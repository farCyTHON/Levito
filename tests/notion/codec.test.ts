import { describe, expect, it } from "vitest";
import type { InitiativeInput, KnowledgeInput, KnowledgeItem } from "@/domain/models";
import { decodePageFlat, encodeProperties, flattenInput, unflattenRecord } from "@/lib/notion/codec";
import { resolveEntityMapping } from "@/lib/notion/mapping";
import { specFor } from "@/lib/notion/specs";
import type { DiscoveredDataSource } from "@/lib/notion/discovery";

const DS = "a".repeat(32);

function mappingFor(entity: Parameters<typeof specFor>[0]) {
  const spec = specFor(entity);
  const discovered: DiscoveredDataSource = {
    id: DS,
    title: spec.databaseTitle,
    properties: spec.fields.map((f, i) => ({
      id: `p${i}`,
      name: f.property,
      type: f.kind,
      options: f.options?.map((name, j) => ({ id: `o${j}`, name })),
      relationDataSourceId: f.kind === "relation" ? "b".repeat(32) : undefined,
    })),
  };
  return resolveEntityMapping(entity, DS, discovered, {}, { dataSourceIds: { [entity]: DS } });
}

const initiative: InitiativeInput = {
  title: "Founder's Week",
  type: "event",
  status: "active",
  summary: "Welcome week for new members",
  ownerId: "page-member-1",
  startDate: "2026-03-01",
  endDate: "2026-03-07",
  recurrence: "",
};

describe("codec round-trip", () => {
  it("encodes and decodes an initiative", () => {
    const mapping = mappingFor("initiatives");
    const flat = flattenInput("initiatives", initiative);
    const props = encodeProperties("initiatives", flat, mapping.fields);

    // Simulate the Notion page property response shape keyed by property id.
    const withPlain = (items: unknown) =>
      (items as Array<{ text?: { content?: string } }>).map((i) => ({
        plain_text: i.text?.content ?? "",
        text: i.text,
      }));
    const properties: Record<string, unknown> = {};
    for (const field of mapping.fields) {
      const value = props[field.propertyId!];
      const v = value as Record<string, unknown>;
      const kind = field.kind;
      if (kind === "title") properties[field.propertyId!] = { id: field.propertyId, type: "title", title: withPlain(v.title) };
      else if (kind === "rich_text") properties[field.propertyId!] = { id: field.propertyId, type: "rich_text", rich_text: withPlain(v.rich_text) };
      else if (kind === "select") properties[field.propertyId!] = { id: field.propertyId, type: "select", select: v.select };
      else if (kind === "date") properties[field.propertyId!] = { id: field.propertyId, type: "date", date: v.date };
      else if (kind === "relation") properties[field.propertyId!] = { id: field.propertyId, type: "relation", relation: (v.relation as Array<{ id: string }>).map((r) => ({ id: r.id })) };
      else if (kind === "checkbox") properties[field.propertyId!] = { id: field.propertyId, type: "checkbox", checkbox: v.checkbox };
      else properties[field.propertyId!] = { id: field.propertyId, type: kind, [kind]: v[kind] };
    }

    const decoded = decodePageFlat({ id: "pg1", properties }, mapping.fields);
    const { required, names } = {
      required: new Set(mapping.fields.filter((f) => f.required && f.status === "ok").map((f) => f.field)),
      names: new Map(mapping.fields.map((f) => [f.field, f.propertyName ?? f.field])),
    };
    const record = unflattenRecord("initiatives", decoded, required, names, {
      id: "pg1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }) as InitiativeInput & { id: string };

    expect(record.title).toBe("Founder's Week");
    expect(record.type).toBe("event");
    expect(record.ownerId).toBe("page-member-1");
    expect(record.startDate).toBe("2026-03-01");
  });

  it("chunks rich_text beyond the 2000-char limit", () => {
    const mapping = mappingFor("knowledge");
    const long = "x".repeat(4500);
    const input: KnowledgeInput = {
      title: "Big doc",
      kind: "sop",
      summary: "",
      content: long,
      ownerId: null,
      tags: [],
      lastReviewedOn: null,
      initiativeIds: [],
      contact: null,
    };
    const flat = flattenInput("knowledge", input);
    const props = encodeProperties("knowledge", flat, mapping.fields) as Record<string, { rich_text: unknown[] }>;
    const contentField = mapping.fields.find((f) => f.field === "content")!;
    const chunks = props[contentField.propertyId!]!.rich_text;
    expect(chunks.length).toBe(3);
    expect(chunks.every((c) => (c as { text: { content: string } }).text.content.length <= 2000)).toBe(true);
  });

  it("flattens and restores contact details and alternatives", () => {
    const input: KnowledgeInput = {
      title: "Venue contact",
      kind: "contact",
      summary: "",
      content: "",
      ownerId: null,
      tags: ["venue"],
      lastReviewedOn: null,
      initiativeIds: [],
      contact: { organization: "Town Hall", email: "a@b.c", phone: "123", website: "https://x" },
    };
    const flat = flattenInput("knowledge", input);
    expect(flat.contactOrganization).toBe("Town Hall");

    const decoded = unflattenRecord(
      "knowledge",
      {
        title: "Venue contact",
        kind: "contact",
        contactOrganization: "Town Hall",
        contactEmail: "a@b.c",
        contactPhone: "123",
        contactWebsite: "https://x",
        tags: ["venue"],
      },
      new Set(["title", "kind"]),
      new Map(),
      { id: "k1", createdAt: "", updatedAt: "" },
    ) as KnowledgeItem & { contact: unknown };
    expect(decoded.contact).toEqual({ organization: "Town Hall", email: "a@b.c", phone: "123", website: "https://x" });
  });
});
