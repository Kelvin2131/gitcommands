import { DeskError } from "@/lib/errors";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function zonedParts(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = zonedParts(utc, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = asUtc - utc.getTime();
  return new Date(utc.getTime() - offset);
}

export function startOfZonedDay(now: Date, timeZone: string): Date {
  const parts = zonedParts(now, timeZone);
  return zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, timeZone);
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new DeskError("Use a date like 2026-11-01.");
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function calendarDaysInclusive(startIso: string, endIso: string): number {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new DeskError("Use a date like 2026-11-01.");
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days < 1 || days > 366) throw new DeskError("Pick a period of 1 to 366 days.");
  return days;
}

export function parseZonedDate(isoDate: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) throw new DeskError("Use a date like 2026-11-01.");
  return zonedTimeToUtc(Number(match[1]), Number(match[2]), Number(match[3]), 0, 0, timeZone);
}

export function periodBounds(startIso: string, endIso: string, timeZone: string): { start: Date; end: Date; days: number } {
  const days = calendarDaysInclusive(startIso, endIso);
  const start = parseZonedDate(startIso, timeZone);
  const end = parseZonedDate(addCalendarDays(endIso, 1), timeZone);
  return { start, end, days };
}

export function zonedMonthRange(now: Date, timeZone: string): { start: Date; end: Date } {
  const parts = zonedParts(now, timeZone);
  const start = zonedTimeToUtc(parts.year, parts.month, 1, 0, 0, timeZone);
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
  const end = zonedTimeToUtc(nextYear, nextMonth, 1, 0, 0, timeZone);
  return { start, end };
}

export function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function isoDay(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getTimeZone(): string {
  const zone = process.env.APP_TIMEZONE || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return "America/New_York";
  }
}
