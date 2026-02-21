# Recurring Events — RRULE Design

**Date**: 2026-02-19
**Branch**: feature/ui-calendar-storybook
**Status**: Approved, ready for implementation

---

## Context

The community platform needs recurring events for HOA/utilities notifications. Events are created only by admins/editors/moderators via the admin panel. Users cannot create events.

**Required recurrence types**: monthly, weekly, yearly
**Daily recurrence**: not needed — covered by all-day events with a date range (`eventAllDay=true` + `eventStartAt`/`eventEndAt`)

---

## Decision: RRULE (RFC 5545)

Store recurrence as a single `event_recurrence_rule: varchar(500)` RRULE string per RFC 5545.
Use the `rrule` npm package for occurrence expansion in TypeScript.

**Rejected alternatives**:
- Flat columns (`eventRecurrenceDayOfWeek`, etc.) — redundant with RRULE, don't support multi-day weekly
- Separate `event_recurrence` table — over-engineered for current scale

---

## Schema Changes

### Add

```typescript
// publications table
eventRecurrenceRule: varchar("event_recurrence_rule", { length: 500 }),
// RRULE string per RFC 5545, null = no recurrence
// Examples:
//   monthly 20–25:  "FREQ=MONTHLY;BYMONTHDAY=20"  (duration from endAt-startAt)
//   weekly fri:     "FREQ=WEEKLY;BYDAY=FR"
//   yearly sep 15:  "FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=15"
```

### Remove (redundant with RRULE)

```typescript
eventRecurrenceInterval  // → INTERVAL= in RRULE (always 1 for our cases)
eventRecurrenceDayOfWeek // → BYDAY= in RRULE
eventRecurrenceStartDay  // → BYMONTHDAY= in RRULE
eventRecurrenceEndDay    // → duration = eventEndAt - eventStartAt
```

### Keep

```typescript
eventRecurrenceType   // enum — for display labels without parsing RRULE, SQL filtering
eventRecurrenceUntil  // timestamp — for SQL-level series end filtering without parsing RRULE
```

### Migration

```sql
-- 0005_recurrence_rrule.sql
ALTER TABLE "publication" ADD COLUMN "event_recurrence_rule" varchar(500);
ALTER TABLE "publication" DROP COLUMN "event_recurrence_interval";
ALTER TABLE "publication" DROP COLUMN "event_recurrence_day_of_week";
ALTER TABLE "publication" DROP COLUMN "event_recurrence_start_day";
ALTER TABLE "publication" DROP COLUMN "event_recurrence_end_day";
```

---

## RRULE Conventions

### Monthly — period within a month

```
FREQ=MONTHLY;BYMONTHDAY=20
eventStartAt = 2025-02-20T00:00:00+03:00
eventEndAt   = 2025-02-25T23:59:59+03:00
```

Duration = `endAt - startAt` = 5 days. Widget draws dots on `[occurrence, occurrence + duration]`.
Do NOT use `BYMONTHDAY=20,21,22,23,24,25` — that generates 6 separate occurrences, not one range.

### Weekly — specific days

```
FREQ=WEEKLY;BYDAY=FR
eventStartAt = 2025-02-21T19:00:00+03:00
eventEndAt   = 2025-02-21T21:00:00+03:00
```

Multi-day: `BYDAY=MO,FR` (comma-separated RFC 5545 weekday codes).

### Yearly — specific date

```
FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=15
eventStartAt = 2025-09-15T00:00:00+03:00
eventAllDay  = true
```

### With end date

```
FREQ=WEEKLY;BYDAY=MO;UNTIL=20251231T210000Z
```

`UNTIL` must be UTC per RFC 5545. Mirrors `eventRecurrenceUntil` column.

---

## Timezone Handling (Critical)

**Problem**: `eventStartAt` is stored UTC in PostgreSQL.
`2025-02-20T00:00:00+03:00` → stored as `2025-02-19T21:00:00Z`.
Passing raw UTC Date to `RRule` with `BYMONTHDAY=20` will match the 19th (UTC), not the 20th.

**Fix**: Convert to Moscow local time before passing to rrule:

