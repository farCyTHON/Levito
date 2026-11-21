import type { ID, WorkspaceData } from "@/domain/models";
import {
  RecordNotFoundError,
  type EntityRepository,
  type WorkspaceRepositories,
  type WriteReceipt,
} from "@/lib/repositories";
import type { DemoStore } from "./demo-store";

type CollectionKey = "members" | "initiatives" | "knowledge" | "decisions" | "actions" | "handovers";
type RecordOf<K extends CollectionKey> = WorkspaceData[K][number];
type InputOf<K extends CollectionKey> = Omit<RecordOf<K>, "id" | "createdAt" | "updatedAt">;

const without = (ids: ID[], id: ID) => ids.filter((x) => x !== id);
const clear = (value: ID | null, id: ID) => (value === id ? null : value);

const detach: Record<CollectionKey, (data: WorkspaceData, id: ID) => WorkspaceData> = {
  members: (data, id) => ({
    ...data,
    initiatives: data.initiatives.map((i) => ({ ...i, ownerId: clear(i.ownerId, id) })),
    knowledge: data.knowledge.map((k) => ({ ...k, ownerId: clear(k.ownerId, id) })),
    decisions: data.decisions.map((d) => ({ ...d, ownerId: clear(d.ownerId, id) })),
    actions: data.actions.map((a) => ({ ...a, assigneeId: clear(a.assigneeId, id) })),
    handovers: data.handovers.map((h) => ({
      ...h,
      outgoingOwnerId: clear(h.outgoingOwnerId, id),
      successorId: clear(h.successorId, id),
      acknowledgedOn: h.successorId === id ? null : h.acknowledgedOn,
    })),
  }),
  initiatives: (data, id) => ({
    ...data,
    knowledge: data.knowledge.map((k) => ({ ...k, initiativeIds: without(k.initiativeIds, id) })),
    decisions: data.decisions.map((d) => ({ ...d, initiativeIds: without(d.initiativeIds, id) })),
    actions: data.actions.map((a) => ({ ...a, initiativeId: clear(a.initiativeId, id) })),
    handovers: data.handovers.map((h) => ({ ...h, initiativeIds: without(h.initiativeIds, id) })),
  }),
  knowledge: (data, id) => ({
    ...data,
    handovers: data.handovers.map((h) => ({ ...h, knowledgeIds: without(h.knowledgeIds, id) })),
  }),
  decisions: (data, id) => ({
    ...data,
    handovers: data.handovers.map((h) => ({ ...h, decisionIds: without(h.decisionIds, id) })),
  }),
  actions: (data) => data,
  handovers: (data, id) => ({
    ...data,
    actions: data.actions.map((a) => ({ ...a, handoverId: clear(a.handoverId, id) })),
  }),
};

export function createDemoRepositories(
  store: DemoStore,
  createId: () => string = () => crypto.randomUUID(),
): WorkspaceRepositories {
  const receipt = (): WriteReceipt => ({
    target: "demo-session",
    confirmed: true,
    at: store.now().toISOString(),
  });

  function collection<K extends CollectionKey>(key: K): EntityRepository<RecordOf<K>, InputOf<K>> {
    const rows = () => store.read()[key] as RecordOf<K>[];
    return {
      list: async () => rows(),
      get: async (id) => rows().find((r) => r.id === id) ?? null,
      async create(input) {
        const at = store.now().toISOString();
        const record = { ...input, id: createId(), createdAt: at, updatedAt: at } as RecordOf<K>;
        store.write((data) => ({ ...data, [key]: [record, ...data[key]] }));
        return { record, receipt: receipt() };
      },
      async update(id, input) {
        const existing = rows().find((r) => r.id === id);
        if (!existing) throw new RecordNotFoundError(key, id);
        const record = { ...existing, ...input, updatedAt: store.now().toISOString() } as RecordOf<K>;
        store.write((data) => ({
          ...data,
          [key]: (data[key] as RecordOf<K>[]).map((r) => (r.id === id ? record : r)),
        }));
        return { record, receipt: receipt() };
      },
      async remove(id) {
        if (!rows().some((r) => r.id === id)) throw new RecordNotFoundError(key, id);
        store.write((data) =>
          detach[key]({ ...data, [key]: (data[key] as RecordOf<K>[]).filter((r) => r.id !== id) }, id),
        );
        return receipt();
      },
    };
  }

  return {
    target: "demo-session",
    members: collection("members"),
    initiatives: collection("initiatives"),
    knowledge: collection("knowledge"),
    decisions: collection("decisions"),
    actions: collection("actions"),
    handovers: collection("handovers"),
    organization: {
      get: async () => store.read().organization,
      async update(input) {
        store.write((data) => ({ ...data, organization: input }));
        return { record: input, receipt: receipt() };
      },
    },
    settings: {
      get: async () => store.read().settings,
      async update(input) {
        store.write((data) => ({ ...data, settings: input }));
        return { record: input, receipt: receipt() };
      },
    },
  };
}
