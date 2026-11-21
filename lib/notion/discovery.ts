import "server-only";
import type { Client } from "@notionhq/client";
import { toNotionError } from "./errors";
import type { FieldKind } from "./specs";

export interface DiscoveredOption {
  id: string;
  name: string;
}

export interface DiscoveredProperty {
  id: string;
  name: string;
  type: string;
  options?: DiscoveredOption[];
  /** For relation properties: the data source this relation points at. */
  relationDataSourceId?: string;
}

export interface DiscoveredDataSource {
  id: string;
  title: string;
  properties: DiscoveredProperty[];
}

function plainText(richText: unknown): string {
  if (!Array.isArray(richText)) return "";
  return richText
    .map((item) => {
      const text = (item as { plain_text?: string }).plain_text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

export async function discoverDataSource(
  client: Client,
  dataSourceId: string,
): Promise<DiscoveredDataSource> {
  try {
    const ds = await client.dataSources.retrieve({ data_source_id: dataSourceId });
    if (ds.object !== "data_source") {
      throw new Error("Unexpected response while retrieving the data source.");
    }
    const properties: DiscoveredProperty[] = Object.values(ds.properties ?? {}).map((prop) => {
      const p = prop as {
        id?: string;
        name?: string;
        type?: string;
        select?: { options?: Array<{ id?: string; name?: string }> };
        multi_select?: { options?: Array<{ id?: string; name?: string }> };
        status?: { options?: Array<{ id?: string; name?: string }> };
        relation?: { data_source_id?: string };
      };
      const options = p.select?.options ?? p.multi_select?.options ?? p.status?.options;
      return {
        id: String(p.id ?? ""),
        name: String(p.name ?? ""),
        type: String(p.type ?? "unknown"),
        options: options?.map((o) => ({ id: String(o.id ?? ""), name: String(o.name ?? "") })),
        relationDataSourceId: p.relation?.data_source_id,
      };
    });
    const title = "title" in ds ? plainText((ds as { title?: unknown }).title) : "";
    return { id: ds.id, title, properties };
  } catch (error) {
    throw toNotionError(error);
  }
}

/** Checks whether a discovered Notion property type can serve a Levito field kind. */
export function kindCompatible(kind: FieldKind, notionType: string): boolean {
  switch (kind) {
    case "title":
      return notionType === "title";
    case "relation":
      return notionType === "relation";
    default:
      return notionType === kind;
  }
}
