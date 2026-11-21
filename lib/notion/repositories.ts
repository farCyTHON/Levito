import "server-only";
import type { Client } from "@notionhq/client";
import type {
  Action,
  ActionInput,
  Decision,
  DecisionInput,
  Handover,
  HandoverInput,
  Initiative,
  InitiativeInput,
  KnowledgeInput,
  KnowledgeItem,
  Member,
  MemberInput,
  Organization,
  WorkspaceSettings,
} from "@/domain/models";
import {
  RecordNotFoundError,
  type EntityRepository,
  type WorkspaceRepositories,
  type WriteReceipt,
  type WriteResult,
} from "@/lib/repositories";
import {
  decodePageFlat,
  encodeProperties,
  flattenInput,
  pageIsTrashed,
  pageMeta,
  unflattenRecord,
  type DomainRecord,
  type EntityInput,
} from "./codec";
import { discoverDataSource } from "./discovery";
import type { NotionEnv } from "./env";
import { NotionError, toNotionError } from "./errors";
import {
  loadMappingOverrides,
  resolveEntityMapping,
  type EntityMapping,
  type MappingOverrides,
} from "./mapping";
import { specFor, SPEC_ENTITIES, type SpecEntity } from "./specs";

/* ------------------------------------------------------------------ */
/* Raw page shape (structural subset of the SDK response)              */
/* ------------------------------------------------------------------ */

interface RawPage {
  object?: string;
  id: string;
  created_time?: string;
  last_edited_time?: string;
  in_trash?: boolean;
  is_archived?: boolean;
  archived?: boolean;
  properties?: Record<string, unknown>;
}

interface QueryResponse {
  results: unknown[];
  has_more: boolean;
  next_cursor: string | null;
  request_status?: { type?: string; incomplete_reason?: string };
}

const PAGE_SIZE = 100;
const MAX_PAGES = 100; // 10k results — the documented query ceiling

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reads retry once on 429 when Retry-After is reasonable; writes are never retried. */
async function readWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const notionError = toNotionError(error);
    if (notionError.code === "rate_limited" && notionError.retryAfterMs !== undefined && notionError.retryAfterMs <= 60_000) {
      await sleep(notionError.retryAfterMs + 250);
      return fn();
    }
    throw notionError;
  }
}

async function queryAll(client: Client, dataSourceId: string): Promise<RawPage[]> {
  const pages: RawPage[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = (await readWithRetry(() =>
      client.dataSources.query({
        data_source_id: dataSourceId,
        page_size: PAGE_SIZE,
        start_cursor: cursor,
      }),
    )) as unknown as QueryResponse;

    if (res.request_status?.type === "incomplete") {
      throw new NotionError(
        "incomplete_results",
        `Notion returned an incomplete result set for data source ${dataSourceId} (${res.request_status.incomplete_reason ?? "unknown"}). Results are not being shown partially.`,
      );
    }
    for (const row of res.results) {
      const page = row as RawPage;
      if (page.object === "page" || page.properties) pages.push(page);
    }
    if (!res.has_more) return pages;
    if (!res.next_cursor) {
      throw new NotionError("incomplete_results", "Notion reported more results but provided no cursor.");
    }
    cursor = res.next_cursor;
  }
  throw new NotionError(
    "incomplete_results",
    `Notion query exceeded the ${MAX_PAGES * PAGE_SIZE}-result ceiling for data source ${dataSourceId}. Narrow the data or archive old records.`,
  );
}

/* ------------------------------------------------------------------ */
/* Configuration page codec (organization + settings)                  */
/*                                                                     */
/* The Levito Configuration page stores org/settings as a JSON code    */
/* block in its body (plain pages cannot carry custom properties).     */
/* ------------------------------------------------------------------ */

interface ConfigData {
  name: string;
  shortName: string;
  university: string;
  term: string;
  reviewWindowDays: number;
}

const DEFAULT_CONFIG: ConfigData = {
  name: "",
  shortName: "",
  university: "",
  term: "",
  reviewWindowDays: 365,
};

function blockText(block: unknown): string {
  const b = block as { type?: string; [k: string]: unknown };
  const body = b[b.type ?? ""] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
  return (body?.rich_text ?? []).map((r) => r.plain_text ?? "").join("");
}

