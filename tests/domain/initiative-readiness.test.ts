import { describe, expect, it } from "vitest";
import { evaluateInitiativeReadiness } from "@/domain/initiative-readiness";
import { buildInitiativePack } from "@/domain/initiative-pack";
import { buildDemoSeed } from "@/lib/repositories/demo/seed";

const TODAY = "2026-03-01";

function data() {
  return buildDemoSeed(TODAY);
}

const opts = { asOf: TODAY, reviewWindowDays: 180 };

describe("evaluateInitiativeReadiness", () => {
  it("scores a fully documented initiative at 100", () => {
    const d = data();
    const initiative = {
      ...d.initiatives[0],
      ownerId: d.members[0].id,
    };
    // give it a successor via a handover, a playbook, fresh review, complete actions
    const handover = { ...d.handovers[0], initiativeIds: [initiative.id], successorId: d.members[1].id };
    const playbook = { ...d.knowledge.find((k) => k.kind === "playbook")!, initiativeIds: [initiative.id], content: "x".repeat(200), lastReviewedOn: TODAY };
    d.handovers = [handover];
    d.knowledge = [playbook];
    d.actions = [{ ...d.actions[0], initiativeId: initiative.id, status: "open" as const, assigneeId: d.members[0].id, dueDate: TODAY, nextStep: "do it" }];
    const r = evaluateInitiativeReadiness(initiative, d, opts);
    expect(r.score).toBe(100);
    expect(r.ready).toBe(true);
  });

  it("reports exact missing information per criterion", () => {
    const d = data();
    const bare = { ...d.initiatives[0], ownerId: null };
    d.knowledge = [];
    d.actions = [];
    d.handovers = [];
    const r = evaluateInitiativeReadiness(bare, d, opts);
    expect(r.score).toBeLessThan(100);
    const ids = r.criteria.map((c) => c.id);
    expect(ids).toEqual(["owner", "successor", "playbook", "review", "actions"]);
    const missing = r.missingInfo.join(" ");
    expect(missing).toMatch(/owner/i);
    expect(missing).toMatch(/incoming owner/i);
    expect(missing).toMatch(/playbook|knowledge/i);
  });

  it("weights criteria correctly (playbook 25 is largest)", () => {
    const d = data();
    const initiative = { ...d.initiatives[0], ownerId: d.members[0].id };
    d.handovers = [{ ...d.handovers[0], initiativeIds: [initiative.id], successorId: d.members[1].id }];
    const r = evaluateInitiativeReadiness(initiative, d, opts);
    const byId = Object.fromEntries(r.criteria.map((c) => [c.id, c]));
    expect(byId.owner.weight).toBe(20);
    expect(byId.successor.weight).toBe(20);
    expect(byId.playbook.weight).toBe(25);
    expect(byId.review.weight).toBe(15);
    expect(byId.actions.weight).toBe(100 - 20 - 20 - 25 - 15);
  });
});

describe("buildInitiativePack", () => {
  it("contains only recorded data and lists gaps", () => {
    const d = data();
    const initiative = d.initiatives[0];
    const r = evaluateInitiativeReadiness(initiative, d, opts);
    const pack = buildInitiativePack(initiative, d, r, TODAY);
    expect(pack.title).toContain(initiative.title);
    expect(pack.markdown).toContain(initiative.title);
    expect(pack.markdown).toContain("Readiness");
    // nothing invented: gaps come straight from readiness.missingInfo
    expect(pack.gaps).toEqual(r.missingInfo);
  });
});
