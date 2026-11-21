"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ISODate, WorkspaceData } from "@/domain/models";
import { createApiService } from "@/lib/client/api-service";
import type { WorkspaceService } from "@/lib/services/workspace-service";

export type WorkspaceMode = "demo" | "notion" | "error" | "loading";

export interface WorkspaceSnapshot {
  data: WorkspaceData;
  today: ISODate;
  mode: Exclude<WorkspaceMode, "loading">;
  fetchedAt: string;
}

interface WorkspaceState {
  snapshot: WorkspaceSnapshot | null;
  error: string | null;
  listeners: Set<() => void>;
  loaded: boolean;
}

const state: WorkspaceState = { snapshot: null, error: null, listeners: new Set(), loaded: false };
let inflight: Promise<void> | null = null;

function emit() {
  for (const listener of state.listeners) listener();
}

export async function refreshWorkspace(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        mode?: WorkspaceSnapshot["mode"];
        today?: ISODate;
        fetchedAt?: string;
        data?: WorkspaceData;
        error?: { message?: string };
        message?: string;
      } | null;
      if (!res.ok || !payload?.ok || !payload.data) {
        state.error = payload?.error?.message ?? payload?.message ?? `Workspace request failed (${res.status}).`;
        state.snapshot = null;
      } else {
        state.error = null;
        state.snapshot = {
          data: payload.data,
          today: payload.today ?? new Date().toISOString().slice(0, 10),
          mode: payload.mode ?? "demo",
          fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
        };
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Could not reach the Levito API.";
      state.snapshot = null;
    } finally {
      state.loaded = true;
      inflight = null;
      emit();
    }
  })();
  return inflight;
}

function subscribe(listener: () => void): () => void {
  state.listeners.add(listener);
  if (!state.loaded && !inflight) void refreshWorkspace();
  return () => state.listeners.delete(listener);
}

const getSnapshot = () => state.snapshot;
const getError = () => state.error;
const getLoaded = () => state.loaded;

const service = createApiService(() => void refreshWorkspace());

export interface Workspace {
  data: WorkspaceData;
  today: ISODate;
  mode: Exclude<WorkspaceMode, "loading">;
  service: WorkspaceService;
  refresh: () => Promise<void>;
  resetDemo: () => Promise<void>;
}

export function useWorkspace(): Workspace | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return useMemo(
    () =>
      snapshot
        ? {
            data: snapshot.data,
            today: snapshot.today,
            mode: snapshot.mode,
            service,
            refresh: refreshWorkspace,
            resetDemo: async () => {
              await fetch("/api/demo/reset", { method: "POST" });
              await refreshWorkspace();
            },
          }
        : null,
    [snapshot],
  );
}

/** Non-null only after the first load attempt finished with an error. */
export function useWorkspaceError(): string | null {
  return useSyncExternalStore(subscribe, getError, () => null);
}

export function useWorkspaceLoaded(): boolean {
  return useSyncExternalStore(subscribe, getLoaded, () => false);
}
