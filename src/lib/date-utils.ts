// src/lib/date-utils.ts
// Moscow timezone utilities shared between server and client components

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, no DST

/**
 * Convert a UTC Date to a YYYY-MM-DD string in Moscow time.
 * Used for grouping events by calendar day on the server.
 */
export function toMoscowDateStr(utcDate: Date): string {
  return new Date(utcDate.getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Get the Moscow-local calendar components from a UTC Date.
 * Used to construct a "floating" dtstart for rrule (no tz conversion inside rrule).
 */
export function toMoscowLocalParts(utcDate: Date): {
  year: number;
  month: number; // 0-indexed
  day: number;
  hours: number;
  minutes: number;
} {
  const local = new Date(utcDate.getTime() + MOSCOW_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    hours: local.getUTCHours(),
    minutes: local.getUTCMinutes(),
  };
}

/**
 * Build a "floating" dtstart Date for rrule from a UTC-stored eventStartAt.
 * rrule.js treats dtstart as local (no timezone), so we reconstruct
 * the Moscow calendar date in UTC slots to avoid offset shifts.
 */
export function buildRRuleDtstart(utcDate: Date): Date {
  const { year, month, day, hours, minutes } = toMoscowLocalParts(utcDate);
  return new Date(Date.UTC(year, month, day, hours, minutes, 0));
}

/**
 * Build RRULE string from recurrence parameters.
 * All date inputs must be in Moscow local time.
 */
export function buildRRuleString(params: {
  type: "weekly" | "monthly" | "yearly";
  startAt: Date; // UTC-stored, will be converted to Moscow local
  selectedWeekdays?: number[]; // 0=Mon, 1=Tue, ..., 6=Sun (for weekly)
  until?: Date | null; // UTC timestamp, used as-is for UNTIL= (must be UTC per RFC 5545)
}): string {
  const { type, startAt, selectedWeekdays, until } = params;
  const local = toMoscowLocalParts(startAt);

  const untilStr = until
    ? until.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z"
    : null;

  const parts: string[] = [];

  if (type === "monthly") {
    parts.push("FREQ=MONTHLY", `BYMONTHDAY=${local.day}`);
  } else if (type === "weekly") {
    const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
    // Default to the weekday of startAt if none selected
    const days = selectedWeekdays?.length
      ? selectedWeekdays
      : [local.day === 0 ? 6 : ((local.day + 6) % 7)]; // convert JS Sun=0 to Mon=0
    const byDay = days.map((d) => DAY_CODES[d]).join(",");
    parts.push("FREQ=WEEKLY", `BYDAY=${byDay}`);
  } else if (type === "yearly") {
    parts.push("FREQ=YEARLY", `BYMONTH=${local.month + 1}`, `BYMONTHDAY=${local.day}`);
  }

  if (untilStr) parts.push(`UNTIL=${untilStr}`);

  return parts.join(";");
}
