import { apiError, json, requireContext } from "@/lib/server/api";
import { loadWorkspaceData, notionEnv } from "@/lib/server/context";
import { buildInitiativePack } from "@/domain/initiative-pack";
import { evaluateInitiativeReadiness } from "@/domain/initiative-readiness";
import { createNotionClient } from "@/lib/notion/client";
import { toNotionError } from "@/lib/notion/errors";

function markdownToBlocks(markdown: string): unknown[] {
  const blocks: unknown[] = [];
  const rich = (text: string) => [{ type: "text", text: { content: text.slice(0, 2000) } }];
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith("### ")) blocks.push({ object: "block", type: "heading_3", heading_3: { rich_text: rich(line.slice(4)) } });
    else if (line.startsWith("## ")) blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: rich(line.slice(3)) } });
    else if (line.startsWith("# ")) blocks.push({ object: "block", type: "heading_1", heading_1: { rich_text: rich(line.slice(2)) } });
    else if (/^[-*] /.test(line)) blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich(line.slice(2)) } });
    else blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: rich(line) } });
    if (blocks.length >= 950) break;
  }
  return blocks;
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const resolved = await requireContext();
  if ("response" in resolved) return resolved.response;
  const { id } = await ctx.params;

  try {
    const data = await loadWorkspaceData(resolved.repos);
    const initiative = data.initiatives.find((i) => i.id === id);
    if (!initiative) return apiError("not_found", `No initiative with id "${id}".`, 404);

    const readiness = evaluateInitiativeReadiness(initiative, data, {
      asOf: resolved.ctx.today,
      reviewWindowDays: data.settings.reviewWindowDays,
    });
    const pack = buildInitiativePack(initiative, data, readiness, resolved.ctx.today);

    if (resolved.ctx.mode !== "notion") {
      return json({ ok: true, demo: true, pack: { title: pack.title, markdown: pack.markdown, gaps: pack.gaps }, readiness });
    }

    const env = notionEnv();
    if (!env.rootPageId) {
      return apiError("not_configured", "NOTION_ROOT_PAGE_ID is not set — nowhere to create the pack page.", 409);
    }
    const client = createNotionClient(env);
    const page = await client.pages.create({
      parent: { page_id: env.rootPageId },
      properties: { title: { title: [{ type: "text", text: { content: pack.title.slice(0, 2000) } }] } },
      children: markdownToBlocks(pack.markdown) as never,
    });
    const url = (page as { url?: string }).url ?? null;

    // Link back: append a pointer block to the initiative's Notion page body.
    if (url && initiative.id) {
      await client.blocks.children
        .append({
          block_id: initiative.id,
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ type: "text", text: { content: `Handover pack: ${url}`, link: { url } } }] },
            },
          ] as never,
        })
        .catch(() => undefined);
    }

    return json({
      ok: true,
      demo: false,
      pack: { id: page.id, url, title: pack.title },
      readiness,
      receipt: { target: "notion", confirmed: true, at: new Date().toISOString() },
    });
  } catch (error) {
    const ne = toNotionError(error);
    return apiError(ne.code, ne.message, ne.code === "rate_limited" ? 429 : 502);
  }
}