async function readConfig(client: Client, pageId: string): Promise<ConfigData> {
  let cursor: string | null = null;
  do {
    const res = (await client.blocks.children.list({ block_id: pageId, page_size: 100, start_cursor: cursor })) as {
      results: unknown[];
      has_more: boolean;
      next_cursor: string | null;
    };
    for (const block of res.results) {
      const b = block as { type?: string };
      if (b.type === "code") {
        try {
          return { ...DEFAULT_CONFIG, ...(JSON.parse(blockText(block)) as Partial<ConfigData>) };
        } catch {
          return { ...DEFAULT_CONFIG };
        }
      }
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return { ...DEFAULT_CONFIG };
}

async function writeConfig(client: Client, pageId: string, data: ConfigData): Promise<void> {
  // Replace the managed JSON code block: delete existing children, append fresh.
  let cursor: string | null = null;
  do {
    const res = (await client.blocks.children.list({ block_id: pageId, page_size: 100, start_cursor: cursor })) as {
      results: Array<{ id: string }>;
      has_more: boolean;
      next_cursor: string | null;
    };
    for (const block of res.results) {
      await client.blocks.delete({ block_id: block.id }).catch(() => undefined);
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  await client.blocks.children.append({
    block_id: pageId,
    children: [
      {
        object: "block",
        type: "code",
        code: {
          rich_text: [{ type: "text", text: { content: JSON.stringify(data) } }],
          language: "json",
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "Levito configuration — managed by Levito." } }],
        },
      },
    ] as never,
  });
}

/* ------------------------------------------------------------------ */
/* Repository factory                                                   */
/* ------------------------------------------------------------------ */

export interface NotionRepositories extends WorkspaceRepositories {
  /** Re-runs schema discovery and mapping resolution (e.g. after a mapping or repair change). */
  refreshMappings(): Promise<void>;
  /** Per-entity mapping status for the settings UI. */
  mappingStatus(): Promise<EntityMapping[]>;
}

export interface CreateNotionRepositoriesOptions {
  env: NotionEnv;
  client: Client;
  overrides?: MappingOverrides;
}

export async function createNotionRepositories(
  options: CreateNotionRepositoriesOptions,
): Promise<NotionRepositories> {
  const { env, client } = options;
  const overrides = options.overrides ?? loadMappingOverrides();
  const mappings = new Map<SpecEntity, Promise<EntityMapping>>();

  const dataSourceIdFor = (entity: SpecEntity): string => {
    const id = env.dataSources[entity];
    if (!id) {
      throw new NotionError(
        "unknown",
        `No data source ID configured for ${specFor(entity).databaseTitle}. Set ${specFor(entity).envVar} or run npm run notion:setup.`,
      );
    }
    return id;
  };

  async function resolveMapping(entity: SpecEntity): Promise<EntityMapping> {
    const dataSourceId = env.dataSources[entity] ?? null;
    if (!dataSourceId) {
      return resolveEntityMapping(entity, null, null, overrides, { dataSourceIds: env.dataSources });
    }
    const discovered = await discoverDataSource(client, dataSourceId);
    return resolveEntityMapping(entity, dataSourceId, discovered, overrides, {
      dataSourceIds: env.dataSources,
    });
  }

  function ensureMapping(entity: SpecEntity): Promise<EntityMapping> {
    let pending = mappings.get(entity);
    if (!pending) {
      pending = resolveMapping(entity);
      mappings.set(entity, pending);
    }
    return pending;
  }

  function receipt(): WriteReceipt {
    return { target: "notion", confirmed: true, at: new Date().toISOString() };
  }

  function requiredFields(mapping: EntityMapping): { required: Set<string>; names: Map<string, string> } {
    const required = new Set<string>();
    const names = new Map<string, string>();
    for (const f of mapping.fields) {
      if (f.propertyName) names.set(f.field, f.propertyName);
      if (f.required && f.status === "ok") required.add(f.field);
    }
    return { required, names };
  }

  function assertUsable(entity: SpecEntity, mapping: EntityMapping): void {
    if (mapping.usable) return;
    const spec = specFor(entity);
    throw new NotionError(
      "validation_error",
      `The ${spec.databaseTitle} data source is missing required mapped fields: ${mapping.missingRequired.join(", ")}. Open Settings → Notion connection to inspect and repair the schema.`,
    );
  }

  function decode(entity: SpecEntity, mapping: EntityMapping, page: RawPage): DomainRecord {
    const { required, names } = requiredFields(mapping);
    return unflattenRecord(entity, decodePageFlat(page, mapping.fields), required, names, pageMeta(page));
  }

  function makeRepo(entity: SpecEntity): EntityRepository<DomainRecord, EntityInput> {
    const spec = specFor(entity);
    return {
      async list() {
        const mapping = await ensureMapping(entity);
        assertUsable(entity, mapping);
        const pages = await queryAll(client, dataSourceIdFor(entity));
        return pages
          .filter((p) => !pageIsTrashed(p))
          .map((p) => decode(entity, mapping, p));
      },
      async get(id) {
        const mapping = await ensureMapping(entity);
        assertUsable(entity, mapping);
        let page: RawPage;
        try {
          page = (await readWithRetry(() => client.pages.retrieve({ page_id: id }))) as unknown as RawPage;
        } catch (error) {
          const ne = toNotionError(error);
          if (ne.code === "not_found") return null;
          throw ne;
        }
        if (pageIsTrashed(page)) return null;
        return decode(entity, mapping, page);
      },
      async create(input) {
        const mapping = await ensureMapping(entity);
        assertUsable(entity, mapping);
        const flat = flattenInput(entity, input);
        const properties = encodeProperties(entity, flat, mapping.fields);
        try {
          const page = (await client.pages.create({
            parent: { data_source_id: dataSourceIdFor(entity) },
            properties: properties as never,
          })) as unknown as RawPage;
          return { record: decode(entity, mapping, page), receipt: receipt() };
        } catch (error) {
          throw toNotionError(error);
        }
      },
      async update(id, input) {
        const mapping = await ensureMapping(entity);
        assertUsable(entity, mapping);
        const flat = flattenInput(entity, input);
        const properties = encodeProperties(entity, flat, mapping.fields);
        try {
          const page = (await client.pages.update({
            page_id: id,
            properties: properties as never,
          })) as unknown as RawPage;
          return { record: decode(entity, mapping, page), receipt: receipt() };
        } catch (error) {
          const ne = toNotionError(error);
          if (ne.code === "not_found") throw new RecordNotFoundError(spec.entity, id);
          throw ne;
        }
      },
      async remove(id) {
        try {
          await client.pages.update({ page_id: id, in_trash: true });
        } catch (error) {
          const ne = toNotionError(error);
          if (ne.code === "not_found") throw new RecordNotFoundError(spec.entity, id);
          throw ne;
        }
        return receipt();
      },
    };
  }

  /* Organization + settings live on the Levito configuration page. */

  function requireConfigPage(): string {
    if (!env.configPageId) {
      throw new NotionError(
        "unknown",
        "NOTION_CONFIG_PAGE_ID is not configured. Run npm run notion:setup to create the Levito configuration page.",
      );
    }
    return env.configPageId;
  }

  const organization = {
    async get(): Promise<Organization> {
      const c = await readConfig(client, requireConfigPage());
      return { name: c.name, shortName: c.shortName, university: c.university, term: c.term };
    },
    async update(input: Organization): Promise<WriteResult<Organization>> {
      const pageId = requireConfigPage();
      const c = await readConfig(client, pageId);
      await writeConfig(client, pageId, { ...c, ...input });
      return { record: input, receipt: receipt() };
    },
  };

  const settings = {
    async get(): Promise<WorkspaceSettings> {
      const c = await readConfig(client, requireConfigPage());
      return { reviewWindowDays: c.reviewWindowDays > 0 ? c.reviewWindowDays : 365 };
    },
    async update(input: WorkspaceSettings): Promise<WriteResult<WorkspaceSettings>> {
      const pageId = requireConfigPage();
      const c = await readConfig(client, pageId);
      await writeConfig(client, pageId, { ...c, reviewWindowDays: input.reviewWindowDays });
      return { record: input, receipt: receipt() };
    },
  };

  return {
    target: "notion",
    members: makeRepo("members") as EntityRepository<Member, MemberInput>,
    initiatives: makeRepo("initiatives") as EntityRepository<Initiative, InitiativeInput>,
    knowledge: makeRepo("knowledge") as EntityRepository<KnowledgeItem, KnowledgeInput>,
    decisions: makeRepo("decisions") as EntityRepository<Decision, DecisionInput>,
    actions: makeRepo("actions") as EntityRepository<Action, ActionInput>,
    handovers: makeRepo("handovers") as EntityRepository<Handover, HandoverInput>,
    organization,
    settings,
    async refreshMappings() {
      mappings.clear();
      await Promise.all(SPEC_ENTITIES.map((e) => ensureMapping(e).catch(() => undefined)));
    },
    async mappingStatus() {
      return Promise.all(SPEC_ENTITIES.map((e) => ensureMapping(e)));
    },
  };
}

