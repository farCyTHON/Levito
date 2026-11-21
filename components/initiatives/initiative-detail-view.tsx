"use client";

import { useId, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, GitBranch, Link2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CheckList } from "@/components/shared/form";
import { MemberChip } from "@/components/shared/member-chip";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { Pill } from "@/components/shared/pill";
import { StateIcon } from "@/components/shared/readiness";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ID, Initiative } from "@/domain/models";
import type { CheckState } from "@/domain/readiness";
import { ActionsSection } from "@/components/initiatives/action-list";
import { InitiativeReadinessCard } from "@/components/initiatives/initiative-readiness";
import { useWorkspace, type Workspace } from "@/lib/hooks/use-workspace";
import { formatDate, formatRelative } from "@/lib/utils/dates";
import {
  DECISION_STATUS_LABELS,
  INITIATIVE_STATUS_LABELS,
  INITIATIVE_TYPE_LABELS,
  KNOWLEDGE_KIND_LABELS,
  REVIEW_STATE_LABELS,
} from "@/lib/utils/labels";
import { notifyError, notifySaved } from "@/lib/utils/notify";
import { initiativeCoverage, isActionable, reviewState, type InitiativeCoverage } from "@/lib/services/insights";
import { InitiativeFormDialog } from "./initiative-form";
import { dateRange } from "./initiatives-view";

