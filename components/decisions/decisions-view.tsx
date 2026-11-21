"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, GitBranch, Pencil, Plus, Search, SearchX, Trash2 } from "lucide-react";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OptionSelect } from "@/components/shared/form";
import { MemberChip } from "@/components/shared/member-chip";
import { PageHeader } from "@/components/shared/page-header";
import { Pill } from "@/components/shared/pill";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DECISION_STATUSES, type Decision } from "@/domain/models";
import { useWorkspace, type Workspace } from "@/lib/hooks/use-workspace";
import { formatDate, formatMonth } from "@/lib/utils/dates";
import { DECISION_STATUS_LABELS } from "@/lib/utils/labels";
import { notifyError, notifySaved } from "@/lib/utils/notify";
import { DecisionFormDialog, OutcomeDialog } from "./decision-form";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...DECISION_STATUSES.map((s) => ({ value: s, label: DECISION_STATUS_LABELS[s].label })),
  { value: "awaiting", label: "Awaiting outcome" },
];

const DOT: Record<Decision["status"], string> = {
  decided: "border-brand bg-brand",
  proposed: "border-warning bg-background",
  superseded: "border-muted-foreground/50 bg-background",
};

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium text-muted-foreground">{label}</h4>
      <div className="text-sm leading-relaxed text-pretty">{children}</div>
    </div>
  );
}

