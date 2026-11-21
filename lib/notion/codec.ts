import type {
  Action,
  ActionInput,
  Decision,
  DecisionInput,
  Handover,
  HandoverInput,
  ID,
  Initiative,
  InitiativeInput,
  KnowledgeInput,
  KnowledgeItem,
  Member,
  MemberInput,
} from "@/domain/models";
import { NotionError } from "./errors";
import type { ResolvedField } from "./mapping";
import type { SpecEntity } from "./specs";

export type FlatValue = string | number | boolean | string[] | null;
export type FlatRecord = Record<string, FlatValue>;

export type EntityInput =
  | MemberInput
  | InitiativeInput
  | KnowledgeInput
  | DecisionInput
  | ActionInput
  | HandoverInput;

export type DomainRecord = Member | Initiative | KnowledgeItem | Decision | Action | Handover;

const str = (v: FlatValue | undefined): string => (typeof v === "string" ? v : "");
const strOrNull = (v: FlatValue | undefined): string | null => (typeof v === "string" && v !== "" ? v : null);
const bool = (v: FlatValue | undefined): boolean => v === true;
const list = (v: FlatValue | undefined): string[] => (Array.isArray(v) ? v : []);
const relId = (v: FlatValue | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : strOrNull(v);

/* ------------------------------------------------------------------ */
/* Flatten / unflatten: domain record <-> flat field map               */
/* ------------------------------------------------------------------ */

export function flattenInput(entity: SpecEntity, input: EntityInput): FlatRecord {
  switch (entity) {
    case "members": {
      const i = input as MemberInput;
      return { name: i.name, role: i.role, department: i.department, email: i.email, active: i.active };
    }
    case "initiatives": {
      const i = input as InitiativeInput;
      return {
        title: i.title,
        type: i.type,
        status: i.status,
        summary: i.summary,
        ownerId: i.ownerId,
        startDate: i.startDate,
        endDate: i.endDate,
        recurrence: i.recurrence,
      };
    }
    case "knowledge": {
      const i = input as KnowledgeInput;
      const c = i.contact;
      return {
        title: i.title,
        kind: i.kind,
        summary: i.summary,
        content: i.content,
        ownerId: i.ownerId,
        tags: i.tags,
        lastReviewedOn: i.lastReviewedOn,
        initiativeIds: i.initiativeIds,
        contactOrganization: c?.organization ?? "",
        contactEmail: c?.email ?? "",
        contactPhone: c?.phone ?? "",
        contactWebsite: c?.website ?? "",
      };
    }
    case "decisions": {
      const i = input as DecisionInput;
      return {
        title: i.title,
        status: i.status,
        decidedOn: i.decidedOn,
        ownerId: i.ownerId,
        context: i.context,
        alternatives: i.alternatives.join("\n"),
        chosen: i.chosen,
        rationale: i.rationale,
        outcome: i.outcome,
        initiativeIds: i.initiativeIds,
      };
    }
    case "actions": {
      const i = input as ActionInput;
      return {
        title: i.title,
        status: i.status,
        assigneeId: i.assigneeId,
        dueDate: i.dueDate,
        nextStep: i.nextStep,
        initiativeId: i.initiativeId,
        handoverId: i.handoverId,
      };
    }
    case "handovers": {
      const i = input as HandoverInput;
      return {
        title: i.title,
        outgoingTerm: i.outgoingTerm,
        incomingTerm: i.incomingTerm,
        outgoingOwnerId: i.outgoingOwnerId,
        successorId: i.successorId,
        targetDate: i.targetDate,
        initiativeIds: i.initiativeIds,
        knowledgeIds: i.knowledgeIds,
        decisionIds: i.decisionIds,
        scopeConfirmed: i.scopeConfirmed,
        actionsReviewed: i.actionsReviewed,
        acknowledgedOn: i.acknowledgedOn,
      };
    }
  }
}

interface PageMeta {
  id: ID;
  createdAt: string;
  updatedAt: string;
}

function requireField(entity: SpecEntity, field: string, value: FlatValue, propName: string): FlatValue {
  const empty =
    value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) {
    throw new NotionError(
      "validation_error",
      `Record in "${entity}" is missing required property "${propName}" (${field}). Fix the record in Notion or review the field mapping.`,
    );
  }
  return value;
}

