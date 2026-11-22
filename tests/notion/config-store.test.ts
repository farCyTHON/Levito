import { createHash, randomUUID } from "node:crypto";
import type { Client } from "@notionhq/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configStore, initializeConfig } from "@/lib/notion/config-store";
import { readNotionEnv } from "@/lib/notion/env";
import { createNotionRepositories } from "@/lib/notion/repositories";
import { runConfigCommand } from "../../scripts/config-command";

const root = randomUUID();
const page = randomUUID(), pin = randomUUID(), old = randomUUID(), note = randomUUID();
const org = { name: "Test Union", shortName: "TU", term: "Autumn", university: "Example" };
const oldPayload = { ...org, reviewWindowDays: 90 };
const header = { owner: "levito/config", version: 2, revision: randomUUID(), number: 1 };
const initial = { owner: header.owner, version: 2, kind: "manifest", previous: null, active: { revision: header.revision, number: 1, candidateId: old, digest: createHash("sha256").update(JSON.stringify({name:org.name,shortName:org.shortName,university:org.university,term:org.term,reviewWindowDays:90})).digest("hex") } };

function block(id: string, body: unknown, parent: string = page, isToggle = false) {
  return {
    id, type: isToggle ? "toggle" : "code", created_by: {id:"bot"}, parent: { type: parent === page ? "page_id" : "block_id", page_id: parent, block_id: parent },
    toggle: {rich_text: [{ plain_text: JSON.stringify(body) }]},
    archived: false, in_trash: false,
    code: { language: "json", rich_text: [{ plain_text: JSON.stringify(body) }] },
  };
}
type CodeWrite = { language: string; rich_text: { text: { content: string } }[] };
const unpack = (code: CodeWrite) => JSON.parse(code.rich_text.map(x => x.text.content).join(""));

function fixture() {
  const originalNote = block(note, { ...oldPayload, name: "Unrelated JSON example" });
  const originalCandidate = block(old, { ...header, kind: "candidate", payload: oldPayload });
  const rows = new Map([originalNote, originalCandidate, block(pin, initial, page, true)].map(b => [b.id, structuredClone(b)]));
  const blocks = {
    delete: vi.fn(),
    retrieve: vi.fn(async ({ block_id }: { block_id: string }) => {
      if (!rows.has(block_id)) throw new Error("Missing block");
      return structuredClone(rows.get(block_id)!);
    }),
    update: vi.fn(async ({ block_id, code }: { block_id: string; code: CodeWrite }) => {
      expect(rows.get(block_id)?.parent.block_id).toBe(pin);
      rows.set(block_id, block(block_id, unpack(code), pin));
      return rows.get(block_id);
    }),
    children: {
      list: vi.fn(async ({block_id}: {block_id:string}) => ({results: structuredClone([...rows.values()].filter(b => b.parent.block_id === block_id).reverse()), has_more:false})),
      append: vi.fn(async ({ block_id, children, position }: { block_id: string; children: {code?: CodeWrite; toggle?:CodeWrite}[]; position?:{type:string} }) => {
        const parent = block_id.replaceAll("-", "") === page.replaceAll("-", "") ? page : block_id;
        if (parent !== page) expect(position?.type).toBe("start");
        const results = children.map(({ code, toggle }) => {
          const b = block(randomUUID(), unpack((code ?? toggle)!), parent, !!toggle);
          rows.set(b.id, b);
          return b;
        });
        return { results: structuredClone(results) };
      }),
    },
  };
  const client = { blocks, users:{me:async()=>({id:"bot"})}, pages: { retrieve:async ({page_id}:{page_id:string})=>({id:page_id,parent:{type:"page_id",page_id:root}}) } } as unknown as Client;
  const repos = (manifest = pin as string) => createNotionRepositories({
    client, overrides: {}, env: readNotionEnv({ NOTION_ROOT_PAGE_ID:root, NOTION_CONFIG_PAGE_ID: page, NOTION_CONFIG_MANIFEST_BLOCK_ID: manifest }),
  });
  return { rows, client, repos, blocks, originalNote, originalCandidate };
}

