import type { ID, Initiative, ISODate, WorkspaceData } from "./models";
import { reviewState } from "@/lib/services/insights";
import { SUBSTANTIVE_CONTENT_MIN_CHARS } from "./readiness";

export interface ReadinessCriterion {
  id: "owner" | "successor" | "playbook" | "review" | "actions";
  label: string;
  weight: number;
  /** 0..1 contribution before weighting. */
  score: number;
  /** Points contributed to the 0-100 score. */
  points: number;
  state: "pass" | "partial" | "fail" | "unknown";
  summary: string;
  /** Exact missing information, phrased as actionable gaps. */
  missing: string[];
}

export interface InitiativeReadiness {
  initiativeId: ID;
  /** 0-100 documented readiness score. */
  score: number;
  /** True only when every criterion fully passes. */
  ready: boolean;
  /** True when any criterion could not be assessed. */
  incomplete: boolean;
  criteria: ReadinessCriterion[];
  missingInfo: string[];
}

export interface InitiativeReadinessOptions {
  asOf: ISODate;
  reviewWindowDays: number;
}

const WEIGHTS = { owner: 20, successor: 20, playbook: 25, review: 15, actions: 20 } as const;

function memberName(data: WorkspaceData, id: ID | null): string | null {
  if (!id) return null;
  return data.members.find((m) => m.id === id)?.name ?? null;
}

/** Incoming owner = successor on a handover scoped to this initiative. */
function coveringHandover(data: WorkspaceData, initiativeId: ID) {
  const covering = data.handovers.filter((h) => h.initiativeIds.includes(initiativeId));
  if (covering.length === 0) return null;
  covering.sort((a, b) => (b.targetDate ?? "").localeCompare(a.targetDate ?? ""));
  return covering[0];
}

