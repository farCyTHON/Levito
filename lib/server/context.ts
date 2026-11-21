import "server-only";
import type { WorkspaceData } from "@/domain/models";
import { toISODate } from "@/lib/utils/dates";
import { createDemoRepositories } from "@/lib/repositories/demo/demo-repositories";
import { DemoStore } from "@/lib/repositories/demo/demo-store";
import { buildDemoSeed } from "@/lib/repositories/demo/seed";
import type { WorkspaceRepositories } from "@/lib/repositories";
import { createNotionClient } from "@/lib/notion/client";
import { readNotionEnv, type NotionEnv } from "@/lib/notion/env";
import { createNotionRepositories, type NotionRepositories } from "@/lib/notion/repositories";
import { createFileStorage } from "./file-storage";

export type AppMode = "demo" | "notion" | "error";

export interface AppContext {
  mode: AppMode;
  repositories: WorkspaceRepositories | null;
  /** Populated when mode === "error". */
  error: string | null;
  /** Server-side "today" used for readiness evaluation. */
  today: string;
}

const DEMO_FILE = process.env.LEVITO_DEMO_FILE ?? ".data/levito-demo.json";

let demoStore: DemoStore | null = null;
let notionRepos: NotionRepositories | null = null;
let contextPromise: Promise<AppContext> | null = null;

function getDemoStore(): DemoStore {
  if (!demoStore) {
    demoStore = new DemoStore({
      seed: buildDemoSeed,
      storage: createFileStorage(DEMO_FILE),
    });
  }
  return demoStore;
}

export function resetDemoStore(): void {
  getDemoStore().reset();
  contextPromise = null;
}

/**
 * Composition root: selects the demo or Notion repository set from server-side
 * environment configuration. A configured-but-broken Notion setup surfaces as
 * `error` — it never silently falls back to demo data.
 */
export async function getAppContext(): Promise<AppContext> {
  if (!contextPromise) contextPromise = buildContext();
  return contextPromise;
}

async function buildContext(): Promise<AppContext> {
  const today = toISODate(new Date());
  const env = readNotionEnv();

  if (!env.apiKey) {
    return {
      mode: "demo",
      repositories: createDemoRepositories(getDemoStore()),
      error: null,
      today,
    };
  }

  try {
    if (!notionRepos) {
      const client = createNotionClient(env);
      notionRepos = await createNotionRepositories({ env, client });
    }
    return { mode: "notion", repositories: notionRepos, error: null, today };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notion connection failed.";
    return { mode: "error", repositories: null, error: message, today };
  }
}

export function notionEnv(): NotionEnv {
  return readNotionEnv();
}

export async function loadWorkspaceData(repos: WorkspaceRepositories): Promise<WorkspaceData> {
  const organization = await repos.organization.get();
  const settings = await repos.settings.get();
  // Sequential on purpose: dataSources.query is limited to ~3 req/s.
  const members = await repos.members.list();
  const initiatives = await repos.initiatives.list();
  const knowledge = await repos.knowledge.list();
  const decisions = await repos.decisions.list();
  const actions = await repos.actions.list();
  const handovers = await repos.handovers.list();
  return { organization, settings, members, initiatives, knowledge, decisions, actions, handovers };
}