describe("Notion configuration commits", () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => { f = fixture(); });
  afterEach(() => {
    expect(f.blocks.delete).not.toHaveBeenCalled();
    expect(f.blocks.children.list.mock.calls.every(([arg])=>arg.block_id !== page)).toBe(true);
    expect(f.rows.get(note)).toEqual(f.originalNote);
    expect(f.rows.get(old)).toEqual(f.originalCandidate);
  });

  it("switches the pin only after staging; fresh repositories follow it past the first JSON note", async () => {
    const writer = await f.repos();
    expect(await writer.organization.get()).toEqual(org);
    expect((await writer.settings.update({ reviewWindowDays: 180 })).receipt.confirmed).toBe(true);
    const reader = await f.repos();
    expect(await reader.settings.get()).toEqual({ reviewWindowDays: 180 });
    expect(await reader.organization.get()).toEqual(org);
    expect(f.rows.size).toBe(5);
    expect(f.rows.get(pin)).toEqual(block(pin, initial, page, true));

  });

  it.each(["append", "retrieve", "payload", "parent", "marker", "revision", "schema version"])(
    "leaves previous configuration active on candidate %s failure", async fault => {
      if (fault === "append") f.blocks.children.append.mockRejectedValueOnce(new Error("append failed"));
      const retrieve = f.blocks.retrieve.getMockImplementation()!;
      f.blocks.retrieve.mockImplementation(async args => {
        const b = await retrieve(args);
        if (args.block_id === pin || args.block_id === old) return b;
        if (fault === "retrieve") throw new Error("read-back failed");
        const body = JSON.parse(b.code.rich_text[0].plain_text);
        if (fault === "payload") body.payload.term = "Wrong";
        if (fault === "parent") b.parent.page_id = randomUUID();
        if (fault === "marker") body.owner = "unrelated";
        if (fault === "revision") body.revision = randomUUID();
        if (fault === "schema version") body.version = 99;
        b.code.rich_text[0].plain_text = JSON.stringify(body);
        return b;
      });
      const message = {
        append: /append failed/, retrieve: /read-back failed/, payload: /candidate verification/,
        parent: /parent or type/, marker: /Invalid Levito/, revision: /candidate verification/,
        "schema version": /Invalid Levito/,
      }[fault];
      await expect((await f.repos()).settings.update({ reviewWindowDays: 180 })).rejects.toThrow(message);
      expect(f.blocks.update).not.toHaveBeenCalled();
      expect(f.rows.get(pin)).toEqual(block(pin, initial, page, true));
      expect(await (await f.repos()).settings.get()).toEqual({ reviewWindowDays: 90 });
    },
  );

  it.each([true, false])("reconciles an ambiguous activation (committed=%s)", async committed => {
    const apply = f.blocks.update.getMockImplementation()!;
    f.blocks.update.mockImplementationOnce(async args => {
      if (committed) await apply(args);
      throw new Error("connection interrupted");
    });
    const save = (await f.repos()).settings.update({ reviewWindowDays: 120 });
    if (committed) expect((await save).receipt.confirmed).toBe(true);
    else await expect(save).rejects.toThrow("connection interrupted");
    expect(f.blocks.retrieve.mock.calls.at(-1)?.[0].block_id).toBe(pin);
    expect(f.blocks.update).toHaveBeenCalledTimes(1);
    expect(await (await f.repos()).settings.get()).toEqual({ reviewWindowDays: committed ? 120 : 90 });
  });

  it("never confirms an activation when the final read is unavailable", async () => {
    const apply = f.blocks.update.getMockImplementation()!;
    f.blocks.update.mockImplementationOnce(async args => {
      const result = await apply(args);
      f.blocks.retrieve.mockRejectedValueOnce(new Error("unavailable"));
      return result;
    });
    await expect((await f.repos()).settings.update({ reviewWindowDays: 120 })).rejects.toThrow(/could not be verified/);
    expect(await (await f.repos()).settings.get()).toEqual({ reviewWindowDays: 120 });
  });

  it("rejects a competing manifest revision before activation", async () => {
    const append = f.blocks.children.append.getMockImplementation()!;
    f.blocks.children.append.mockImplementationOnce(async args => {
      const result = await append(args);
      const payload = { name:org.name, shortName: org.shortName, university:org.university, term:org.term, reviewWindowDays:75 };
      const other = { ...initial.active, revision: randomUUID(), candidateId: randomUUID(), digest:createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
      f.rows.set(other.candidateId, block(other.candidateId, { ...header, revision:other.revision, kind:"candidate",payload }));
      f.rows.set(pin, block(pin, {...initial, active:other},page,true));
      return result;
    });
    await expect((await f.repos()).settings.update({ reviewWindowDays: 180 })).rejects.toThrow(/changed/);
    expect(f.blocks.update).not.toHaveBeenCalled();
    expect(await (await f.repos()).settings.get()).toEqual({ reviewWindowDays: 75 });
  });

  it("serializes concurrent read-merge-write calls across repository instances", async () => {
    const [a, b] = await Promise.all([f.repos(), f.repos()]);
    await Promise.all([a.organization.update({ ...org, term: "Spring" }), b.settings.update({ reviewWindowDays: 180 })]);
    const fresh = await f.repos();
    expect(await fresh.organization.get()).toEqual({ ...org, term: "Spring" });
    expect(await fresh.settings.get()).toEqual({ reviewWindowDays: 180 });
  });

  it("a delayed activation cannot replace a confirmed post-restart save", async () => {
    const apply = f.blocks.update.getMockImplementation()!;
    let late!: () => Promise<unknown>;
    f.blocks.update.mockImplementationOnce(async args => {
      late = () => apply(args);
      throw new Error("timeout");
    });
    await expect((await f.repos()).settings.update({ reviewWindowDays: 120 })).rejects.toThrow(/timeout/);
    expect(await (await f.repos()).settings.get()).toEqual({reviewWindowDays:90});

    // Discard both module state and the global write queue, keeping only mock Notion records.
    vi.resetModules();
    delete (globalThis as {levitoConfigWrites?: unknown}).levitoConfigWrites;
    const { configStore: restarted } = await import("@/lib/notion/config-store");
    await restarted(f.client, page, pin, root).update({reviewWindowDays:180});
    expect((await restarted(f.client, page, pin, root).get()).reviewWindowDays).toBe(180);
    await late();
    expect((await restarted(f.client, page, pin, root).get()).reviewWindowDays).toBe(180);
    expect(new Set(f.blocks.update.mock.calls.map(([a])=>a.block_id)).size).toBe(2);
  });

  it.each(["unavailable", "invalid payload"])("explicit restoration after active candidate %s", async reason => {
    const store = configStore(f.client, page, pin, root);
    await store.update({ reviewWindowDays: 120 });
    const {active,previous} = await store.previewRecovery();
    const retrieve = f.blocks.retrieve.getMockImplementation()!;
    f.blocks.retrieve.mockImplementation(async args => {
      const b = await retrieve(args);
      if (args.block_id === active.candidateId) {
        if (reason === "unavailable") throw new Error("not accessible");
        b.code.rich_text[0].plain_text = "{}";
      }
      return b;
    });
    await expect(store.get()).rejects.toThrow();
    expect((await store.previewRecovery()).payload).toEqual(oldPayload);
    await expect(store.restore(randomUUID(), previous.revision)).rejects.toThrow(/selection changed/);
    await store.restore(active.revision, previous.revision);
    expect(await (await f.repos()).settings.get()).toEqual({reviewWindowDays:90});
    expect((await store.previewRecovery()).active.number).toBe(3);
  });

  it("rejects recovery from a schema-valid but altered predecessor", async () => {
    const store = configStore(f.client, page, pin, root);
    await store.update({reviewWindowDays:180});
    const {active,previous} = await store.previewRecovery();
    const retrieve = f.blocks.retrieve.getMockImplementation()!;
    f.blocks.retrieve.mockImplementation(async args => {
      const b = await retrieve(args);
      if (b.id === old) {
        const data = JSON.parse(b.code.rich_text[0].plain_text);
        data.payload.term = "Not verified";
        b.code.rich_text[0].plain_text = JSON.stringify(data);
      }
      return b;
    });
    await expect(store.previewRecovery()).rejects.toThrow(/digest/);
    await expect(store.restore(active.revision,previous.revision)).rejects.toThrow(/digest/);
    expect(f.blocks.update).toHaveBeenCalledTimes(1);
  });

  it("refuses missing and unmarked pins without writing", async () => {
    for (const id of ["", note]) {
      await expect((await f.repos(id)).organization.update(org)).rejects.toThrow();
    }
    expect(f.blocks.children.append).not.toHaveBeenCalled();
    expect(f.blocks.update).not.toHaveBeenCalled();
  });

  it("explicit initialization returns a verified new pin without adopting legacy data", async () => {
    const id = await initializeConfig(f.client, page, root);
    const fresh = await f.repos(id);
    expect(await fresh.settings.get()).toEqual({ reviewWindowDays: 365 });
    expect((await fresh.organization.get()).name).toBe("");
    expect(f.rows.get(pin)).toEqual(block(pin, initial, page, true));
  });
});

