export type NotionErrorCode =
  | "invalid_credentials"
  | "access_denied"
  | "not_found"
  | "rate_limited"
  | "validation_error"
  | "incomplete_results"
  | "unavailable"
  | "unknown";

export class NotionError extends Error {
  constructor(
    readonly code: NotionErrorCode,
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "NotionError";
  }
}

interface ApiErrorLike {
  code?: string;
  status?: number;
  message?: string;
  headers?: Record<string, string> | { get?(name: string): string | null };
}

function retryAfterMs(headers: ApiErrorLike["headers"]): number | undefined {
  if (!headers) return undefined;
  const raw =
    typeof (headers as { get?: unknown }).get === "function"
      ? (headers as { get(name: string): string | null }).get("retry-after")
      : (headers as Record<string, string>)["retry-after"] ??
        (headers as Record<string, string>)["Retry-After"];
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

const CODE_MAP: Record<string, NotionErrorCode> = {
  unauthorized: "invalid_credentials",
  invalid_token: "invalid_credentials",
  restricted_resource: "access_denied",
  object_not_found: "not_found",
  rate_limited: "rate_limited",
  validation_error: "validation_error",
};

export function toNotionError(error: unknown): NotionError {
  if (error instanceof NotionError) return error;
  const e = error as ApiErrorLike;
  const code = typeof e?.code === "string" ? (CODE_MAP[e.code] ?? "unknown") : "unknown";
  const status = typeof e?.status === "number" ? e.status : undefined;
  const retry = retryAfterMs(e?.headers);
  const detail = typeof e?.message === "string" ? e.message : "Notion request failed";
  return new NotionError(code, detail, status, retry);
}

export function isNotionError(error: unknown): error is NotionError {
  return error instanceof NotionError;
}
