"use client";

import { CheckList, DateField, Field, FormDialog, ListInput, MemberSelect, OptionSelect } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KNOWLEDGE_KINDS, type ContactDetails, type KnowledgeInput, type KnowledgeItem } from "@/domain/models";
import type { Workspace } from "@/lib/hooks/use-workspace";
import { KNOWLEDGE_KIND_LABELS } from "@/lib/utils/labels";
import { notifySaved } from "@/lib/utils/notify";

const EMPTY_CONTACT: ContactDetails = { organization: "", email: "", phone: "", website: "" };

const EMPTY: KnowledgeInput = {
  title: "",
  kind: "playbook",
  summary: "",
  content: "",
  ownerId: null,
  tags: [],
  lastReviewedOn: null,
  initiativeIds: [],
  contact: null,
};

export function KnowledgeFormDialog({
  workspace,
  open,
  onOpenChange,
  item,
}: {
  workspace: Workspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: KnowledgeItem;
}) {
  const { data, today, service } = workspace;
  return (
    <FormDialog<KnowledgeInput>
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Edit document" : "New document"}
      description="Playbooks, SOPs, lessons, contacts and templates the next committee will rely on."
      initial={item ?? { ...EMPTY, lastReviewedOn: today }}
      submitLabel={item ? "Save changes" : "Add to library"}
      onSubmit={async (values) => {
        const result = item ? await service.knowledge.update(item.id, values) : await service.knowledge.create(values);
        if (result.ok) notifySaved(item ? "Document updated" : "Document added", result.receipt);
        return result;
      }}
    >
      {({ values, errors, set }) => {
        const contact = values.contact ?? EMPTY_CONTACT;
        const setContact = (key: keyof ContactDetails, value: string) => set("contact", { ...contact, [key]: value });
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <Field label="Title" error={errors.title}>
                {(control) => (
                  <Input {...control} autoFocus value={values.title} onChange={(e) => set("title", e.target.value)} />
                )}
              </Field>
              <Field label="Type" error={errors.kind}>
                {(control) => (
                  <OptionSelect
                    {...control}
                    value={values.kind}
                    onChange={(kind) => {
                      set("kind", kind);
                      set("contact", kind === "contact" ? contact : null);
                    }}
                    options={KNOWLEDGE_KINDS.map((k) => ({ value: k, label: KNOWLEDGE_KIND_LABELS[k].label }))}
                  />
                )}
              </Field>
            </div>
            <Field label="Summary" error={errors.summary} hint="One or two sentences shown in lists.">
              {(control) => (
                <Textarea {...control} rows={2} value={values.summary} onChange={(e) => set("summary", e.target.value)} />
              )}
            </Field>
            {values.kind === "contact" && (
              <fieldset className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Contact details</legend>
                <Field label="Organization">
                  {(control) => (
                    <Input {...control} value={contact.organization} onChange={(e) => setContact("organization", e.target.value)} />
                  )}
                </Field>
                <Field label="Email" error={errors.contact}>
                  {(control) => (
                    <Input {...control} type="email" value={contact.email} onChange={(e) => setContact("email", e.target.value)} />
                  )}
                </Field>
                <Field label="Phone">
                  {(control) => (
                    <Input {...control} type="tel" value={contact.phone} onChange={(e) => setContact("phone", e.target.value)} />
                  )}
                </Field>
                <Field label="Website">
                  {(control) => (
                    <Input {...control} value={contact.website} onChange={(e) => setContact("website", e.target.value)} />
                  )}
                </Field>
              </fieldset>
            )}
            <Field
              label={values.kind === "contact" ? "Notes" : "Content"}
              error={errors.content}
              hint={
                values.kind === "contact"
                  ? undefined
                  : "Handover readiness expects at least 200 characters of real documentation."
              }
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={values.kind === "contact" ? 3 : 8}
                  value={values.content}
                  onChange={(e) => set("content", e.target.value)}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner" error={errors.ownerId}>
                {(control) => (
                  <MemberSelect {...control} members={data.members} value={values.ownerId} onChange={(v) => set("ownerId", v)} />
                )}
              </Field>
              <Field label="Last reviewed" error={errors.lastReviewedOn} optional>
                {(control) => (
                  <DateField {...control} value={values.lastReviewedOn} onChange={(v) => set("lastReviewedOn", v)} />
                )}
              </Field>
            </div>
            <Field label="Tags" error={errors.tags} optional hint="Separate tags with commas.">
              {(control) => (
                <ListInput
                  {...control}
                  separator=","
                  value={values.tags}
                  onChange={(v) => set("tags", v)}
                  placeholder="events, finance"
                />
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
        );
      }}
    </FormDialog>
  );
}
