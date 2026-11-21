import { z } from "zod";
import {
  ACTION_STATUSES,
  DECISION_STATUSES,
  INITIATIVE_STATUSES,
  INITIATIVE_TYPES,
  KNOWLEDGE_KINDS,
  type ActionInput,
  type DecisionInput,
  type HandoverInput,
  type InitiativeInput,
  type KnowledgeInput,
  type MemberInput,
  type Organization,
  type WorkspaceSettings,
} from "@/domain/models";
import { isISODate } from "@/lib/utils/dates";

const isoDate = z.string().refine(isISODate, "Enter a valid date");
const optionalDate = isoDate.nullable();
const refId = z.string().min(1);
const optionalRef = refId.nullable();
const refList = z.array(refId).transform((ids) => [...new Set(ids)]);
const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);
const title = (label: string) =>
  z.string().trim().min(2, `${label} needs at least 2 characters`).max(140, "Keep this under 140 characters");
const email = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address");

export const memberInputSchema = z.object({
  name: title("Name"),
  role: z.string().trim().min(2, "Add a committee role").max(80),
  email,
  active: z.boolean(),
}) satisfies z.ZodType<MemberInput>;

export const initiativeInputSchema = z
  .object({
    title: title("Title"),
    type: z.enum(INITIATIVE_TYPES),
    status: z.enum(INITIATIVE_STATUSES),
    summary: text(2000),
    ownerId: optionalRef,
    startDate: optionalDate,
    endDate: optionalDate,
    recurrence: text(120),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date",
  }) satisfies z.ZodType<InitiativeInput>;

export const knowledgeInputSchema = z
  .object({
    title: title("Title"),
    kind: z.enum(KNOWLEDGE_KINDS),
    summary: text(400),
    content: text(20000),
    ownerId: optionalRef,
    tags: z
      .array(z.string().trim().toLowerCase().min(1).max(30))
      .max(8, "Use at most 8 tags")
      .transform((tags) => [...new Set(tags)]),
    lastReviewedOn: optionalDate,
    initiativeIds: refList,
    contact: z
      .object({
        organization: text(120),
        email,
        phone: text(40),
        website: text(200),
      })
      .nullable(),
  })
  .refine((v) => v.kind !== "contact" || v.contact !== null, {
    path: ["contact"],
    message: "Contact records need contact details",
  }) satisfies z.ZodType<KnowledgeInput>;

export const decisionInputSchema = z
  .object({
    title: title("Title"),
    status: z.enum(DECISION_STATUSES),
    decidedOn: isoDate,
    ownerId: optionalRef,
    context: z.string().trim().min(10, "Describe the context in at least a sentence").max(4000),
    alternatives: z.array(z.string().trim().min(1).max(300)).max(8, "List at most 8 alternatives"),
    chosen: text(600),
    rationale: text(4000),
    outcome: text(4000),
    initiativeIds: refList,
  })
  .refine((v) => v.status === "proposed" || v.chosen.length > 0, {
    path: ["chosen"],
    message: "Record which option was chosen, or keep the decision as proposed",
  }) satisfies z.ZodType<DecisionInput>;

export const actionInputSchema = z.object({
  title: title("Title"),
  status: z.enum(ACTION_STATUSES),
  assigneeId: optionalRef,
  dueDate: optionalDate,
  nextStep: text(400),
  initiativeId: optionalRef,
  handoverId: optionalRef,
}) satisfies z.ZodType<ActionInput>;

export const handoverInputSchema = z
  .object({
    title: title("Role"),
    outgoingTerm: z.string().trim().min(2, "Add the outgoing term").max(40),
    incomingTerm: z.string().trim().min(2, "Add the incoming term").max(40),
    outgoingOwnerId: optionalRef,
    successorId: optionalRef,
    targetDate: optionalDate,
    initiativeIds: refList,
    knowledgeIds: refList,
    decisionIds: refList,
    scopeConfirmed: z.boolean(),
    actionsReviewed: z.boolean(),
    acknowledgedOn: optionalDate,
  })
  .refine((v) => v.successorId === null || v.successorId !== v.outgoingOwnerId, {
    path: ["successorId"],
    message: "The successor must be a different person from the outgoing owner",
  })
  .refine((v) => v.acknowledgedOn === null || v.successorId !== null, {
    path: ["acknowledgedOn"],
    message: "A handover cannot be acknowledged without a successor",
  }) satisfies z.ZodType<HandoverInput>;

export const organizationSchema = z.object({
  name: title("Organization name"),
  shortName: z.string().trim().min(1, "Add a short name").max(12, "Keep the short name under 12 characters"),
  university: text(120),
  term: text(40),
}) satisfies z.ZodType<Organization>;

export const settingsSchema = z.object({
  reviewWindowDays: z
    .number()
    .int("Use a whole number of days")
    .min(30, "The review window must be at least 30 days")
    .max(730, "The review window can be at most 730 days"),
}) satisfies z.ZodType<WorkspaceSettings>;

export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_form";
    errors[key] ??= issue.message;
  }
  return errors;
}
