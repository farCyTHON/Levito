import { json } from "@/lib/server/api";
import { getAppContext } from "@/lib/server/context";
import { getNotionConnectionStatus } from "@/lib/notion/status";
import { readNotionEnv } from "@/lib/notion/env";

export async function GET() {
  const ctx = await getAppContext();
  const notion = await getNotionConnectionStatus(readNotionEnv());
  return json({
    ok: true,
    mode: ctx.mode,
    error: ctx.error,
    notion,
  });
}
