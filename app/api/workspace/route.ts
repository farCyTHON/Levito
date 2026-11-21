import { getAppContext, loadWorkspaceData } from "@/lib/server/context";
import { apiError, json } from "@/lib/server/api";

export async function GET() {
  const ctx = await getAppContext();
  if (ctx.mode === "error" || !ctx.repositories) {
    return apiError("backend_unavailable", ctx.error ?? "Data backend unavailable.", 503, { mode: ctx.mode });
  }
  try {
    const data = await loadWorkspaceData(ctx.repositories);
    return json({
      ok: true,
      mode: ctx.mode,
      today: ctx.today,
      fetchedAt: new Date().toISOString(),
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load workspace data.";
    return apiError("load_failed", message, 502, { mode: ctx.mode });
  }
}
