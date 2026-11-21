import { apiError, json } from "@/lib/server/api";
import { getAppContext } from "@/lib/server/context";
import { getNotionConnectionStatus } from "@/lib/notion/status";
import { readNotionEnv } from "@/lib/notion/env";

export async function GET() {
  const ctx = await getAppContext();
  try {
    const status = await getNotionConnectionStatus(readNotionEnv());
    return json({ ok: true, mode: ctx.mode, status });
  } catch (error) {
    return apiError("status_failed", error instanceof Error ? error.message : "Status check failed.", 502);
  }
}
