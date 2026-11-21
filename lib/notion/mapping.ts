import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kindCompatible, type DiscoveredDataSource } from "./discovery";
import { specFor, type FieldSpec, type SpecEntity } from "./specs";

export type FieldStatus = "ok" | "missing" | "type_mismatch" | "relation_target_mismatch";

export interface ResolvedField {
  field: string;
  kind: FieldSpec["kind"];
  required: boolean;
  specProperty: string;
  propertyId: string | null;
  propertyName: string | null;
  propertyType: string | null;
  status: FieldStatus;
  writable: boolean;
  relationEntity?: SpecEntity;
  relationDataSourceId?: string | null;
  /** Domain options absent from the Notion property (auto-created on write for select/multi_select). */
  missingOptions?: string[];
}

export interface EntityMapping {
  entity: SpecEntity;
  dataSourceId: string | null;
  databaseTitle: string;
  fields: ResolvedField[];
  missingRequired: string[];
  usable: boolean;
}

export type MappingOverrides = Partial<Record<SpecEntity, Record<string, string>>>;

const MAPPING_FILE = join(process.cwd(), "notion.mapping.json");
const ID_LIKE = /^[0-9a-f]{32}$|^[0-9a-f-]{36}$/i;

export function loadMappingOverrides(): MappingOverrides {
  try {
    const raw = readFileSync(MAPPING_FILE, "utf8");
    const parsed = JSON.parse(raw) as { overrides?: MappingOverrides };
    return parsed.overrides ?? {};
  } catch {
    return {};
  }
}

export function saveMappingOverrides(overrides: MappingOverrides): void {
  mkdirSync(process.cwd(), { recursive: true });
  writeFileSync(MAPPING_FILE, JSON.stringify({ version: 1, overrides }, null, 2) + "\n", "utf8");
}

function findProperty(
  discovered: DiscoveredDataSource,
  field: FieldSpec,
  override: string | undefined,
): DiscoveredDataSource["properties"][number] | undefined {
  if (override) {
    const byId = discovered.properties.find((p) => p.id === override || p.id.replace(/-/g, "") === override.replace(/-/g, ""));
    if (byId) return byId;
    const byName = discovered.properties.find((p) => p.name === override);
    if (byName) return byName;
    return undefined;
  }
  return (
    discovered.properties.find((p) => p.name === field.property) ??
    discovered.properties.find((p) => p.name.toLowerCase() === field.property.toLowerCase())
  );
}

export interface ResolveContext {
  /** Expected data source IDs per entity, used to validate relation targets. */
  dataSourceIds: Partial<Record<SpecEntity, string>>;
}

export function resolveEntityMapping(
  entity: SpecEntity,
  dataSourceId: string | null,
  discovered: DiscoveredDataSource | null,
  overrides: MappingOverrides = {},
  context: ResolveContext = { dataSourceIds: {} },
): EntityMapping {
  const spec = specFor(entity);
  const entityOverrides = overrides[entity] ?? {};
  const fields: ResolvedField[] = spec.fields.map((field) => {
    const base: ResolvedField = {
      field: field.field,
      kind: field.kind,
      required: field.required,
      specProperty: field.property,
      propertyId: null,
      propertyName: null,
      propertyType: null,
      status: "missing",
      writable: false,
      relationEntity: field.relationEntity,
      relationDataSourceId: null,
    };
    if (!discovered) return base;

    const prop = findProperty(discovered, field, entityOverrides[field.field]);
    if (!prop) return base;

    const resolved: ResolvedField = {
      ...base,
      propertyId: prop.id,
      propertyName: prop.name,
      propertyType: prop.type,
    };

    if (!kindCompatible(field.kind, prop.type)) {
      resolved.status = "type_mismatch";
      return resolved;
    }

    if (field.kind === "relation" && field.relationEntity) {
      const expected = context.dataSourceIds[field.relationEntity];
      resolved.relationDataSourceId = prop.relationDataSourceId ?? null;
      const norm = (v?: string | null) => (v ?? "").replace(/-/g, "");
      if (expected && norm(prop.relationDataSourceId) !== norm(expected)) {
        resolved.status = "relation_target_mismatch";
        return resolved;
      }
    }

    if ((field.kind === "select" || field.kind === "multi_select") && field.options && prop.options) {
      const have = new Set(prop.options.map((o) => o.name));
      const missing = field.options.filter((o) => !have.has(o));
      if (missing.length > 0) resolved.missingOptions = missing;
    }

    resolved.status = "ok";
    resolved.writable = prop.type !== "formula" && prop.type !== "rollup" && !prop.type.startsWith("created_") && !prop.type.startsWith("last_edited_");
    return resolved;
  });

  const missingRequired = fields.filter((f) => f.required && f.status !== "ok").map((f) => f.field);
  return {
    entity,
    dataSourceId,
    databaseTitle: spec.databaseTitle,
    fields,
    missingRequired,
    usable: missingRequired.length === 0,
  };
}

export function isOverrideKeyValid(entity: SpecEntity, field: string): boolean {
  return specFor(entity).fields.some((f) => f.field === field);
}

export { ID_LIKE };