```typescript
import { toZonedTime } from "date-fns-tz";

const MOSCOW_TZ = "Europe/Moscow";

function toMoscowDateStr(utcDate: Date): string {
  return toZonedTime(utcDate, MOSCOW_TZ).toISOString().slice(0, 10);
}

function buildRRuleOptions(event: EventRow): Partial<RRuleOptions> {
  const localStart = toZonedTime(event.eventStartAt, MOSCOW_TZ);
  return {
    // dtstart must be a "floating" local date (no tz info)
    dtstart: new Date(Date.UTC(
      localStart.getFullYear(),
      localStart.getMonth(),
      localStart.getDate(),
      localStart.getHours(),
      localStart.getMinutes(),
    )),
  };
}
```

Install: `bun add rrule date-fns-tz` (date-fns-tz may already be present).

---

## weeklyAgenda Router — New Algorithm

### Step 1: SQL — broad candidate fetch

```typescript
// Two separate branches in the WHERE clause:
or(
  // Non-recurring: falls within the 14-day window
  and(
    eq(publications.eventRecurrenceType, "none"),
    lte(publications.eventStartAt, windowEnd),
    gte(publications.eventEndAt ?? publications.eventStartAt, windowStart),
  ),
  // Recurring: series has not ended
  and(
    ne(publications.eventRecurrenceType, "none"),
    or(
      isNull(publications.eventRecurrenceUntil),
      gte(publications.eventRecurrenceUntil, windowStart),
    ),
  ),
)
```

### Step 2: TypeScript — expand occurrences

```typescript
import { RRule } from "rrule";

const DAY_MS = 24 * 60 * 60 * 1000;

for (const event of recurringEvents) {
  if (!event.eventRecurrenceRule) continue;

  const ruleOptions = RRule.parseString(event.eventRecurrenceRule);
  ruleOptions.dtstart = buildRRuleLocalStart(event.eventStartAt); // Moscow local
  const rule = new RRule(ruleOptions);

  const occurrences = rule.between(windowStart, windowEnd, true);
  if (occurrences.length === 0) continue;

  // Duration from original dates
  const durationMs = event.eventEndAt
    ? event.eventEndAt.getTime() - event.eventStartAt.getTime()
    : 0;

  // Next occurrence = first in window → shown in agenda list
  const nextOcc = occurrences[0]!;
  const virtualStart = nextOcc;
  const virtualEnd = durationMs > 0 ? new Date(nextOcc.getTime() + durationMs) : null;

  // All dot dates = all occurrences + their duration range
  const dotDates: string[] = [];
  for (const occ of occurrences) {
    dotDates.push(toMoscowDateStr(occ));
    if (durationMs > 0) {
      let d = new Date(occ.getTime() + DAY_MS);
      const occEnd = new Date(occ.getTime() + durationMs);
      while (d <= occEnd && toMoscowDateStr(d) !== toMoscowDateStr(occEnd)) {
        dotDates.push(toMoscowDateStr(d));
        d = new Date(d.getTime() + DAY_MS);
      }
    }
  }

  // Place event on the date of next occurrence in agenda
  const agendaDate = toMoscowDateStr(virtualStart);
  agendaMap[agendaDate] ??= [];
  agendaMap[agendaDate]!.push({ ...event, eventStartAt: virtualStart, eventEndAt: virtualEnd });
}
```

---

## Admin Form UI

### Recurrence section structure

The recurrence section derives its base parameters from the date pickers above — it is a dependent UI, not independent.

**None selected** — section shows only the type dropdown.

**Monthly selected** (auto-derives from startAt=20feb, endAt=25feb):
```
Тип: [Ежемесячно ▼]
Период: 20 — 25 числа каждого месяца  ← read-only, computed
Завершить: [Никогда ▼] | [Дата ▼] → DatePicker
```

**Weekly selected** (auto-selects day from startAt weekday):
```
Тип: [Еженедельно ▼]
Дни: [Пн] [Вт] [Ср] [Чт] [Пт✓] [Сб] [Вс]  ← toggle buttons
Завершить: [Никогда ▼]
```

**Yearly selected**:
```
Тип: [Ежегодно ▼]
Каждый год: 15 сентября  ← read-only, computed from startAt
Завершить: [Никогда ▼]
```

### Smart validation constraints