export function unflattenRecord(
  entity: SpecEntity,
  flat: FlatRecord,
  required: Set<string>,
  propNames: Map<string, string>,
  meta: PageMeta,
): DomainRecord {
  const need = (field: string): FlatValue => {
    const value = flat[field];
    return required.has(field) ? requireField(entity, field, value, propNames.get(field) ?? field) : value ?? null;
  };
  const base = { id: meta.id, createdAt: meta.createdAt, updatedAt: meta.updatedAt };

  switch (entity) {
    case "members":
      return {
        ...base,
        name: str(need("name")),
        role: str(flat.role ?? ""),
        department: str(flat.department ?? ""),
        email: str(flat.email ?? ""),
        active: bool(flat.active),
      } as Member;
    case "initiatives":
      return {
        ...base,
        title: str(need("title")),
        type: str(need("type")) as Initiative["type"],
        status: str(need("status")) as Initiative["status"],
        summary: str(flat.summary ?? ""),
        ownerId: relId(flat.ownerId),
        startDate: strOrNull(flat.startDate),
        endDate: strOrNull(flat.endDate),
        recurrence: str(flat.recurrence ?? ""),
      } as Initiative;
    case "knowledge": {
      const org = str(flat.contactOrganization ?? "");
      const email = str(flat.contactEmail ?? "");
      const phone = str(flat.contactPhone ?? "");
      const website = str(flat.contactWebsite ?? "");
      const hasContact = Boolean(org || email || phone || website);
      return {
        ...base,
        title: str(need("title")),
        kind: str(need("kind")) as KnowledgeItem["kind"],
        summary: str(flat.summary ?? ""),
        content: str(flat.content ?? ""),
        ownerId: relId(flat.ownerId),
        tags: list(flat.tags),
        lastReviewedOn: strOrNull(flat.lastReviewedOn),
        initiativeIds: list(flat.initiativeIds),
        contact: hasContact ? { organization: org, email, phone, website } : null,
      } as KnowledgeItem;
    }
    case "decisions":
      return {
        ...base,
        title: str(need("title")),
        status: str(need("status")) as Decision["status"],
        decidedOn: str(need("decidedOn")),
        ownerId: relId(flat.ownerId),
        context: str(flat.context ?? ""),
        alternatives: str(flat.alternatives ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        chosen: str(flat.chosen ?? ""),
        rationale: str(flat.rationale ?? ""),
        outcome: str(flat.outcome ?? ""),
        initiativeIds: list(flat.initiativeIds),
      } as Decision;
    case "actions":
      return {
        ...base,
        title: str(need("title")),
        status: str(need("status")) as Action["status"],
        assigneeId: relId(flat.assigneeId),
        dueDate: strOrNull(flat.dueDate),
        nextStep: str(flat.nextStep ?? ""),
        initiativeId: relId(flat.initiativeId),
        handoverId: relId(flat.handoverId),
      } as Action;
    case "handovers":
      return {
        ...base,
        title: str(need("title")),
        outgoingTerm: str(flat.outgoingTerm ?? ""),
        incomingTerm: str(flat.incomingTerm ?? ""),
        outgoingOwnerId: relId(flat.outgoingOwnerId),
        successorId: relId(flat.successorId),
        targetDate: strOrNull(flat.targetDate),
        initiativeIds: list(flat.initiativeIds),
        knowledgeIds: list(flat.knowledgeIds),
        decisionIds: list(flat.decisionIds),
        scopeConfirmed: bool(flat.scopeConfirmed),
        actionsReviewed: bool(flat.actionsReviewed),
        acknowledgedOn: strOrNull(flat.acknowledgedOn),
      } as Handover;
  }
}

/* ------------------------------------------------------------------ */
/* Notion property payload encode/decode                               */
/* ------------------------------------------------------------------ */

const RICH_TEXT_LIMIT = 2000;

interface RawPage {
  id: string;
  created_time?: string;
  last_edited_time?: string;
  in_trash?: boolean;
  is_archived?: boolean;
  archived?: boolean;
  properties?: Record<string, unknown>;
}

function richTextItems(text: string): Array<{ type: "text"; text: { content: string } }> {
  const items: Array<{ type: "text"; text: { content: string } }> = [];
  for (let i = 0; i < text.length; i += RICH_TEXT_LIMIT) {
    items.push({ type: "text", text: { content: text.slice(i, i + RICH_TEXT_LIMIT) } });
  }
  return items;
}

function plainTextOf(value: unknown): string {
  const items = (value as { plain_text?: string }[] | undefined) ?? [];
  return items.map((i) => i.plain_text ?? "").join("");
}

/** Decodes one Notion page into a flat field record using resolved mappings. */
export function decodePageFlat(page: RawPage, fields: ResolvedField[]): FlatRecord {
  const byId = new Map<string, Record<string, unknown>>();
  for (const prop of Object.values(page.properties ?? {})) {
    const p = prop as { id?: string } & Record<string, unknown>;
    if (p.id) byId.set(p.id, p);
  }

  const flat: FlatRecord = {};
  for (const field of fields) {
    if (!field.propertyId || field.status !== "ok") continue;
    const prop = byId.get(field.propertyId) ?? byId.get(field.propertyId.replace(/-/g, ""));
    if (!prop) continue;
    const kind = field.kind;
    switch (kind) {
      case "title":
      case "rich_text": {
        const key = kind === "title" ? "title" : "rich_text";
        flat[field.field] = plainTextOf(prop[key]);
        break;
      }
      case "select": {
        const v = prop.select as { name?: string } | null | undefined;
        flat[field.field] = v?.name ?? "";
        break;
      }
      case "multi_select": {
        const v = prop.multi_select as Array<{ name?: string }> | undefined;
        flat[field.field] = (v ?? []).map((o) => o.name ?? "");
        break;
      }
      case "date": {
        const v = prop.date as { start?: string | null } | null | undefined;
        flat[field.field] = v?.start ?? null;
        break;
      }
      case "checkbox":
        flat[field.field] = prop.checkbox === true;
        break;
      case "email":
      case "phone_number":
      case "url": {
        const v = prop[kind];
        flat[field.field] = typeof v === "string" && v !== "" ? v : "";
        break;
      }
      case "relation": {
        const v = prop.relation as Array<{ id?: string }> | undefined;
        flat[field.field] = (v ?? []).map((r) => r.id ?? "").filter(Boolean);
        break;
      }
    }
  }
  return flat;
}

export function pageIsTrashed(page: RawPage): boolean {
  return page.in_trash === true || page.is_archived === true || page.archived === true;
}

export function pageMeta(page: RawPage): PageMeta {
  return {
    id: page.id,
    createdAt: page.created_time ?? new Date(0).toISOString(),
    updatedAt: page.last_edited_time ?? page.created_time ?? new Date(0).toISOString(),
  };
}

/** Encodes flat field values into a Notion `properties` update payload. */
export function encodeProperties(entity: SpecEntity, flat: FlatRecord, fields: ResolvedField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.propertyId || field.status !== "ok" || !field.writable) continue;
    const key = field.propertyId;
    const value = flat[field.field];
    switch (field.kind) {
      case "title":
        properties[key] = { type: "title", title: richTextItems(str(value)) };
        break;
      case "rich_text":
        properties[key] = { type: "rich_text", rich_text: richTextItems(str(value)) };
        break;
      case "select": {
        const name = str(value);
        properties[key] = { type: "select", select: name ? { name } : null };
        break;
      }
      case "multi_select":
        properties[key] = {
          type: "multi_select",
          multi_select: list(value).map((name) => ({ name })),
        };
        break;
      case "date": {
        const start = strOrNull(value);
        properties[key] = { type: "date", date: start ? { start } : null };
        break;
      }
      case "checkbox":
        properties[key] = { type: "checkbox", checkbox: bool(value) };
        break;
      case "email":
      case "phone_number":
      case "url": {
        const v = str(value);
        properties[key] = { type: field.kind, [field.kind]: v === "" ? null : v };
        break;
      }
      case "relation": {
        const ids = Array.isArray(value) ? value.filter(Boolean) : strOrNull(value) ? [strOrNull(value)!] : [];
        properties[key] = { type: "relation", relation: ids.map((id) => ({ id })) };
        break;
      }
    }
  }
  return properties;
}
