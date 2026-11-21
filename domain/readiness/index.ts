import { daysBetween } from "@/lib/utils/dates";
import type { EntityRef, Handover, ID, ISODate, WorkspaceData } from "../models";

export const READINESS_POLICY_VERSION = "2026.1";
export const POINTS_PER_CHECK = 20;
export const SUBSTANTIVE_CONTENT_MIN_CHARS = 200;

export type CheckState = "pass" | "fail" | "unknown";
export type CheckId = "ownership" | "successor" | "playbooks" | "reviews" | "actions";
export type ReadinessStatus = "ready" | "gaps" | "incomplete";

export interface Evidence {
  state: CheckState;
  label: string;
  detail: string;
  ref?: EntityRef;
}

export interface ReadinessCheck {
  id: CheckId;
  label: string;
  question: string;
  state: CheckState;
  points: number;
  maxPoints: number;
  summary: string;
  remediation: string | null;
  evidence: Evidence[];
}

export interface ReadinessReport {
  handoverId: ID;
  policyVersion: string;
  asOf: ISODate;
  reviewWindowDays: number;
  checks: ReadinessCheck[];
  score: number;
  maxScore: number;
  status: ReadinessStatus;
}

export type ReadinessContext = Pick<WorkspaceData, "members" | "initiatives" | "knowledge" | "actions">;

export interface ReadinessOptions {
  asOf: ISODate;
  reviewWindowDays: number;
}

function combine(evidence: Evidence[]): CheckState {
  if (evidence.some((e) => e.state === "fail")) return "fail";
  if (evidence.some((e) => e.state === "unknown")) return "unknown";
  return "pass";
}

function check(
  base: Pick<ReadinessCheck, "id" | "label" | "question">,
  state: CheckState,
  summary: string,
  remediation: string | null,
  evidence: Evidence[],
): ReadinessCheck {
  return {
    ...base,
    state,
    summary,
    remediation: state === "pass" ? null : remediation,
    evidence,
    points: state === "pass" ? POINTS_PER_CHECK : 0,
    maxPoints: POINTS_PER_CHECK,
  };
}

export function openActionsFor(handover: Handover, actions: WorkspaceData["actions"]) {
  return actions.filter(
    (a) =>
      a.status !== "done" &&
      (a.handoverId === handover.id || (a.initiativeId !== null && handover.initiativeIds.includes(a.initiativeId))),
  );
}

function ownershipCheck(handover: Handover, ctx: ReadinessContext): ReadinessCheck {
  const base = {
    id: "ownership",
    label: "Documented owners",
    question: "Is the outgoing owner recorded, and does every in-scope initiative have an owner?",
  } as const;
  const evidence: Evidence[] = [];

  const outgoing = ctx.members.find((m) => m.id === handover.outgoingOwnerId);
  if (handover.outgoingOwnerId === null) {
    evidence.push({ state: "fail", label: "Outgoing owner", detail: "No outgoing owner recorded" });
  } else if (!outgoing) {
    evidence.push({ state: "unknown", label: "Outgoing owner", detail: "Linked member record could not be found" });
  } else {
    evidence.push({
      state: "pass",
      label: "Outgoing owner",
      detail: `${outgoing.name} (${outgoing.role})`,
      ref: { type: "member", id: outgoing.id },
    });
  }

  for (const id of handover.initiativeIds) {
    const initiative = ctx.initiatives.find((i) => i.id === id);
    if (!initiative) {
      evidence.push({ state: "unknown", label: "Linked initiative", detail: "Record could not be found" });
      continue;
    }
    if (initiative.status === "completed") continue;
    const owner = ctx.members.find((m) => m.id === initiative.ownerId);
    evidence.push({
      state: owner ? "pass" : initiative.ownerId ? "unknown" : "fail",
      label: initiative.title,
      detail: owner ? `Owned by ${owner.name}` : initiative.ownerId ? "Owner record could not be found" : "No owner assigned",
      ref: { type: "initiative", id },
    });
  }

  let state = combine(evidence);
  if (state === "pass" && !handover.scopeConfirmed) {
    state = "unknown";
    evidence.push({
      state: "unknown",
      label: "Scope",
      detail: "The outgoing owner has not confirmed which initiatives belong to this handover",
    });
  }

  const summary =
    state === "pass"
      ? "Outgoing owner and all in-scope initiative owners are documented."
      : state === "fail"
        ? "At least one owner is missing."
        : "Ownership cannot be fully assessed yet.";
  const remediation =
    state === "fail"
      ? "Assign an owner to each flagged record."
      : "Confirm the handover scope so initiative ownership can be assessed.";
  return check(base, state, summary, remediation, evidence);
}

