"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, ListChecks, Plus, Rocket, Search, SearchX } from "lucide-react";
import { OptionSelect } from "@/components/shared/form";
import { MemberChip } from "@/components/shared/member-chip";
import { PageHeader } from "@/components/shared/page-header";
import { Pill } from "@/components/shared/pill";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INITIATIVE_STATUSES, INITIATIVE_TYPES, type Initiative } from "@/domain/models";
import { useWorkspace, type Workspace } from "@/lib/hooks/use-workspace";
import { formatDate } from "@/lib/utils/dates";
import { INITIATIVE_STATUS_LABELS, INITIATIVE_TYPE_LABELS } from "@/lib/utils/labels";
import { initiativeCoverage } from "@/lib/services/insights";
import { InitiativeFormDialog } from "./initiative-form";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...INITIATIVE_STATUSES.map((s) => ({ value: s, label: INITIATIVE_STATUS_LABELS[s].label })),
];
const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  ...INITIATIVE_TYPES.map((t) => ({ value: t, label: INITIATIVE_TYPE_LABELS[t] })),
];
const STATUS_ORDER = { active: 0, planned: 1, paused: 2, completed: 3 } as const;

export function dateRange(initiative: Initiative): string {
  if (!initiative.startDate) return initiative.recurrence || "No dates";
  if (!initiative.endDate || initiative.endDate === initiative.startDate) return formatDate(initiative.startDate);
  return `${formatDate(initiative.startDate)} – ${formatDate(initiative.endDate)}`;
}

function InitiativeRow({ workspace, initiative }: { workspace: Workspace; initiative: Initiative }) {
  const coverage = initiativeCoverage(workspace.data, initiative);
  const status = INITIATIVE_STATUS_LABELS[initiative.status];
  return (
    <li>
      <Link
        href={`/initiatives/${initiative.id}`}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40 md:grid-cols-[minmax(0,1fr)_6.5rem_11rem_9.5rem_auto]"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{initiative.title}</span>
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              {INITIATIVE_TYPE_LABELS[initiative.type]}
            </span>
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{dateRange(initiative)}</p>
        </div>
        <div className="row-span-2 self-center md:row-span-1">
          <Pill tone={status.tone} dot>
            {status.label}
          </Pill>
        </div>
        <MemberChip members={workspace.data.members} id={initiative.ownerId} emptyLabel="No owner" />
        <div className="hidden items-center gap-3 text-xs text-muted-foreground md:flex">
          <span className="inline-flex items-center gap-1" title="Linked documents">
            <BookOpen className="size-3.5" aria-hidden />
            <span className="tabular">{coverage.knowledge.length}</span>
            <span className="sr-only">linked documents</span>
          </span>
          <span className="inline-flex items-center gap-1" title="Open actions">
            <ListChecks className="size-3.5" aria-hidden />
            <span className="tabular">{coverage.openActions.length}</span>
            <span className="sr-only">open actions</span>
          </span>
          {!coverage.hasProcedure && initiative.status !== "completed" && <Pill tone="warning">No playbook</Pill>}
        </div>
        <ChevronRight
          aria-hidden
          className="hidden size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 md:block"
        />
      </Link>
    </li>
  );
}

function InitiativesContent({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [creating, setCreating] = useState(false);

  const { initiatives } = workspace.data;
  const needle = query.trim().toLowerCase();
  const filtered = initiatives
    .filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (type === "all" || i.type === type) &&
        (!needle || `${i.title} ${i.summary}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title));
  const filtering = needle !== "" || status !== "all" || type !== "all";

  return (
    <>
      <PageHeader
        title="Initiatives"
        description="Everything the organization runs: events, campaigns, projects and recurring activities."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New initiative
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search initiatives"
            aria-label="Search initiatives"
            className="pl-8"
          />
        </div>
        <OptionSelect
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          aria-label="Filter by status"
          className="w-36"
        />
        <OptionSelect value={type} onChange={setType} options={TYPE_OPTIONS} aria-label="Filter by type" className="w-32" />
        <p className="tabular ml-auto text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} of {initiatives.length}
        </p>
      </div>

      {initiatives.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No initiatives yet"
          description="Start with the activity the next committee is most likely to ask about."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New initiative
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No initiatives match these filters"
          description="Try a different search term, or clear the filters to see everything."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setStatus("all");
                setType("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {filtered.map((initiative) => (
            <InitiativeRow key={initiative.id} workspace={workspace} initiative={initiative} />
          ))}
        </ul>
      )}
      {filtering && filtered.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Filters are applied. Some initiatives are hidden.</p>
      )}

      <InitiativeFormDialog
        workspace={workspace}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(initiative) => router.push(`/initiatives/${initiative.id}`)}
      />
    </>
  );
}

export function InitiativesView() {
  const workspace = useWorkspace();
  return workspace ? <InitiativesContent workspace={workspace} /> : <PageSkeleton />;
}
