import type { SpecEntity } from "./specs";
import { ENTITY_SPECS } from "./specs";

export interface NotionEnv {
  apiKey: string | null;
  version: string;
  rootPageId: string | null;
  configPageId: string | null;
  configManifestBlockId: string | null;
  dataSources: Partial<Record<SpecEntity, string>>;
}

export const DEFAULT_NOTION_VERSION = "2026-03-11";

export function readNotionEnv(env: Record<string, string | undefined> = process.env): NotionEnv {
  const dataSources: Partial<Record<SpecEntity, string>> = {};
  for (const spec of ENTITY_SPECS) {
    const id = env[spec.envVar]?.trim();
    if (id) dataSources[spec.entity] = id.replace(/-/g, "");
  }
  return {
    apiKey: env.NOTION_API_KEY?.trim() || env.NOTION_TOKEN?.trim() || null,
    version: env.NOTION_VERSION?.trim() || DEFAULT_NOTION_VERSION,
    rootPageId: env.NOTION_ROOT_PAGE_ID?.trim()?.replace(/-/g, "") || null,
    configPageId: env.NOTION_CONFIG_PAGE_ID?.trim()?.replace(/-/g, "") || null,
    configManifestBlockId: env.NOTION_CONFIG_MANIFEST_BLOCK_ID?.trim() || null,
    dataSources,
  };
}

export interface NotionConfigIssue {
  key: string;
  description: string;
}

/** Returns the list of missing configuration keys; empty means fully configured. */
export function missingNotionConfig(env: NotionEnv): NotionConfigIssue[] {
  const issues: NotionConfigIssue[] = [];
  if (!env.apiKey) issues.push({ key: "NOTION_API_KEY", description: "Notion internal integration token" });
  if (!env.rootPageId) issues.push({ key: "NOTION_ROOT_PAGE_ID", description: "Parent page ID for the Levito workspace" });
  for (const spec of ENTITY_SPECS) {
    if (!env.dataSources[spec.entity]) {
      issues.push({ key: spec.envVar, description: `Data source ID for ${spec.databaseTitle}` });
    }
  }
  if (!env.configPageId) {
    issues.push({ key: "NOTION_CONFIG_PAGE_ID", description: "Levito configuration page ID (created by notion:setup)" });
  }
  if (!env.configManifestBlockId) {
    issues.push({ key: "NOTION_CONFIG_MANIFEST_BLOCK_ID", description: "Pinned Levito configuration manifest (see README migration instructions)" });
  }
  return issues;
}

export function hasNotionCredentials(env: NotionEnv): boolean {
  return Boolean(env.apiKey);
}
