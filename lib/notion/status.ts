import "server-only";
import { createNotionClient } from "./client";
import { discoverDataSource } from "./discovery";
import { hasNotionCredentials, missingNotionConfig, readNotionEnv, type NotionEnv } from "./env";
import { toNotionError } from "./errors";
import { loadMappingOverrides, resolveEntityMapping, type EntityMapping } from "./mapping";
import { specFor, SPEC_ENTITIES, type SpecEntity } from "./specs";

export interface SourceStatus {
  entity: SpecEntity;
  databaseTitle: string;
  envVar: string;
  configured: boolean;
  dataSourceId: string | null;
  reachable: boolean | null;
  title: string | null;
  propertyCount: number | null;
  mappingUsable: boolean | null;
  missingRequired: string[];
  error: string | null;
}

export interface NotionConnectionStatus {
  credentialsPresent: boolean;
  fullyConfigured: boolean;
  missingConfig: Array<{ key: string; description: string }>;
  apiVersion: string;
  workspace: { ok: boolean; botName: string | null; error: string | null };
  configPage: { configured: boolean; reachable: boolean | null; error: string | null };
  sources: SourceStatus[];
  checkedAt: string;
}

function errorMessage(error: unknown): string {
  const e = toNotionError(error);
  return `${e.code}: ${e.message}`;
}

export async function getNotionConnectionStatus(
  env: NotionEnv = readNotionEnv(),
): Promise<NotionConnectionStatus> {
  const missingConfig = missingNotionConfig(env);
  const base: NotionConnectionStatus = {
    credentialsPresent: hasNotionCredentials(env),
    fullyConfigured: missingConfig.length === 0,
    missingConfig,
    apiVersion: env.version,
    workspace: { ok: false, botName: null, error: null },
    configPage: { configured: Boolean(env.configPageId), reachable: null, error: null },
    sources: [],
    checkedAt: new Date().toISOString(),
  };

  if (!env.apiKey) {
    base.workspace.error = "NOTION_API_KEY is not set.";
    base.configPage.error = "Not checked — no credentials.";
    base.sources = SPEC_ENTITIES.map((entity) => ({
      entity,
      databaseTitle: specFor(entity).databaseTitle,
      envVar: specFor(entity).envVar,
      configured: Boolean(env.dataSources[entity]),
      dataSourceId: env.dataSources[entity] ?? null,
      reachable: null,
      title: null,
      propertyCount: null,
      mappingUsable: null,
      missingRequired: [],
      error: null,
    }));
    return base;
  }

  const client = createNotionClient(env);
  const overrides = loadMappingOverrides();

  try {
    const me = await client.users.me();
    base.workspace = {
      ok: true,
      botName: "name" in me && me.name ? String(me.name) : "Levito integration",
      error: null,
    };
  } catch (error) {
    base.workspace.error = errorMessage(error);
    base.configPage.error = "Not checked — workspace unreachable.";
    base.sources = SPEC_ENTITIES.map((entity) => sourceStub(env, entity, "Not checked — workspace unreachable."));
    return base;
  }

  if (env.configPageId) {
    try {
      await client.pages.retrieve({ page_id: env.configPageId });
      base.configPage.reachable = true;
    } catch (error) {
      base.configPage.reachable = false;
      base.configPage.error = errorMessage(error);
    }
  } else {
    base.configPage.error = "NOTION_CONFIG_PAGE_ID is not set.";
  }

  base.sources = await Promise.all(
    SPEC_ENTITIES.map(async (entity): Promise<SourceStatus> => {
      const spec = specFor(entity);
      const dataSourceId = env.dataSources[entity] ?? null;
      const stub: SourceStatus = {
        entity,
        databaseTitle: spec.databaseTitle,
        envVar: spec.envVar,
        configured: Boolean(dataSourceId),
        dataSourceId,
        reachable: null,
        title: null,
        propertyCount: null,
        mappingUsable: null,
        missingRequired: [],
        error: null,
      };
      if (!dataSourceId) {
        stub.error = `${spec.envVar} is not set.`;
        return stub;
      }
      try {
        const discovered = await discoverDataSource(client, dataSourceId);
        stub.reachable = true;
        stub.title = discovered.title || spec.databaseTitle;
        stub.propertyCount = discovered.properties.length;
        const mapping: EntityMapping = resolveEntityMapping(entity, dataSourceId, discovered, overrides, {
          dataSourceIds: env.dataSources,
        });
        stub.mappingUsable = mapping.usable;
        stub.missingRequired = mapping.missingRequired;
      } catch (error) {
        stub.reachable = false;
        stub.error = errorMessage(error);
      }
      return stub;
    }),
  );

  return base;
}

function sourceStub(env: NotionEnv, entity: SpecEntity, error: string): SourceStatus {
  const spec = specFor(entity);
  return {
    entity,
    databaseTitle: spec.databaseTitle,
    envVar: spec.envVar,
    configured: Boolean(env.dataSources[entity]),
    dataSourceId: env.dataSources[entity] ?? null,
    reachable: null,
    title: null,
    propertyCount: null,
    mappingUsable: null,
    missingRequired: [],
    error,
  };
}
