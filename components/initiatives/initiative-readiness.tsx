"use client";

import { useState } from "react";
import { FileDown, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Initiative } from "@/domain/models";
import { evaluateInitiativeReadiness } from "@/domain/initiative-readiness";
import type { Workspace } from "@/lib/hooks/use-workspace";
import { notifyError } from "@/lib/utils/notify";
import { toast } from "sonner";

const STATE_STYLE: Record<string, string> = {
  pass: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  fail: "text-destructive",
  unknown: "text-muted-foreground",
};

export function InitiativeReadinessCard({ workspace, initiative }: { workspace: Workspace; initiative: Initiative }) {
  const [saving, setSaving] = useState(false);
  const readiness = evaluateInitiativeReadiness(initiative, workspace.data, {
    asOf: workspace.today,
    reviewWindowDays: workspace.data.settings.reviewWindowDays,
  });

  async function generatePack() {
    setSaving(true);
    try {
      const res = await fetch(`/api/initiatives/${initiative.id}/pack`, { method: "POST" });
      const payload = (await res.json()) as {
        ok?: boolean;
        demo?: boolean;
        pack?: { url?: string | null; title?: string; markdown?: string };
        error?: { message?: string };
        message?: string;
      };
      if (!res.ok || payload.ok === false) {
        notifyError("Could not generate pack", payload.error?.message ?? payload.message);
        return;
      }
      if (payload.demo) {
        await navigator.clipboard.writeText(payload.pack?.markdown ?? "").catch(() => undefined);
        toast.success("Pack preview generated (demo)", {
          description: "Markdown copied to clipboard — demo mode cannot write to Notion.",
        });
        return;
      }
      toast.success("Handover pack saved to Notion", {
        description: payload.pack?.title,
        action: payload.pack?.url
          ? { label: "Open", onClick: () => window.open(payload.pack!.url!, "_blank", "noopener") }
          : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Handover readiness</h3>
          <p className="text-xs text-muted-foreground">
            {readiness.ready
              ? "Ready to hand over — all criteria documented."
              : readiness.incomplete
                ? "Assessment incomplete — some criteria could not be verified."
                : "Gaps must be closed before handover."}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular">{readiness.score}</p>
          <p className="text-xs text-muted-foreground">/ 100</p>
        </div>
        <Button size="sm" variant="outline" onClick={generatePack} disabled={saving}>
          <FileDown aria-hidden />
          {saving ? "Generating…" : "Generate pack"}
        </Button>
      </div>
      <Progress value={readiness.score} className="mt-3" aria-label={`Readiness score ${readiness.score} of 100`} />
      <ul className="mt-3 divide-y text-sm">
        {readiness.criteria.map((c) => (
          <li key={c.id} className="flex items-start gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {c.label} <span className="text-xs font-normal text-muted-foreground">({c.weight}%)</span>
              </p>
              <p className="text-xs text-pretty text-muted-foreground">{c.summary}</p>
              {c.missing.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {c.missing.map((m, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className={`shrink-0 text-xs font-medium tabular ${STATE_STYLE[c.state]}`}>
              {c.points}/{c.weight}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
