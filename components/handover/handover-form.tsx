"use client";

import { CheckList, DateField, Field, FormDialog, MemberSelect } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import type { Handover, HandoverInput } from "@/domain/models";
import type { Workspace } from "@/lib/hooks/use-workspace";
import { DECISION_STATUS_LABELS, INITIATIVE_STATUS_LABELS, KNOWLEDGE_KIND_LABELS } from "@/lib/utils/labels";
import { notifySaved } from "@/lib/utils/notify";

export function HandoverFormDialog({
  workspace,
  open,
  onOpenChange,
  handover,
  onCreated,
}: {
  workspace: Workspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handover?: Handover;
  onCreated?: (handover: Handover) => void;
}) {
  const { data, service } = workspace;
  const template = data.handovers[0];
  const empty: HandoverInput = {
    title: "",
    outgoingTerm: template?.outgoingTerm ?? "",
    incomingTerm: template?.incomingTerm ?? "",
    outgoingOwnerId: null,
    successorId: null,
    targetDate: null,
    initiativeIds: [],
    knowledgeIds: [],
    decisionIds: [],
    scopeConfirmed: false,
    actionsReviewed: false,
    acknowledgedOn: null,
  };

  return (
    <FormDialog<HandoverInput>
      open={open}
      onOpenChange={onOpenChange}
      title={handover ? "Edit handover" : "New handover"}
      description="One role or responsibility passing from one committee to the next."
      initial={handover ?? empty}
      submitLabel={handover ? "Save changes" : "Create handover"}
      onSubmit={async (values) => {
        const successorChanged = handover !== undefined && handover.successorId !== values.successorId;
        const input = successorChanged ? { ...values, acknowledgedOn: null } : values;
        const result = handover ? await service.handovers.update(handover.id, input) : await service.handovers.create(input);
        if (result.ok) {
          notifySaved(handover ? "Handover updated" : "Handover created", result.receipt);
          if (!handover) onCreated?.(result.record);
        }
        return result;
      }}
    >
      {({ values, errors, set }) => (
        <>
          <Field label="Role or responsibility" error={errors.title}>
            {(control) => (
              <Input
                {...control}
                autoFocus
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Marketing Lead"
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Outgoing term" error={errors.outgoingTerm}>
              {(control) => (
                <Input {...control} value={values.outgoingTerm} onChange={(e) => set("outgoingTerm", e.target.value)} />
              )}
            </Field>
            <Field label="Incoming term" error={errors.incomingTerm}>
              {(control) => (
                <Input {...control} value={values.incomingTerm} onChange={(e) => set("incomingTerm", e.target.value)} />
              )}
            </Field>
            <Field label="Target date" error={errors.targetDate} optional>
              {(control) => <DateField {...control} value={values.targetDate} onChange={(v) => set("targetDate", v)} />}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Outgoing owner" error={errors.outgoingOwnerId}>
              {(control) => (
                <MemberSelect
                  {...control}
                  members={data.members}
                  value={values.outgoingOwnerId}
                  onChange={(v) => set("outgoingOwnerId", v)}
                  emptyLabel="Not recorded"
                />
              )}
            </Field>
            <Field label="Successor" error={errors.successorId}>
              {(control) => (
                <MemberSelect
                  {...control}
                  members={data.members}
                  value={values.successorId}
                  onChange={(v) => set("successorId", v)}
                  emptyLabel="Not yet named"
                />
              )}
            </Field>
          </div>
          <CheckList
            label="Initiatives in scope"
            value={values.initiativeIds}
            onChange={(v) => set("initiativeIds", v)}
            emptyLabel="No initiatives exist yet."
            options={data.initiatives.map((i) => ({
              id: i.id,
              label: i.title,
              hint: INITIATIVE_STATUS_LABELS[i.status].label,
            }))}
          />
          <CheckList
            label="Required documents"
            value={values.knowledgeIds}
            onChange={(v) => set("knowledgeIds", v)}
            emptyLabel="The Knowledge Library is empty."
            options={data.knowledge.map((k) => ({ id: k.id, label: k.title, hint: KNOWLEDGE_KIND_LABELS[k.kind].label }))}
          />
          <CheckList
            label="Decisions to know about"
            value={values.decisionIds}
            onChange={(v) => set("decisionIds", v)}
            emptyLabel="The Decision Log is empty."
            options={data.decisions.map((d) => ({ id: d.id, label: d.title, hint: DECISION_STATUS_LABELS[d.status].label }))}
          />
        </>
      )}
    </FormDialog>
  );
}
