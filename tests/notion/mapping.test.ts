import { describe, expect, it } from "vitest";
import type { DiscoveredDataSource } from "@/lib/notion/discovery";
import { isOverrideKeyValid, resolveEntityMapping } from "@/lib/notion/mapping";
import { specFor } from "@/lib/notion/specs";

const DS = {
  members: "m".repeat(32),
  initiatives: "i".repeat(32),
  knowledge: "k".repeat(32),
  decisions: "d".repeat(32),
  actions: "a".repeat(32),
  handovers: "h".repeat(32),
};

function discoveredFor(entity: Parameters<typeof specFor>[0], overrides: Record<string, { type: string; id?: string }> = {}): DiscoveredDataSource {
  const spec = specFor(entity);
  const properties = spec.fields.map((f, idx) => {
    const o = overrides[f.property] ?? {};
    return {
      id: o.id ?? `prop-${idx.toString().padStart(2, "0")}`,
      name: f.property,
      type: o.type ?? f.kind,
      options: f.options?.map((name, i) => ({ id: `opt-${i}`, name })),
      relationDataSourceId: f.kind === "relation" ? DS[f.relationEntity!] : undefined,
    };
  });
  return { id: DS[entity], title: spec.databaseTitle, properties };
}

describe("resolveEntityMapping", () => {
  it("maps every field when the schema matches the spec", () => {
    const m = resolveEntityMapping("initiatives", DS.initiatives, discoveredFor("initiatives"), {}, { dataSourceIds: DS });
    expect(m.usable).toBe(true);
    expect(m.missingRequired).toEqual([]);
    expect(m.fields.find((f) => f.field === "status")?.status).toBe("ok");
    expect(m.fields.find((f) => f.field === "ownerId")?.relationDataSourceId?.replace(/-/g, "")).toBe(DS.members);
  });

  it("reports missing required fields", () => {
    const ds = discoveredFor("initiatives");
    ds.properties = ds.properties.filter((p) => p.name !== "Status");
    const m = resolveEntityMapping("initiatives", DS.initiatives, ds, {}, { dataSourceIds: DS });
    expect(m.usable).toBe(false);
    expect(m.missingRequired).toContain("status");
  });

  it("flags type mismatches instead of silently mapping", () => {
    const ds = discoveredFor("initiatives", { Status: { type: "rich_text" } });
    const m = resolveEntityMapping("initiatives", DS.initiatives, ds, {}, { dataSourceIds: DS });
    const status = m.fields.find((f) => f.field === "status")!;
    expect(status.status).toBe("type_mismatch");
    expect(m.missingRequired).toContain("status");
  });

  it("flags relation properties pointing at the wrong data source", () => {
    const ds = discoveredFor("initiatives");
    const owner = ds.properties.find((p) => p.name === "Owner")!;
    owner.relationDataSourceId = DS.knowledge;
    const m = resolveEntityMapping("initiatives", DS.initiatives, ds, {}, { dataSourceIds: DS });
    expect(m.fields.find((f) => f.field === "ownerId")?.status).toBe("relation_target_mismatch");
  });

  it("honours overrides by property id and rejects invalid keys", () => {
    const ds = discoveredFor("members");
    const role = ds.properties.find((p) => p.name === "Role")!;
    const m = resolveEntityMapping("members", DS.members, ds, { members: { role: role.id } }, { dataSourceIds: DS });
    expect(m.fields.find((f) => f.field === "role")?.propertyId).toBe(role.id);
    expect(isOverrideKeyValid("members", "role")).toBe(true);
    expect(isOverrideKeyValid("members", "nope")).toBe(false);
  });

  it("matches renamed properties only via overrides", () => {
    const ds = discoveredFor("members");
    ds.properties.find((p) => p.name === "Role")!.name = "Portfolio role";
    const auto = resolveEntityMapping("members", DS.members, ds, {}, { dataSourceIds: DS });
    expect(auto.fields.find((f) => f.field === "role")?.status).toBe("missing");
    const prop = ds.properties.find((p) => p.name === "Portfolio role")!;
    const overridden = resolveEntityMapping(
      "members",
      DS.members,
      ds,
      { members: { role: prop.id } },
      { dataSourceIds: DS },
    );
    expect(overridden.fields.find((f) => f.field === "role")?.status).toBe("ok");
  });
});
