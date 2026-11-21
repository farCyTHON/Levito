"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { cn } from "cn";
import { Pill } from "@/components/shared/pill";
import type { CheckState, ReadinessCheck, ReadinessReport } from "@/domain/readiness";
import { CHECK_STATE_LABELS, READINESS_STATUS_LABELS, refHref } from "@/lib/utils/labels";

const STATE_ICON = { pass: CircleCheck, fail: CircleX, unknown: CircleDashed } as const;
const STATE_TEXT: Record<CheckState, string> = {
  pass: "text-success",
  fail: "text-destructive",
  unknown: "text-warning",
};
const STATE_FILL: Record<CheckState, string> = {
  pass: "bg-success",
  fail: "bg-destructive",
  unknown: "border border-dashed border-warning/70 bg-warning/15",
};
const RING_TEXT = { ready: "text-success", gaps: "text-foreground", incomplete: "text-warning" } as const;

export function StateIcon({ state, className }: { state: CheckState; className?: string }) {
  const Icon = STATE_ICON[state];
  return <Icon aria-hidden className={cn("size-4 shrink-0", STATE_TEXT[state], className)} />;
}

export function ReadinessPill({ report }: { report: ReadinessReport }) {
  const { label, tone } = READINESS_STATUS_LABELS[report.status];
  return (
    <Pill tone={tone} dot>
      {label}
    </Pill>
  );
}

export function ReadinessRing({
  score,
  maxScore = 100,
  status,
  size = 88,
  label,
}: {
  score: number | null;
  maxScore?: number;
  status: ReadinessReport["status"];
  size?: number;
  label: string;
}) {
  const stroke = size >= 80 ? 6 : 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = score === null ? 0 : Math.max(0, Math.min(1, score / maxScore));
  return (
    <div
      role="img"
      aria-label={score === null ? `${label}: no score` : `${label}: ${score} of ${maxScore} points`}
      className={cn("relative shrink-0", RING_TEXT[status])}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground">
        <span className={cn("tabular leading-none font-semibold", size >= 80 ? "text-2xl" : "text-sm")}>
          {score ?? "–"}
        </span>
        {size >= 80 && <span className="mt-0.5 text-[0.65rem] text-muted-foreground">of {maxScore}</span>}
      </div>
    </div>
  );
}

export function ReadinessSegments({ report, className }: { report: ReadinessReport; className?: string }) {
  return (
    <div
      role="img"
      aria-label={report.checks.map((c) => `${c.label}: ${CHECK_STATE_LABELS[c.state].label}`).join(", ")}
      className={cn("flex gap-0.5", className)}
    >
      {report.checks.map((check) => (
        <span
          key={check.id}
          title={`${check.label}: ${CHECK_STATE_LABELS[check.state].label}`}
          className={cn("h-1.5 w-5 rounded-full", STATE_FILL[check.state])}
        />
      ))}
    </div>
  );
}

function CheckRow({ check, open, onToggle }: { check: ReadinessCheck; open: boolean; onToggle: () => void }) {
  const panelId = useId();
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
      >
        <StateIcon state={check.state} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{check.label}</span>
            <Pill tone={CHECK_STATE_LABELS[check.state].tone}>{CHECK_STATE_LABELS[check.state].label}</Pill>
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{check.summary}</span>
        </span>
        <span className="tabular shrink-0 pt-0.5 text-xs text-muted-foreground">
          {check.points}/{check.maxPoints}
        </span>
        <ChevronRight
          aria-hidden
          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <div id={panelId} className="space-y-3 pr-4 pb-4 pl-11">
          <p className="text-xs text-muted-foreground">{check.question}</p>
          <ul className="space-y-1.5">
            {check.evidence.map((evidence, index) => {
              const href = evidence.ref ? refHref(evidence.ref) : null;
              return (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <StateIcon state={evidence.state} className="mt-0.5 size-3.5" />
                  <span className="min-w-0">
                    {href ? (
                      <Link href={href} className="font-medium underline-offset-4 hover:underline">
                        {evidence.label}
                      </Link>
                    ) : (
                      <span className="font-medium">{evidence.label}</span>
                    )}
                    <span className="text-muted-foreground"> — {evidence.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {check.remediation && (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
              <span className="font-medium">Next step: </span>
              {check.remediation}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function ReadinessChecklist({ report }: { report: ReadinessReport }) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  return (
    <ul className="divide-y">
      {report.checks.map((check) => {
        const open = toggled[check.id] ?? check.state !== "pass";
        return (
          <CheckRow
            key={check.id}
            check={check}
            open={open}
            onToggle={() => setToggled((current) => ({ ...current, [check.id]: !open }))}
          />
        );
      })}
    </ul>
  );
}
