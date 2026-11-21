"use client";

import { useState } from "react";
import { ListChecks, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MemberChip } from "@/components/shared/member-chip";
import { SectionHeading } from "@/components/shared/page-header";
import { Pill } from "@/components/shared/pill";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Action, ActionInput } from "@/domain/models";
import type { Workspace } from "@/lib/hooks/use-workspace";
import { formatDate, formatRelative } from "@/lib/utils/dates";
import { notifyError, notifySaved } from "@/lib/utils/notify";
import { isOverdue } from "@/lib/services/insights";
import { ActionFormDialog } from "./action-form";

function ActionRow({
  workspace,
  action,
  onEdit,
  onDelete,
}: {
  workspace: Workspace;
  action: Action;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data, today, service } = workspace;
  const done = action.status === "done";
  const overdue = isOverdue(action, today);
  const missing = done
    ? []
    : [
        action.assigneeId === null && "No assignee",
        action.dueDate === null && "No due date",
        !action.nextStep.trim() && "No next step",
      ].filter((m): m is string => Boolean(m));

  async function toggle(checked: boolean) {
    const result = await service.actions.update(action.id, { status: checked ? "done" : "open" });
    if (result.ok) notifySaved(checked ? "Action completed" : "Action reopened", result.receipt);
    else notifyError("Could not update the action", result.message);
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Checkbox
        checked={done}
        onCheckedChange={(checked) => toggle(checked === true)}
        aria-label={`Mark "${action.title}" as ${done ? "open" : "done"}`}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>{action.title}</p>
        {action.nextStep.trim() && !done && (
          <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{action.nextStep}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <MemberChip members={data.members} id={action.assigneeId} className="text-xs" />
          {action.dueDate && (
            <span className={cn(overdue && "font-medium text-destructive")} title={formatDate(action.dueDate)}>
              {overdue ? "Overdue · due " : "Due "}
              {formatRelative(action.dueDate, today)}
            </span>
          )}
          {action.status === "in_progress" && <Pill tone="brand">In progress</Pill>}
          {missing.map((label) => (
            <Pill key={label} tone="warning">
              {label}
            </Pill>
          ))}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Options for "${action.title}"`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function ActionsSection({
  workspace,
  actions,
  title = "Actions",
  description,
  defaults,
  emptyDescription,
}: {
  workspace: Workspace;
  actions: Action[];
  title?: string;
  description?: string;
  defaults?: Partial<ActionInput>;
  emptyDescription: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Action | null>(null);
  const [deleting, setDeleting] = useState<Action | null>(null);
  const sorted = [...actions].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
  );

  async function remove(action: Action) {
    try {
      notifySaved("Action deleted", await workspace.service.actions.remove(action.id));
    } catch {
      notifyError("Could not delete the action", "It may already have been removed.");
    }
  }

  return (
    <section>
      <SectionHeading
        title={title}
        description={description}
        action={
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Add action
          </Button>
        }
      />
      {sorted.length === 0 ? (
        <EmptyState icon={ListChecks} title="No actions recorded" description={emptyDescription} className="py-8" />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {sorted.map((action) => (
            <ActionRow
              key={action.id}
              workspace={workspace}
              action={action}
              onEdit={() => setEditing(action)}
              onDelete={() => setDeleting(action)}
            />
          ))}
        </ul>
      )}

      <ActionFormDialog workspace={workspace} open={creating} onOpenChange={setCreating} defaults={defaults} />
      <ActionFormDialog
        workspace={workspace}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        action={editing ?? undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this action?"
        description={`"${deleting?.title ?? ""}" will be removed from this demo session.`}
        confirmLabel="Delete action"
        onConfirm={() => deleting && remove(deleting)}
      />
    </section>
  );
}
