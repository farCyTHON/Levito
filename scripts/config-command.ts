import type { Client } from "@notionhq/client";
import { configStore, discoverManifest, initializeConfig, readLegacyPin, verifyConfigPage } from "../lib/notion/config-store.ts";

// The CLI calls this dispatcher before handing control to database provisioning.
export async function runConfigCommand(client: Client, root: string, env: Record<string, string | undefined>, args: string[],
  provision: (page: string, pin: string) => Promise<void>) {
  const [command, active, previous] = args;
  if (!(args.length === 0 || (args.length === 1 && ["--init-config", "--upgrade-v1", "--preview-recovery"].includes(command)) ||
      (command === "--restore-config" && args.length === 3))) throw new Error("Invalid configuration command.");
  let page = env.NOTION_CONFIG_PAGE_ID;
  let pin = env.NOTION_CONFIG_MANIFEST_BLOCK_ID;
  if (command && !page) throw new Error("Set an explicit NOTION_CONFIG_PAGE_ID.");
  if (!page) {
    if (pin) throw new Error("Pinned manifest without a configuration page.");
    // Fresh installations may create a page only after ruling out an existing one.
    const names: string[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const result = await client.blocks.children.list({ block_id: root, start_cursor: cursor });
      for (const block of result.results) {
        if (!("type" in block)) throw new Error("Cannot inspect partial root child.");
        if (block.type === "child_page" && block.child_page.title === "Levito Configuration") names.push(block.id);
      }
      cursor = result.has_more ? result.next_cursor ?? undefined : undefined;
      if (result.has_more && (!cursor || seen.has(cursor))) throw new Error("Incomplete root listing.");
      if (cursor) seen.add(cursor);
    } while (cursor);
    if (names.length) throw new Error("Existing configuration page: set its explicit ID and migrate before provisioning.");
    const created = await client.pages.create({ parent: { page_id: root },
      properties: { title: { title: [{ text: { content: "Levito Configuration" } }] } } });
    page = created.id;
    pin = await initializeConfig(client, page, root);
  }
  await verifyConfigPage(client, page, root);
  if (command === "--upgrade-v1") {
    if (!pin) throw new Error("Select the exact old manifest pin to upgrade.");
    const payload = await readLegacyPin(client, page, pin);
    pin = await discoverManifest(client, page, pin) ?? await initializeConfig(client, page, root, payload);
  }
  if (command === "--init-config" && !pin) {
    pin = await discoverManifest(client, page) ?? await initializeConfig(client, page, root);
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
