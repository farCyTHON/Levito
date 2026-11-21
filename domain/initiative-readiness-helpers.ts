import type { WorkspaceData } from "./models";

export function memberName(data: WorkspaceData, id: string | null): string | null {
  if (!id) return null;
  return data.members.find((m) => m.id === id)?.name ?? null;
}
