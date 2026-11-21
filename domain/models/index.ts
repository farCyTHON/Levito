export type ID = string;
export type ISODate = string;
export type ISODateTime = string;

export const INITIATIVE_TYPES = ["event", "campaign", "project", "recurring"] as const;
export type InitiativeType = (typeof INITIATIVE_TYPES)[number];

export const INITIATIVE_STATUSES = ["planned", "active", "paused", "completed"] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

export const KNOWLEDGE_KINDS = ["playbook", "sop", "lesson", "contact", "template"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const DECISION_STATUSES = ["proposed", "decided", "superseded"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const ACTION_STATUSES = ["open", "in_progress", "done"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

interface Entity {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Member extends Entity {
  name: string;
  role: string;
  email: string;
  active: boolean;
}

export interface Initiative extends Entity {
  title: string;
  type: InitiativeType;
  status: InitiativeStatus;
  summary: string;
  ownerId: ID | null;
  startDate: ISODate | null;
  endDate: ISODate | null;
  recurrence: string;
}

export interface ContactDetails {
  organization: string;
  email: string;
  phone: string;
  website: string;
}

export interface KnowledgeItem extends Entity {
  title: string;
  kind: KnowledgeKind;
  summary: string;
  content: string;
  ownerId: ID | null;
  tags: string[];
  lastReviewedOn: ISODate | null;
  initiativeIds: ID[];
  contact: ContactDetails | null;
}

export interface Decision extends Entity {
  title: string;
  status: DecisionStatus;
  decidedOn: ISODate;
  ownerId: ID | null;
  context: string;
  alternatives: string[];
  chosen: string;
  rationale: string;
  outcome: string;
  initiativeIds: ID[];
}

export interface Action extends Entity {
  title: string;
  status: ActionStatus;
  assigneeId: ID | null;
  dueDate: ISODate | null;
  nextStep: string;
  initiativeId: ID | null;
  handoverId: ID | null;
}

export interface Handover extends Entity {
  title: string;
  outgoingTerm: string;
  incomingTerm: string;
  outgoingOwnerId: ID | null;
  successorId: ID | null;
  targetDate: ISODate | null;
  initiativeIds: ID[];
  knowledgeIds: ID[];
  decisionIds: ID[];
  scopeConfirmed: boolean;
  actionsReviewed: boolean;
  acknowledgedOn: ISODate | null;
}

export interface Organization {
  name: string;
  shortName: string;
  university: string;
  term: string;
}

export interface WorkspaceSettings {
  reviewWindowDays: number;
}

export interface WorkspaceData {
  organization: Organization;
  settings: WorkspaceSettings;
  members: Member[];
  initiatives: Initiative[];
  knowledge: KnowledgeItem[];
  decisions: Decision[];
  actions: Action[];
  handovers: Handover[];
}

type InputOf<T extends Entity> = Omit<T, keyof Entity>;

export type MemberInput = InputOf<Member>;
export type InitiativeInput = InputOf<Initiative>;
export type KnowledgeInput = InputOf<KnowledgeItem>;
export type DecisionInput = InputOf<Decision>;
export type ActionInput = InputOf<Action>;
export type HandoverInput = InputOf<Handover>;

export type EntityRef =
  | { type: "member"; id: ID }
  | { type: "initiative"; id: ID }
  | { type: "knowledge"; id: ID }
  | { type: "decision"; id: ID }
  | { type: "action"; id: ID }
  | { type: "handover"; id: ID };
