"use client";

import { useId, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, FileText, MoreHorizontal, Pencil, Trash2, Undo2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MemberSelect } from "@/components/shared/form";
import { MemberChip } from "@/components/shared/member-chip";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { Pill } from "@/components/shared/pill";
import { ReadinessChecklist, ReadinessPill, ReadinessRing } from "@/components/shared/readiness";
import { ErrorState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Handover, HandoverInput } from "@/domain/models";
import { evaluateReadiness, type ReadinessReport } from "@/domain/readiness";
import { ActionsSection } from "@/components/initiatives/action-list";
import { useWorkspace, type Workspace } from "@/lib/hooks/use-workspace";
import { formatDate, formatRelative } from "@/lib/utils/dates";
import { DECISION_STATUS_LABELS, INITIATIVE_STATUS_LABELS, KNOWLEDGE_KIND_LABELS } from "@/lib/utils/labels";
import { notifyError, notifySaved } from "@/lib/utils/notify";
import { HandoverFormDialog } from "./handover-form";
import { PackDialog } from "./pack-dialog";

function statusExplanation(report: ReadinessReport): string {
  const count = (state: "fail" | "unknown") => report.checks.filter((c) => c.state === state).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (report.status === "ready") return "Every check is met by documented evidence.";
  if (report.status === "gaps") {
    return `${plural(count("fail"), "check")} ${count("fail") === 1 ? "has" : "have"} a documented gap. Each one is listed below with what to fix.`;
  }
  const gaps = count("fail");
  return `${plural(count("unknown"), "check")} cannot be assessed yet${gaps ? `, and ${plural(gaps, "check")} ${gaps === 1 ? "has a gap" : "have gaps"}` : ""}. Treat this score as a lower bound, not a verdict.`;
}

