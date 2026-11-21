import type { ISODate, WorkspaceData } from "@/domain/models";
import { toISODate } from "@/lib/utils/dates";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DemoSnapshot {
  data: WorkspaceData;
  today: ISODate;
}

interface DemoStoreOptions {
  seed: (today: ISODate) => WorkspaceData;
  storage?: StorageLike | null;
  now?: () => Date;
}

const STORAGE_KEY = "levito.demo.v1";
const COLLECTIONS = ["members", "initiatives", "knowledge", "decisions", "actions", "handovers"] as const;

function isWorkspaceData(value: unknown): value is WorkspaceData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.organization === "object" &&
    typeof record.settings === "object" &&
    COLLECTIONS.every((key) => Array.isArray(record[key]))
  );
}

export class DemoStore {
  private snapshot: DemoSnapshot | null = null;
  private listeners = new Set<() => void>();
  private readonly storage: StorageLike | null;
  readonly now: () => Date;

  constructor(private readonly options: DemoStoreOptions) {
    this.storage = options.storage ?? null;
    this.now = options.now ?? (() => new Date());
  }

  getSnapshot = (): DemoSnapshot | null => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  init(): void {
    if (this.snapshot) return;
    const today = toISODate(this.now());
    this.snapshot = { data: this.load() ?? this.options.seed(today), today };
    this.emit();
  }

  reset(): void {
    const today = toISODate(this.now());
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {}
    this.snapshot = { data: this.options.seed(today), today };
    this.emit();
  }

  read(): WorkspaceData {
    this.init();
    return this.snapshot!.data;
  }

  write(recipe: (data: WorkspaceData) => WorkspaceData): void {
    const current = this.read();
    this.snapshot = { data: recipe(current), today: this.snapshot!.today };
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.snapshot.data));
    } catch {}
    this.emit();
  }

  private load(): WorkspaceData | null {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isWorkspaceData(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
