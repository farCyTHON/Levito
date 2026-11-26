import { formatDate } from "@/lib/utils/dates";
import type { Handover, ISODate, WorkspaceData } from "./models";
import { openActionsFor, type ReadinessReport } from "./readiness";

export interface PackItem {
  title: string;
  detail?: string;
  meta?: string[];
}

export interface PackSection {
  heading: string;
  items: PackItem[];
  emptyNote: string;
}

export interface HandoverPack {
  title: string;
  generatedOn: ISODate;
  policyVersion: string;
  readinessLine: string;
  sections: PackSection[];
  omissions: string[];
}

const STATE_LABEL = { pass: "Met", fail: "Gap", unknown: "Not assessed" } as const;

export function buildHandoverPack(
  handover: Handover,
  data: WorkspaceData,
  report: ReadinessReport,
  generatedOn: ISODate,
): HandoverPack {
  const omissions: string[] = [];
  const memberName = (id: string | null, fallback: string) =>
    id === null ? fallback : (data.members.find((m) => m.id === id)?.name ?? "Unknown member (record missing)");

  function resolve<T extends { id: string }>(ids: string[], collection: T[], label: string): T[] {
    const found: T[] = [];
    for (const id of ids) {
      const record = collection.find((r) => r.id === id);
      if (record) found.push(record);
      else omissions.push(`A linked ${label} could not be found and was left out.`);
    }
    return found;
  }

  const initiatives = resolve(handover.initiativeIds, data.initiatives, "initiative");
  const knowledge = resolve(handover.knowledgeIds, data.knowledge, "document");
  const decisions = resolve(handover.decisionIds, data.decisions, "decision");
  const actions = openActionsFor(handover, data.actions);
  if (!handover.scopeConfirmed) {
    omissions.push("The handover scope has not been confirmed, so this pack may be missing initiatives or documents.");
  }

  const sections: PackSection[] = [
    {
      heading: "Responsibility",
      emptyNote: "",
      items: [
        { title: "Role", detail: handover.title },
        { title: "Outgoing owner", detail: `${memberName(handover.outgoingOwnerId, "Not recorded")} · ${handover.outgoingTerm}` },
        { title: "Incoming owner", detail: `${memberName(handover.successorId, "Not yet named")} · ${handover.incomingTerm}` },
        { title: "Target handover date", detail: formatDate(handover.targetDate) },
        {
          title: "Successor acknowledgement",
          detail: handover.acknowledgedOn ? `Acknowledged on ${formatDate(handover.acknowledgedOn)}` : "Not yet acknowledged",
        },
      ],
    },
    {
      heading: "Readiness checks",
      emptyNote: "",
      items: report.checks.map((c) => ({
        title: `${c.label} — ${STATE_LABEL[c.state]}`,
        detail: c.summary,
        meta: c.remediation ? [`Next: ${c.remediation}`] : undefined,
      })),
    },
    {
      heading: "Initiatives in scope",
      emptyNote: "No initiatives are linked to this handover.",
      items: initiatives.map((i) => ({
        title: i.title,
        detail: i.summary,
        meta: [`Status: ${i.status}`, `Owner: ${memberName(i.ownerId, "Unassigned")}`, ...(i.recurrence ? [`Recurs: ${i.recurrence}`] : [])],
      })),
    },
    {
      heading: "Unfinished actions",
      emptyNote: handover.actionsReviewed
        ? "No open actions. The outgoing owner confirmed the list is complete."
        : "No open actions recorded. The list has not been confirmed as complete.",
      items: actions.map((a) => ({
        title: a.title,
        detail: a.nextStep.trim() ? `Next step: ${a.nextStep}` : "No next step recorded",
        meta: [`Assignee: ${memberName(a.assigneeId, "Unassigned")}`, `Due: ${formatDate(a.dueDate)}`],
      })),
    },
    {
      heading: "Playbooks, SOPs and templates",
      emptyNote: "No documents are linked to this handover.",
      items: knowledge
        .filter((k) => k.kind !== "contact")
        .map((k) => ({
          title: k.title,
          detail: k.summary,
          meta: [`Type: ${k.kind}`, `Last reviewed: ${k.lastReviewedOn ? formatDate(k.lastReviewedOn) : "never"}`],
        })),
    },
    {
      heading: "Key contacts",
      emptyNote: "No contacts are linked to this handover.",
      items: knowledge
        .filter((k) => k.kind === "contact")
        .map((k) => ({
          title: k.title,
          detail: k.summary,
          meta: [k.contact?.organization, k.contact?.email, k.contact?.phone].filter((v): v is string => Boolean(v)),
        })),
    },
    {
      heading: "Decisions to know about",
      emptyNote: "No decisions are linked to this handover.",
      items: decisions.map((d) => ({
        title: d.title,
        detail: d.chosen ? `Decided: ${d.chosen}` : "No option chosen yet",
        meta: [
          `Status: ${d.status}`,
          `Date: ${formatDate(d.decidedOn)}`,
          d.outcome.trim() ? `Outcome: ${d.outcome}` : "Outcome: not yet recorded",
        ],
      })),
    },
  ];

  return {
    title: `${handover.title} handover — ${handover.outgoingTerm} to ${handover.incomingTerm}`,
    generatedOn,
    policyVersion: report.policyVersion,
    readinessLine:
      report.status === "incomplete"
        ? `Assessment incomplete — ${report.score} of ${report.maxScore} points confirmed so far.`
        : `${report.score} of ${report.maxScore} points — ${report.status === "ready" ? "all checks met" : "gaps remain"}.`,
    sections,
    omissions,
  };
}

export type PackSource = "notion" | "demo";

export function isPackSource(mode: unknown): mode is PackSource {
  return mode === "notion" || mode === "demo";
}

export function packToMarkdown(pack: HandoverPack, source: PackSource): string {
  if (!isPackSource(source)) throw new Error("Cannot export a handover pack with an unknown record source.");
  const attribution = source === "notion" ? "live Notion records" : "Levito demo records";
  const lines = [
    `# ${pack.title}`,
    "",
    `Generated ${formatDate(pack.generatedOn)} from ${attribution} · readiness policy ${pack.policyVersion}`,
    "",
    `**Documented readiness:** ${pack.readinessLine}`,
  ];
  for (const section of pack.sections) {
    lines.push("", `## ${section.heading}`, "");
    if (section.items.length === 0) {
      lines.push(`_${section.emptyNote}_`);
      continue;
    }
    for (const item of section.items) {
      lines.push(`- **${item.title}**${item.detail ? ` — ${item.detail}` : ""}`);
      for (const meta of item.meta ?? []) lines.push(`  - ${meta}`);
    }
  }
  if (pack.omissions.length) {
    lines.push("", "## Omissions", "", ...pack.omissions.map((o) => `- ${o}`));
  }
  return lines.join("\n");
}
