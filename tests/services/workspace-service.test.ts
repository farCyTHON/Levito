import { describe, expect, it } from "vitest";
import type { InitiativeInput } from "@/domain/models";
import { RecordNotFoundError } from "@/lib/repositories";
import { createDemoRepositories } from "@/lib/repositories/demo/demo-repositories";
import { DemoStore, type StorageLike } from "@/lib/repositories/demo/demo-store";
import { buildDemoSeed } from "@/lib/repositories/demo/seed";
import { buildOverview, reviewState } from "@/lib/services/insights";
import { createWorkspaceService } from "@/lib/services/workspace-service";

function memoryStorage(): StorageLike & { size: () => number } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    size: () => map.size,
  };
}

function setup(storage: StorageLike | null = null) {
  let counter = 0;
  const store = new DemoStore({ seed: buildDemoSeed, storage, now: () => new Date(2026, 10, 21, 12) });
  const service = createWorkspaceService(createDemoRepositories(store, () => `test-${++counter}`));
  return { store, service, data: () => store.read() };
}

const initiative: InitiativeInput = {
  title: "Summer Social",
  type: "event",
  status: "planned",
  summary: "",
  ownerId: null,
  startDate: null,
  endDate: null,
  recurrence: "",
};

describe("workspace service in demo mode", () => {
  it("creates a record and reports a demo-session receipt, never a Notion write", async () => {
    const { service, data } = setup();
    const result = await service.initiatives.create({ ...initiative, title: "  Summer Social  " });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record).toMatchObject({ id: "test-1", title: "Summer Social" });
    expect(result.receipt.target).toBe("demo-session");
    expect(service.target).toBe("demo-session");
    expect(data().initiatives[0].id).toBe("test-1");
  });

  it("rejects invalid input with field errors and writes nothing", async () => {
    const { service, data } = setup();
    const before = data().initiatives.length;
    const result = await service.initiatives.create({
      ...initiative,
      title: "",
      startDate: "2027-05-10",
      endDate: "2027-05-01",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual(["endDate", "title"]);
    expect(data().initiatives).toHaveLength(before);
  });

  it("validates the merged record on partial updates", async () => {
    const { service } = setup();
    const proposed = await service.decisions.update("d-website", { status: "decided" });
    expect(proposed.ok).toBe(false);

    const decided = await service.decisions.update("d-website", { status: "decided", chosen: "Hosted site builder" });
    expect(decided.ok && decided.record.status).toBe("decided");
  });

  it("refuses a successor who is also the outgoing owner", async () => {
    const { service } = setup();
    const result = await service.handovers.update("h-sponsorship", { successorId: "m-yuki" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.successorId).toBeDefined();
  });

  it("returns a clear error when updating a record that no longer exists", async () => {
    const { service } = setup();
    const result = await service.actions.update("missing", { status: "done" });
    expect(result).toMatchObject({ ok: false, fieldErrors: {} });
    await expect(service.actions.remove("missing")).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it("detaches references when a record is deleted", async () => {
    const { service, data } = setup();
    await service.initiatives.remove("i-founders");

    expect(data().initiatives.some((i) => i.id === "i-founders")).toBe(false);
    expect(data().handovers.find((h) => h.id === "h-events")!.initiativeIds).toEqual(["i-pitch"]);
    expect(data().knowledge.find((k) => k.id === "k-fw-playbook")!.initiativeIds).toEqual([]);
    expect(data().actions.find((a) => a.id === "a-keynote")!.initiativeId).toBeNull();
  });

  it("marks documents reviewed and reflects it in handover readiness", async () => {
    const { service, data } = setup();
    expect(buildOverview(data(), "2026-11-21").reports.get("h-treasurer")!.score).toBe(100);
    expect(buildOverview(data(), "2026-11-21").reports.get("h-events")!.score).toBe(60);

    await service.knowledge.markReviewed("k-pitch-runbook", "2026-11-21");
    await service.knowledge.markReviewed("k-greenleaf", "2026-11-21");
    await service.actions.update("a-insurance", {
      assigneeId: "m-tomas",
      dueDate: "2026-12-01",
      nextStep: "Request the renewal quote from the Union insurer.",
    });

    const report = buildOverview(data(), "2026-11-21").reports.get("h-events")!;
    expect(report.status).toBe("ready");
  });

  it("persists to the provided storage and restores from it", async () => {
    const storage = memoryStorage();
    const first = setup(storage);
    await first.service.organization.update({ ...first.data().organization, shortName: "HES" });

    const second = setup(storage);
    expect(second.data().organization.shortName).toBe("HES");

    second.store.reset();
    expect(second.data().organization.shortName).toBe("HUES");
    expect(storage.size()).toBe(0);
  });

  it("falls back to seed data when stored data is corrupt", () => {
    const storage = memoryStorage();
    storage.setItem("levito.demo.v1", "{not json");
    expect(setup(storage).data().members.length).toBeGreaterThan(0);
  });

  it("notifies subscribers on change", async () => {
    const { store, service } = setup();
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.init();
    await service.settings.update({ reviewWindowDays: 90 });
    unsubscribe();
    await service.settings.update({ reviewWindowDays: 120 });
    expect(calls).toBe(2);
  });

  it("rejects an out-of-range review window", async () => {
    const { service } = setup();
    expect((await service.settings.update({ reviewWindowDays: 5 })).ok).toBe(false);
  });
});

describe("insights", () => {
  it("classifies document review state against the review window", () => {
    const data = buildDemoSeed("2026-11-21");
    const state = (id: string) => reviewState(data.knowledge.find((k) => k.id === id)!, "2026-11-21", 180);
    expect(state("k-budget-sop")).toBe("current");
    expect(state("k-pitch-runbook")).toBe("stale");
    expect(state("k-greenleaf")).toBe("never");
    expect(reviewState({ ...data.knowledge[0], lastReviewedOn: "2026-06-10" }, "2026-11-21", 180)).toBe("due_soon");
  });

  it("derives overview metrics and attention items from records", () => {
    const overview = buildOverview(buildDemoSeed("2026-11-21"), "2026-11-21");
    expect(overview.metrics).toMatchObject({
      liveInitiatives: 7,
      unownedInitiatives: 1,
      openActions: 10,
      overdueActions: 1,
      unactionableActions: 2,
      decisionsAwaitingOutcome: 2,
    });
    expect(overview.attention[0].severity).toBe("high");
    expect(overview.attention.some((a) => a.title === "Website Refresh has no owner")).toBe(true);
  });
});
