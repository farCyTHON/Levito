import { describe, expect, it } from "vitest";
import { buildDemoSeed } from "@/lib/repositories/demo/seed";
import { buildHandoverPack, packToMarkdown } from "@/domain/handover-pack";
import type { Handover, WorkspaceData } from "@/domain/models";
import { evaluateReadiness, summarizeReadiness, type CheckId } from "@/domain/readiness";

const TODAY = "2026-11-21";

function setup(patch: (data: WorkspaceData) => void = () => {}) {
  const data = buildDemoSeed(TODAY);
  patch(data);
  const evaluate = (id: string) =>
    evaluateReadiness(
      data.handovers.find((h) => h.id === id)!,
      data,
      { asOf: TODAY, reviewWindowDays: data.settings.reviewWindowDays },
    );
  return { data, evaluate };
}

const handover = (data: WorkspaceData, id: string): Handover => data.handovers.find((h) => h.id === id)!;
const stateOf = (report: ReturnType<typeof evaluateReadiness>, id: CheckId) =>
  report.checks.find((c) => c.id === id)!.state;

describe("evaluateReadiness", () => {
  it("scores a fully documented handover as ready with 100 points", () => {
    const report = setup().evaluate("h-treasurer");
    expect(report.status).toBe("ready");
    expect(report.score).toBe(100);
    expect(report.checks.every((c) => c.remediation === null)).toBe(true);
  });

  it("fails the successor check when nobody is named", () => {
    const report = setup().evaluate("h-sponsorship");
    expect(stateOf(report, "successor")).toBe("fail");
    expect(report.score).toBe(80);
    expect(report.status).toBe("gaps");
  });

  it("fails review currency for stale and never-reviewed documents", () => {
    const report = setup().evaluate("h-events");
    const reviews = report.checks.find((c) => c.id === "reviews")!;
    expect(reviews.state).toBe("fail");
    expect(reviews.evidence.filter((e) => e.state === "fail").map((e) => e.label)).toEqual([
      "Pitch Night Run of Show",
      "Greenleaf Catering",
    ]);
  });

  it("does not treat a future review date as current", () => {
    const { evaluate } = setup((data) => {
      data.knowledge.find((k) => k.id === "k-budget-sop")!.lastReviewedOn = "2027-01-01";
    });
    expect(stateOf(evaluate("h-treasurer"), "reviews")).toBe("fail");
  });

  it("fails open actions that lack an assignee, due date or next step", () => {
    const actions = setup().evaluate("h-events").checks.find((c) => c.id === "actions")!;
    expect(actions.state).toBe("fail");
    expect(actions.evidence.find((e) => e.state === "fail")?.detail).toBe("Missing assignee, due date, next step");
  });

  it("treats zero open actions as unknown until the list is reviewed", () => {
    const withoutReview = setup((data) => {
      data.actions = [];
      handover(data, "h-treasurer").actionsReviewed = false;
    });
    expect(stateOf(withoutReview.evaluate("h-treasurer"), "actions")).toBe("unknown");

    const withReview = setup((data) => {
      data.actions = [];
    });
    expect(stateOf(withReview.evaluate("h-treasurer"), "actions")).toBe("pass");
  });

  it("reports an unconfirmed, empty scope as incomplete rather than failing or passing", () => {
    const report = setup().evaluate("h-president");
    expect(report.status).toBe("incomplete");
    expect(report.score).toBe(20);
    expect(stateOf(report, "ownership")).toBe("unknown");
    expect(stateOf(report, "playbooks")).toBe("unknown");
    expect(stateOf(report, "reviews")).toBe("unknown");
    expect(stateOf(report, "successor")).toBe("pass");
  });

  it("fails ownership when an in-scope initiative has no owner", () => {
    const { evaluate } = setup((data) => {
      data.initiatives.find((i) => i.id === "i-budget")!.ownerId = null;
    });
    expect(stateOf(evaluate("h-treasurer"), "ownership")).toBe("fail");
  });

  it("marks a missing linked record as unknown, not as a pass", () => {
    const { evaluate } = setup((data) => {
      data.knowledge = data.knowledge.filter((k) => k.id !== "k-expense-form");
    });
    const report = evaluate("h-treasurer");
    expect(stateOf(report, "playbooks")).toBe("unknown");
    expect(report.status).toBe("incomplete");
  });

  it("fails thin documentation and scopes without a playbook or SOP", () => {
    const thin = setup((data) => {
      data.knowledge.find((k) => k.id === "k-budget-sop")!.content = "TODO";
    });
    expect(stateOf(thin.evaluate("h-treasurer"), "playbooks")).toBe("fail");

    const noProcedure = setup((data) => {
      handover(data, "h-treasurer").knowledgeIds = ["k-expense-form"];
    });
    expect(stateOf(noProcedure.evaluate("h-treasurer"), "playbooks")).toBe("fail");
  });

  it("respects the configured review window", () => {
    const { evaluate } = setup((data) => {
      data.settings.reviewWindowDays = 365;
      data.knowledge.find((k) => k.id === "k-greenleaf")!.lastReviewedOn = TODAY;
    });
    expect(stateOf(evaluate("h-events"), "reviews")).toBe("pass");
  });
});

describe("summarizeReadiness", () => {
  it("counts each status and averages the score", () => {
    const { data, evaluate } = setup();
    const summary = summarizeReadiness(data.handovers.map((h) => evaluate(h.id)));
    expect(summary).toEqual({ total: 4, ready: 1, gaps: 2, incomplete: 1, averageScore: 65 });
  });

  it("returns no average when there are no handovers", () => {
    expect(summarizeReadiness([]).averageScore).toBeNull();
  });
});

describe("buildHandoverPack", () => {
  it("builds sections from stored records only", () => {
    const { data, evaluate } = setup();
    const pack = buildHandoverPack(handover(data, "h-events"), data, evaluate("h-events"), TODAY);
    const section = (heading: string) => pack.sections.find((s) => s.heading === heading)!;

    expect(section("Initiatives in scope").items.map((i) => i.title)).toEqual(["Founders' Week", "Pitch Night"]);
    expect(section("Unfinished actions").items).toHaveLength(3);
    expect(section("Key contacts").items.map((i) => i.title)).toEqual(["Greenleaf Catering"]);
    expect(pack.omissions).toEqual([]);
    expect(packToMarkdown(pack)).toContain("## Unfinished actions");
  });

  it("states omissions instead of inventing content", () => {
    const { data, evaluate } = setup((d) => {
      d.decisions = d.decisions.filter((x) => x.id !== "d-ticketing");
    });
    const pack = buildHandoverPack(handover(data, "h-events"), data, evaluate("h-events"), TODAY);
    expect(pack.omissions).toHaveLength(1);

    const president = buildHandoverPack(handover(data, "h-president"), data, evaluate("h-president"), TODAY);
    expect(president.readinessLine).toMatch(/^Assessment incomplete/);
    expect(president.omissions[0]).toMatch(/scope has not been confirmed/);
  });
});
