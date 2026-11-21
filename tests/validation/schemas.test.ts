import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatRelative, isISODate } from "@/lib/utils/dates";
import { buildDemoSeed } from "@/lib/repositories/demo/seed";
import {
  actionInputSchema,
  decisionInputSchema,
  handoverInputSchema,
  initiativeInputSchema,
  knowledgeInputSchema,
  memberInputSchema,
  toFieldErrors,
} from "@/lib/validation/schemas";

describe("schemas", () => {
  it("accepts every record in the demo seed", () => {
    const seed = buildDemoSeed("2026-11-21");
    const cases = [
      [memberInputSchema, seed.members],
      [initiativeInputSchema, seed.initiatives],
      [knowledgeInputSchema, seed.knowledge],
      [decisionInputSchema, seed.decisions],
      [actionInputSchema, seed.actions],
      [handoverInputSchema, seed.handovers],
    ] as const;
    for (const [schema, records] of cases) {
      for (const record of records) {
        const result = schema.safeParse(record);
        expect(result.success, `${record.id}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
      }
    }
  });

  it("strips entity metadata and normalises tags and references", () => {
    const seed = buildDemoSeed("2026-11-21");
    const parsed = knowledgeInputSchema.parse({
      ...seed.knowledge[0],
      tags: [" Events ", "events", "Flagship"],
      initiativeIds: ["i-founders", "i-founders"],
    });
    expect(parsed).not.toHaveProperty("id");
    expect(parsed.tags).toEqual(["events", "flagship"]);
    expect(parsed.initiativeIds).toEqual(["i-founders"]);
  });

  it("requires contact details on contact records", () => {
    const seed = buildDemoSeed("2026-11-21");
    const result = knowledgeInputSchema.safeParse({ ...seed.knowledge[0], kind: "contact", contact: null });
    expect(result.success).toBe(false);
    if (!result.success) expect(toFieldErrors(result.error)).toHaveProperty("contact");
  });

  it("rejects impossible dates and malformed emails", () => {
    const seed = buildDemoSeed("2026-11-21");
    expect(actionInputSchema.safeParse({ ...seed.actions[0], dueDate: "2027-02-30" }).success).toBe(false);
    expect(memberInputSchema.safeParse({ ...seed.members[0], email: "not-an-email" }).success).toBe(false);
    expect(memberInputSchema.safeParse({ ...seed.members[0], email: "" }).success).toBe(true);
  });

  it("blocks acknowledgement without a successor", () => {
    const seed = buildDemoSeed("2026-11-21");
    const sponsorship = seed.handovers.find((h) => h.id === "h-sponsorship")!;
    const result = handoverInputSchema.safeParse({ ...sponsorship, acknowledgedOn: "2026-11-21" });
    expect(result.success).toBe(false);
  });
});

describe("dates", () => {
  it("does calendar arithmetic across month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(daysBetween("2026-11-21", "2026-12-01")).toBe(10);
    expect(isISODate("2026-02-29")).toBe(false);
  });

  it("formats relative dates", () => {
    expect(formatRelative("2026-11-21", "2026-11-21")).toBe("today");
    expect(formatRelative("2026-11-24", "2026-11-21")).toBe("in 3 days");
    expect(formatRelative("2026-10-01", "2026-11-21")).toBe("7 weeks ago");
  });
});
