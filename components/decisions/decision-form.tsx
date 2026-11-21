"use client";

import { CheckList, DateField, Field, FormDialog, ListInput, MemberSelect, OptionSelect } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DECISION_STATUSES, type Decision, type DecisionInput } from "@/domain/models";
import type { Workspace } from "@/lib/hooks/use-workspace";
import { DECISION_STATUS_LABELS } from "@/lib/utils/labels";
import { notifySaved } from "@/lib/utils/notify";

export function DecisionFormDialog({
  workspace,
  open,
  onOpenChange,
  decision,
}: {
  workspace: Workspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision?: Decision;
}) {
  const { data, today, service } = workspace;
  const empty: DecisionInput = {
    title: "",
    status: "decided",
    decidedOn: today,
    ownerId: null,
    context: "",
    alternatives: [],
    chosen: "",
    rationale: "",
    outcome: "",
    initiativeIds: [],
  };
  return (
    <FormDialog<DecisionInput>
      open={open}
      onOpenChange={onOpenChange}
      title={decision ? "Edit decision" : "Log a decision"}
      description="Record what was decided and why, so the next committee does not have to rediscover it."
      initial={decision ?? empty}
      submitLabel={decision ? "Save changes" : "Log decision"}
      onSubmit={async (values) => {
        const result = decision
          ? await service.decisions.update(decision.id, values)
          : await service.decisions.create(values);
        if (result.ok) notifySaved(decision ? "Decision updated" : "Decision logged", result.receipt);
        return result;
      }}
    >
      {({ values, errors, set }) => (
        <>
          <Field label="Decision" error={errors.title}>
            {(control) => (
              <Input
                {...control}
                autoFocus
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Move ticketing to the Students' Union platform"
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Status" error={errors.status}>
              {(control) => (
                <OptionSelect
                  {...control}
                  value={values.status}
                  onChange={(v) => set("status", v)}
                  options={DECISION_STATUSES.map((s) => ({ value: s, label: DECISION_STATUS_LABELS[s].label }))}
                />
              )}
            </Field>
            <Field label="Date" error={errors.decidedOn}>
              {(control) => (
                <DateField {...control} value={values.decidedOn} onChange={(v) => set("decidedOn", v ?? "")} />
              )}
            </Field>
            <Field label="Responsible" error={errors.ownerId}>
              {(control) => (
                <MemberSelect {...control} members={data.members} value={values.ownerId} onChange={(v) => set("ownerId", v)} />
              )}
            </Field>
          </div>
          <Field label="Context" error={errors.context} hint="What situation or problem prompted this?">
            {(control) => (
              <Textarea {...control} rows={3} value={values.context} onChange={(e) => set("context", e.target.value)} />
            )}
          </Field>
          <Field label="Alternatives considered" error={errors.alternatives} optional hint="One per line.">
            {(control) => (
              <ListInput {...control} separator={"\n"} value={values.alternatives} onChange={(v) => set("alternatives", v)} />
            )}
          </Field>
          <Field
            label="Chosen option"
            error={errors.chosen}
            optional={values.status === "proposed"}
            hint={values.status === "proposed" ? "Leave empty until the committee decides." : undefined}
          >
            {(control) => <Input {...control} value={values.chosen} onChange={(e) => set("chosen", e.target.value)} />}
          </Field>
          <Field label="Rationale" error={errors.rationale} optional>
            {(control) => (
              <Textarea {...control} rows={2} value={values.rationale} onChange={(e) => set("rationale", e.target.value)} />
            )}
          </Field>
          <Field label="Outcome" error={errors.outcome} optional hint="Leave empty if it is too early to tell. It will show as not yet recorded.">
            {(control) => (
              <Textarea {...control} rows={2} value={values.outcome} onChange={(e) => set("outcome", e.target.value)} />
            )}
          </Field>
          <CheckList
            label="Related initiatives"
            value={values.initiativeIds}
            onChange={(v) => set("initiativeIds", v)}
            emptyLabel="No initiatives exist yet."
            options={data.initiatives.map((i) => ({ id: i.id, label: i.title }))}
          />
        </>
      )}
    </FormDialog>
  );
}

export function OutcomeDialog({
  workspace,
  decision,
  onClose,
}: {
  workspace: Workspace;
  decision: Decision | null;
  onClose: () => void;
}) {
  return (
    <FormDialog<{ outcome: string }>
      open={decision !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Record outcome"
      description={decision ? `What actually happened after "${decision.title}"?` : ""}
      initial={{ outcome: decision?.outcome ?? "" }}
      submitLabel="Save outcome"
      onSubmit={async ({ outcome }) => {
        if (!decision) return { ok: true };
        if (!outcome.trim()) {
          return {
            ok: false,
            message: "Describe the outcome before saving.",
            fieldErrors: { outcome: "An outcome cannot be empty" },
          };
        }
        const result = await workspace.service.decisions.update(decision.id, { outcome });
        if (result.ok) notifySaved("Outcome recorded", result.receipt);
        return result;
      }}
    >
      {({ values, errors, set }) => (
        <Field label="Outcome" error={errors.outcome} hint="Stick to what was observed. It is fine to say it did not work.">
          {(control) => (
            <Textarea
              {...control}
              autoFocus
              rows={4}
              value={values.outcome}
              onChange={(e) => set("outcome", e.target.value)}
            />
          )}
        </Field>
      )}
    </FormDialog>
  );
}
