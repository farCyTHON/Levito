"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  CalendarCheck,
  Contact,
  FileText,
  Lightbulb,
  ListOrdered,
  type LucideIcon,
  Pencil,
  Plus,
  Search,
  SearchX,
  Trash2,
} from "lucide-react";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OptionSelect } from "@/components/shared/form";
import { MemberChip } from "@/components/shared/member-chip";
import { PageHeader } from "@/components/shared/page-header";
import { Pill } from "@/components/shared/pill";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { KNOWLEDGE_KINDS, type KnowledgeItem, type KnowledgeKind } from "@/domain/models";
import { useWorkspace, type Workspace } from "@/lib/hooks/use-workspace";
import { formatDate, formatRelative } from "@/lib/utils/dates";
import { KNOWLEDGE_KIND_LABELS, REVIEW_STATE_LABELS } from "@/lib/utils/labels";
import { notifyError, notifySaved } from "@/lib/utils/notify";
import { reviewState } from "@/lib/services/insights";
import { KnowledgeFormDialog } from "./knowledge-form";

const KIND_ICONS: Record<KnowledgeKind, LucideIcon> = {
  playbook: BookOpen,
  sop: ListOrdered,
  lesson: Lightbulb,
  contact: Contact,
  template: FileText,
};

const REVIEW_FILTERS = [
  { value: "all", label: "Any review state" },
  { value: "attention", label: "Needs review" },
  { value: "current", label: "Reviewed" },
] as const;
type ReviewFilter = (typeof REVIEW_FILTERS)[number]["value"];

function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-transparent bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
      <span className="tabular font-normal opacity-60">{count}</span>
    </button>
  );
}

