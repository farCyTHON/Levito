"use client";

import { useState } from "react";
import { Pencil, Plus, RotateCcw, UserRound } from "lucide-react";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field, FormDialog, OptionSelect } from "@/components/shared/form";
import { PageHeader } from "@/components/shared/page-header";
import { Pill } from "@/components/shared/pill";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { NotionPanel } from "@/components/settings/notion-panel";
import { THEME_OPTIONS } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Member, MemberInput, Organization } from "@/domain/models";
import { POINTS_PER_CHECK, READINESS_POLICY_VERSION, SUBSTANTIVE_CONTENT_MIN_CHARS } from "@/domain/readiness";
import { useTheme } from "@/lib/hooks/use-theme";
import { useWorkspace, type Workspace } from "@/lib/hooks/use-workspace";
import { notifyError, notifySaved } from "@/lib/utils/notify";
import { toast } from "sonner";

const REVIEW_WINDOWS = [
  { value: "90", label: "90 days (termly)" },
  { value: "180", label: "180 days (twice a year)" },
  { value: "365", label: "365 days (yearly)" },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t py-8 first:border-t-0 first:pt-0 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function MemberFormDialog({
  workspace,
  open,
  onOpenChange,
  member,
}: {
  workspace: Workspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: Member;
}) {
  const { service } = workspace;
  return (
    <FormDialog<MemberInput>
      open={open}
      onOpenChange={onOpenChange}
      title={member ? "Edit member" : "Add member"}
      description="Members can own initiatives and documents, be assigned actions, and be named in handovers."
      initial={member ?? { name: "", role: "", department: "", email: "", active: true }}
      submitLabel={member ? "Save changes" : "Add member"}
      onSubmit={async (values) => {
        const result = member ? await service.members.update(member.id, values) : await service.members.create(values);
        if (result.ok) notifySaved(member ? "Member updated" : "Member added", result.receipt);
        return result;
      }}
    >
      {({ values, errors, set }) => (
        <>
          <Field label="Name" error={errors.name}>
            {(control) => (
              <Input {...control} autoFocus value={values.name} onChange={(e) => set("name", e.target.value)} />
            )}
          </Field>
          <Field label="Committee role" error={errors.role}>
            {(control) => (
              <Input
                {...control}
                value={values.role}
                onChange={(e) => set("role", e.target.value)}
                placeholder="Secretary"
              />
            )}
          </Field>
          <Field label="Department" error={errors.department} optional>
            {(control) => (
              <Input
                {...control}
                value={values.department ?? ""}
                onChange={(e) => set("department", e.target.value)}
                placeholder="e.g. Events, Finance"
              />
            )}
          </Field>
          <Field label="Email" error={errors.email} optional>
            {(control) => (
              <Input {...control} type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
            )}
          </Field>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox checked={values.active} onCheckedChange={(checked) => set("active", checked === true)} />
            Active committee member
          </label>
        </>
      )}
    </FormDialog>
  );
}

function OrganizationForm({ workspace }: { workspace: Workspace }) {
  const stored = workspace.data.organization;
  const [values, setValues] = useState<Organization>(stored);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = (Object.keys(stored) as Array<keyof Organization>).some((key) => stored[key] !== values[key]);
  const set = (key: keyof Organization, value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const result = await workspace.service.organization.update(values);
    if (!result.ok) return setErrors(result.fieldErrors);
    setErrors({});
    setValues(result.record);
    notifySaved("Organization updated", result.receipt);
  }

  return (
    <form onSubmit={save} noValidate className="grid max-w-xl gap-4">
      <Field label="Organization name" error={errors.name}>
        {(control) => <Input {...control} value={values.name} onChange={(e) => set("name", e.target.value)} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Short name" error={errors.shortName}>
          {(control) => <Input {...control} value={values.shortName} onChange={(e) => set("shortName", e.target.value)} />}
        </Field>
        <Field label="Current term" error={errors.term}>
          {(control) => <Input {...control} value={values.term} onChange={(e) => set("term", e.target.value)} />}
        </Field>
      </div>
      <Field label="University" error={errors.university}>
        {(control) => <Input {...control} value={values.university} onChange={(e) => set("university", e.target.value)} />}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={!dirty}>
          Save organization
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setValues(stored);
              setErrors({});
            }}
          >
            Discard
          </Button>
        )}
      </div>
    </form>
  );
}

