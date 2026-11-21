import type { ISODate } from "@/domain/models";

const DAY_MS = 86_400_000;

function toUTC(iso: ISODate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = toUTC(value);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function addDays(iso: ISODate, days: number): ISODate {
  return new Date(toUTC(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: ISODate | null | undefined): string {
  return iso ? dateFormat.format(toUTC(iso)) : "No date";
}

export function formatMonth(iso: ISODate): string {
  return monthFormat.format(toUTC(iso));
}

export function formatRelative(iso: ISODate, today: ISODate): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  const abs = Math.abs(diff);
  const unit = abs >= 60 ? `${Math.round(abs / 30)} months` : abs >= 14 ? `${Math.round(abs / 7)} weeks` : `${abs} days`;
  return diff > 0 ? `in ${unit}` : `${unit} ago`;
}
