import type { Client } from "@notionhq/client";
import { describe, expect, it, vi } from "vitest";
import { evaluateInitiativeReadiness } from "@/domain/initiative-readiness";
import { createNotionRepositories } from "@/lib/notion/repositories";
import { specFor, type SpecEntity } from "@/lib/notion/specs";
import { readNotionEnv } from "@/lib/notion/env";
import { buildDemoSeed } from "@/lib/repositories/demo/seed";
import { createWorkspaceService } from "@/lib/services/workspace-service";

const today = "2026-11-26";
type Property = { type: string; [key: string]: unknown };
type Properties = Record<string, Property>;

function notionFixture() {
  const rows = new Map<string, { id: string; entity: string; properties: Properties }>();
  const pages = {
    create: vi.fn(async ({ parent, properties }: { parent: {data_source_id: string}; properties: Properties }) => {
      const id = `page-${rows.size}`;
      const row = { id, entity: parent.data_source_id, properties: responseProperties(properties) };
      rows.set(id, row);
      return row;
    }),
    update: vi.fn(async ({page_id, properties}: {page_id:string; properties:Properties}) => {
      const row = rows.get(page_id)!;
      Object.assign(row.properties, responseProperties(properties));
      return row;
    }),
    retrieve: async ({page_id}: {page_id:string}) => rows.get(page_id),
  };
  function responseProperties(properties: Properties) {
    return Object.fromEntries(Object.entries(properties).map(([id, prop]) => {
      const value = prop[prop.type];
      const text = prop.type === "rich_text" || prop.type === "title";
      return [id,{id,...prop,[prop.type]: text
        ? (value as {text:{content:string}}[]).map(t => ({plain_text:t.text.content})) : value}];
    }));
  }
  const dataSources = {
    retrieve: async ({data_source_id}: {data_source_id: SpecEntity}) => ({
      object:"data_source", id:data_source_id, properties:specFor(data_source_id).fields.map(f => ({
        id:f.property, name:f.property, type:f.kind, relation:{data_source_id:f.relationEntity},
      })),
    }),
    query: async ({data_source_id}: {data_source_id:string}) => ({
      results:[...rows.values()].filter(row => row.entity === data_source_id), has_more:false, next_cursor:null,
    }),
  };
  return {pages, client:{pages,dataSources} as unknown as Client};
}

describe("readiness from persisted Notion records (mock SDK)", () => {
  it("counts only saved content and scoped member relations; failed edits leave the score unchanged", async () => {
    const {pages,client} = notionFixture();
    const repos = await createNotionRepositories({client,overrides:{},env:{...readNotionEnv({}),dataSources:{
      members:"members",initiatives:"initiatives",knowledge:"knowledge",handovers:"handovers",
    }}});
    const service = createWorkspaceService(repos);
    const data = buildDemoSeed(today);
    const [initiative,other] = data.initiatives;
    const [owner,successor] = data.members;
    const scoped = { ...data.handovers[0], initiativeIds:[initiative.id], outgoingOwnerId:owner.id };
    for (const successorId of [null,owner.id]) {
      expect(await service.handovers.create({...scoped,successorId})).toMatchObject({
        ok:false,fieldErrors:{successorId:expect.any(String)},
      });
    }
    expect(pages.create).not.toHaveBeenCalled();
    const mismapped = await createNotionRepositories({client,overrides:{},env:{...readNotionEnv({}),
      dataSources:{handovers:"handovers",members:"wrong-source",initiatives:"initiatives"},
    }});
    await expect(createWorkspaceService(mismapped).handovers.create({...scoped,successorId:successor.id}))
      .rejects.toThrow(/property mapping/);
    expect(pages.create).not.toHaveBeenCalled();
    expect(await service.handovers.create({...scoped,successorId:successor.id})).toMatchObject({ok:true});
    expect(pages.create.mock.calls[0][0].properties).toMatchObject({
      "Outgoing owner":{type:"relation",relation:[{id:owner.id}]},
      Successor:{type:"relation",relation:[{id:successor.id}]},
      Initiatives:{type:"relation",relation:[{id:initiative.id}]},
    });
    const content = `  ${"x".repeat(199)}\n`;
    const doc = await service.knowledge.create({...data.knowledge[0],kind:"sop",initiativeIds:[initiative.id],content});
    if (!doc.ok) throw new Error(doc.message);
    expect(doc.record.content).toBe(content);
    async function points() {
      const persisted = {...data,knowledge:await repos.knowledge.list(),handovers:await repos.handovers.list()};
      const criterion = (i: typeof initiative, key: string) => evaluateInitiativeReadiness(i,persisted,{
        asOf:today,reviewWindowDays:180,
      }).criteria.find(c => c.id === key)!.points;
      expect(criterion(initiative,"successor")).toBe(20);
      expect(criterion(other,"successor")).toBe(0);
      return criterion(initiative,"playbook");
    }
    expect(await points()).toBe(13);
    pages.update.mockRejectedValueOnce(new Error("Notion unavailable"));
    await expect(service.knowledge.update(doc.record.id,{content:"x".repeat(200)})).rejects.toThrow();
    expect(await points()).toBe(13);
    for (const size of [200,201,4500]) {
      const content = "x".repeat(size);
      expect(await service.knowledge.update(doc.record.id,{content})).toMatchObject({
        ok:true,receipt:{target:"notion",confirmed:true},
      });
      expect((await repos.knowledge.get(doc.record.id))?.content).toBe(content);
      expect(await points()).toBe(25);
    }
  });
});