export function evaluateInitiativeReadiness(
  initiative: Initiative,
  data: WorkspaceData,
  options: InitiativeReadinessOptions,
): InitiativeReadiness {
  const criteria: ReadinessCriterion[] = [];
  const push = (c: Omit<ReadinessCriterion, "points">) =>
    criteria.push({ ...c, points: Math.round(c.weight * c.score) });

  /* 1. Current owner — 20% */
  {
    const owner = memberName(data, initiative.ownerId);
    const missing: string[] = [];
    if (!initiative.ownerId) missing.push("Assign a current owner to this initiative.");
    else if (!owner) missing.push(`Owner record "${initiative.ownerId}" no longer exists — reassign.`);
    push({
      id: "owner",
      label: "Current owner",
      weight: WEIGHTS.owner,
      score: missing.length ? 0 : 1,
      state: missing.length ? "fail" : "pass",
      summary: owner ? `Owned by ${owner}.` : "No resolvable owner.",
      missing,
    });
  }

  /* 2. Incoming owner — 20% */
  {
    const handover = coveringHandover(data, initiative.id);
    const successor = memberName(data, handover?.successorId ?? null);
    const missing = successor ? [] : [handover
      ? `Choose an incoming owner in the handover "${handover.title}".`
      : `Create or edit a handover, name an incoming owner and select "${initiative.title}" under Initiatives in scope.`];
    push({
      id: "successor",
      label: "Incoming owner",
      weight: WEIGHTS.successor,
      score: missing.length ? 0 : 1,
      state: missing.length ? "fail" : "pass",
      summary: successor ? `Successor: ${successor}.` : "No successor documented.",
      missing,
    });
  }

  /* 3. Playbook availability — 25% */
  {
    const docs = data.knowledge.filter((k) => k.initiativeIds.includes(initiative.id));
    const procedures = docs.filter((k) => k.kind === "playbook" || k.kind === "sop");
    const substantive = procedures.filter((k) => k.content.trim().length >= SUBSTANTIVE_CONTENT_MIN_CHARS);
    const missing: string[] = [];
    let score = 0;
    let state: ReadinessCriterion["state"] = "fail";
    if (substantive.length > 0) {
      score = 1;
      state = "pass";
    } else if (procedures.length > 0) {
      score = 0.5;
      state = "partial";
      for (const doc of procedures) {
        missing.push(`"${doc.title}": ${doc.content.trim().length} / ${SUBSTANTIVE_CONTENT_MIN_CHARS} characters. Expand a linked playbook or SOP in the Knowledge Library.`);
      }
    } else if (docs.length > 0) {
      score = 0.25;
      state = "partial";
      missing.push("No playbook or SOP linked — link at least one procedure document.");
    } else {
      missing.push("No knowledge linked — add and link a playbook or SOP.");
    }
    push({
      id: "playbook",
      label: "Playbook availability",
      weight: WEIGHTS.playbook,
      score,
      state,
      summary:
        substantive.length > 0
          ? `${substantive.length} substantive playbook/SOP linked.`
          : procedures.length > 0
            ? "Playbook/SOP linked but content is thin."
            : "No playbook or SOP linked.",
      missing,
    });
  }

  /* 4. Review recency — 15% */
  {
    const docs = data.knowledge.filter(
      (k) => k.initiativeIds.includes(initiative.id) && k.kind !== "contact",
    );
    const missing: string[] = [];
    let score = 0;
    let state: ReadinessCriterion["state"] = "unknown";
    if (docs.length === 0) {
      missing.push("No reviewable documents linked — link knowledge that needs periodic review.");
    } else {
      const states = docs.map((d) => reviewState(d, options.asOf, options.reviewWindowDays));
      const current = states.filter((s) => s === "current").length;
      const soon = states.filter((s) => s === "due_soon").length;
      score = (current + soon * 0.5) / docs.length;
      state = score >= 1 ? "pass" : score > 0 ? "partial" : "fail";
      const stale = docs.filter((d) => {
        const s = reviewState(d, options.asOf, options.reviewWindowDays);
        return s === "stale" || s === "never";
      });
      for (const d of stale) {
        missing.push(
          d.lastReviewedOn
            ? `Review "${d.title}" and update its review date (last reviewed ${d.lastReviewedOn}).`
            : `"${d.title}" has never been reviewed — set a review date.`,
        );
      }
      for (const d of docs.filter((_, index) => states[index] === "due_soon")) {
        missing.push(`"${d.title}" is due for review soon. Review it and record the new review date.`);
      }
    }
    push({
      id: "review",
      label: "Review recency",
      weight: WEIGHTS.review,
      score,
      state,
      summary:
        docs.length === 0
          ? "No linked documents to assess."
          : `${docs.length} linked document(s); ${Math.round(score * 100)}% within the review window.`,
      missing,
    });
  }

  /* 5. Open-action completeness — 20% */
  {
    const open = data.actions.filter((a) => a.initiativeId === initiative.id && a.status !== "done");
    const complete = open.filter(
      (a) => a.assigneeId !== null && a.dueDate !== null && a.nextStep.trim().length > 0,
    );
    const missing: string[] = [];
    for (const a of open) {
      const gaps: string[] = [];
      if (!a.assigneeId) gaps.push("no assignee");
      if (!a.dueDate) gaps.push("no due date");
      if (!a.nextStep.trim()) gaps.push("no next step");
      if (gaps.length) missing.push(`"${a.title}" — ${gaps.join(", ")}.`);
    }
    const score = open.length === 0 ? 1 : complete.length / open.length;
    const state: ReadinessCriterion["state"] =
      open.length === 0 ? "pass" : score === 1 ? "pass" : score > 0 ? "partial" : "fail";
    push({
      id: "actions",
      label: "Open-action completeness",
      weight: WEIGHTS.actions,
      score,
      state,
      summary:
        open.length === 0
          ? "No open actions."
          : `${complete.length}/${open.length} open actions fully specified.`,
      missing,
    });
  }

  const score = criteria.reduce((sum, c) => sum + c.points, 0);
  const missingInfo = criteria.flatMap((c) => c.missing);
  const incomplete = criteria.some((c) => c.state === "unknown");
  return {
    initiativeId: initiative.id,
    score,
    ready: score === 100 && !incomplete,
    incomplete,
    criteria,
    missingInfo,
  };
}
