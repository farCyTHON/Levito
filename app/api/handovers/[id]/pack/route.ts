import { apiError, json, requireContext } from "@/lib/server/api";
import { loadWorkspaceData, notionEnv } from "@/lib/server/context";
import { buildHandoverPack, packToMarkdown } from "@/domain/handover-pack";
import { evaluateReadiness } from "@/domain/readiness";
import { createNotionClient } from "@/lib/notion/client";
import { toNotionError } from "@/lib/notion/errors";

function markdownToBlocks(markdown: string): unknown[] {
  // Conservative markdown -> Notion blocks: headings, bullets, numbered items,
  // quotes and paragraphs. Anything unrecognized becomes a paragraph.
  const blocks: unknown[] = [];
  const rich = (text: string) => [{ type: "text", text: { content: text.slice(0, 2000) } }];
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith("### ")) {
      blocks.push({ object: "block", type: "heading_3", heading_3: { rich_text: rich(line.slice(4)) } });
    } else if (line.startsWith("## ")) {
      blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: rich(line.slice(3)) } });
    } else if (line.startsWith("# ")) {
      blocks.push({ object: "block", type: "heading_1", heading_1: { rich_text: rich(line.slice(2)) } });
    } else if (line.startsWith("- [ ] ") || line.startsWith("- [x] ")) {
      const checked = line[3] === "x";
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: { rich_text: rich(line.slice(6)), checked },
      });
    } else if (/^[-*] /.test(line)) {
      blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich(line.slice(2)) } });
    } else if (/^\d+\. /.test(line)) {
      blocks.push({ object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: rich(line.replace(/^\d+\. /, "")) } });
    } else if (line.startsWith("> ")) {
      blocks.push({ object: "block", type: "quote", quote: { rich_text: rich(line.slice(2)) } });
    } else {
      blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: rich(line) } });
    }
    if (blocks.length >= 950) break; // stay under the 1000-element append limit
  }
  return blocks;
}

/**
 * POST /api/handovers/[id]/pack — generates the handover pack from live records
 * and writes it as a new page under the configured Notion root page.
 * Requires Notion mode; demo mode gets an explicit 409.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const resolved = await requireContext({ requireNotion: true });
  if ("response" in resolved) return resolved.response;
  if (resolved.ctx.mode !== "notion") {
    return apiError("notion_required", "Handover packs can only be written to Notion.", 409);
  }

  const { id } = await ctx.params;
  const env = notionEnv();
  if (!env.apiKey || !env.rootPageId) {
    return apiError("not_configured", "Notion is not fully configured.", 409);
  }

  try {
    const data = await loadWorkspaceData(resolved.repos);
    const handover = data.handovers.find((h) => h.id === id);
    if (!handover) return apiError("not_found", `No handover with id "${id}".`, 404);

    const report = evaluateReadiness(handover, data, {
      asOf: resolved.ctx.today,
      reviewWindowDays: data.settings.reviewWindowDays,
    });
    const pack = buildHandoverPack(handover, data, report, resolved.ctx.today);
    const markdown = packToMarkdown(pack, "notion");
    const blocks = markdownToBlocks(markdown);

    const client = createNotionClient(env);
    const page = await client.pages.create({
      parent: { page_id: env.rootPageId },
      properties: {
        title: {
          title: [{ type: "text", text: { content: pack.title.slice(0, 2000) } }],
        },
      },
      children: blocks as never,
    });

    return json({
      ok: true,
      receipt: { target: "notion", confirmed: true, at: new Date().toISOString() },
      pack: { id: page.id, url: (page as { url?: string }).url ?? null, title: pack.title, generatedOn: pack.generatedOn },
    });
  } catch (error) {
    const ne = toNotionError(error);
    const status = ne.code === "rate_limited" ? 429 : ne.code === "validation_error" ? 422 : 502;
    return apiError(ne.code, ne.message, status);
  }
}