function KnowledgeSheet({
  workspace,
  item,
  onClose,
  onEdit,
  onDelete,
}: {
  workspace: Workspace;
  item: KnowledgeItem | null;
  onClose: () => void;
  onEdit: (item: KnowledgeItem) => void;
  onDelete: (item: KnowledgeItem) => void;
}) {
  const { data, today, service } = workspace;

  async function markReviewed(target: KnowledgeItem) {
    const result = await service.knowledge.markReviewed(target.id, today);
    if (result.ok) notifySaved("Marked as reviewed today", result.receipt);
    else notifyError("Could not record the review", result.message);
  }

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl data-[side=right]:sm:max-w-xl">
        {item && (
          <>
            <SheetHeader className="gap-2 border-b px-5 py-4 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <Pill>{KNOWLEDGE_KIND_LABELS[item.kind].label}</Pill>
                {item.kind !== "contact" && (
                  <Pill tone={REVIEW_STATE_LABELS[reviewState(item, today, data.settings.reviewWindowDays)].tone} dot>
                    {REVIEW_STATE_LABELS[reviewState(item, today, data.settings.reviewWindowDays)].label}
                  </Pill>
                )}
              </div>
              <SheetTitle className="text-lg leading-snug">{item.title}</SheetTitle>
              <SheetDescription>{item.summary || "No summary provided."}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-5 py-5">
              <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Owner</dt>
                <dd>
                  <MemberChip members={data.members} id={item.ownerId} />
                </dd>
                <dt className="text-muted-foreground">Last reviewed</dt>
                <dd>
                  {item.lastReviewedOn
                    ? `${formatDate(item.lastReviewedOn)} (${formatRelative(item.lastReviewedOn, today)})`
                    : "Never"}
                </dd>
                {item.tags.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Tags</dt>
                    <dd className="flex flex-wrap gap-1">
                      {item.tags.map((tag) => (
                        <Pill key={tag}>{tag}</Pill>
                      ))}
                    </dd>
                  </>
                )}
                {item.contact && (
                  <>
                    <dt className="text-muted-foreground">Organization</dt>
                    <dd>{item.contact.organization || "Not recorded"}</dd>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="break-all">
                      {item.contact.email ? (
                        <a href={`mailto:${item.contact.email}`} className="underline underline-offset-4">
                          {item.contact.email}
                        </a>
                      ) : (
                        "Not recorded"
                      )}
                    </dd>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>{item.contact.phone || "Not recorded"}</dd>
                    {item.contact.website && (
                      <>
                        <dt className="text-muted-foreground">Website</dt>
                        <dd className="break-all">{item.contact.website}</dd>
                      </>
                    )}
                  </>
                )}
              </dl>

              <section>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                  {item.kind === "contact" ? "Notes" : "Content"}
                </h3>
                {item.content.trim() ? (
                  <div className="rounded-lg border bg-card px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                    {item.content}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
                    Nothing has been written yet.
                  </p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">Related initiatives</h3>
                {item.initiativeIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not linked to any initiative.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {item.initiativeIds.map((id) => {
                      const initiative = data.initiatives.find((i) => i.id === id);
                      return (
                        <li key={id}>
                          {initiative ? (
                            <Link
                              href={`/initiatives/${id}`}
                              className="inline-flex h-6 items-center rounded-md border px-2 text-xs hover:bg-muted/60"
                            >
                              {initiative.title}
                            </Link>
                          ) : (
                            <Pill tone="warning">Missing initiative</Pill>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <div className="mt-auto flex flex-wrap gap-2 border-t px-5 py-3">
              <Button onClick={() => markReviewed(item)} disabled={item.lastReviewedOn === today}>
                <CalendarCheck aria-hidden />
                {item.lastReviewedOn === today ? "Reviewed today" : "Mark reviewed today"}
              </Button>
              <Button variant="outline" onClick={() => onEdit(item)}>
                <Pencil aria-hidden />
                Edit
              </Button>
              <Button variant="ghost" className="ml-auto text-destructive" onClick={() => onDelete(item)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function KnowledgeContent({ workspace }: { workspace: Workspace }) {
  const { data, today, service } = workspace;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KnowledgeKind | "all">("all");
  const [review, setReview] = useState<ReviewFilter>("all");
  const selectedId = useSearchParams().get("doc");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeItem | null>(null);

  const stateOf = (item: KnowledgeItem) => reviewState(item, today, data.settings.reviewWindowDays);
  const needle = query.trim().toLowerCase();
  const matchesText = (item: KnowledgeItem) =>
    !needle ||
    [item.title, item.summary, item.content, item.contact?.organization ?? "", ...item.tags]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  const matchesReview = (item: KnowledgeItem) => {
    if (review === "all") return true;
    if (item.kind === "contact") return false;
    const state = stateOf(item);
    return review === "current" ? state === "current" : state !== "current";
  };
  const preKind = data.knowledge.filter((item) => matchesText(item) && matchesReview(item));
  const filtered = preKind
    .filter((item) => kind === "all" || item.kind === kind)
    .sort((a, b) => a.title.localeCompare(b.title));
  const selected = data.knowledge.find((item) => item.id === selectedId) ?? null;

  function select(id: string | null) {
    window.history.replaceState(null, "", id ? `?doc=${encodeURIComponent(id)}` : window.location.pathname);
  }

  async function remove(item: KnowledgeItem) {
    try {
      const receipt = await service.knowledge.remove(item.id);
      select(null);
      notifySaved("Document deleted", receipt);
    } catch {
      notifyError("Could not delete the document", "It may already have been removed.");
    }
  }

  return (
    <>
      <PageHeader
        title="Knowledge Library"
        description="Playbooks, SOPs, lessons, contacts and templates. Each document carries an owner and a review date so the next committee knows what to trust."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New document
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, content and tags"
            aria-label="Search the Knowledge Library"
            className="pl-8"
          />
        </div>
        <OptionSelect
          value={review}
          onChange={setReview}
          options={REVIEW_FILTERS}
          aria-label="Filter by review state"
          className="w-44"
        />
      </div>

      <div role="group" aria-label="Filter by document type" className="mb-4 flex flex-wrap gap-1.5">
        <FilterChip active={kind === "all"} onClick={() => setKind("all")} count={preKind.length}>
          All
        </FilterChip>
        {KNOWLEDGE_KINDS.map((k) => (
          <FilterChip
            key={k}
            active={kind === k}
            onClick={() => setKind(k)}
            count={preKind.filter((item) => item.kind === k).length}
          >
            {KNOWLEDGE_KIND_LABELS[k].plural}
          </FilterChip>
        ))}
      </div>

      {data.knowledge.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="The library is empty"
          description="Start with the one process that would be hardest to reconstruct if its owner left tomorrow."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New document
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No documents match"
          description="Nothing fits this search and filter combination."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setKind("all");
                setReview("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card" aria-live="polite">
          {filtered.map((item) => {
            const Icon = KIND_ICONS[item.kind];
            const state = REVIEW_STATE_LABELS[stateOf(item)];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => select(item.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{item.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {KNOWLEDGE_KIND_LABELS[item.kind].label}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.summary}</span>
                  </span>
                  <span className="hidden w-40 shrink-0 lg:block">
                    <MemberChip members={data.members} id={item.ownerId} emptyLabel="No owner" />
                  </span>
                  <span className="hidden w-32 shrink-0 justify-end sm:flex">
                    {item.kind === "contact" ? (
                      <span className="text-xs text-muted-foreground">Contact record</span>
                    ) : (
                      <Pill tone={state.tone} dot>
                        {state.label}
                      </Pill>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <KnowledgeSheet
        workspace={workspace}
        item={selected}
        onClose={() => select(null)}
        onEdit={setEditing}
        onDelete={setDeleting}
      />
      <KnowledgeFormDialog workspace={workspace} open={creating} onOpenChange={setCreating} />
      <KnowledgeFormDialog
        workspace={workspace}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        item={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this document?"
        description={`"${deleting?.title ?? ""}" will be removed from this demo session and unlinked from any handover that requires it.`}
        confirmLabel="Delete document"
        onConfirm={() => deleting && remove(deleting)}
      />
    </>
  );
}

export function KnowledgeView() {
  const workspace = useWorkspace();
  return workspace ? <KnowledgeContent workspace={workspace} /> : <PageSkeleton />;
}
