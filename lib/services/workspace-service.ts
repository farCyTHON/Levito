import type { z } from "zod";
import type { ID, ISODate } from "@/domain/models";
import type { EntityRepository, WorkspaceRepositories, WriteReceipt } from "@/lib/repositories";
import {
  actionInputSchema,
  decisionInputSchema,
  handoverCreateSchema,
  handoverInputSchema,
  initiativeInputSchema,
  knowledgeInputSchema,
  memberInputSchema,
  organizationSchema,
  settingsSchema,
  toFieldErrors,
} from "@/lib/validation/schemas";

export type FieldErrors = Record<string, string>;

export type CommandResult<T> =
  | { ok: true; record: T; receipt: WriteReceipt }
  | { ok: false; message: string; fieldErrors: FieldErrors };

const invalid = (fieldErrors: FieldErrors): CommandResult<never> => ({
  ok: false,
  message: "Some fields need attention before this can be saved.",
  fieldErrors,
});

function entityCommands<T extends { id: ID }, TInput>(
  repo: EntityRepository<T, TInput>,
  schema: z.ZodType<TInput>,
  label: string,
  createSchema: z.ZodType<TInput> = schema,
) {
  return {
    async create(input: unknown): Promise<CommandResult<T>> {
      const parsed = createSchema.safeParse(input);
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));
      return { ok: true, ...(await repo.create(parsed.data)) };
    },
    async update(id: ID, patch: Partial<TInput>): Promise<CommandResult<T>> {
      const existing = await repo.get(id);
      if (!existing) {
        return { ok: false, message: `This ${label} no longer exists. It may have been deleted.`, fieldErrors: {} };
      }
      const parsed = schema.safeParse({ ...existing, ...patch });
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));
      return { ok: true, ...(await repo.update(id, parsed.data)) };
    },
    remove: (id: ID) => repo.remove(id),
  };
}

export function createWorkspaceService(repos: WorkspaceRepositories) {
  const knowledge = entityCommands(repos.knowledge, knowledgeInputSchema, "document");
  const handovers = entityCommands(repos.handovers, handoverInputSchema, "handover", handoverCreateSchema);

  return {
    target: repos.target,
    members: entityCommands(repos.members, memberInputSchema, "member"),
    initiatives: entityCommands(repos.initiatives, initiativeInputSchema, "initiative"),
    decisions: entityCommands(repos.decisions, decisionInputSchema, "decision"),
    actions: entityCommands(repos.actions, actionInputSchema, "action"),
    knowledge: {
      ...knowledge,
      markReviewed: (id: ID, on: ISODate) => knowledge.update(id, { lastReviewedOn: on }),
    },
    handovers: {
      ...handovers,
      acknowledge: (id: ID, on: ISODate | null) => handovers.update(id, { acknowledgedOn: on }),
    },
    organization: {
      async update(input: unknown) {
        const parsed = organizationSchema.safeParse(input);
        if (!parsed.success) return invalid(toFieldErrors(parsed.error));
        return { ok: true as const, ...(await repos.organization.update(parsed.data)) };
      },
    },
    settings: {
      async update(input: unknown) {
        const parsed = settingsSchema.safeParse(input);
        if (!parsed.success) return invalid(toFieldErrors(parsed.error));
        return { ok: true as const, ...(await repos.settings.update(parsed.data)) };
      },
    },
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
