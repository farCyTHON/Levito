"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Repeat2 } from "lucide-react";
import { MemberChip } from "@/components/shared/member-chip";
import { PageHeader } from "@/components/shared/page-header";
import { Pill } from "@/components/shared/pill";
import { ReadinessPill, ReadinessRing, ReadinessSegments } from "@/components/shared/readiness";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { summarizeReadiness } from "@/domain/readiness";
import { useWorkspace, type Workspace } from "@/lib/hooks/use-workspace";
import { formatDate, formatRelative } from "@/lib/utils/dates";
import { readinessReports } from "@/lib/services/insights";
import { HandoverFormDialog } from "./handover-form";

function HandoversContent({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const { data, today } = workspace;
  const [creating, setCreating] = useState(false);
  const reports = readinessReports(data, today);
  const summary = summarizeReadiness([...reports.values()]);

  return (
    <>
      <PageHeader
        title="Handover Center"
        description="One handover per role. Readiness is scored only from what is actually documented: owners, successors, playbooks, review dates and open actions."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New handover
          </Button>
        }
        meta={
          data.handovers.length > 0 && (
            <>
              <Pill tone="success" dot>
                {summary.ready} ready
              </Pill>
              <Pill tone="danger" dot>
                {summary.gaps} with gaps
              </Pill>
              <Pill tone="warning" dot>
                {summary.incomplete} not fully assessed
              </Pill>
            </>
          )
        }
      />

      {data.handovers.length === 0 ? (
        <EmptyState
          icon={Repeat2}
          title="No handovers yet"
          description="Create a handover for each role that changes hands at the end of the committee term."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New handover
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.handovers.map((handover) => {
            const report = reports.get(handover.id)!;
            const firstGap = report.checks.find((c) => c.state !== "pass");
            return (
              <li key={handover.id}>
                <Link
                  href={`/handovers/${handover.id}`}
                  className="group flex h-full flex-col gap-4 rounded-lg border bg-card p-4 transition-colors outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start gap-4">
                    <ReadinessRing
                      score={report.score}
                      maxScore={report.maxScore}
                      status={report.status}
                      size={56}
                      label={`${handover.title} readiness`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-medium">{handover.title}</h2>
                        <ReadinessPill report={report} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {handover.outgoingTerm} to {handover.incomingTerm}
                        {handover.targetDate &&
                          ` · due ${formatRelative(handover.targetDate, today)} (${formatDate(handover.targetDate)})`}
                      </p>
                      <ReadinessSegments report={report} className="mt-2.5" />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <MemberChip members={data.members} id={handover.outgoingOwnerId} emptyLabel="No outgoing owner" />
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-label="hands over to" />
                    <MemberChip members={data.members} id={handover.successorId} emptyLabel="No successor named" />
                  </div>

                  <p className="mt-auto border-t pt-3 text-sm text-muted-foreground">
                    {firstGap ? (
                      <>
                        <span className="font-medium text-foreground">{firstGap.label}: </span>
                        {firstGap.summary}
                      </>
                    ) : handover.acknowledgedOn ? (
                      `Acknowledged by the successor on ${formatDate(handover.acknowledgedOn)}.`
                    ) : (
                      "All checks met. Waiting for the successor to acknowledge."
                    )}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <HandoverFormDialog
        workspace={workspace}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(handover) => router.push(`/handovers/${handover.id}`)}
      />
    </>
  );
}

export function HandoversView() {
  const workspace = useWorkspace();
  return workspace ? <HandoversContent workspace={workspace} /> : <PageSkeleton />;
}
