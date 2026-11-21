"use client";

import { DateField, Field, FormDialog, MemberSelect, NullableSelect, OptionSelect } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ACTION_STATUSES, type Action, type ActionInput } from "@/domain/models";
import type { Workspace } from "@/lib/hooks/use-workspace";
import { ACTION_STATUS_LABELS } from "@/lib/utils/labels";
import { notifySaved } from "@/lib/utils/notify";

const EMPTY: ActionInput = {
  title: "",
  status: "open",
  assigneeId: null,
  dueDate: null,
  nextStep: "",
  initiativeId: null,
  handoverId: null,
};

export function ActionFormDialog({
  workspace,
  open,
  onOpenChange,
  action,
  defaults,
}: {
  workspace: Workspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: Action;
  defaults?: Partial<ActionInput>;
}) {
  const { data, service } = workspace;
  return (
    <FormDialog<ActionInput>
      open={open}
      onOpenChange={onOpenChange}
      title={action ? "Edit action" : "Add action"}
      description="Unfinished work a successor can pick up needs an assignee, a due date and a next step."
      initial={action ?? { ...EMPTY, ...defaults }}
      submitLabel={action ? "Save changes" : "Add action"}
      onSubmit={async (values) => {
        const result = action ? await service.actions.update(action.id, values) : await service.actions.create(values);
        if (result.ok) notifySaved(action ? "Action updated" : "Action added", result.receipt);
        return result;
      }}
    >
      {({ values, errors, set }) => (
        <>
          <Field label="Title" error={errors.title}>
            {(control) => (
              <Input
                {...control}
                autoFocus
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Confirm the keynote speaker"
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Assignee" error={errors.assigneeId}>
              {(control) => (
                <MemberSelect
                  {...control}
                  members={data.members}
                  value={values.assigneeId}
                  onChange={(v) => set("assigneeId", v)}
                />
              )}
            </Field>
            <Field label="Due date" error={errors.dueDate}>
              {(control) => <DateField {...control} value={values.dueDate} onChange={(v) => set("dueDate", v)} />}
            </Field>
          </div>
          <Field label="Next step" error={errors.nextStep} hint="The very next thing someone would do to move this forward.">
            {(control) => (
              <Textarea {...control} rows={2} value={values.nextStep} onChange={(e) => set("nextStep", e.target.value)} />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Status" error={errors.status}>
              {(control) => (
                <OptionSelect
                  {...control}
                  value={values.status}
                  onChange={(v) => set("status", v)}
                  options={ACTION_STATUSES.map((s) => ({ value: s, label: ACTION_STATUS_LABELS[s].label }))}
                />
              )}
            </Field>
            <Field label="Initiative" error={errors.initiativeId}>
              {(control) => (
                <NullableSelect
                  {...control}
                  value={values.initiativeId}
                  onChange={(v) => set("initiativeId", v)}
                  emptyLabel="None"
                  options={data.initiatives.map((i) => ({ value: i.id, label: i.title }))}
                />
              )}
            </Field>
            <Field label="Handover" error={errors.handoverId}>
              {(control) => (
                <NullableSelect
                  {...control}
                  value={values.handoverId}
                  onChange={(v) => set("handoverId", v)}
                  emptyLabel="None"
                  options={data.handovers.map((h) => ({ value: h.id, label: h.title }))}
                />
              )}
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}
