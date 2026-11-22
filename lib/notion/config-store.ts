import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Client } from "@notionhq/client";
import { z } from "zod";

const payloadSchema = z.strictObject({
  name: z.union([z.literal(""), z.string().min(2).max(140)]), shortName: z.string().max(12),
  university: z.string().max(120), term: z.string().max(40), reviewWindowDays: z.number().int().min(30).max(730),
});
type Payload = z.infer<typeof payloadSchema>;
const header = { owner: z.literal("levito/config"), version: z.literal(2) };
const revision = { revision: z.uuid(), number: z.number().int().positive() };
const ref = z.strictObject({ ...revision, candidateId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) });
const pointers = { active: ref, previous: ref.nullable() };
const manifest = z.strictObject({ ...header, kind: z.literal("manifest"), ...pointers });
const slot = z.strictObject({ ...header, kind: z.literal("slot"), state: z.enum(["prepared", "committed"]), ...pointers });
const candidate = z.strictObject({ ...header, kind: z.literal("candidate"), ...revision, payload: payloadSchema });
const mark = { owner: "levito/config", version: 2 } as const;
type Ref = z.infer<typeof ref>;
type Block = Awaited<ReturnType<Client['blocks']['retrieve']>>;
const norm = (id: string) => id.replaceAll("-", "").toLowerCase();
const digest = (data: Payload) => createHash("sha256").update(JSON.stringify(payloadSchema.parse(data))).digest("hex");
const rich = (data: object) => (JSON.stringify(data).match(/[\s\S]{1,1000}/gu) ?? [])
  .map(content => ({ text: { content } }));
const code = (data: object) => ({ language: "json" as const, rich_text: rich(data) });

export async function verifyConfigPage(client: Client, page: string, root: string) {
  if (!page || !root) throw new Error("Both configuration page and root IDs are required.");
  const p = await client.pages.retrieve({ page_id: page });
  if (!("parent" in p) || p.in_trash || norm(p.id) !== norm(page) || p.parent.type !== "page_id" || norm(p.parent.page_id) !== norm(root)) {
    throw new Error("Expected a live configuration page directly under NOTION_ROOT_PAGE_ID.");
  }
}

function jsonBody(b: Block) {
  if (!("type" in b)) return null;
  const parts = b.type === "toggle" ? b.toggle.rich_text : b.type === "code" && b.code.language === "json" ? b.code.rich_text : null;
  try { return parts && JSON.parse(parts.map(p => p.plain_text).join("")); } catch { return null; }
}
function parse<T>(b: Block, parent: string, nested: boolean, schema: z.ZodType<T>, toggle = false) {
  if (!("type" in b) || b.in_trash || b.type !== (toggle ? "toggle" : "code") ||
      !(nested ? b.parent.type === "block_id" && norm(b.parent.block_id) === norm(parent)
        : b.parent.type === "page_id" && norm(b.parent.page_id) === norm(parent))) throw new Error("Unexpected configuration block parent or type.");
  const result = schema.safeParse(jsonBody(b));
  if (!result.success) throw new Error("Invalid Levito configuration block or schema version.");
  return result.data;
}
async function exact(client: Client, id: string) {
  const b = await client.blocks.retrieve({ block_id: id });
  if (norm(b.id) !== norm(id)) throw new Error("Configuration read returned a different block.");
  return b;
}
async function append(client: Client, parent: string, body: object, toggle = false, first = false) {
  const { results } = await client.blocks.children.append({ block_id: parent,
    ...(first ? { position: { type: "start" as const } } : {}),
    children: [toggle ? { type: "toggle", toggle: { rich_text: rich(body) } } : { type: "code", code: code(body) }],
  });
  if (results.length !== 1 || !z.uuid().safeParse(results[0].id).success) throw new Error("Unconfirmed appended block ID.");
  return results[0].id;
}
async function stage(client: Client, page: string, input: Payload, number: number): Promise<Ref> {
  const payload = payloadSchema.parse(input);
  const intended = { ...mark, kind: "candidate", revision: randomUUID(), number, payload } as const;
  const id = await append(client, page, intended);
  if (!isDeepStrictEqual(parse(await exact(client, id), page, false, candidate), intended)) throw new Error("Configuration candidate verification failed.");
  return { revision: intended.revision, number, candidateId: id, digest: digest(payload) };
}
async function load(client: Client, page: string, pointer: Ref) {
  const data = parse(await exact(client, pointer.candidateId), page, false, candidate);
  if (data.revision !== pointer.revision || data.number !== pointer.number || digest(data.payload) !== pointer.digest) throw new Error("Candidate revision or payload digest mismatch.");
  return data.payload;
}
export async function initializeConfig(client: Client, page: string, root: string,
  payload: Payload = { name: "", shortName: "", university: "", term: "", reviewWindowDays: 365 }) {
  await verifyConfigPage(client, page, root);
  const active = await stage(client, page, payload, 1);
  const body = { ...mark, kind: "manifest", active, previous: null } as const;
  const pin = await append(client, page, body, true);
  if (!isDeepStrictEqual(parse(await exact(client, pin), page, false, manifest, true), body)) throw new Error("Initial manifest verification failed.");
  return pin;
}

