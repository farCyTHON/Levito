import { apiError, json } from "@/lib/server/api";
import { notionEnv } from "@/lib/server/context";
import { createNotionClient } from "@/lib/notion/client";
import { discoverDataSource, type DiscoveredDataSource } from "@/lib/notion/discovery";
import { toNotionError } from "@/lib/notion/errors";
import { loadMappingOverrides, resolveEntityMapping } from "@/lib/notion/mapping";
import { specFor, type FieldSpec, type SpecEntity } from "@/lib/notion/specs";

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Notion property configuration for a Levito field kind. */
function propertyConfigFor(field: FieldSpec): Record<string, unknown> | null {
  switch (field.kind) {
    case "title":
      return { type: "title", title: {} };
    case "rich_text":
      return { type: "rich_text", rich_text: {} };
    case "select":
      return {
        type: "select",
        select: { options: (field.options ?? []).map((name) => ({ name })) },
      };
    case "multi_select":
      return {
        type: "multi_select",
        multi_select: { options: (field.options ?? []).map((name) => ({ name })) },
      };
    case "date":
      return { type: "date", date: {} };
    case "checkbox":
      return { type: "checkbox", checkbox: {} };
    case "email":
      return { type: "email", email: {} };
    case "phone_number":
      return { type: "phone_number", phone_number: {} };
    case "url":
      return { type: "url", url: {} };
    case "relation":
      // Relations are provisioned by notion:setup, not ad-hoc repair.
      return null;
  }
}

/**
 * POST { entity, fields: string[] } — adds missing scalar properties to a data
 * source. Only fields from the canonical spec are allowed, and only when they
 * are currently unmapped/missing. Relation fields are rejected (they require a
 * provisioned target). This never modifies or deletes existing properties.
 */
export async function POST(request: Request) {
  const env = notionEnv();
  if (!env.apiKey) {
    return apiError("not_configured", "NOTION_API_KEY is not set.", 409);
  }
  const body = (await readJson(request)) as { entity?: string; fields?: string[] } | undefined;
  const entity = body?.entity as SpecEntity | undefined;
  const requested = body?.fields;
  if (!entity || typeof entity !== "string" || !Array.isArray(requested)) {
    return apiError("validation_error", "Body must be { entity, fields: string[] }.", 400);
  }
  const spec = specFor(entity);
  const dataSourceId = env.dataSources[entity];
  if (!dataSourceId) {
    return apiError("not_configured", `${spec.envVar} is not set for ${spec.databaseTitle}.`, 409);
  }

  const client = createNotionClient(env);
  let discovered: DiscoveredDataSource;
  try {
    discovered = await discoverDataSource(client, dataSourceId);
  } catch (error) {
    const ne = toNotionError(error);
    return apiError(ne.code, ne.message, 502);
  }

  const mapping = resolveEntityMapping(entity, dataSourceId, discovered, loadMappingOverrides(), {
    dataSourceIds: env.dataSources,
  });
  const byField = new Map(mapping.fields.map((f) => [f.field, f]));

  const toAdd: Record<string, Record<string, unknown>> = {};
  const skipped: Array<{ field: string; reason: string }> = [];
  for (const fieldName of requested) {
    const specField = spec.fields.find((f) => f.field === fieldName);
    if (!specField) {
      skipped.push({ field: fieldName, reason: "not a Levito field" });
      continue;
    }
    const resolved = byField.get(fieldName);
    if (resolved && resolved.status === "ok") {
      skipped.push({ field: fieldName, reason: "already mapped" });
      continue;
    }
    if (specField.kind === "relation") {
      skipped.push({ field: fieldName, reason: "relations must be provisioned by npm run notion:setup" });
      continue;
    }
    // If a property with the conventional name already exists but is unmapped
    // (e.g. type mismatch), do not create a duplicate — report instead.
    const nameClash = discovered.properties.find(
      (p) => p.name === specField.property || p.name.toLowerCase() === specField.property.toLowerCase(),
    );
    if (nameClash) {
      skipped.push({
        field: fieldName,
        reason: `a property named "${nameClash.name}" already exists with type "${nameClash.type}" — remap the field instead`,
      });
      continue;
    }
    const config = propertyConfigFor(specField);
    if (!config) {
      skipped.push({ field: fieldName, reason: "unsupported kind" });
      continue;
    }
    toAdd[specField.property] = config;
  }

  if (Object.keys(toAdd).length === 0) {
    return json({ ok: true, added: [], skipped, message: "Nothing to add." });
  }

  try {
    await client.dataSources.update({ data_source_id: dataSourceId, properties: toAdd as never });
  } catch (error) {
    const ne = toNotionError(error);
    return apiError(ne.code, ne.message, 502);
  }

  const refreshed = await discoverDataSource(client, dataSourceId).catch(() => null);
  return json({
    ok: true,
    added: Object.keys(toAdd),
    skipped,
    schema: refreshed,
  });
}
