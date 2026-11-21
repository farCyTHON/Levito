"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, CircleOff, RefreshCw, Wrench } from "lucide-react";
import { Pill } from "@/components/shared/pill";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyError, notifySaved } from "@/lib/utils/notify";
import { toast } from "sonner";

interface SourceStatus {
  entity: string;
  databaseTitle: string;
  envVar: string;
  configured: boolean;
  dataSourceId: string | null;
  reachable: boolean | null;
  title: string | null;
  propertyCount: number | null;
  mappingUsable: boolean | null;
  missingRequired: string[];
  error: string | null;
}

interface ConnectionPayload {
  ok: boolean;
  mode: string;
  status: {
    credentialsPresent: boolean;
    fullyConfigured: boolean;
    missingConfig: Array<{ key: string; description: string }>;
    apiVersion: string;
    workspace: { ok: boolean; botName: string | null; error: string | null };
    configPage: { configured: boolean; reachable: boolean | null; error: string | null };
    sources: SourceStatus[];
  };
}

interface ResolvedField {
  field: string;
  kind: string;
  required: boolean;
  specProperty: string;
  propertyId: string | null;
  propertyName: string | null;
  propertyType: string | null;
  status: "ok" | "missing" | "type_mismatch" | "relation_target_mismatch";
  writable: boolean;
  missingOptions?: string[];
}

interface EntityMapping {
  entity: string;
  databaseTitle: string;
  dataSourceId: string | null;
  usable: boolean;
  missingRequired: string[];
  fields: ResolvedField[];
  discoveryError?: string;
  properties?: Array<{ id: string; name: string; type: string }>;
}

interface MappingPayload {
  ok: boolean;
  overrides: Record<string, Record<string, string>>;
  entities: EntityMapping[];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  return (await res.json()) as T;
}

function StatusPill({ source }: { source: SourceStatus }) {
  if (!source.configured) return <Pill>Not configured</Pill>;
  if (source.reachable === false) return <Pill tone="danger">Unreachable</Pill>;
  if (source.mappingUsable === false) return <Pill tone="warning">Mapping incomplete</Pill>;
  if (source.reachable === true) return <Pill tone="success" dot>Connected</Pill>;
  return <Pill>Unknown</Pill>;
}

