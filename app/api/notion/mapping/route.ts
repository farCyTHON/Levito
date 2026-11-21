import { apiError, json } from "@/lib/server/api";
import { notionEnv } from "@/lib/server/context";
import { createNotionClient } from "@/lib/notion/client";
import { discoverDataSource } from "@/lib/notion/discovery";
import { toNotionError } from "@/lib/notion/errors";
import {
  isOverrideKeyValid,
  loadMappingOverrides,
  saveMappingOverrides,
  resolveEntityMapping,
  type MappingOverrides,
} from "@/lib/notion/mapping";
import { SPEC_ENTITIES } from "@/lib/notion/specs";
import type { SpecEntity } from "@/lib/notion/specs";

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** GET: resolved field mappings + schema issues for every configured data source. */
export async function GET() {
  const env = notionEnv();
  if (!env.apiKey) {
    return apiError("not_configured", "NOTION_API_KEY is not set. Levito is running on demo data.", 409);
  }
  const client = createNotionClient(env);
  const overrides = loadMappingOverrides();
  const entities = await Promise.all(
    SPEC_ENTITIES.map(async (entity) => {
      const dataSourceId = env.dataSources[entity] ?? null;
      if (!dataSourceId) {
        return resolveEntityMapping(entity, null, null, overrides, { dataSourceIds: env.dataSources });
      }
      try {
        const discovered = await discoverDataSource(client, dataSourceId);
        return {
          ...resolveEntityMapping(entity, dataSourceId, discovered, overrides, {
            dataSourceIds: env.dataSources,
          }),
          properties: discovered.properties.map((p) => ({ id: p.id, name: p.name, type: p.type })),
        };
      } catch (error) {
        const ne = toNotionError(error);
        return {
          ...resolveEntityMapping(entity, dataSourceId, null, overrides, { dataSourceIds: env.dataSources }),
          discoveryError: `${ne.code}: ${ne.message}`,
        };
      }
    }),
  );
  return json({ ok: true, overrides, entities });
}

/**
 * PUT: save custom field mapping overrides.
 * Body: { overrides: { <entity>: { <field>: "<propertyId-or-name>" } } }
 * Passing null for a field removes the override.
 */
export async function PUT(request: Request) {
  const env = notionEnv();
  if (!env.apiKey) {
    return apiError("not_configured", "NOTION_API_KEY is not set.", 409);
  }
  const body = (await readJson(request)) as { overrides?: MappingOverrides } | undefined;
  const incoming = body?.overrides;
  if (!incoming || typeof incoming !== "object") {
    return apiError("validation_error", "Body must be { overrides: { entity: { field: property } } }.", 400);
  }

  const clean: MappingOverrides = {};
  for (const [entity, fields] of Object.entries(incoming)) {
    if (!SPEC_ENTITIES.includes(entity as SpecEntity) || !fields || typeof fields !== "object") {
      return apiError("validation_error", `Unknown entity "${entity}" in mapping overrides.`, 400);
    }
    const entityKey = entity as SpecEntity;
    const cleanFields: Record<string, string> = {};
    for (const [field, value] of Object.entries(fields)) {
      if (!isOverrideKeyValid(entityKey, field)) {
        return apiError("validation_error", `Unknown field "${field}" for ${entityKey}.`, 400);
      }
      if (value === null || value === "") continue;
      if (typeof value !== "string") {
        return apiError("validation_error", `Mapping for ${entityKey}.${field} must be a string.`, 400);
      }
      cleanFields[field] = value;
    }
    if (Object.keys(cleanFields).length > 0) clean[entityKey] = cleanFields;
  }

  saveMappingOverrides(clean);
  return json({ ok: true, overrides: clean });
}