describe("setup CLI dispatch (injected mock client, no process or env file)", () => {
  const env = {NOTION_CONFIG_PAGE_ID:page};
  it.each(["wrong parent","missing access","absent page","no explicit page","legacy without pin","unknown flag"])(
    "rejects %s before provisioning or configuration writes", async reason => {
      const f = fixture(), provision = vi.fn();
      if (reason === "wrong parent") vi.spyOn(f.client.pages,"retrieve").mockResolvedValue({id:page,parent:{type:"page_id",page_id:randomUUID()}} as never);
      if (reason === "missing access" || reason === "absent page") vi.spyOn(f.client.pages,"retrieve").mockRejectedValue(new Error(reason));
      const flags = reason === "legacy without pin" ? [] : [reason === "unknown flag" ? "--typo" : "--init-config"];
      await expect(runConfigCommand(f.client,root,reason === "no explicit page" ? {} : env,flags,provision)).rejects.toThrow();
      expect(provision).not.toHaveBeenCalled();
      expect(f.blocks.children.append).not.toHaveBeenCalled();
      expect(f.blocks.update).not.toHaveBeenCalled();
      expect(f.blocks.delete).not.toHaveBeenCalled();
    });
  it("initializes once, reuses its manifest across executions and preserves legacy notes", async () => {
    const f = fixture(), provision = vi.fn();
    f.rows.delete(pin); // Model an uninitialized page with existing JSON notes.
    const run = () => runConfigCommand(f.client,root,env,["--init-config"],provision);
    const first = await run();
    expect(first).toMatch(/^NOTION_CONFIG_MANIFEST_BLOCK_ID=/);
    expect(await run()).toEqual(first);
    expect(f.blocks.children.append).toHaveBeenCalledTimes(2);
    expect(provision).not.toHaveBeenCalled();
    expect(f.rows.get(note)).toEqual(f.originalNote);
    expect(f.blocks.delete).not.toHaveBeenCalled();
  });
  it("refuses ambiguous discovery but honors explicit verified selection", async () => {
    const f = fixture(), provision = vi.fn(), other = randomUUID();
    f.rows.set(other,block(other,initial,page,true));
    await expect(runConfigCommand(f.client,root,env,["--init-config"],provision)).rejects.toThrow(/Multiple managed manifests/);
    await expect(runConfigCommand(f.client,root,{...env,NOTION_CONFIG_MANIFEST_BLOCK_ID:pin},[],provision)).resolves.toBeUndefined();
    expect(provision).toHaveBeenCalledWith(page,pin);
    expect(f.blocks.children.append).not.toHaveBeenCalled();
    expect(f.blocks.delete).not.toHaveBeenCalled();
  });
  it("copies an explicitly pinned v1 revision once; never mutates the old namespace", async () => {
    const f = fixture(), provision = vi.fn();
    const v1 = {owner:header.owner,version:1,revision:header.revision};
    const manifest = block(pin,{...v1,kind:"manifest",candidateId:old});
    f.rows.set(pin,manifest);
    f.rows.set(old,block(old,{...v1,kind:"candidate",payload:oldPayload}));
    const run = () => runConfigCommand(f.client,root,{...env,NOTION_CONFIG_MANIFEST_BLOCK_ID:pin},["--upgrade-v1"],provision);
    const result = await run();
    expect(await run()).toBe(result);
    const migrated = await f.repos(result!.split("=")[1]);
    expect(await migrated.settings.get()).toEqual({reviewWindowDays:90});
    expect(await migrated.organization.get()).toEqual(org);
    expect(f.rows.get(pin)).toEqual(manifest);
    expect(f.blocks.children.append).toHaveBeenCalledTimes(2);
    expect(f.blocks.update).not.toHaveBeenCalled();
    expect(f.blocks.delete).not.toHaveBeenCalled();
  });
});
