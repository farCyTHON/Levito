import type {
  Action,
  ActionInput,
  Decision,
  DecisionInput,
  Handover,
  HandoverInput,
  ID,
  Initiative,
  InitiativeInput,
  ISODateTime,
  KnowledgeInput,
  KnowledgeItem,
  Member,
  MemberInput,
  Organization,
  WorkspaceSettings,
} from "@/domain/models";

export type WriteTarget = "demo-session" | "notion";

export interface WriteReceipt {
  target: WriteTarget;
  confirmed: boolean;
  at: ISODateTime;
}

export interface WriteResult<T> {
  record: T;
  receipt: WriteReceipt;
}

export class RecordNotFoundError extends Error {
  constructor(
    readonly collection: string,
    readonly id: ID,
  ) {
    super(`No ${collection} record with id "${id}"`);
    this.name = "RecordNotFoundError";
  }
}

export interface EntityRepository<T extends { id: ID }, TInput> {
  list(): Promise<T[]>;
  get(id: ID): Promise<T | null>;
  create(input: TInput): Promise<WriteResult<T>>;
  update(id: ID, input: TInput): Promise<WriteResult<T>>;
  remove(id: ID): Promise<WriteReceipt>;
}

export interface WorkspaceRepositories {
  target: WriteTarget;
  members: EntityRepository<Member, MemberInput>;
  initiatives: EntityRepository<Initiative, InitiativeInput>;
  knowledge: EntityRepository<KnowledgeItem, KnowledgeInput>;
  decisions: EntityRepository<Decision, DecisionInput>;
  actions: EntityRepository<Action, ActionInput>;
  handovers: EntityRepository<Handover, HandoverInput>;
  organization: {
    get(): Promise<Organization>;
    update(input: Organization): Promise<WriteResult<Organization>>;
  };
  settings: {
    get(): Promise<WorkspaceSettings>;
    update(input: WorkspaceSettings): Promise<WriteResult<WorkspaceSettings>>;
  };
}
