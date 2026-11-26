import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/handovers/[id]/pack/route";
import { buildHandoverPack, packToMarkdown } from "@/domain/handover-pack";
import { evaluateReadiness } from "@/domain/readiness";
import { createDemoRepositories } from "@/lib/repositories/demo/demo-repositories";
import { DemoStore } from "@/lib/repositories/demo/demo-store";
import { buildDemoSeed } from "@/lib/repositories/demo/seed";
import { getAppContext, notionEnv } from "@/lib/server/context";
import { readNotionEnv } from "@/lib/notion/env";

const { createPage } = vi.hoisted(() => ({ createPage: vi.fn() }));
vi.mock("@/lib/notion/client", () => ({ createNotionClient: () => ({ pages: { create: createPage } }) }));
vi.mock("@/lib/server/context", async (original) => ({
  ...await original<typeof import("@/lib/server/context")>(),
  getAppContext: vi.fn(),
  notionEnv: vi.fn(),
}));

const today = "2026-11-26";
const data = buildDemoSeed(today);
const repos = createDemoRepositories(new DemoStore({ seed: () => data }));
const handover = data.handovers[0];
const post = () => POST(new Request("http://localhost/"), { params: Promise.resolve({ id: handover.id }) });

beforeEach(() => vi.clearAllMocks());

it("rejects demo mode before attempting a Notion write", async () => {
  vi.mocked(getAppContext).mockResolvedValue({ mode: "demo", repositories: repos, today, error: null });
  const response = await post();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "notion_required" } });
  expect(createPage).not.toHaveBeenCalled();
});

it("saves the same attribution, readiness and handover content as the clipboard formatter", async () => {
  vi.mocked(getAppContext).mockResolvedValue({ mode: "notion", repositories: repos, today, error: null });
  vi.mocked(notionEnv).mockReturnValue(readNotionEnv({ NOTION_API_KEY: "test", NOTION_ROOT_PAGE_ID: "test-root" }));
  createPage.mockResolvedValue({ id: "test-pack", url: "https://example.test/pack" });
  expect((await post()).status).toBe(200);
  const report = evaluateReadiness(handover, data, { asOf: today, reviewWindowDays: data.settings.reviewWindowDays });
  const copy = packToMarkdown(buildHandoverPack(handover, data, report, today), "notion");
  type Block = Record<string, { rich_text: { text: { content: string } }[] }> & { type: string };
  const blocks: Block[] = createPage.mock.calls[0][0].children;
  expect(blocks.map(b => b[b.type].rich_text[0].text.content)).toEqual(
    copy.split("\n").filter(Boolean).map(line => line.replace(/^(#{1,3} |- )/, "")),
  );
});
