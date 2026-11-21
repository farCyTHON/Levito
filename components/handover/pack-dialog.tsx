"use client";

import { useState } from "react";
import { Check, Copy, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildHandoverPack, packToMarkdown } from "@/domain/handover-pack";
import type { Handover } from "@/domain/models";
import type { ReadinessReport } from "@/domain/readiness";
import type { Workspace } from "@/lib/hooks/use-workspace";
import { formatDate } from "@/lib/utils/dates";
import { notifyError } from "@/lib/utils/notify";
import { toast } from "sonner";

export function PackDialog({
  workspace,
  handover,
  report,
  open,
  onOpenChange,
}: {
  workspace: Workspace;
  handover: Handover;
  report: ReadinessReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const pack = buildHandoverPack(handover, workspace.data, report, workspace.today);

  async function saveToNotion() {
    setSaving(true);
    try {
      const res = await fetch(`/api/handovers/${handover.id}/pack`, { method: "POST" });
      const payload = (await res.json()) as {
        ok?: boolean;
        pack?: { url?: string; title?: string };
        error?: { message?: string };
        message?: string;
      };
      if (!res.ok || payload.ok === false || !payload.pack?.url) {
        notifyError("Could not save pack", payload.error?.message ?? payload.message ?? "Unknown error");
        return;
      }
      toast.success("Handover pack saved to Notion", {
        description: payload.pack.title,
        action: { label: "Open", onClick: () => window.open(payload.pack!.url, "_blank", "noopener") },
      });
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(packToMarkdown(pack));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notifyError("Could not copy", "Your browser blocked clipboard access.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="leading-snug">{pack.title}</DialogTitle>
          <DialogDescription>
            Generated {formatDate(pack.generatedOn)} · readiness policy {pack.policyVersion}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          <p className="flex gap-2.5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-pretty">
            <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              {workspace.mode === "notion"
                ? "This preview is generated from your live Notion records. Use “Save pack to Notion” to write it as a new page — it has not been saved yet."
                : "This is a preview built from the demo records. Nothing has been written to Notion. Every line comes from a stored record; nothing is summarised or invented."}
            </span>
          </p>

          <p className="text-sm">
            <span className="font-medium">Documented readiness: </span>
            {pack.readinessLine}
          </p>

          {pack.sections.map((section) => (
            <section key={section.heading}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {section.heading}
              </h3>
              {section.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{section.emptyNote}</p>
              ) : (
                <ul className="divide-y rounded-lg border bg-card">
                  {section.items.map((item, index) => (
                    <li key={index} className="px-3.5 py-2.5">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.detail && <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{item.detail}</p>}
                      {item.meta && item.meta.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">{item.meta.join(" · ")}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {pack.omissions.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Omissions</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {pack.omissions.map((omission, index) => (
                  <li key={index}>{omission}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <DialogFooter className="m-0 rounded-none px-5 py-3">
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
          {workspace.mode === "notion" && (
            <Button onClick={saveToNotion} disabled={saving}>
              {saving ? "Saving…" : "Save pack to Notion"}
            </Button>
          )}
          <Button onClick={copy} variant={workspace.mode === "notion" ? "outline" : "default"}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy as Markdown"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