function ScopeList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; label: string; hint: string; href: string } | null>;
}) {
  return (
    <div className="px-4 py-3">
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">
        {title} <span className="tabular font-normal">· {items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, index) =>
            item ? (
              <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={item.href} className="min-w-0 truncate underline-offset-4 hover:underline">
                  {item.label}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>
              </li>
            ) : (
              <li key={index}>
                <Pill tone="warning">Linked record is missing</Pill>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function ConfirmationRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5 px-4 py-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        aria-describedby={`${id}-hint`}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-xs text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function HandoverDetail({
  workspace,
  handover,
  onLeaving,
}: {
  workspace: Workspace;
  handover: Handover;
  onLeaving: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const { data, today, service } = workspace;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const report = evaluateReadiness(handover, data, {
    asOf: today,
    reviewWindowDays: data.settings.reviewWindowDays,
  });
  const actions = data.actions.filter(
    (a) => a.handoverId === handover.id || (a.initiativeId !== null && handover.initiativeIds.includes(a.initiativeId)),
  );
  const successor = data.members.find((m) => m.id === handover.successorId);

  async function patch(change: Partial<HandoverInput>, message: string) {
    const result = await service.handovers.update(handover.id, change);
    if (result.ok) notifySaved(message, result.receipt);
    else notifyError("Could not update the handover", Object.values(result.fieldErrors)[0] ?? result.message);
  }

  async function remove() {
    try {
      onLeaving();
      const receipt = await service.handovers.remove(handover.id);
      notifySaved("Handover deleted", receipt);
      router.push("/handovers");
    } catch {
      notifyError("Could not delete the handover", "It may already have been removed.");
    }
  }

  return (
    <>
      <PageHeader
        back={{ href: "/handovers", label: "Handover Center" }}
        title={`${handover.title} handover`}
        meta={
          <>
            <ReadinessPill report={report} />
            <span className="text-xs text-muted-foreground">
              {handover.outgoingTerm} to {handover.incomingTerm}
              {handover.targetDate &&
                ` · target ${formatDate(handover.targetDate)} (${formatRelative(handover.targetDate, today)})`}
            </span>
          </>
        }
        actions={
          <>
            <Button onClick={() => setPreviewing(true)}>
              <FileText aria-hidden />
              Preview handover pack
            </Button>
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
                  Delete handover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby={`${uid}-readiness-heading`} className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center gap-5 border-b px-4 py-4">
              <ReadinessRing
                score={report.score}
                maxScore={report.maxScore}
                status={report.status}
                label="Documented readiness"
              />
              <div className="min-w-0 flex-1 basis-56">
                <h2 id={`${uid}-readiness-heading`} className="text-sm font-medium">
                  Documented readiness
                </h2>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{statusExplanation(report)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Five checks, 20 points each. Review window {report.reviewWindowDays} days · assessed{" "}
                  {formatDate(report.asOf)} · policy {report.policyVersion}
                </p>
              </div>
            </div>
            <ReadinessChecklist report={report} />
          </section>

          <ActionsSection
            workspace={workspace}
            actions={actions}
            title="Unfinished work"
            description="Actions attached to this handover or to an initiative in its scope."
            defaults={{ handoverId: handover.id, assigneeId: handover.outgoingOwnerId }}
            emptyDescription="Add anything the outgoing owner has started but will not finish before the handover date."
          />

          <section aria-labelledby={`${uid}-scope-heading`}>
            <SectionHeading
              id={`${uid}-scope-heading`}
              title="Scope"
              description="What the successor is taking on. Readiness is assessed against exactly these records."
              action={
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden />
                  Edit scope
                </Button>
              }
            />
            <div className="divide-y rounded-lg border bg-card">
              <ScopeList
                title="Initiatives"
                empty="No initiatives in scope."
                items={handover.initiativeIds.map((id) => {
                  const record = data.initiatives.find((i) => i.id === id);
                  return record
                    ? {
                        id,
                        label: record.title,
                        hint: INITIATIVE_STATUS_LABELS[record.status].label,
                        href: `/initiatives/${id}`,
                      }
                    : null;
                })}
              />
              <ScopeList
                title="Required documents"
                empty="No documents linked."
                items={handover.knowledgeIds.map((id) => {
                  const record = data.knowledge.find((k) => k.id === id);
                  return record
                    ? { id, label: record.title, hint: KNOWLEDGE_KIND_LABELS[record.kind].label, href: `/knowledge?doc=${id}` }
                    : null;
                })}
              />
              <ScopeList
                title="Decisions to know about"
                empty="No decisions linked."
                items={handover.decisionIds.map((id) => {
                  const record = data.decisions.find((d) => d.id === id);
                  return record
                    ? { id, label: record.title, hint: DECISION_STATUS_LABELS[record.status].label, href: `/decisions?focus=${id}#${id}` }
                    : null;
                })}
              />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section aria-labelledby={`${uid}-people-heading`} className="rounded-lg border bg-card">
            <h2 id={`${uid}-people-heading`} className="border-b px-4 py-3 text-sm font-medium">
              People
            </h2>
            <div className="space-y-4 px-4 py-3">
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Outgoing owner</p>
                <MemberChip members={data.members} id={handover.outgoingOwnerId} emptyLabel="Not recorded" showRole />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Incoming owner (successor)
                </p>
                <MemberSelect
                  aria-label="Successor"
                  members={data.members.filter((m) => m.id !== handover.outgoingOwnerId)}
                  value={handover.successorId}
                  emptyLabel="Not yet named"
                  onChange={(successorId) =>
                    patch(
                      { successorId, acknowledgedOn: null },
                      successorId ? "Successor assigned" : "Successor removed",
                    )
                  }
                />
              </div>
            </div>
          </section>

          <section aria-labelledby={`${uid}-confirm-heading`} className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h2 id={`${uid}-confirm-heading`} className="text-sm font-medium">
                Outgoing owner confirmations
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Without these, an empty list could mean nothing to do or nothing written down.
              </p>
            </div>
            <div className="divide-y">
              <ConfirmationRow
                checked={handover.scopeConfirmed}
                onChange={(scopeConfirmed) =>
                  patch({ scopeConfirmed }, scopeConfirmed ? "Scope confirmed" : "Scope confirmation removed")
                }
                label="Scope is complete"
                description="The initiatives and documents listed are everything this role covers."
              />
              <ConfirmationRow
                checked={handover.actionsReviewed}
                onChange={(actionsReviewed) =>
                  patch({ actionsReviewed }, actionsReviewed ? "Action list reviewed" : "Action review removed")
                }
                label="Action list is complete"
                description="All unfinished work for this role has been recorded."
              />
            </div>
          </section>

          <section aria-labelledby={`${uid}-ack-heading`} className="rounded-lg border bg-card">
            <h2 id={`${uid}-ack-heading`} className="border-b px-4 py-3 text-sm font-medium">
              Successor acknowledgement
            </h2>
            <div className="space-y-3 px-4 py-3">
              {handover.acknowledgedOn ? (
                <>
                  <p className="flex items-start gap-2 text-sm">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    <span>
                      {successor?.name ?? "The successor"} acknowledged this handover on{" "}
                      {formatDate(handover.acknowledgedOn)}.
                    </span>
                  </p>
                  <Button variant="outline" size="sm" onClick={() => patch({ acknowledgedOn: null }, "Acknowledgement removed")}>
                    <Undo2 aria-hidden />
                    Undo
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-pretty text-muted-foreground">
                    {!successor
                      ? "Name a successor before recording an acknowledgement."
                      : report.status === "ready"
                        ? `Record that ${successor.name} has read the pack and accepts the role.`
                        : `Gaps remain. Acknowledging records that ${successor.name} has seen the current state, not that the handover is complete.`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!successor}
                    onClick={() => patch({ acknowledgedOn: today }, "Acknowledgement recorded")}
                  >
                    Record acknowledgement
                  </Button>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      <HandoverFormDialog workspace={workspace} open={editing} onOpenChange={setEditing} handover={handover} />
      <PackDialog
        workspace={workspace}
        handover={handover}
        report={report}
        open={previewing}
        onOpenChange={setPreviewing}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this handover?"
        description={`The ${handover.title} handover will be removed from this demo session. Its actions are kept but unlinked.`}
        confirmLabel="Delete handover"
        onConfirm={remove}
      />
    </>
  );
}

export function HandoverDetailView({ id }: { id: string }) {
  const workspace = useWorkspace();
  const [leaving, setLeaving] = useState(false);
  useLayoutEffect(() => () => setLeaving(false), []);
  if (!workspace) return <PageSkeleton variant="detail" />;
  const handover = workspace.data.handovers.find((h) => h.id === id);
  if (!handover && leaving) return <PageSkeleton variant="detail" />;
  if (!handover) {
    return (
      <ErrorState
        title="Handover not found"
        description="This handover does not exist in the current demo session. It may have been deleted, or the demo data was reset."
        action={
          <Button asChild>
            <Link href="/handovers">Back to Handover Center</Link>
          </Button>
        }
      />
    );
  }
  return <HandoverDetail workspace={workspace} handover={handover} onLeaving={() => setLeaving(true)} />;
}
