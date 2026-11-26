import { afterEach, expect, it, vi } from "vitest";
import { createApiService } from "@/lib/client/api-service";
import { refreshWorkspace } from "@/lib/hooks/use-workspace";

afterEach(() => vi.unstubAllGlobals());

it("waits for a new post-write workspace read even when an older read is pending", async () => {
  const old = Promise.withResolvers<Response>();
  const fresh = Promise.withResolvers<Response>();
  const fetch = vi.fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(Response.json({ok:true, receipt:{target:"notion",confirmed:true}}))
    .mockReturnValueOnce(fresh.promise);
  vi.stubGlobal("fetch",fetch);
  const previousRead = refreshWorkspace();
  const service = createApiService(() => refreshWorkspace(true));
  const write = service.knowledge.update("sop",{content:"a".repeat(200)});
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/workspace","/api/knowledge/sop","/api/workspace"]);
  fresh.resolve(Response.json({ok:true,data:{},mode:"notion"}));
  expect(await write).toMatchObject({ok:true});
  old.resolve(Response.json({ok:false},{status:502}));
  await previousRead;
});

it("does not report success or refresh readiness on a rejected Notion write", async () => {
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({ok:false,error:{message:"Write rejected"}},{status:502})));
  const refreshed = vi.fn();
  const result = await createApiService(refreshed).handovers.update("handover",{successorId:"incoming"});
  expect(result).toMatchObject({ok:false,message:"Write rejected"});
  expect(refreshed).not.toHaveBeenCalled();
});
