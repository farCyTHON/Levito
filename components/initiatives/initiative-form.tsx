"use client";

import { DateField, Field, FormDialog, MemberSelect, OptionSelect } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INITIATIVE_STATUSES, INITIATIVE_TYPES, type Initiative, type InitiativeInput } from "@/domain/models";
import type { Workspace } from "@/lib/hooks/use-workspace";
import { INITIATIVE_STATUS_LABELS, INITIATIVE_TYPE_LABELS } from "@/lib/utils/labels";
import { notifySaved } from "@/lib/utils/notify";

const EMPTY: InitiativeInput = {
  title: "",
  type: "event",
  status: "planned",
  summary: "",
  ownerId: null,
  startDate: null,
  endDate: null,
  recurrence: "",
};

export function InitiativeFormDialog({
  workspace,
  open,
  onOpenChange,
  initiative,
  onCreated,
}: {
  workspace: Workspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initiative?: Initiative;
  onCreated?: (initiative: Initiative) => void;
}) {
  const { data, service } = workspace;
  return (
    <FormDialog<InitiativeInput>
      open={open}
      onOpenChange={onOpenChange}
      title={initiative ? "Edit initiative" : "New initiative"}
      description="Events, campaigns, projects and recurring activities the organization runs."
      initial={initiative ?? EMPTY}
      submitLabel={initiative ? "Save changes" : "Create initiative"}
      onSubmit={async (values) => {
        const result = initiative
          ? await service.initiatives.update(initiative.id, values)
          : await service.initiatives.create(values);
        if (result.ok) {
          notifySaved(initiative ? "Initiative updated" : "Initiative created", result.receipt);
          if (!initiative) onCreated?.(result.record);
        }
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
                placeholder="Spring Careers Fair"
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" error={errors.type}>
              {(control) => (
                <OptionSelect
                  {...control}
                  value={values.type}
                  onChange={(v) => set("type", v)}
                  options={INITIATIVE_TYPES.map((t) => ({ value: t, label: INITIATIVE_TYPE_LABELS[t] }))}
                />
              )}
            </Field>
            <Field label="Status" error={errors.status}>
              {(control) => (
                <OptionSelect
                  {...control}
                  value={values.status}
                  onChange={(v) => set("status", v)}
                  options={INITIATIVE_STATUSES.map((s) => ({ value: s, label: INITIATIVE_STATUS_LABELS[s].label }))}
                />
              )}
            </Field>
          </div>
          <Field label="Owner" error={errors.ownerId} hint="The person a successor would ask about this.">
            {(control) => (
              <MemberSelect
                {...control}
                members={data.members}
                value={values.ownerId}
                onChange={(v) => set("ownerId", v)}
                emptyLabel="No owner yet"
              />
            )}
          </Field>
          <Field label="Summary" error={errors.summary} optional>
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={values.summary}
                onChange={(e) => set("summary", e.target.value)}
                placeholder="What it is, who it is for, and why it matters."
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" error={errors.startDate} optional>
              {(control) => <DateField {...control} value={values.startDate} onChange={(v) => set("startDate", v)} />}
            </Field>
            <Field label="End date" error={errors.endDate} optional>
              {(control) => <DateField {...control} value={values.endDate} onChange={(v) => set("endDate", v)} />}
            </Field>
          </div>
          <Field label="Recurrence" error={errors.recurrence} optional hint="Descriptive only, for example: Every September.">
            {(control) => (
              <Input {...control} value={values.recurrence} onChange={(e) => set("recurrence", e.target.value)} />
            )}
          </Field>
        </>
      )}
    </FormDialog>
  );
}