function SettingsContent({ workspace }: { workspace: Workspace }) {
  const { data, service, resetDemo } = workspace;
  const { theme, setTheme } = useTheme();
  const [resetting, setResetting] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const windowValue = String(data.settings.reviewWindowDays);
  const windowOptions = REVIEW_WINDOWS.some((o) => o.value === windowValue)
    ? REVIEW_WINDOWS
    : [...REVIEW_WINDOWS, { value: windowValue, label: `${windowValue} days` }];

  async function setReviewWindow(value: string) {
    const result = await service.settings.update({ reviewWindowDays: Number(value) });
    if (result.ok) notifySaved("Review window updated", result.receipt);
    else notifyError("Could not update the review window", Object.values(result.fieldErrors)[0]);
  }

  return (
    <>
      <PageHeader title="Settings" description="Data source, organization details, readiness policy and appearance." />

      <Section
        title="Data source"
        description="Where Levito reads and writes records. Notion is the source of truth when connected; otherwise the app runs on clearly labelled demo data."
      >
        {workspace.mode === "demo" && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setResetting(true)}>
              <RotateCcw aria-hidden />
              Reset demo data
            </Button>
            <p className="text-xs text-muted-foreground">Restores the original sample records.</p>
          </div>
        )}
        <NotionPanel />
      </Section>

      <Section title="Organization" description="Shown in the sidebar and on generated handover packs.">
        <OrganizationForm key={JSON.stringify(data.organization)} workspace={workspace} />
      </Section>

      <Section
        title="Readiness policy"
        description="How handover readiness is scored. The rules are fixed and visible so a score can always be explained."
      >
        <div className="max-w-xl space-y-4">
          <div className="grid gap-1.5">
            <p id="review-window-label" className="text-xs font-medium text-muted-foreground">
              Document review window
            </p>
            <OptionSelect
              aria-label="Document review window"
              value={windowValue}
              onChange={setReviewWindow}
              options={windowOptions}
              className="w-64"
            />
            <p className="text-xs text-muted-foreground">
              A linked document older than this counts as stale in every handover.
            </p>
          </div>
          <ol className="divide-y rounded-lg border bg-card text-sm">
            {[
              ["Documented owners", "The outgoing owner is recorded and every in-scope initiative has an owner."],
              ["Named successor", "An incoming owner is recorded."],
              [
                "Playbooks and SOPs",
                `At least one playbook or SOP is linked, and each linked document has ${SUBSTANTIVE_CONTENT_MIN_CHARS}+ characters.`,
              ],
              ["Review dates", "Every linked document has a review date inside the review window."],
              ["Open actions", "Every unfinished action has an assignee, a due date and a next step."],
            ].map(([label, rule]) => (
              <li key={label} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{label}</p>
                  <p className="text-muted-foreground">{rule}</p>
                </div>
                <span className="tabular shrink-0 text-xs text-muted-foreground">{POINTS_PER_CHECK} pts</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-pretty text-muted-foreground">
            A check that cannot be assessed scores zero and marks the handover as not fully assessed, rather than
            passing or failing it. Policy version {READINESS_POLICY_VERSION}.
          </p>
        </div>
      </Section>

      <Section title="Members" description="Committee members, past and incoming. Deactivate people who have left rather than removing their history.">
        <div className="mb-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setAddingMember(true)}>
            <Plus aria-hidden />
            Add member
          </Button>
        </div>
        {data.members.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No members"
            description="Add committee members so work and documents can be assigned to them."
            className="py-8"
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {data.members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", !member.active && "text-muted-foreground")}>
                    {member.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.role}
                    {member.email && ` · ${member.email}`}
                  </p>
                </div>
                {!member.active && <Pill>Inactive</Pill>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${member.name}`}
                  onClick={() => setEditingMember(member)}
                >
                  <Pencil aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Appearance" description="Levito is designed dark-first. Your choice is remembered on this device.">
        <div role="radiogroup" aria-label="Theme" className="inline-flex gap-1 rounded-lg border bg-card p-1">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                theme === value ? "bg-secondary font-medium text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <MemberFormDialog workspace={workspace} open={addingMember} onOpenChange={setAddingMember} />
      <MemberFormDialog
        workspace={workspace}
        open={editingMember !== null}
        onOpenChange={(open) => !open && setEditingMember(null)}
        member={editingMember ?? undefined}
      />
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Reset demo data?"
        description="Everything you have added or changed in this demo session will be discarded and the original sample records restored."
        confirmLabel="Reset demo"
        onConfirm={() => {
          resetDemo();
          toast.success("Demo data reset", { description: "The original sample records have been restored." });
        }}
      />
    </>
  );
}

export function SettingsView() {
  const workspace = useWorkspace();
  return workspace ? <SettingsContent workspace={workspace} /> : <PageSkeleton />;
}