function DecisionEntry({
  workspace,
  decision,
  open,
  onToggle,
  onEdit,
  onDelete,
  onRecordOutcome,
}: {
  workspace: Workspace;
  decision: Decision;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRecordOutcome: () => void;
}) {
  const { data } = workspace;
  const status = DECISION_STATUS_LABELS[decision.status];
  const awaiting = decision.status === "decided" && !decision.outcome.trim();
  const panelId = useId();

  return (
    <li id={decision.id} className="relative scroll-mt-6 pb-4 pl-7 last:pb-0">
      <span
        aria-hidden
        className={cn("absolute top-4 left-0 size-2.5 -translate-x-1/2 rounded-full border-2", DOT[decision.status])}
      />
      <article className={cn("rounded-lg border bg-card transition-shadow", open && "ring-1 ring-ring/30")}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <time dateTime={decision.decidedOn}>{formatDate(decision.decidedOn)}</time>
              <Pill tone={status.tone}>{status.label}</Pill>
              {awaiting && <Pill tone="warning">Outcome not recorded</Pill>}
            </span>
            <span
              className={cn(
                "mt-1.5 block text-sm font-medium",
                decision.status === "superseded" && "text-muted-foreground line-through",
              )}
            >
              {decision.title}
            </span>
            {decision.chosen && !open && (
              <span className="mt-0.5 block truncate text-sm text-muted-foreground">{decision.chosen}</span>
            )}
          </span>
          <ChevronRight
            aria-hidden
            className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
        </button>

        {open && (
          <div id={panelId} className="space-y-4 border-t px-4 py-4">
            <Block label="Context">{decision.context}</Block>
            <Block label="Alternatives considered">
              {decision.alternatives.length ? (
                <ul className="list-disc space-y-0.5 pl-5">
                  {decision.alternatives.map((alternative) => (
                    <li key={alternative}>{alternative}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">None recorded.</span>
              )}
            </Block>
            <Block label="Chosen option">
              {decision.chosen || <span className="text-muted-foreground">Not decided yet.</span>}
            </Block>
            {decision.rationale && <Block label="Rationale">{decision.rationale}</Block>}
            <Block label="Outcome">
              {decision.outcome.trim() ? (
                decision.outcome
              ) : (
                <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
                  {decision.status === "proposed"
                    ? "Nothing to report until a decision is made."
                    : "Not yet recorded. Levito does not assume an outcome."}
                  {decision.status !== "proposed" && (
                    <Button variant="outline" size="sm" onClick={onRecordOutcome}>
                      Record outcome
                    </Button>
                  )}
                </span>
              )}
            </Block>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-3">
              <MemberChip members={data.members} id={decision.ownerId} emptyLabel="No one responsible" />
              <ul className="flex flex-wrap gap-1.5">
                {decision.initiativeIds.map((id) => {
                  const initiative = data.initiatives.find((i) => i.id === id);
                  return initiative ? (
                    <li key={id}>
                      <Link
                        href={`/initiatives/${id}`}
                        className="inline-flex h-6 items-center rounded-md border px-2 text-xs hover:bg-muted/60"
                      >
                        {initiative.title}
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={onEdit}>
                  <Pencil aria-hidden />
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
                  <Trash2 aria-hidden />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </article>
    </li>
  );
}

function DecisionsContent({ workspace }: { workspace: Workspace }) {
  const { decisions } = workspace.data;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const focusId = useSearchParams().get("focus");
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Decision | null>(null);
  const [deleting, setDeleting] = useState<Decision | null>(null);
  const [recording, setRecording] = useState<Decision | null>(null);

  const needle = query.trim().toLowerCase();
  const filtered = decisions
    .filter((d) => {
      const statusMatch =
        status === "all" ||
        (status === "awaiting" ? d.status === "decided" && !d.outcome.trim() : d.status === status);
      const textMatch =
        !needle || [d.title, d.context, d.chosen, d.rationale, d.outcome].join(" ").toLowerCase().includes(needle);
      return statusMatch && textMatch;
    })
    .sort((a, b) => b.decidedOn.localeCompare(a.decidedOn));

  const groups: Array<{ month: string; items: Decision[] }> = [];
  for (const decision of filtered) {
    const month = formatMonth(decision.decidedOn);
    const last = groups.at(-1);
    if (last?.month === month) last.items.push(decision);
    else groups.push({ month, items: [decision] });
  }

  async function remove(decision: Decision) {
    try {
      notifySaved("Decision deleted", await workspace.service.decisions.remove(decision.id));
    } catch {
      notifyError("Could not delete the decision", "It may already have been removed.");
    }
  }

  return (
    <>
      <PageHeader
        title="Decision Log"
        description="What was decided, what else was considered, and how it turned out. Newest first."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Log decision
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search decisions"
            aria-label="Search decisions"
            className="pl-8"
          />
        </div>
        <OptionSelect
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          aria-label="Filter by status"
          className="w-44"
        />
        <p className="tabular ml-auto text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} of {decisions.length}
        </p>
      </div>

      {decisions.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No decisions logged"
          description="Log the next decision the committee makes, including the options it turned down."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Log decision
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No decisions match"
          description="Nothing fits this search and status filter."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="max-w-3xl space-y-6">
          {groups.map((group) => (
            <section key={group.month} aria-label={group.month}>
              <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.month}</h2>
              <ol className="ml-1.5 border-l">
                {group.items.map((decision) => {
                  const open = toggled[decision.id] ?? decision.id === focusId;
                  return (
                    <DecisionEntry
                      key={decision.id}
                      workspace={workspace}
                      decision={decision}
                      open={open}
                      onToggle={() => setToggled((current) => ({ ...current, [decision.id]: !open }))}
                      onEdit={() => setEditing(decision)}
                      onDelete={() => setDeleting(decision)}
                      onRecordOutcome={() => setRecording(decision)}
                    />
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <DecisionFormDialog workspace={workspace} open={creating} onOpenChange={setCreating} />
      <DecisionFormDialog
        workspace={workspace}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        decision={editing ?? undefined}
      />
      <OutcomeDialog workspace={workspace} decision={recording} onClose={() => setRecording(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this decision?"
        description={`"${deleting?.title ?? ""}" will be removed from this demo session.`}
        confirmLabel="Delete decision"
        onConfirm={() => deleting && remove(deleting)}
      />
    </>
  );
}

export function DecisionsView() {
  const workspace = useWorkspace();
  return workspace ? <DecisionsContent workspace={workspace} /> : <PageSkeleton />;
}
