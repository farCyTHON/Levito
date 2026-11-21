import { apiError, json } from "@/lib/server/api";
import { getAppContext, resetDemoStore } from "@/lib/server/context";

export async function POST() {
  const ctx = await getAppContext();
  if (ctx.mode !== "demo") {
    return apiError(
      "not_demo",
      ctx.mode === "notion"
        ? "The app is connected to Notion. Demo reset only applies to demo data."
        : "Backend unavailable.",
      409,
    );
  }
  resetDemoStore();
  return json({ ok: true, receipt: { target: "demo-session", confirmed: true, at: new Date().toISOString() } });
}