async function* children(client: Client, parent: string) {
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (;;) {
    const res = await client.blocks.children.list({ block_id: parent, start_cursor: cursor, page_size: 100 });
    yield* res.results;
    if (!res.has_more) return;
    if (!res.next_cursor || seen.has(res.next_cursor)) throw new Error("Incomplete configuration listing.");
    seen.add(cursor = res.next_cursor);
  }
}

// Installation-only discovery. Never adopt a user's JSON example, even if it copies the format.
export async function discoverManifest(client: Client, page: string, exclude?: string) {
  const bot = await client.users.me({});
  const ids: string[] = [];
  for await (const b of children(client, page)) {
    if (!("created_by" in b)) throw new Error("Partial configuration-page listing. Cannot safely discover a manifest.");
    if (exclude && norm(b.id) === norm(exclude)) continue;
    const body = jsonBody(b);
    if (body?.owner !== mark.owner || body.kind !== "manifest") continue;
    if (b.created_by.id !== bot.id) throw new Error("Manifest marker from a different author. Explicitly select a trusted manifest.");
    ids.push(b.id);
  }
  if (ids.length > 1) throw new Error(`Multiple managed manifests: ${ids.join(", ")}. Explicitly select a verified v2 pin.`);
  return ids[0];
}

// Explicit v1 pin only. Copy its selected values to an independent v2 namespace:
// an outstanding v1 PATCH can never address a v2 slot.
export async function readLegacyPin(client: Client, page: string, pin: string) {
  const v1 = { owner: z.literal("levito/config"), version: z.literal(1), revision: z.uuid() };
  const pointer = parse(await exact(client,pin), page, false,
    z.strictObject({...v1,kind:z.literal("manifest"),candidateId:z.uuid()}));
  const entry = parse(await exact(client,pointer.candidateId), page, false,
    z.strictObject({...v1,kind:z.literal("candidate"),payload:payloadSchema}));
  if (entry.revision !== pointer.revision) throw new Error("Legacy configuration revision mismatch.");
  return entry.payload;
}

const runtime = globalThis as typeof globalThis & { levitoConfigWrites?: Map<string, Promise<void>> };
const writes = (runtime.levitoConfigWrites ??= new Map());
export function configStore(client: Client, page: string, pin: string, root: string) {
  // Each slot reserves its precedence BEFORE any activation request. Activation updates only
  // that exact slot, never its position. An unacknowledged reservation is never activated.
  async function head() {
    const initial = parse(await exact(client, pin), page, false, manifest, true);
    let highest = initial.active.number;
    for await (const b of children(client, pin)) {
      const record = parse(b, pin, true, slot);
      highest = Math.max(highest, record.active.number);
      if (record.state === "committed") return { active: record.active, previous: record.previous, highest };
    }
    return { active: initial.active, previous: initial.previous, highest };
  }
  type Head = Awaited<ReturnType<typeof head>>;
  async function save(prepare: (base: Head) => Promise<{ payload: Payload; previous: Ref }>) {
    const key = norm(pin);
    const operation = (writes.get(key) ?? Promise.resolve()).then(async () => {
      await verifyConfigPage(client, page, root);
      const base = await head();
      const change = await prepare(base);
      const active = await stage(client, page, change.payload, base.highest + 1);
      const pending = { ...mark, kind: "slot", state: "prepared", active, previous: change.previous } as const;
      const id = await append(client, pin, pending, false, true);
      if (!isDeepStrictEqual(parse(await exact(client, id), pin, true, slot), pending)) throw new Error("Reservation verification failed.");
      const first = await client.blocks.children.list({ block_id: pin, page_size: 1 });
      if (first.results[0]?.id !== id) throw new Error("Notion did not reserve the leading position. Refusing activation.");
      if (!isDeepStrictEqual((await head()).active, base.active)) throw new Error("Configuration changed; reload before retrying.");
      const committed = { ...pending, state: "committed" };
      let failure: unknown;
      try { await client.blocks.update({ block_id: id, code: code(committed) }); } catch (error) { failure = error; }
      let observed;
      try { observed = await head(); } catch { throw new Error("Configuration activation could not be verified. Reload before retrying."); }
      if (!isDeepStrictEqual(observed.active, active) || !isDeepStrictEqual(observed.previous, change.previous)) {
        throw failure ?? new Error("Notion did not confirm this activation.");
      }
    });
    const tail = operation.catch(() => {});
    writes.set(key, tail);
    try { await operation; } finally { if (writes.get(key) === tail) writes.delete(key); }
  }
  async function recovery(base: Head) {
    if (!base.previous) throw new Error("No trusted previous revision.");
    return { active: base.active, previous: base.previous, payload: await load(client, page, base.previous) };
  }
  return {
    async get() { return load(client, page, (await head()).active); },
    update(patch: Partial<Payload>) {
      return save(async base => ({ payload: { ...await load(client, page, base.active), ...patch }, previous: base.active }));
    },
    async previewRecovery() { return recovery(await head()); },
    restore(activeRevision: string, previousRevision: string) {
      return save(async base => {
        const reviewed = await recovery(base);
        if (reviewed.active.revision !== activeRevision || reviewed.previous.revision !== previousRevision) throw new Error("Recovery selection changed; preview again.");
        return { payload: reviewed.payload, previous: reviewed.previous };
      });
    },
  };
}