function MappingEditor({ entity, onSaved }: { entity: EntityMapping; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [repairing, setRepairing] = useState<string[] | null>(null);

  const dirty = Object.keys(draft).length > 0;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/notion/mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: { [entity.entity]: draft } }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: { message?: string }; message?: string };
      if (!res.ok || payload.ok === false) {
        notifyError("Could not save mapping", payload.error?.message ?? payload.message);
        return;
      }
      notifySaved("Field mapping saved", { target: "notion", confirmed: true, at: new Date().toISOString() });
      setDraft({});
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function repair(fields: string[]) {
    setRepairing(fields);
    try {
      const res = await fetch("/api/notion/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: entity.entity, fields }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        added?: string[];
        skipped?: Array<{ field: string; reason: string }>;
        error?: { message?: string };
        message?: string;
      };
      if (!res.ok || payload.ok === false) {
        notifyError("Repair failed", payload.error?.message ?? payload.message);
        return;
      }
      const added = payload.added ?? [];
      const skipped = payload.skipped ?? [];
      toast.success(`Added ${added.length} propert${added.length === 1 ? "y" : "ies"} to ${entity.databaseTitle}`, {
        description: skipped.length ? skipped.map((s) => `${s.field}: ${s.reason}`).join("; ") : undefined,
      });
      onSaved();
    } finally {
      setRepairing(null);
    }
  }

  const missingScalar = entity.fields.filter(
    (f) => f.status === "missing" && f.kind !== "relation" && f.kind !== "title",
  );

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Levito field</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Notion property</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Map to…</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entity.fields.map((field) => (
            <tr key={field.field}>
              <td className="px-3 py-2">
                <span className="font-medium">{field.field}</span>
                {field.required && <span className="ml-1 text-destructive" aria-label="required">*</span>}
                <span className="block text-xs text-muted-foreground">expects “{field.specProperty}”</span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{field.kind}</td>
              <td className="px-3 py-2">
                {field.propertyName ? (
                  <span>
                    {field.propertyName}
                    <span className="block text-xs text-muted-foreground">{field.propertyType}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                {field.status === "ok" ? (
                  <Pill tone="success" dot>ok</Pill>
                ) : field.status === "missing" ? (
                  <Pill tone="warning">missing</Pill>
                ) : field.status === "type_mismatch" ? (
                  <Pill tone="danger">type mismatch</Pill>
                ) : (
                  <Pill tone="danger">wrong relation target</Pill>
                )}
              </td>
              <td className="px-3 py-2">
                <Select
                  value={draft[field.field] ?? ""}
                  onValueChange={(value) =>
                    setDraft((d) => {
                      const next = { ...d };
                      if (value === "__auto__" || value === "") delete next[field.field];
                      else next[field.field] = value;
                      return next;
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-56 text-xs" aria-label={`Map ${field.field}`}>
                    <SelectValue placeholder="Auto (by name)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">Auto (by name)</SelectItem>
                    {(entity.properties ?? [])
                      .filter((p) => p.type !== "formula" && p.type !== "rollup")
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} <span className="text-muted-foreground">({p.type})</span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
        <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : "Save mapping"}
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setDraft({})}>
            Discard
          </Button>
        )}
        {missingScalar.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={repairing !== null}
            onClick={() => {
              const fields = missingScalar.map((f) => f.field);
              void repair(fields);
            }}
          >
            <Wrench aria-hidden />
            {repairing ? "Repairing…" : `Add ${missingScalar.length} missing propert${missingScalar.length === 1 ? "y" : "ies"}`}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Repair only adds missing scalar properties — it never changes or deletes existing ones. Relation fields are
          provisioned by <code>npm run notion:setup</code>.
        </p>
      </div>
    </div>
  );
}

export function NotionPanel() {
  const [connection, setConnection] = useState<ConnectionPayload | null>(null);
  const [mapping, setMapping] = useState<MappingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [conn, map] = await Promise.all([
        getJson<ConnectionPayload>("/api/notion/connection"),
        getJson<MappingPayload>("/api/notion/mapping").catch(() => null),
      ]);
      setConnection(conn);
      setMapping(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  if (loading && !connection) {
    return <Skeleton className="h-48 w-full" />;
  }

  const status = connection?.status;
  const sources = status?.sources ?? [];
  const mappingByEntity = new Map((mapping?.entities ?? []).map((e) => [e.entity, e]));

  return (
    <div className="space-y-4">
      {status && (
        <div className="rounded-lg border bg-card px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {status.workspace.ok ? (
              <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
            ) : (
              <CircleOff className="size-4 text-muted-foreground" aria-hidden />
            )}
            <span className="font-medium">
              {status.workspace.ok ? `Connected as ${status.workspace.botName ?? "integration"}` : "Not reachable"}
            </span>
            <Pill>API {status.apiVersion}</Pill>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void load()}>
              <RefreshCw aria-hidden />
              Recheck
            </Button>
          </div>
          {status.workspace.error && (
            <p className="mt-1.5 text-xs text-destructive">{status.workspace.error}</p>
          )}
          {status.missingConfig.length > 0 && (
            <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <p className="font-medium text-warning">Missing configuration</p>
              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                {status.missingConfig.map((m) => (
                  <li key={m.key}>
                    <code>{m.key}</code> — {m.description}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-muted-foreground">
                Run <code>npm run notion:setup</code> to provision the databases and write the IDs to{" "}
                <code>.env.local</code>, then restart the dev server.
              </p>
            </div>
          )}
          {status.configPage.configured && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Config page:{" "}
              {status.configPage.reachable ? "reachable" : (status.configPage.error ?? "not checked")}
            </p>
          )}
        </div>
      )}

      {!status?.credentialsPresent && (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          <CircleAlert className="mx-auto mb-2 size-5" aria-hidden />
          No <code>NOTION_API_KEY</code> configured — Levito is running on demo data. Add credentials to{" "}
          <code>.env.local</code> and run <code>npm run notion:setup</code>.
        </div>
      )}

      {sources.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {sources.map((source) => {
            const mappingEntity = mappingByEntity.get(source.entity);
            const open = expanded === source.entity;
            return (
              <li key={source.entity}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  onClick={() => setExpanded(open ? null : source.entity)}
                  aria-expanded={open}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{source.databaseTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {source.configured
                        ? `${source.envVar} · ${source.title ?? source.dataSourceId} · ${source.propertyCount ?? "?"} properties`
                        : `${source.envVar} not set`}
                      {source.missingRequired.length > 0 &&
                        ` · missing: ${source.missingRequired.join(", ")}`}
                    </p>
                  </div>
                  <StatusPill source={source} />
                </button>
                {open && mappingEntity && (
                  <div className="border-t px-4 py-3">
                    {mappingEntity.discoveryError && (
                      <p className="mb-2 text-xs text-destructive">{mappingEntity.discoveryError}</p>
                    )}
                    <MappingEditor entity={mappingEntity} onSaved={() => void load()} />
                  </div>
                )}
                {open && !mappingEntity && (
                  <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                    Schema discovery unavailable — check the connection above.
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
