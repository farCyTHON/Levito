import { apiError, json, requireContext } from "@/lib/server/api";
import { toNotionError } from "@/lib/notion/errors";

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function GET() {
  const resolved = await requireContext();
  if ("response" in resolved) return resolved.response;
  try {
    return json({ ok: true, record: await resolved.repos.settings.get() });
  } catch (error) {
    const ne = toNotionError(error);
    return apiError(ne.code, ne.message, 502);
  }
}

export async function PATCH(request: Request) {
  const resolved = await requireContext();
  if ("response" in resolved) return resolved.response;
  const result = await resolved.service.settings.update(await readJson(request));
  if (result.ok) return json({ ok: true, record: result.record, receipt: result.receipt });
  return json({ ok: false, message: result.message, fieldErrors: result.fieldErrors }, 400);
}
