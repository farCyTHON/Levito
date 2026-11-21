import type { Action, ID, Initiative, ISODate, KnowledgeItem, WorkspaceData } from "@/domain/models";
import { evaluateReadiness, summarizeReadiness, type ReadinessReport } from "@/domain/readiness";
import { daysBetween } from "@/lib/utils/dates";

export type ReviewState = "current" | "due_soon" | "stale" | "never";

const DUE_SOON_DAYS = 30;

export function reviewState(item: KnowledgeItem, today: ISODate, reviewWindowDays: number): ReviewState {
  if (!item.lastReviewedOn) return "never";
  const age = daysBetween(item.lastReviewedOn, today);
  if (age > reviewWindowDays) return "stale";
  return age > reviewWindowDays - DUE_SOON_DAYS ? "due_soon" : "current";
}

export function isOverdue(action: Action, today: ISODate): boolean {
  return action.status !== "done" && action.dueDate !== null && action.dueDate < today;
}

export function isActionable(action: Action): boolean {
  return action.assigneeId !== null && action.dueDate !== null && action.nextStep.trim().length > 0;
}

export function readinessReports(data: WorkspaceData, today: ISODate): Map<ID, ReadinessReport> {
  const options = { asOf: today, reviewWindowDays: data.settings.reviewWindowDays };
  return new Map(data.handovers.map((h) => [h.id, evaluateReadiness(h, data, options)]));
}

export interface InitiativeCoverage {
  knowledge: KnowledgeItem[];
  hasProcedure: boolean;
  decisions: WorkspaceData["decisions"];
  actions: Action[];
  openActions: Action[];
  handovers: WorkspaceData["handovers"];
}

export function initiativeCoverage(data: WorkspaceData, initiative: Initiative): InitiativeCoverage {
  const knowledge = data.knowledge.filter((k) => k.initiativeIds.includes(initiative.id));
  const actions = data.actions.filter((a) => a.initiativeId === initiative.id);
  return {
    knowledge,
    hasProcedure: knowledge.some((k) => k.kind === "playbook" || k.kind === "sop"),
    decisions: data.decisions.filter((d) => d.initiativeIds.includes(initiative.id)),
    actions,
    openActions: actions.filter((a) => a.status !== "done"),
    handovers: data.handovers.filter((h) => h.initiativeIds.includes(initiative.id)),
  };
}

export interface AttentionItem {
  id: string;
  severity: "high" | "medium";
  title: string;
  detail: string;
  href: string;
}

export function buildOverview(data: WorkspaceData, today: ISODate) {
  const reports = readinessReports(data, today);
  const summary = summarizeReadiness([...reports.values()]);
  const liveInitiatives = data.initiatives.filter((i) => i.status !== "completed");
  const openActions = data.actions.filter((a) => a.status !== "done");
  const reviewable = data.knowledge.filter((k) => k.kind !== "contact");
  const needsReview = reviewable.filter((k) => {
    const state = reviewState(k, today, data.settings.reviewWindowDays);
    return state === "stale" || state === "never";
  });
  const decided = data.decisions.filter((d) => d.status === "decided");

  const attention: AttentionItem[] = [];
  for (const handover of data.handovers) {
    const report = reports.get(handover.id)!;
    for (const check of report.checks) {
      if (check.state === "pass") continue;
      attention.push({
        id: `${handover.id}-${check.id}`,
        severity: check.state === "fail" ? "high" : "medium",
        title: `${handover.title} handover: ${check.label.toLowerCase()}`,
        detail: check.state === "fail" ? check.summary : `Not assessed — ${check.summary}`,
        href: `/handovers/${handover.id}`,
      });
    }
  }
  for (const initiative of liveInitiatives) {
    if (initiative.ownerId === null) {
      attention.push({
        id: `${initiative.id}-owner`,
        severity: "high",
        title: `${initiative.title} has no owner`,
        detail: "Unowned initiatives are the first thing lost in a committee transition.",
        href: `/initiatives/${initiative.id}`,
      });
    } else if (!initiativeCoverage(data, initiative).hasProcedure) {
      attention.push({
        id: `${initiative.id}-docs`,
        severity: "medium",
        title: `${initiative.title} has no playbook or SOP`,
        detail: "Nothing documents how this initiative is actually run.",
        href: `/initiatives/${initiative.id}`,
      });
    }
  }
  attention.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));

  return {
    reports,
    summary,
    attention,
    metrics: {
      liveInitiatives: liveInitiatives.length,
      unownedInitiatives: liveInitiatives.filter((i) => i.ownerId === null).length,
      documents: data.knowledge.length,
      documentsNeedingReview: needsReview.length,
      openActions: openActions.length,
      overdueActions: openActions.filter((a) => isOverdue(a, today)).length,
      unactionableActions: openActions.filter((a) => !isActionable(a)).length,
      decisions: data.decisions.length,
      decisionsAwaitingOutcome: decided.filter((d) => !d.outcome.trim()).length,
    },
    upcomingActions: openActions
      .filter((a) => a.dueDate !== null)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .slice(0, 6),
  };
}
