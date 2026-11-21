import "server-only";
import { Client } from "@notionhq/client";
import { NotionError } from "./errors";

export type NotionClient = Client;

/**
 * Creates a server-side Notion client. Credentials never leave the server:
 * this module is marked `server-only` and must only be imported from route
 * handlers, server components or scripts running on the server.
 */
export function createNotionClient(env: { apiKey: string | null; version: string }): NotionClient {
  if (!env.apiKey) {
    throw new NotionError("invalid_credentials", "NOTION_API_KEY is not configured.");
  }
  return new Client({ auth: env.apiKey, notionVersion: env.version });
}
