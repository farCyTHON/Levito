import "server-only";
import type { ID } from "@/domain/models";
import { RecordNotFoundError, type WorkspaceRepositories } from "@/lib/repositories";
import { createWorkspaceService, type CommandResult, type WorkspaceService } from "@/lib/services/workspace-service";
import { toNotionError } from "@/lib/notion/errors";
import { getAppContext, type AppContext } from "./context";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function apiError(code: string, message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ ok: false, error: { code, message }, ...extra }, { status });
}

/** Resolves the app context or returns an error Response for error/demo-mismatch cases. */
export async function requireContext(opts: { allowDemo?: boolean; requireNotion?: boolean } = {}): Promise<
  { ctx: AppContext; repos: WorkspaceRepositories; service: WorkspaceService } | { response: Response }
> {
  const ctx = await getAppContext();
  if (ctx.mode === "error" || !ctx.repositories) {
    return { response: apiError("backend_unavailable", ctx.error ?? "Data backend unavailable.", 503) };
  }
  if (opts.requireNotion && ctx.mode !== "notion") {
    return {
      response: apiError(
        "notion_required",
        ctx.mode === "demo"
          ? "This action requires a Notion connection. The app is currently running on demo data."
          : "Notion connection unavailable.",
        409,
      ),
    };
  }
  return { ctx, repos: ctx.repositories, service: createWorkspaceService(ctx.repositories) };
}

function commandResponse<T>(result: CommandResult<T>): Response {
  if (result.ok) return json({ ok: true, record: result.record, receipt: result.receipt });
  const status = result.message.includes("no longer exists") ? 404 : 400;
  return json({ ok: false, message: result.message, fieldErrors: result.fieldErrors }, status);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function mapError(error: unknown): Response {
  const ne = toNotionError(error);
  const status =
    ne.code === "rate_limited" ? 429 : ne.code === "invalid_credentials" ? 502 : ne.code === "access_denied" ? 502 : ne.code === "validation_error" ? 422 : ne.code === "incomplete_results" ? 502 : 502;
  return apiError(ne.code, ne.message, status, ne.retryAfterMs ? { retryAfterMs: ne.retryAfterMs } : {});
}

type EntityKey = "members" | "initiatives" | "knowledge" | "decisions" | "actions" | "handovers";

const ENTITY_LABELS: Record<EntityKey, string> = {
  members: "member",
  initiatives: "initiative",
  knowledge: "document",
  decisions: "decision",
  actions: "action",
  handovers: "handover",
};

export function collectionGet(entity: EntityKey) {
  return async () => {
    const resolved = await requireContext();
    if ("response" in resolved) return resolved.response;
    try {
      const records = await resolved.repos[entity].list();
      return json({ ok: true, records });
    } catch (error) {
      return mapError(error);
    }
  };
}

export function collectionPost(entity: EntityKey) {
  return async (request: Request) => {
    const resolved = await requireContext();
    if ("response" in resolved) return resolved.response;
    const body = await readJson(request);
    const commands = resolved.service[entity] as unknown as {
      create(input: unknown): Promise<CommandResult<unknown>>;
    };
    try {
      return commandResponse(await commands.create(body));
    } catch (error) {
      return mapError(error);
    }
  };
}

export function itemGet(entity: EntityKey) {
  return async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const resolved = await requireContext();
    if ("response" in resolved) return resolved.response;
    const { id } = await ctx.params;
    try {
      const record = await resolved.repos[entity].get(id as ID);
      if (!record) return apiError("not_found", `No ${ENTITY_LABELS[entity]} with id "${id}".`, 404);
      return json({ ok: true, record });
    } catch (error) {
      return mapError(error);
    }
  };
}

export function itemPatch(entity: EntityKey) {
  return async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const resolved = await requireContext();
    if ("response" in resolved) return resolved.response;
    const { id } = await ctx.params;
    const body = await readJson(request);
    const commands = resolved.service[entity] as unknown as {
      update(id: ID, patch: Record<string, unknown>): Promise<CommandResult<unknown>>;
    };
    try {
      return commandResponse(await commands.update(id as ID, (body ?? {}) as Record<string, unknown>));
    } catch (error) {
      return mapError(error);
    }
  };
}

export function itemDelete(entity: EntityKey) {
  return async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const resolved = await requireContext();
    if ("response" in resolved) return resolved.response;
    const { id } = await ctx.params;
    try {
      const receipt = await resolved.repos[entity].remove(id as ID);
      return json({ ok: true, receipt });
    } catch (error) {
      if (error instanceof RecordNotFoundError) {
        return apiError("not_found", error.message, 404);
      }
      return mapError(error);
    }
  };
}

export type { EntityKey };
