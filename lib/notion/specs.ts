/**
 * Canonical Levito field specifications for Notion provisioning, schema
 * discovery, mapping and codecs. This file is intentionally dependency-free
 * (no runtime imports) so that `scripts/notion-setup.ts` can load it under
 * plain Node type-stripping.
 */

export type SpecEntity =
  | "members"
  | "initiatives"
  | "knowledge"
  | "decisions"
  | "actions"
  | "handovers";

export const SPEC_ENTITIES: readonly SpecEntity[] = [
  "members",
  "initiatives",
  "knowledge",
  "decisions",
  "actions",
  "handovers",
];

export type FieldKind =
  | "title"
  | "rich_text"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "email"
  | "phone_number"
  | "url"
  | "relation";

export interface FieldSpec {
  /** Domain field name on the flat record shape. */
  field: string;
  kind: FieldKind;
  /** Conventional Notion property name used for provisioning and default mapping. */
  property: string;
  required: boolean;
  /** Allowed values for select/multi_select fields (domain enum values). */
  options?: readonly string[];
  /** Target entity for relation fields. */
  relationEntity?: SpecEntity;
}

export interface EntitySpec {
  entity: SpecEntity;
  /** Title of the Notion database provisioned for this entity. */
  databaseTitle: string;
  /** Environment variable that stores the data source ID. */
  envVar: string;
  fields: readonly FieldSpec[];
}

const f = (
  field: string,
  kind: FieldKind,
  property: string,
  required = false,
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({ field, kind, property, required, ...extra });

export const ENTITY_SPECS: readonly EntitySpec[] = [
  {
    entity: "members",
    databaseTitle: "Members",
    envVar: "NOTION_DS_MEMBERS",
    fields: [
      f("name", "title", "Name", true),
      f("role", "rich_text", "Role"),
      f("email", "email", "Email"),
      f("active", "checkbox", "Active"),
    ],
  },
  {
    entity: "initiatives",
    databaseTitle: "Initiatives",
    envVar: "NOTION_DS_INITIATIVES",
    fields: [
      f("title", "title", "Title", true),
      f("type", "select", "Type", true, {
        options: ["event", "campaign", "project", "recurring"],
      }),
      f("status", "select", "Status", true, {
        options: ["planned", "active", "paused", "completed"],
      }),
      f("summary", "rich_text", "Summary"),
      f("ownerId", "relation", "Owner", false, { relationEntity: "members" }),
      f("startDate", "date", "Start date"),
      f("endDate", "date", "End date"),
      f("recurrence", "rich_text", "Recurrence"),
    ],
  },
  {
    entity: "knowledge",
    databaseTitle: "Knowledge Library",
    envVar: "NOTION_DS_KNOWLEDGE",
    fields: [
      f("title", "title", "Title", true),
      f("kind", "select", "Kind", true, {
        options: ["playbook", "sop", "lesson", "contact", "template"],
      }),
      f("summary", "rich_text", "Summary"),
      f("content", "rich_text", "Content"),
      f("ownerId", "relation", "Owner", false, { relationEntity: "members" }),
      f("tags", "multi_select", "Tags"),
      f("lastReviewedOn", "date", "Last reviewed"),
      f("initiativeIds", "relation", "Initiatives", false, { relationEntity: "initiatives" }),
      f("contactOrganization", "rich_text", "Contact organization"),
      f("contactEmail", "email", "Contact email"),
      f("contactPhone", "phone_number", "Contact phone"),
      f("contactWebsite", "url", "Contact website"),
    ],
  },
  {
    entity: "decisions",
    databaseTitle: "Decision Log",
    envVar: "NOTION_DS_DECISIONS",
    fields: [
      f("title", "title", "Title", true),
      f("status", "select", "Status", true, {
        options: ["proposed", "decided", "superseded"],
      }),
      f("decidedOn", "date", "Decided on", true),
      f("ownerId", "relation", "Owner", false, { relationEntity: "members" }),
      f("context", "rich_text", "Context"),
      f("alternatives", "rich_text", "Alternatives"),
      f("chosen", "rich_text", "Chosen option"),
      f("rationale", "rich_text", "Rationale"),
      f("outcome", "rich_text", "Outcome"),
      f("initiativeIds", "relation", "Initiatives", false, { relationEntity: "initiatives" }),
    ],
  },
  {
    entity: "actions",
    databaseTitle: "Handover Actions",
    envVar: "NOTION_DS_HANDOVER_ACTIONS",
    fields: [
      f("title", "title", "Title", true),
      f("status", "select", "Status", true, {
        options: ["open", "in_progress", "done"],
      }),
      f("assigneeId", "relation", "Assignee", false, { relationEntity: "members" }),
      f("dueDate", "date", "Due date"),
      f("nextStep", "rich_text", "Next step"),
      f("initiativeId", "relation", "Initiative", false, { relationEntity: "initiatives" }),
      f("handoverId", "relation", "Handover", false, { relationEntity: "handovers" }),
    ],
  },
  {
    entity: "handovers",
    databaseTitle: "Handovers",
    envVar: "NOTION_DS_HANDOVERS",
    fields: [
      f("title", "title", "Title", true),
      f("outgoingTerm", "rich_text", "Outgoing term"),
      f("incomingTerm", "rich_text", "Incoming term"),
      f("outgoingOwnerId", "relation", "Outgoing owner", false, { relationEntity: "members" }),
      f("successorId", "relation", "Successor", false, { relationEntity: "members" }),
      f("targetDate", "date", "Target date"),
      f("initiativeIds", "relation", "Initiatives", false, { relationEntity: "initiatives" }),
      f("knowledgeIds", "relation", "Knowledge", false, { relationEntity: "knowledge" }),
      f("decisionIds", "relation", "Decisions", false, { relationEntity: "decisions" }),
      f("scopeConfirmed", "checkbox", "Scope confirmed"),
      f("actionsReviewed", "checkbox", "Actions reviewed"),
      f("acknowledgedOn", "date", "Acknowledged on"),
    ],
  },
];

export function specFor(entity: SpecEntity): EntitySpec {
  const spec = ENTITY_SPECS.find((s) => s.entity === entity);
  if (!spec) throw new Error(`Unknown entity spec: ${entity}`);
  return spec;
}