| Condition | Constraint |
|---|---|
| startAt and endAt in same month | Monthly available |
| startAt and endAt span multiple months | Monthly disabled |
| startAt and endAt within same calendar week | Weekly available |
| startAt and endAt span multiple weeks | Weekly disabled (can't define a clean weekly period) |
| endAt not set | Monthly = single day; Weekly = day picker |

### RRULE generation

```typescript
function buildRRule(params: {
  type: "weekly" | "monthly" | "yearly";
  startAt: Date;        // Moscow local
  selectedWeekdays?: number[]; // 0=Mon..6=Sun, for weekly
  until?: Date | null;
}): string {
  const { type, startAt, selectedWeekdays, until } = params;
  const untilStr = until
    ? until.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
    : null;

  if (type === "monthly") {
    const day = startAt.getDate();
    return ["FREQ=MONTHLY", `BYMONTHDAY=${day}`, untilStr && `UNTIL=${untilStr}`]
      .filter(Boolean).join(";");
  }
  if (type === "weekly") {
    const days = (selectedWeekdays ?? [startAt.getDay() === 0 ? 6 : startAt.getDay() - 1]);
    const byDay = days.map(d => ["MO","TU","WE","TH","FR","SA","SU"][d]).join(",");
    return ["FREQ=WEEKLY", `BYDAY=${byDay}`, untilStr && `UNTIL=${untilStr}`]
      .filter(Boolean).join(";");
  }
  if (type === "yearly") {
    const month = startAt.getMonth() + 1;
    const day = startAt.getDate();
    return ["FREQ=YEARLY", `BYMONTH=${month}`, `BYMONTHDAY=${day}`, untilStr && `UNTIL=${untilStr}`]
      .filter(Boolean).join(";");
  }
}
```

---

## Calendar Widget — Accent Color on Hover Fix

**Current bug**: date circles highlight with `boxShadow: "0 0 0 2px currentColor"` (text color = black/white).

**Fix**: pass the hovered event's hex color through state:

```typescript
// WeeklyAgendaClient state
const [hoveredEventColor, setHoveredEventColor] = useState<string | null>(null);

// On event card hover:
onMouseEnter={() => {
  setHoveredEventId(event.id);
  setHoveredEventColor(color.hex);
}}
onMouseLeave={() => {
  setHoveredEventId(null);
  setHoveredEventColor(null);
}}

// Date circle animation:
animate={
  isHighlighted
    ? { scale: 1.15, boxShadow: `0 0 0 2px ${hoveredEventColor ?? "#f59e0b"}` }
    : isHovered
      ? { scale: 1.08 }
      : { scale: 1, boxShadow: "none" }
}
```

---

## Card Display

| Recurrence type | Date/time shown in card |
|---|---|
| Monthly, 20–25 | "20 — 25 мар." (next occurrence) |
| Weekly, fri 19:00 | "пт, 28 фев. · 19:00 — 21:00" |
| Yearly, sep 15 | "15 сент." |
| Non-recurring | current behavior unchanged |

Recurrence badge next to date: `RefreshCw` icon (lucide) + label "ежемесячно" / "еженедельно" / "ежегодно".

---

## Known Limitations

- `BYMONTHDAY=29,30,31` events will be skipped in months with fewer days (Feb, Apr, Jun, Sep, Nov). Document in admin UI.
- No per-occurrence overrides ("cancel this Friday's meeting") — deferred. Schema accommodates it via a future `event_occurrence_exceptions` table.
- No `EXDATE` support in initial implementation.
- Color index is ephemeral (assigned by iteration order) — not a stable identifier. Acceptable for now.

---

## Implementation Order

1. `bun add rrule` — add package
2. Schema: add `eventRecurrenceRule`, remove 4 redundant fields, create migration `0005`
3. `~/lib/date-utils.ts` — shared `toMoscowDateStr`, `buildRRuleLocalStart` utilities
4. tRPC router: update `weeklyAgenda` candidate query + TypeScript expansion
5. Admin form (new + edit): recurrence UI with smart constraints
6. `WeeklyAgendaClient`: accent color hover fix + recurrence badge
7. Zod validation: cross-field refine for dates + recurrence constraints
8. `bun run check` — 0 errors

---

## Files to Change

| File | Change |
|---|---|
| `src/server/db/schemas/publications.ts` | Add `eventRecurrenceRule`, remove 4 fields |
| `drizzle/0005_recurrence_rrule.sql` | Migration |
| `drizzle/meta/_journal.json` | Add entry |
| `src/lib/date-utils.ts` | New: shared date utilities |
| `src/server/api/routers/publications.ts` | Update schemas, weeklyAgenda query |
| `src/app/(admin)/admin/events/new/page.tsx` | Recurrence UI |
| `src/app/(admin)/admin/events/[id]/page.tsx` | Recurrence UI |
| `src/components/weekly-agenda.tsx` | Use new router output |
| `src/components/weekly-agenda-client.tsx` | Accent color fix, recurrence badge |
