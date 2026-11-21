import type { Initiative, WorkspaceData } from "./models";
import { memberName } from "./initiative-readiness-helpers";
import type { InitiativeReadiness } from "./initiative-readiness";
import { formatDate } from "@/lib/utils/dates";
import { INITIATIVE_STATUS_LABELS, INITIATIVE_TYPE_LABELS, KNOWLEDGE_KIND_LABELS } from "@/lib/utils/labels";
import { reviewState } from "@/lib/services/insights";

export interface InitiativePack {
  title: string;
  generatedOn: string;
  markdown: string;
  sections: Array<{ heading: string; lines: string[] }>;
  gaps: string[];
}

export function buildInitiativePack(
  initiative: Initiative,
  data: WorkspaceData,
  readiness: InitiativeReadiness,
  today: string,
): InitiativePack {
  const name = (id: string | null) => memberName(data, id) ?? "Unassigned";
  const knowledge = data.knowledge.filter((k) => k.initiativeIds.includes(initiative.id));
  const decisions = data.decisions.filter((d) => d.initiativeIds.includes(initiative.id));
  const actions = data.actions.filter((a) => a.initiativeId === initiative.id && a.status !== "done");
  const contacts = knowledge.filter((k) => k.kind === "contact" && k.contact);
  const gaps = readiness.missingInfo;

  const sections = [
    {
      heading: "Initiative",
      lines: [
        `**${initiative.title}** — ${INITIATIVE_TYPE_LABELS[initiative.type]} · ${INITIATIVE_STATUS_LABELS[initiative.status].label}`,
        initiative.summary || "_No summary recorded._",
        initiative.startDate ? `Dates: ${formatDate(initiative.startDate)}${initiative.endDate && initiative.endDate !== initiative.startDate ? ` – ${formatDate(initiative.endDate)}` : ""}` : initiative.recurrence ? `Recurrence: ${initiative.recurrence}` : "_No dates recorded._",
      ],
    },
    {
      heading: "Ownership",
      lines: [
        `Current owner: ${name(initiative.ownerId)}`,
        (() => {
          const covering = data.handovers.filter((h) => h.initiativeIds.includes(initiative.id));
          const succ = covering.sort((a, b) => (b.targetDate ?? "").localeCompare(a.targetDate ?? ""))[0]?.successorId;
          return `Incoming owner: ${succ ? name(succ) : "_Not documented — see readiness gaps._"}`;
        })(),
      ],
    },
    {
      heading: "Knowledge & playbooks",
      lines: knowledge.length
        ? knowledge.map(
            (k) =>
              `- ${k.title} (${KNOWLEDGE_KIND_LABELS[k.kind]}) — review: ${k.lastReviewedOn ? `${reviewState(k, today, data.settings.reviewWindowDays)} (${formatDate(k.lastReviewedOn)})` : "never"}`,
          )
        : ["_No knowledge linked._"],
    },
    {
      heading: "Decisions",
      lines: decisions.length
        ? decisions.map((d) => `- ${d.title} — ${d.status}${d.outcome ? ` — outcome: ${d.outcome}` : " — outcome pending"}`)
        : ["_No decisions recorded._"],
    },
    {
      heading: "Contacts",
      lines: contacts.length
        ? contacts.flatMap((k) =>
            k.contact
              ? [
                  `- ${k.title}: ${[k.contact.organization, k.contact.email, k.contact.phone, k.contact.website].filter(Boolean).join(" · ") || "_details incomplete_"}`,
                ]
              : [],
          )
        : ["_No contacts recorded._"],
    },
    {
      heading: "Outstanding tasks",
      lines: actions.length
        ? actions.map(
            (a) =>
              `- ${a.title} — ${a.status}${a.dueDate ? ` · due ${formatDate(a.dueDate)}` : " · no due date"}${a.nextStep ? ` · next: ${a.nextStep}` : " · no next step"}`,
          )
        : ["_No open actions._"],
    },
    {
      heading: "Readiness & gaps",
      lines: [
        `Documented readiness: ${readiness.score}/100${readiness.ready ? " — ready" : readiness.incomplete ? " — assessment incomplete" : ""}`,
        ...readiness.criteria.map((c) => `- ${c.label}: ${c.points}/${c.weight} pts — ${c.summary}`),
        ...(gaps.length ? ["", "**Unresolved gaps:**", ...gaps.map((g) => `- ${g}`)] : ["_No gaps identified._"]),
      ],
    },
  ];

  const title = `Handover pack — ${initiative.title}`;
  const markdown = [
    `# ${title}`,
    `Generated ${formatDate(today)} from Levito records. Every line comes from a stored record; nothing is invented.`,
    "",
    ...sections.flatMap((s) => [`## ${s.heading}`, ...s.lines.map((l) => (l.startsWith("- ") || l.startsWith("**") ? l : l)), ""]),
  ].join("\n");

  return { title, generatedOn: today, markdown, sections, gaps };
}