function LinkDocumentsDialog({
  workspace,
  initiative,
  open,
  onOpenChange,
}: {
  workspace: Workspace;
  initiative: Initiative;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <LinkDocumentsBody workspace={workspace} initiative={initiative} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function LinkDocumentsBody({
  workspace,
  initiative,
  onDone,
}: {
  workspace: Workspace;
  initiative: Initiative;
  onDone: () => void;
}) {
  const { knowledge } = workspace.data;
  const linked = knowledge.filter((k) => k.initiativeIds.includes(initiative.id)).map((k) => k.id);
  const [selected, setSelected] = useState<ID[]>(linked);

  async function save() {
    const changed = knowledge.filter((k) => linked.includes(k.id) !== selected.includes(k.id));
    let receipt = null;
    for (const item of changed) {
      const initiativeIds = selected.includes(item.id)
        ? [...item.initiativeIds, initiative.id]
        : item.initiativeIds.filter((id) => id !== initiative.id);
      const result = await workspace.service.knowledge.update(item.id, { initiativeIds });
      if (!result.ok) return notifyError("Could not update linked documents", result.message);
      receipt = result.receipt;
    }
    if (receipt) notifySaved("Linked documents updated", receipt);
    onDone();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Link documents</DialogTitle>
        <DialogDescription>Choose the Knowledge Library entries that explain how {initiative.title} runs.</DialogDescription>
      </DialogHeader>
      <CheckList
        label="Knowledge Library"
        value={selected}
        onChange={setSelected}
        emptyLabel="The Knowledge Library is empty. Add a document there first."
        options={knowledge.map((k) => ({ id: k.id, label: k.title, hint: KNOWLEDGE_KIND_LABELS[k.kind].label }))}
      />
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save}>Save links</Button>
      </DialogFooter>
    </>
  );
}

function CoverageCard({ initiative, coverage }: { initiative: Initiative; coverage: InitiativeCoverage }) {
  const uid = useId();
  const unready = coverage.openActions.filter((a) => !isActionable(a)).length;
  const completed = initiative.status === "completed";
  const rows: Array<{ state: CheckState; label: string; detail: string }> = [
    {
      state: initiative.ownerId ? "pass" : "fail",
      label: "Owner assigned",
      detail: initiative.ownerId ? "Someone is accountable for this." : "Nobody is accountable for this.",
    },
    {
      state: coverage.hasProcedure ? "pass" : "fail",
      label: "Playbook or SOP linked",
      detail: coverage.hasProcedure
        ? `${coverage.knowledge.length} linked documents.`
        : "Nothing documents how this is run.",
    },
    {
      state: unready === 0 ? "pass" : "fail",
      label: "Open actions can be picked up",
      detail:
        coverage.openActions.length === 0
          ? "No open actions."
          : unready === 0
            ? `All ${coverage.openActions.length} have an assignee, due date and next step.`
            : `${unready} of ${coverage.openActions.length} are missing an assignee, due date or next step.`,
    },
    {
      state: coverage.decisions.length ? "pass" : "unknown",
      label: "Decisions recorded",
      detail: coverage.decisions.length ? `${coverage.decisions.length} in the Decision Log.` : "None logged yet.",
    },
    {
      state: coverage.handovers.length ? "pass" : completed ? "unknown" : "fail",
      label: "Included in a handover",
      detail: coverage.handovers.length
        ? coverage.handovers.map((h) => h.title).join(", ")
        : "Not in scope of any handover.",
    },
  ];
  return (
    <section aria-labelledby={`${uid}-coverage-heading`} className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h2 id={`${uid}-coverage-heading`} className="text-sm font-medium">
          Documentation coverage
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Would a successor be able to run this?</p>
      </div>
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-2.5 px-4 py-2.5">
            <StateIcon state={row.state} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InitiativeDetail({
  workspace,
  initiative,
  onLeaving,
}: {
  workspace: Workspace;
  initiative: Initiative;
  onLeaving: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const { data, today, service } = workspace;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linking, setLinking] = useState(false);
  const coverage = initiativeCoverage(data, initiative);
  const status = INITIATIVE_STATUS_LABELS[initiative.status];

  async function remove() {
    try {
      onLeaving();
      const receipt = await service.initiatives.remove(initiative.id);
      notifySaved("Initiative deleted", receipt);
      router.push("/initiatives");
    } catch {
      notifyError("Could not delete the initiative", "It may already have been removed.");
    }
  }

  return (
    <>
      <PageHeader
        back={{ href: "/initiatives", label: "Initiatives" }}
        title={initiative.title}
        meta={
          <>
            <Pill tone={status.tone} dot>
              {status.label}
            </Pill>
            <Pill>{INITIATIVE_TYPE_LABELS[initiative.type]}</Pill>
            <span className="text-xs text-muted-foreground">{dateRange(initiative)}</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More options">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  <Trash2 aria-hidden />
                  Delete initiative
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby={`${uid}-summary-heading`}>
            <SectionHeading id={`${uid}-summary-heading`} title="Summary" />
            {initiative.summary ? (
              <p className="max-w-prose text-sm leading-relaxed text-pretty">{initiative.summary}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No summary yet. Edit the initiative to add one.</p>
            )}
          </section>

          <ActionsSection
            workspace={workspace}
            actions={coverage.actions}
            description="Unfinished and completed work tied to this initiative."
            defaults={{ initiativeId: initiative.id, assigneeId: initiative.ownerId }}
            emptyDescription="Record unfinished work here so it is not lost when the committee changes."
          />

          <section aria-labelledby={`${uid}-knowledge-heading`}>
            <SectionHeading
              id={`${uid}-knowledge-heading`}
              title="Knowledge"
              description="Playbooks, SOPs, lessons, contacts and templates for this initiative."
              action={
                <Button variant="outline" size="sm" onClick={() => setLinking(true)}>
                  <Link2 aria-hidden />
                  Link documents
                </Button>
              }
            />
            {coverage.knowledge.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No documents linked"
                description="Link the playbook or SOP that explains how this is run."
                className="py-8"
              />
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {coverage.knowledge.map((item) => {
                  const review = REVIEW_STATE_LABELS[reviewState(item, today, data.settings.reviewWindowDays)];
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/knowledge?doc=${item.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          <p className="truncate text-sm text-muted-foreground">{item.summary}</p>
                        </div>
                        <Pill>{KNOWLEDGE_KIND_LABELS[item.kind].label}</Pill>
                        {item.kind !== "contact" && <Pill tone={review.tone}>{review.label}</Pill>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby={`${uid}-decisions-heading`}>
            <SectionHeading
              id={`${uid}-decisions-heading`}
              title="Decisions"
              description="Why things are done the way they are."
            />
            {coverage.decisions.length === 0 ? (
              <EmptyState
                icon={GitBranch}
                title="No decisions logged"
                description="Decisions linked to this initiative in the Decision Log appear here."
                className="py-8"
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/decisions">Open Decision Log</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {coverage.decisions.map((decision) => (
                  <li key={decision.id}>
                    <Link
                      href={`/decisions?focus=${decision.id}#${decision.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{decision.title}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {formatDate(decision.decidedOn)}
                          {decision.chosen && ` · ${decision.chosen}`}
                        </p>
                      </div>
                      <Pill tone={DECISION_STATUS_LABELS[decision.status].tone}>
                        {DECISION_STATUS_LABELS[decision.status].label}
                      </Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section aria-labelledby={`${uid}-details-heading`} className="rounded-lg border bg-card">
            <h2 id={`${uid}-details-heading`} className="border-b px-4 py-3 text-sm font-medium">
              Details
            </h2>
            <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 py-3 text-sm">
              <dt className="text-muted-foreground">Owner</dt>
              <dd>
                <MemberChip members={data.members} id={initiative.ownerId} emptyLabel="No owner" />
              </dd>
              <dt className="text-muted-foreground">Dates</dt>
              <dd>{initiative.startDate ? dateRange(initiative) : "Not scheduled"}</dd>
              <dt className="text-muted-foreground">Recurrence</dt>
              <dd>{initiative.recurrence || "Does not recur"}</dd>
              <dt className="text-muted-foreground">Handover</dt>
              <dd>
                {coverage.handovers.length === 0
                  ? "Not in scope"
                  : coverage.handovers.map((h) => (
                      <Link key={h.id} href={`/handovers/${h.id}`} className="block underline-offset-4 hover:underline">
                        {h.title}
                      </Link>
                    ))}
              </dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd title={formatDate(initiative.updatedAt.slice(0, 10))}>
                {formatRelative(initiative.updatedAt.slice(0, 10), today)}
              </dd>
            </dl>
          </section>
          <InitiativeReadinessCard workspace={workspace} initiative={initiative} />
          <CoverageCard initiative={initiative} coverage={coverage} />
        </aside>
      </div>

      <InitiativeFormDialog workspace={workspace} open={editing} onOpenChange={setEditing} initiative={initiative} />
      <LinkDocumentsDialog workspace={workspace} initiative={initiative} open={linking} onOpenChange={setLinking} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this initiative?"
        description={`"${initiative.title}" will be removed from this demo session. Linked actions, documents and decisions are kept but unlinked.`}
        confirmLabel="Delete initiative"
        onConfirm={remove}
      />
    </>
  );
}

export function InitiativeDetailView({ id }: { id: string }) {
  const workspace = useWorkspace();
  const [leaving, setLeaving] = useState(false);
  useLayoutEffect(() => () => setLeaving(false), []);
  if (!workspace) return <PageSkeleton variant="detail" />;
  const initiative = workspace.data.initiatives.find((i) => i.id === id);
  if (!initiative && leaving) return <PageSkeleton variant="detail" />;
  if (!initiative) {
    return (
      <ErrorState
        title="Initiative not found"
        description="This initiative does not exist in the current demo session. It may have been deleted, or the demo data was reset."
        action={
          <Button asChild>
            <Link href="/initiatives">Back to initiatives</Link>
          </Button>
        }
      />
    );
  }
  return <InitiativeDetail workspace={workspace} initiative={initiative} onLeaving={() => setLeaving(true)} />;
}
