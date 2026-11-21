import { describe, expect, it } from "vitest";
import { memberInputSchema } from "@/lib/validation/schemas";
import { flattenInput, unflattenRecord, encodeProperties, decodePageFlat } from "@/lib/notion/codec";
import { resolveEntityMapping } from "@/lib/notion/mapping";
import { specFor } from "@/lib/notion/specs";
import type { DiscoveredDataSource } from "@/lib/notion/discovery";
import type { MemberInput } from "@/domain/models";
import { createDemoRepositories } from "@/lib/repositories/demo/demo-repositories";
import { DemoStore } from "@/lib/repositories/demo/demo-store";
import { buildDemoSeed } from "@/lib/repositories/demo/seed";

const TODAY = "2026-03-01";
const member: MemberInput = {
  name: "Test Member",
  role: "Treasurer",
  department: "Finance",
  email: "t@example.com",
  active: true,
};

describe("memberInputSchema", () => {
  it("accepts a full member and defaults department", () => {
    const parsed = memberInputSchema.parse({ name: "Al", role: "Sec", email: "", active: true });
    expect(parsed.department).toBe("");
    expect(memberInputSchema.safeParse(member).success).toBe(true);
  });
  it("rejects missing name/role", () => {
    expect(memberInputSchema.safeParse({ ...member, name: "" }).success).toBe(false);
    expect(memberInputSchema.safeParse({ ...member, role: "x" }).success).toBe(false);
  });
});

describe("member codec", () => {
  const DS = "c".repeat(32);
  function mapping() {
    const spec = specFor("members");
    const discovered: DiscoveredDataSource = {
      id: DS,
      title: spec.databaseTitle,
      properties: spec.fields.map((f, i) => ({ id: `m${i}`, name: f.property, type: f.kind })),
    };
    return resolveEntityMapping("members", DS, discovered, {}, { dataSourceIds: { members: DS } });
  }
  it("round-trips department through flat values", () => {
    const flat = flattenInput("members", member);
    expect(flat.department).toBe("Finance");
    const m = mapping();
    const props = encodeProperties("members", flat, m.fields);
    expect(Object.keys(props).length).toBe(m.fields.filter((f) => f.status === "ok" && f.writable).length);
  });
  it("decodes department back into the record", () => {
    const m = mapping();
    const flat = flattenInput("members", member);
    const decoded = unflattenRecord(
      "members",
      flat,
      new Set(m.fields.filter((f) => f.required && f.status === "ok").map((f) => f.field)),
      new Map(m.fields.map((f) => [f.field, f.propertyName ?? f.field])),
      { id: "pg1", createdAt: "", updatedAt: "" },
    );
    expect((decoded as MemberInput & { department: string }).department).toBe("Finance");
    void decodePageFlat;
  });
});

describe("demo member repository", () => {
  function repos() {
    const store = new DemoStore({ seed: () => buildDemoSeed(TODAY), storage: null });
    return createDemoRepositories(store);
  }
  it("creates, lists, updates and removes members", async () => {
    const r = repos();
    const { record } = await r.members.create(member);
    expect(record.name).toBe("Test Member");
    expect((await r.members.list()).some((m) => m.id === record.id)).toBe(true);
    const updated = await r.members.update(record.id, { ...member, department: "Ops" });
    expect(updated.record.department).toBe("Ops");
    await r.members.remove(record.id);
    expect(await r.members.get(record.id)).toBeNull();
  });
  it("keeps owner references resolvable for handover successors", async () => {
    const r = repos();
    const { record: m } = await r.members.create(member);
    const handover = await r.handovers.create({
      title: "Treasurer handover",
      outgoingTerm: "2025",
      incomingTerm: "2026",
      outgoingOwnerId: null,
      successorId: m.id,
      targetDate: null,
      initiativeIds: [],
      knowledgeIds: [],
      decisionIds: [],
      scopeConfirmed: false,
      actionsReviewed: false,
      acknowledgedOn: null,
    });
    const fetched = await r.handovers.get(handover.record.id);
    expect(fetched?.successorId).toBe(m.id);
    const memberRecord = await r.members.get(m.id);
    expect(memberRecord?.name).toBe("Test Member");
  });
});
