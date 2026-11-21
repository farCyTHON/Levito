import "server-only";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { StorageLike } from "@/lib/repositories/demo/demo-store";

/**
 * File-backed StorageLike for the demo repository store. Demo writes persist
 * to a local JSON file on the server — clearly labelled demo data, never
 * synced to Notion.
 */
export function createFileStorage(path: string): StorageLike & { clear(): void } {
  return {
    getItem(key) {
      try {
        if (!existsSync(path)) return null;
        const all = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
        return all[key] ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        mkdirSync(dirname(path), { recursive: true });
        let all: Record<string, string> = {};
        if (existsSync(path)) {
          try {
            all = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
          } catch {
            all = {};
          }
        }
        all[key] = value;
        writeFileSync(path, JSON.stringify(all), "utf8");
      } catch {
        // Demo persistence is best-effort; never break a request over it.
      }
    },
    removeItem(key) {
      try {
        if (!existsSync(path)) return;
        const all = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
        delete all[key];
        writeFileSync(path, JSON.stringify(all), "utf8");
      } catch {}
    },
    clear() {
      try {
        rmSync(path, { force: true });
      } catch {}
    },
  };
}