function successorCheck(handover: Handover, ctx: ReadinessContext): ReadinessCheck {
  const base = {
    id: "successor",
    label: "Named successor",
    question: "Is an incoming owner recorded for this responsibility?",
  } as const;
  const successor = ctx.members.find((m) => m.id === handover.successorId);

  if (handover.successorId === null) {
    return check(base, "fail", "No successor has been named.", "Assign an incoming owner to this handover.", [
      { state: "fail", label: "Successor", detail: "No incoming owner recorded" },
    ]);
  }
  if (!successor) {
    return check(base, "unknown", "The linked successor record could not be found.", "Re-select the incoming owner.", [
      { state: "unknown", label: "Successor", detail: "Linked member record could not be found" },
    ]);
  }
  return check(base, "pass", `${successor.name} is recorded as the incoming owner.`, null, [
    {
      state: "pass",
      label: "Successor",
      detail: `${successor.name} (${successor.role})`,
      ref: { type: "member", id: successor.id },
    },
  ]);
}

function playbooksCheck(handover: Handover, ctx: ReadinessContext): ReadinessCheck {
  const base = {
    id: "playbooks",
    label: "Playbooks and SOPs",
    question: "Are the documents a successor needs linked, and do they contain real content?",
  } as const;

  if (handover.knowledgeIds.length === 0) {
    const state: CheckState = handover.scopeConfirmed ? "fail" : "unknown";
    return check(
      base,
      state,
      handover.scopeConfirmed ? "No documents are linked to this handover." : "No documents linked and scope is not confirmed.",
      handover.scopeConfirmed
        ? "Link at least one playbook or SOP from the Knowledge Library."
        : "Confirm the scope and link the playbooks a successor will need.",
      [{ state, label: "Required documents", detail: "None linked" }],
    );
  }

  const evidence: Evidence[] = [];
  let hasProcedure = false;
  for (const id of handover.knowledgeIds) {
    const item = ctx.knowledge.find((k) => k.id === id);
    if (!item) {
      evidence.push({ state: "unknown", label: "Linked document", detail: "Record could not be found" });
      continue;
    }
    if (item.kind === "playbook" || item.kind === "sop") hasProcedure = true;
    const length = item.content.trim().length;
    const substantive = item.kind === "contact" || length >= SUBSTANTIVE_CONTENT_MIN_CHARS;
    evidence.push({
      state: substantive ? "pass" : "fail",
      label: item.title,
      detail: substantive
        ? item.kind === "contact"
          ? "Contact record"
          : `${length.toLocaleString("en-GB")} characters of documentation`
        : `Only ${length} characters — below the ${SUBSTANTIVE_CONTENT_MIN_CHARS}-character minimum`,
      ref: { type: "knowledge", id },
    });
  }
  if (!hasProcedure) {
    evidence.push({
      state: "fail",
      label: "Procedure coverage",
      detail: "None of the linked documents is a playbook or SOP",
    });
  }

  const state = combine(evidence);
  const summary =
    state === "pass"
      ? `${handover.knowledgeIds.length} linked documents contain substantive content.`
      : state === "fail"
        ? "Some linked documentation is missing or too thin to rely on."
        : "A linked document could not be read.";
  return check(base, state, summary, "Expand the flagged documents or link a playbook or SOP.", evidence);
}

