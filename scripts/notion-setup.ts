/**
 * Levito Notion provisioning — idempotent.
 *
 * Requires an explicitly selected configuration page beneath NOTION_ROOT.
 * Creates or reuses databases and relations, then writes IDs to .env.local.
 *
 * Run: npm run notion:setup
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Client } from "@notionhq/client";
import { listRootDatabases, runConfigCommand } from "./config-command.ts";
import { ENTITY_SPECS, specFor, type SpecEntity } from "../lib/notion/specs.ts";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const API_KEY = process.env.NOTION_API_KEY ?? process.env.NOTION_TOKEN;
const ROOT_PAGE_ID = process.env.NOTION_ROOT_PAGE_ID?.replace(/-/g, "");
const VERSION = process.env.NOTION_VERSION || "2026-03-11";

if (!API_KEY || !ROOT_PAGE_ID) {
  console.error("Missing NOTION_API_KEY or NOTION_ROOT_PAGE_ID in .env.local — see .env.example.");
  process.exit(1);
}

const ROOT: string = ROOT_PAGE_ID;
const client = new Client({ auth: API_KEY, notionVersion: VERSION, retry: false });
const results: Array<{ entity: SpecEntity | "config"; title: string; dataSourceId?: string; action: string }> = [];

function rt(text: string): Array<{ type: "text"; text: { content: string } }> {
  return [{ type: "text", text: { content: text } }];
}

/** Scalar (non-relation) properties for initial_data_source creation. */
function scalarProperties(spec: (typeof ENTITY_SPECS)[number]) {
  const props: Record<string, unknown> = {};
  for (const field of spec.fields) {
    if (field.kind === "relation") continue;
    switch (field.kind) {
      case "title":
        props[field.property] = { type: "title", title: {} };
        break;
      case "rich_text":
        props[field.property] = { type: "rich_text", rich_text: {} };
        break;
      case "select":
        props[field.property] = {
          type: "select",
          select: { options: (field.options ?? []).map((name) => ({ name })) },
        };
        break;
      case "multi_select":
        props[field.property] = {
          type: "multi_select",
          multi_select: { options: (field.options ?? []).map((name) => ({ name })) },
        };
        break;
      case "date":
        props[field.property] = { type: "date", date: {} };
        break;
      case "checkbox":
        props[field.property] = { type: "checkbox", checkbox: {} };
        break;
      case "email":
        props[field.property] = { type: "email", email: {} };
        break;
      case "phone_number":
        props[field.property] = { type: "phone_number", phone_number: {} };
        break;
      case "url":
        props[field.property] = { type: "url", url: {} };
        break;
    }
  }
  return props;
}

async function dataSourceIdForDatabase(databaseId: string): Promise<string> {
  const db = await client.databases.retrieve({ database_id: databaseId });
  const sources = (db as { data_sources?: Array<{ id: string }> }).data_sources ?? [];
  if (sources.length === 0) throw new Error(`Database ${databaseId} has no data sources.`);
  return sources[0].id.replace(/-/g, "");
}

async function ensureDatabase(spec: (typeof ENTITY_SPECS)[number], existing: Map<string, string>) {
  const found = existing.get(spec.databaseTitle);
  if (found) {
    results.push({ entity: spec.entity, title: spec.databaseTitle, dataSourceId: found, action: "reused" });
    return found;
  }
  const created = await client.databases.create({
    parent: { type: "page_id", page_id: ROOT },
    title: rt(spec.databaseTitle),
    is_inline: true,
    initial_data_source: { properties: scalarProperties(spec) as never },
  });
  const databaseId = (created as { id: string }).id;
  const dsId = await dataSourceIdForDatabase(databaseId);
  existing.set(spec.databaseTitle, dsId);
  results.push({ entity: spec.entity, title: spec.databaseTitle, dataSourceId: dsId, action: "created" });
  return dsId;
}

async function ensureRelations(env: Record<SpecEntity, string>) {
  for (const spec of ENTITY_SPECS) {
    for (const field of spec.fields) {
      if (field.kind !== "relation" || !field.relationEntity) continue;
      const targetId = env[field.relationEntity];
      if (!targetId) continue;
      const dsId = env[spec.entity];
      const schema = await client.dataSources.retrieve({ data_source_id: dsId });
      const props = (schema as { properties?: Record<string, { id: string; type: string; name?: string; relation?: { data_source_id?: string } }> }).properties ?? {};
      const match = Object.entries(props).find(([name]) => name === field.property);
      if (match) {
        const [, prop] = match;
        const norm = (v?: string) => (v ?? "").replace(/-/g, "");
        if (prop.type === "relation" && norm(prop.relation?.data_source_id) === norm(targetId)) continue;
        console.warn(`  ! "${field.property}" on ${spec.databaseTitle} exists but is not the expected relation — leaving unchanged`);
        continue;
      }
      await client.dataSources.update({
        data_source_id: dsId,
        properties: {
          [field.property]: {
            type: "relation",
            relation: { data_source_id: targetId, type: "single_property", single_property: {} },
          },
        } as never,
      });
      console.log(`  + relation "${field.property}" on ${spec.databaseTitle} -> ${specFor(field.relationEntity).databaseTitle}`);
    }
  }
}

async function provision(configPageId: string, pin: string) {
  console.log(`Levito Notion setup (API ${VERSION})`);
  console.log(`Root page: ${ROOT}\n`);

  const children = await listRootDatabases(client, ROOT);
  const dbTitles = new Map<string, string>();
  for (const child of children) {
    try {
      dbTitles.set(child.title, await dataSourceIdForDatabase(child.id));
    } catch {
      console.warn(`  ! could not resolve data source for database "${child.title}"`);
    }
  }

  const env = {} as Record<SpecEntity, string>;
  for (const spec of ENTITY_SPECS) {
    env[spec.entity] = await ensureDatabase(spec, dbTitles);
  }
  console.log("Ensuring relation properties…");
  await ensureRelations(env);

  // Write IDs back to .env.local (idempotent upsert).
  const envPath = ".env.local";
  const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split("\n") : [];
  const upserts: Record<string, string> = {
    NOTION_VERSION: VERSION,
    NOTION_CONFIG_PAGE_ID: configPageId,
    NOTION_CONFIG_MANIFEST_BLOCK_ID: pin,
    ...Object.fromEntries(ENTITY_SPECS.map((s) => [s.envVar, env[s.entity]])),
  };
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (match && upserts[match[1]] !== undefined) {
      seen.add(match[1]);
      return `${match[1]}=${upserts[match[1]]}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(upserts)) {
    if (!seen.has(key)) out.push(`${key}=${value}`);
  }
  writeFileSync(envPath, out.join("\n").replace(/\n+$/, "\n"), "utf8");

  console.log("\nSetup complete:\n");
  for (const r of results) {
    console.log(`  ${r.action === "created" ? "+" : "="} ${r.title}${r.dataSourceId ? `  (${r.dataSourceId})` : ""}`);
  }
  console.log(`\n.env.local updated with data source IDs and NOTION_CONFIG_PAGE_ID=${configPageId}`);
  console.log("Next: restart the dev server (env is read at startup), then open Settings → Data source.");
}

runConfigCommand(client, ROOT, process.env, process.argv.slice(2), provision).then(message => {
  if (message) console.log(message);
}).catch((error) => {
  console.error("\nSetup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
