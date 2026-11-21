"use client";

import type { ID, ISODate } from "@/domain/models";
import type { WriteReceipt } from "@/lib/repositories";
import type { CommandResult, WorkspaceService } from "@/lib/services/workspace-service";

const BASE = "/api";

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => null)) as T & {
    ok?: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    error?: { message?: string };
    receipt?: WriteReceipt;
  };
  if (!res.ok || payload?.ok === false) {
    return {
      ok: false,
      message: payload?.message ?? payload?.error?.message ?? `Request failed (${res.status}).`,
      fieldErrors: payload?.fieldErrors ?? {},
    } as T;
  }
  return payload as T;
}

function entityApi<T extends { id: ID }>(path: string, onChanged: () => void) {
  const mutate = async <R extends { ok: boolean }>(promise: Promise<R>): Promise<R> => {
    const result = await promise;
    if (result.ok) onChanged();
    return result;
  };
  return {
    create: (input: unknown) => mutate(call<CommandResult<T>>(path, "POST", input)),
    update: (id: ID, patch: unknown) => mutate(call<CommandResult<T>>(`${path}/${id}`, "PATCH", patch)),
    remove: async (id: ID): Promise<WriteReceipt> => {
      const res = await call<{ ok: boolean; receipt: WriteReceipt }>(`${path}/${id}`, "DELETE");
      onChanged();
      return res.receipt;
    },
  };
}

/**
 * WorkspaceService-compatible client that talks to the Levito API routes.
 * Used for both demo and Notion modes — the server picks the repository set.
 */
export function createApiService(onChanged: () => void): WorkspaceService {
  const members = entityApi("/members", onChanged);
  const initiatives = entityApi("/initiatives", onChanged);
  const knowledge = entityApi("/knowledge", onChanged);
  const decisions = entityApi("/decisions", onChanged);
  const actions = entityApi("/actions", onChanged);
  const handovers = entityApi("/handovers", onChanged);

  return {
    target: "notion",
    members,
    initiatives,
    decisions,
    actions,
    knowledge: {
      ...knowledge,
      markReviewed: (id: ID, on: ISODate) => knowledge.update(id, { lastReviewedOn: on }),
    },
    handovers: {
      ...handovers,
      acknowledge: (id: ID, on: ISODate | null) => handovers.update(id, { acknowledgedOn: on }),
    },
    organization: {
      update: (input: unknown) =>
        mutateCommand(call<CommandResult<never>>("/organization", "PATCH", input), onChanged),
    },
    settings: {
      update: (input: unknown) =>
        mutateCommand(call<CommandResult<never>>("/settings", "PATCH", input), onChanged),
    },
  } as unknown as WorkspaceService;
}

async function mutateCommand<R extends { ok: boolean }>(promise: Promise<R>, onChanged: () => void): Promise<R> {
  const result = await promise;
  if (result.ok) onChanged();
  return result;
}
