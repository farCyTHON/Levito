import type { WorkspaceRepositories } from "@/lib/repositories";
import type { NotionAdapterStatus } from "./types";

export type { DataSourceMapping, FieldMapping, NotionAdapterStatus, NotionWorkspaceMapping } from "./types";

export const NOTION_API_VERSION = "2026-03-11";

export class NotionAdapterNotImplementedError extends Error {
  constructor() {
    super("The Notion adapter is not implemented in Phase 1. Levito is running on demo data only.");
    this.name = "NotionAdapterNotImplementedError";
  }
}

export function getNotionAdapterStatus(env: Record<string, string | undefined> = process.env): NotionAdapterStatus {
  const credentialsDetected = Boolean(env.NOTION_TOKEN);
  return {
    state: "not_implemented",
    credentialsDetected,
    message: credentialsDetected
      ? "A Notion token is configured, but this build cannot use it yet. No Notion requests are made."
      : "No Notion credentials are configured. No Notion requests are made.",
  };
}

export function createNotionRepositories(): WorkspaceRepositories {
  throw new NotionAdapterNotImplementedError();
}
