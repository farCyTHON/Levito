"use client";

import { Database, FlaskConical } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspace } from "@/lib/hooks/use-workspace";

export function DemoBadge() {
  const workspace = useWorkspace();
  const mode = workspace?.mode;

  if (mode === "notion") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label="Connected to Notion — records are read from and written to your Notion workspace"
            className="inline-flex h-6 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 text-[0.6875rem] font-semibold tracking-wider text-emerald-600 dark:text-emerald-400"
          >
            <Database className="size-3" aria-hidden />
            NOTION
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-64 text-pretty">
          Connected to Notion. Reads and writes go to your workspace; receipts confirm each write.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (mode === "error") {
    return (
      <span
        aria-label="Backend error — Notion is configured but unreachable"
        className="inline-flex h-6 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 text-[0.6875rem] font-semibold tracking-wider text-destructive"
      >
        ERROR
      </span>
    );
  }

  if (mode !== "demo") return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Demo mode: sample data stored on the server, never written to Notion"
          className="inline-flex h-6 items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 text-[0.6875rem] font-semibold tracking-wider text-warning focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <FlaskConical className="size-3" aria-hidden />
          DEMO
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-64 text-pretty">
        Sample data for a fictional society, stored on this server&apos;s local demo file. It is never written to
        Notion. Configure NOTION_API_KEY and the data source IDs to connect a real workspace.
      </TooltipContent>
    </Tooltip>
  );
}