function reviewsCheck(handover: Handover, ctx: ReadinessContext, options: ReadinessOptions): ReadinessCheck {
  const base = {
    id: "reviews",
    label: "Review dates",
    question: `Has every linked document been reviewed within the last ${options.reviewWindowDays} days?`,
  } as const;

  if (handover.knowledgeIds.length === 0) {
    return check(base, "unknown", "There are no linked documents to assess.", "Link the required documents first.", [
      { state: "unknown", label: "Required documents", detail: "None linked" },
    ]);
  }

  const evidence: Evidence[] = handover.knowledgeIds.map((id) => {
    const item = ctx.knowledge.find((k) => k.id === id);
    if (!item) return { state: "unknown", label: "Linked document", detail: "Record could not be found" };
    const ref: EntityRef = { type: "knowledge", id };
    if (!item.lastReviewedOn) {
      return { state: "fail", label: item.title, detail: "No review date recorded", ref };
    }
    const age = daysBetween(item.lastReviewedOn, options.asOf);
    if (age < 0) {
      return { state: "fail", label: item.title, detail: "Review date is in the future", ref };
    }
    return age <= options.reviewWindowDays
      ? { state: "pass", label: item.title, detail: `Reviewed ${age} days ago`, ref }
      : {
          state: "fail",
          label: item.title,
          detail: `Reviewed ${age} days ago — limit is ${options.reviewWindowDays}`,
          ref,
        };
  });

  const state = combine(evidence);
  const summary =
    state === "pass"
      ? "All linked documents have a current review date."
      : state === "fail"
        ? "Some linked documents are stale or have never been reviewed."
        : "A linked document could not be read.";
  return check(base, state, summary, "Review the flagged documents and record the review date.", evidence);
}

function actionsCheck(handover: Handover, ctx: ReadinessContext): ReadinessCheck {
  const base = {
    id: "actions",
    label: "Open actions",
    question: "Does every unfinished action have an assignee, a due date and a next step?",
  } as const;
  const open = openActionsFor(handover, ctx.actions);

  if (open.length === 0) {
    return handover.actionsReviewed
      ? check(base, "pass", "No open actions, and the action list has been reviewed.", null, [
          { state: "pass", label: "Action review", detail: "Outgoing owner confirmed there is no unfinished work" },
        ])
      : check(
          base,
          "unknown",
          "No open actions are recorded, but nobody has confirmed the list is complete.",
          "Record unfinished work, or mark the action list as reviewed.",
          [{ state: "unknown", label: "Action review", detail: "Not yet confirmed by the outgoing owner" }],
        );
  }

  const evidence: Evidence[] = open.map((action) => {
    const missing = [
      ctx.members.some((m) => m.id === action.assigneeId) ? null : "assignee",
      action.dueDate ? null : "due date",
      action.nextStep.trim() ? null : "next step",
    ].filter((m): m is string => m !== null);
    return {
      state: missing.length ? "fail" : "pass",
      label: action.title,
      detail: missing.length ? `Missing ${missing.join(", ")}` : "Assigned, dated and has a next step",
      ref: { type: "action", id: action.id },
    };
  });

  const state = combine(evidence);
  const incomplete = evidence.filter((e) => e.state === "fail").length;
  const summary =
    state === "pass"
      ? `All ${open.length} open actions are assigned, dated and have a next step.`
      : `${incomplete} of ${open.length} open actions cannot be picked up as written.`;
  return check(base, state, summary, "Complete the missing fields on each flagged action.", evidence);
}

export function evaluateReadiness(
  handover: Handover,
  ctx: ReadinessContext,
  options: ReadinessOptions,
): ReadinessReport {
  const checks = [
    ownershipCheck(handover, ctx),
    successorCheck(handover, ctx),
    playbooksCheck(handover, ctx),
    reviewsCheck(handover, ctx, options),
    actionsCheck(handover, ctx),
  ];
  const status: ReadinessStatus = checks.every((c) => c.state === "pass")
    ? "ready"
    : checks.some((c) => c.state === "unknown")
      ? "incomplete"
      : "gaps";
  return {
    handoverId: handover.id,
    policyVersion: READINESS_POLICY_VERSION,
    asOf: options.asOf,
    reviewWindowDays: options.reviewWindowDays,
    checks,
    score: checks.reduce((sum, c) => sum + c.points, 0),
    maxScore: checks.length * POINTS_PER_CHECK,
    status,
  };
}

export interface ReadinessSummary {
  total: number;
  ready: number;
  gaps: number;
  incomplete: number;
  averageScore: number | null;
}

export function summarizeReadiness(reports: ReadinessReport[]): ReadinessSummary {
  const count = (status: ReadinessStatus) => reports.filter((r) => r.status === status).length;
  return {
    total: reports.length,
    ready: count("ready"),
    gaps: count("gaps"),
    incomplete: count("incomplete"),
    averageScore: reports.length
      ? Math.round(reports.reduce((sum, r) => sum + r.score, 0) / reports.length)
      : null,
  };
}
