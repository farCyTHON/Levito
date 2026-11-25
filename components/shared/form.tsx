"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ID, Member } from "@/domain/models";
import { notifyError } from "@/lib/utils/notify";
import type { FieldErrors } from "@/lib/services/workspace-service";

type SubmitResult = { ok: true } | { ok: false; message: string; fieldErrors: FieldErrors };

export interface FormApi<T> {
  values: T;
  errors: FieldErrors;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
}

export function FormDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  initial,
  submitLabel,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initial: T;
  submitLabel: string;
  onSubmit: (values: T) => Promise<SubmitResult>;
  children: (form: FormApi<T>) => React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-1 grid-rows-[minmax(0,1fr)] gap-0 p-0 sm:max-w-lg">
        <FormBody
          title={title}
          description={description}
          initial={initial}
          submitLabel={submitLabel}
          onSubmit={onSubmit}
          onDone={() => onOpenChange(false)}
        >
          {children}
        </FormBody>
      </DialogContent>
    </Dialog>
  );
}

function FormBody<T>({
  title,
  description,
  initial,
  submitLabel,
  onSubmit,
  onDone,
  children,
}: {
  title: string;
  description: string;
  initial: T;
  submitLabel: string;
  onSubmit: (values: T) => Promise<SubmitResult>;
  onDone: () => void;
  children: (form: FormApi<T>) => React.ReactNode;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const form: FormApi<T> = {
    values,
    errors,
    set: (key, value) => {
      setValues((current) => ({ ...current, [key]: value }));
      if (errors[key as string]) {
        setErrors((current) => {
          const next = { ...current };
          delete next[key as string];
          return next;
        });
      }
    },
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await onSubmit(values);
      if (result.ok) return onDone();
      setErrors(result.fieldErrors);
      setMessage(result.message);
    } catch (error) {
      setMessage("This could not be saved. Your input is still here, so you can try again.");
      notifyError("Save failed", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 min-w-0 flex-col">
      <DialogHeader className="shrink-0 border-b px-5 py-4">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="@container grid min-h-0 grid-cols-1 gap-4 overflow-y-auto px-5 py-4">
        {children(form)}
        {message && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </p>
        )}
      </div>
      <DialogFooter className="m-0 shrink-0 rounded-none px-5 py-3">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Field({
  label,
  error,
  hint,
  optional,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("grid min-w-0 grid-cols-1 content-start gap-1.5 wrap-anywhere", className)}>
      <Label htmlFor={id} className="flex-wrap text-xs font-medium text-muted-foreground">
        {label}
        {optional && <span className="font-normal text-muted-foreground/70">Optional</span>}
      </Label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type ControlProps = { id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string; "aria-required"?: boolean };

export function OptionSelect<T extends string>({
  value,
  onChange,
  options,
  className,
  size,
  "aria-label": ariaLabel,
  ...control
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  className?: string;
  size?: "sm" | "default";
  "aria-label"?: string;
} & ControlProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger size={size} aria-label={ariaLabel} className={cn("w-full min-w-0 max-w-full *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate", className)} {...control}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-w-(--radix-select-content-available-width) wrap-anywhere">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const NONE = "__none__";

export function MemberSelect({
  members,
  value,
  onChange,
  emptyLabel = "Unassigned",
  ...rest
}: {
  members: Member[];
  value: ID | null;
  onChange: (value: ID | null) => void;
  emptyLabel?: string;
  className?: string;
  size?: "sm" | "default";
  "aria-label"?: string;
} & ControlProps) {
  const options = [
    { value: NONE, label: emptyLabel },
    ...members
      .filter((m) => m.active || m.id === value)
      .map((m) => ({ value: m.id, label: `${m.name} · ${m.role}` })),
  ];
  return (
    <OptionSelect
      value={value !== null && options.some((o) => o.value === value) ? value : NONE}
      onChange={(next) => onChange(next === NONE ? null : next)}
      options={options}
      {...rest}
    />
  );
}

export function NullableSelect({
  value,
  onChange,
  options,
  emptyLabel,
  ...rest
}: {
  value: ID | null;
  onChange: (value: ID | null) => void;
  options: Array<{ value: ID; label: string }>;
  emptyLabel: string;
} & ControlProps) {
  return (
    <OptionSelect
      value={value ?? NONE}
      onChange={(next) => onChange(next === NONE ? null : next)}
      options={[{ value: NONE, label: emptyLabel }, ...options]}
      {...rest}
    />
  );
}

export function DateField({
  value,
  onChange,
  ...control
}: { value: string | null; onChange: (value: string | null) => void } & ControlProps) {
  return <Input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} {...control} />;
}

export function ListInput({
  value,
  onChange,
  separator,
  placeholder,
  ...control
}: {
  value: string[];
  onChange: (value: string[]) => void;
  separator: "," | "\n";
  placeholder?: string;
} & ControlProps) {
  const [text, setText] = useState(value.join(separator === "," ? ", " : "\n"));
  const update = (next: string) => {
    setText(next);
    onChange(
      next
        .split(separator)
        .map((part) => part.trim())
        .filter(Boolean),
    );
  };
  return separator === "," ? (
    <Input value={text} onChange={(e) => update(e.target.value)} placeholder={placeholder} {...control} />
  ) : (
    <Textarea rows={3} value={text} onChange={(e) => update(e.target.value)} placeholder={placeholder} {...control} />
  );
}

export function CheckList({
  label,
  options,
  value,
  onChange,
  emptyLabel,
}: {
  label: string;
  options: Array<{ id: ID; label: string; hint?: string }>;
  value: ID[];
  onChange: (value: ID[]) => void;
  emptyLabel: string;
}) {
  const groupId = useId();
  return (
    <fieldset className="grid min-w-0 grid-cols-1 gap-1.5">
      <legend className="mb-1.5 flex w-full items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        <span className="tabular font-normal">{value.length} selected</span>
      </legend>
      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-lg border p-1">
          {options.map((option) => {
            const id = `${groupId}-${option.id}`;
            const checked = value.includes(option.id);
            return (
              <label
                key={option.id}
                htmlFor={id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={(next) =>
                    onChange(next === true ? [...value, option.id] : value.filter((v) => v !== option.id))
                  }
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.hint && <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span>}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
