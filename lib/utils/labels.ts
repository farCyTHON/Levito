import type {
  ActionStatus,
  DecisionStatus,
  EntityRef,
  InitiativeStatus,
  InitiativeType,
  KnowledgeKind,
} from "@/domain/models";
import type { CheckState, ReadinessStatus } from "@/domain/readiness";
import type { ReviewState } from "@/lib/services/insights";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

interface Label {
  label: string;
  tone: Tone;
}

export const INITIATIVE_TYPE_LABELS: Record<InitiativeType, string> = {
  event: "Event",
  campaign: "Campaign",
  project: "Project",
  recurring: "Recurring",
};

export const INITIATIVE_STATUS_LABELS: Record<InitiativeStatus, Label> = {
  planned: { label: "Planned", tone: "neutral" },
  active: { label: "Active", tone: "brand" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
};

export const KNOWLEDGE_KIND_LABELS: Record<KnowledgeKind, { label: string; plural: string }> = {
  playbook: { label: "Playbook", plural: "Playbooks" },
  sop: { label: "SOP", plural: "SOPs" },
  lesson: { label: "Lesson", plural: "Lessons" },
  contact: { label: "Contact", plural: "Contacts" },
  template: { label: "Template", plural: "Templates" },
};

export const REVIEW_STATE_LABELS: Record<ReviewState, Label> = {
  current: { label: "Reviewed", tone: "success" },
  due_soon: { label: "Review due soon", tone: "warning" },
  stale: { label: "Review overdue", tone: "danger" },
  never: { label: "Never reviewed", tone: "danger" },
};

export const DECISION_STATUS_LABELS: Record<DecisionStatus, Label> = {
  proposed: { label: "Proposed", tone: "warning" },
  decided: { label: "Decided", tone: "brand" },
  superseded: { label: "Superseded", tone: "neutral" },
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, Label> = {
  open: { label: "Open", tone: "neutral" },
  in_progress: { label: "In progress", tone: "brand" },
  done: { label: "Done", tone: "success" },
};

export const READINESS_STATUS_LABELS: Record<ReadinessStatus, Label> = {
  ready: { label: "Ready", tone: "success" },
  gaps: { label: "Gaps remain", tone: "danger" },
  incomplete: { label: "Not fully assessed", tone: "warning" },
};

export const CHECK_STATE_LABELS: Record<CheckState, Label> = {
  pass: { label: "Met", tone: "success" },
  fail: { label: "Gap", tone: "danger" },
  unknown: { label: "Not assessed", tone: "warning" },
};

export function refHref(ref: EntityRef): string | null {
  switch (ref.type) {
    case "initiative":
      return `/initiatives/${ref.id}`;
    case "knowledge":
      return `/knowledge?doc=${ref.id}`;
    case "decision":
      return `/decisions?focus=${ref.id}#${ref.id}`;
    case "handover":
      return `/handovers/${ref.id}`;
    default:
      return null;
  }
}
