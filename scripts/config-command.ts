import type { Client } from "@notionhq/client";
import { configStore, discoverManifest, initializeConfig, listedChildren, readLegacyPin, verifyConfigPage, verifyGenesis } from "../lib/notion/config-store.ts";
import { initJournal } from "./init-journal.ts";

export async function listRootDatabases(client: Client, root: string) {
  const databases: {id: string; title: string}[] = [];
  for await (const b of listedChildren(client, root)) {
    if (!("type" in b)) throw new Error("Cannot inspect partial root child.");
    if (b.type === "child_database") databases.push({id: b.id, title: b.child_database.title});
  }
  return databases;
}

// The CLI calls this dispatcher before handing control to database provisioning.
export async function runConfigCommand(client: Client, root: string, env: Record<string, string | undefined>, args: string[],
  provision: (page: string, pin: string) => Promise<void>) {
  const [command, active, previous] = args;
  if (!(args.length === 0 || (args.length === 1 && ["--init-config", "--upgrade-v1", "--preview-recovery"].includes(command)) ||
      (command === "--resolve-init" && args.length === 2) ||
      (command === "--restore-config" && args.length === 3))) throw new Error("Invalid configuration command.");
  const page = env.NOTION_CONFIG_PAGE_ID;
  let pin = env.NOTION_CONFIG_MANIFEST_BLOCK_ID;
  if (!page) throw new Error("Manually create or select a configuration page and set NOTION_CONFIG_PAGE_ID.");
  await verifyConfigPage(client, page, root);
  const journal = initJournal(env.LEVITO_INIT_STATE_DIR, page);
  const state = journal.state();
  if (command === "--resolve-init") {
    if (!state || state.pin) throw new Error("No indeterminate initialization on this page.");
    const record = await verifyGenesis(client, page, active, state.provenance);
    if (record.initializationId !== state.attempt) {
      throw new Error("Selected manifest does not match the quarantined attempt.");
    }
    await configStore(client, page, active, root).get();
    const canonicalPin = active.replaceAll("-", "").toLowerCase().replace(
      /^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
    journal.confirm(state.attempt, canonicalPin);
    return `NOTION_CONFIG_MANIFEST_BLOCK_ID=${canonicalPin}`;
  }
  if (state && !state.pin) throw new Error("Initialization indeterminate: do not retry. Resolve the exact manifest with --resolve-init or use a fresh page.");
  if (command === "--upgrade-v1" || (command === "--init-config" && !pin)) {
    if (command === "--upgrade-v1" && !pin) throw new Error("Select the exact old manifest pin to upgrade.");
    const legacy = command === "--upgrade-v1" ? await readLegacyPin(client, page, pin!) : undefined;
    const found = await discoverManifest(client, page, legacy ? pin : undefined);
    if (state?.pin && state.pin !== found) throw new Error("Discovery differs from the durable initialization receipt. Select a verified manifest explicitly.");
    if (found) {
      if (legacy) await verifyGenesis(client, page, found, legacy.provenance);
      pin = found;
    } else {
      const attempt = journal.begin(legacy?.provenance);
      pin = await initializeConfig(client, page, root, attempt, legacy?.payload, legacy?.provenance);
      await verifyGenesis(client, page, pin, legacy?.provenance ?? null);
      journal.confirm(attempt, pin);
    }
  }
  if (!pin) throw new Error("Existing page without manifest pin: migrate before provisioning.");
  const store = configStore(client, page, pin, root);
  if (command === "--preview-recovery") {
    const checked = await store.previewRecovery();
    return `Verified previous revision ${checked.previous.number}: ${JSON.stringify(checked.payload)}\nTo restore: --restore-config ${checked.active.revision} ${checked.previous.revision}`;
  }
  if (command === "--restore-config") {
    await store.restore(active, previous);
    return "Previous configuration restored as a verified new revision.";
  }
  await store.get();
  if (command === "--init-config" || command === "--upgrade-v1") return `NOTION_CONFIG_MANIFEST_BLOCK_ID=${pin}`;
  await provision(page, pin);
}
