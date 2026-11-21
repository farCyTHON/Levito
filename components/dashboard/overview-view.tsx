"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, CircleCheck, Repeat2 } from "lucide-react";
import { cn } from "cn";
import { MemberChip } from "@/components/shared/member-chip";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { ReadinessPill, ReadinessRing, ReadinessSegments } from "@/components/shared/readiness";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { useWorkspace, type Workspace } from "@/lib/hooks/use-workspace";
import { formatDate, formatRelative } from "@/lib/utils/dates";
import { buildOverview, isOverdue } from "@/lib/services/insights";

function Metric({
  href,
  label,
  value,
  note,
  alert,
}: {
  href: string;
  label: string;
  value: number;
  note: string;
  alert: boolean;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border bg-card p-4 transition-colors outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="flex items-center justify-between text-xs text-muted-foreground">
        {label}
        <ArrowRight
          aria-hidden
          className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </p>
      <p className="tabular mt-2 text-2xl leading-none font-semibold tracking-tight">{value}</p>
      <p className={cn("mt-2 text-xs", alert ? "text-warning" : "text-muted-foreground")}>{note}</p>
    </Link>
  );
}

function OverviewContent({ workspace }: { workspace: Workspace }) {
  const { data, today } = workspace;
  const { reports, summary, attention, metrics, upcomingActions } = buildOverview(data, today);
  const overallStatus = summary.total > 0 && summary.ready === summary.total ? "ready" : summary.incomplete ? "incomplete" : "gaps";
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

  return (
    <>
      <PageHeader title="Overview" description={`${data.organization.name} · ${data.organization.term}`} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <section aria-labelledby="readiness-summary" className="flex flex-col rounded-lg border bg-card p-4">
          <h2 id="readiness-summary" className="text-sm font-medium">
            Handover readiness
          </h2>
          {summary.total === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No handovers exist yet, so there is nothing to assess.
            </p>
          ) : (
            <>
              <div className="mt-4 flex items-center gap-5">
                <ReadinessRing score={summary.averageScore} status={overallStatus} label="Average documented readiness" />
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="tabular font-semibold">{summary.ready}</span> of{" "}
                    <span className="tabular">{summary.total}</span> handovers ready
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <span aria-hidden className="size-1.5 rounded-full bg-success" />
                      {summary.ready} ready
                    </li>
                    <li className="flex items-center gap-2">
                      <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
                      {summary.gaps} with documented gaps
                    </li>
                    <li className="flex items-center gap-2">
                      <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                      {summary.incomplete} not fully assessed
                    </li>
                  </ul>
                </div>
              </div>
              <p className="mt-4 border-t pt-3 text-xs text-pretty text-muted-foreground">
                Average of each handover&apos;s score. It reflects what has been written down, not everything the
                committee knows.
              </p>
            </>
          )}
        </section>

        <section aria-labelledby="handover-list" className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 id="handover-list" className="text-sm font-medium">
              Handovers
            </h2>
            <Link href="/handovers" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Open Handover Center
            </Link>
          </div>
          {data.handovers.length === 0 ? (
            <EmptyState
              icon={Repeat2}
              title="No handovers yet"
              description="Create one for each role that changes hands this year."
              className="m-4 border-0 py-6"
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link href="/handovers">Go to Handover Center</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {data.handovers.map((handover) => {
                const report = reports.get(handover.id)!;
                return (
                  <li key={handover.id}>
                    <Link
                      href={`/handovers/${handover.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_8.5rem_2.5rem]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{handover.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {data.members.find((m) => m.id === handover.outgoingOwnerId)?.name ?? "No outgoing owner"}
                          {" → "}
                          {data.members.find((m) => m.id === handover.successorId)?.name ?? "no successor"}
                        </p>
                      </div>
                      <ReadinessSegments report={report} className="hidden sm:flex" />
                      <div className="justify-self-end sm:justify-self-start">
                        <ReadinessPill report={report} />
                      </div>
                      <p className="tabular hidden text-right text-sm font-medium sm:block">{report.score}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          href="/initiatives"
          label="Live initiatives"
          value={metrics.liveInitiatives}
          note={metrics.unownedInitiatives ? `${metrics.unownedInitiatives} without an owner` : "All have an owner"}
          alert={metrics.unownedInitiatives > 0}
        />
        <Metric
          href="/knowledge"
          label="Documents"
          value={metrics.documents}
          note={
            metrics.documentsNeedingReview
              ? `${metrics.documentsNeedingReview} overdue or never reviewed`
              : "All reviews are current"
          }
          alert={metrics.documentsNeedingReview > 0}
        />
        <Metric
          href="/handovers"
          label="Open actions"
          value={metrics.openActions}
          note={
            metrics.overdueActions || metrics.unactionableActions
              ? `${metrics.overdueActions} overdue · ${metrics.unactionableActions} missing details`
              : "All assigned and on time"
          }
          alert={metrics.overdueActions + metrics.unactionableActions > 0}
        />
        <Metric
          href="/decisions"
          label="Decisions logged"
          value={metrics.decisions}
          note={
            metrics.decisionsAwaitingOutcome
              ? `${metrics.decisionsAwaitingOutcome} without a recorded outcome`
              : "All outcomes recorded"
          }
          alert={metrics.decisionsAwaitingOutcome > 0}
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="attention-heading">
          <SectionHeading
            id="attention-heading"
            title="Needs attention"
            description={
              attention.length
                ? `${count(attention.length, "gap")} found in the stored records, most serious first.`
                : undefined
            }
          />
          {attention.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              title="No documented gaps"
              description="Every handover check is met and every live initiative has an owner and a playbook."
              className="py-8"
            />
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="group flex items-start gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        item.severity === "high" ? "bg-destructive" : "bg-warning",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="block text-sm text-pretty text-muted-foreground">{item.detail}</span>
                    </span>
                    <span className="sr-only">{item.severity === "high" ? "Gap" : "Not assessed"}</span>
                    <ChevronRight
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="upcoming-heading">
          <SectionHeading id="upcoming-heading" title="Next due actions" description="Open actions with a due date." />
          {upcomingActions.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              title="Nothing scheduled"
              description="No open action has a due date."
              className="py-8"
            />
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {upcomingActions.map((action) => {
                const overdue = isOverdue(action, today);
                const href = action.handoverId
                  ? `/handovers/${action.handoverId}`
                  : action.initiativeId
                    ? `/initiatives/${action.initiativeId}`
                    : "/handovers";
                return (
                  <li key={action.id}>
                    <Link
                      href={href}
                      className="block px-4 py-2.5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
                    >
                      <p className="truncate text-sm font-medium">{action.title}</p>
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <MemberChip members={data.members} id={action.assigneeId} className="text-xs" />
                        <span
                          className={cn("shrink-0", overdue && "font-medium text-destructive")}
                          title={formatDate(action.dueDate)}
                        >
                          {overdue ? "Overdue · " : ""}
                          {formatRelative(action.dueDate!, today)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

export function OverviewView() {
  const workspace = useWorkspace();
  return workspace ? <OverviewContent workspace={workspace} /> : <PageSkeleton variant="overview" />;
}
