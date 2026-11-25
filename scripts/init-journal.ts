import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import type { Provenance } from "../lib/notion/config-store.ts";

const intent = z.strictObject({
  attempt: z.uuid(),
  provenance: z.strictObject({ manifestId: z.uuid(), revision: z.uuid(), digest: z.string().regex(/^[0-9a-f]{64}$/) }).nullable(),
});
const receipt = z.strictObject({ attempt: z.uuid(), pin: z.uuid() });

// Both files are create-only. Even an empty/torn file is a stop condition.
export function initJournal(directory: string | undefined, page: string) {
  if (!directory || !isAbsolute(directory)) throw new Error("Set LEVITO_INIT_STATE_DIR to an existing absolute, persistent directory.");
  const dir = realpathSync(directory);
  const key = page.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(key)) throw new Error("Invalid configuration page ID.");
  const prefix = join(dir, `levito-init-${key}`);
  function create(suffix: string, value: unknown) {
    const fd = openSync(prefix + suffix, "wx", 0o600);
    try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
    if (process.platform !== "win32") {
      const parent = openSync(dir, "r");
      try { fsyncSync(parent); } finally { closeSync(parent); }
    }
  }
  function read<T>(suffix: string, schema: z.ZodType<T>): T | null {
    let contents: string;
    try { contents = readFileSync(prefix + suffix, "utf8"); } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
    return schema.parse(JSON.parse(contents));
  }
  return {
    state() {
      const pending = read(".intent", intent);
      const done = read(".verified", receipt);
      if (done && done.attempt !== pending?.attempt) throw new Error("Inconsistent initialization journal; stop and restore the installation state.");
      return pending && { ...pending, pin: done?.pin };
    },
    begin(provenance?: Provenance) {
      const attempt = randomUUID();
      create(".intent", intent.parse({ attempt, provenance: provenance ?? null }));
      return attempt;
    },
    confirm(attempt: string, pin: string) {
      create(".verified", receipt.parse({ attempt, pin }));
    },
  };
}
