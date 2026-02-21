# Recurring Events (RRULE) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace flat recurrence columns with a single RRULE string field, update the weeklyAgenda query to correctly expand recurring events, and redesign the admin recurrence UI to derive from date pickers.

**Architecture:** Add `eventRecurrenceRule: varchar(500)` to the publications table; remove 4 redundant flat columns; use the `rrule` npm package in the tRPC router to expand RRULE strings into occurrences within the 14-day window; fix accent color hover in WeeklyAgendaClient.

**Tech Stack:** Drizzle ORM + PostgreSQL migration, `rrule` npm package, `date-fns-tz` (already installed as `date-fns`), tRPC 11, React 19, TailwindCSS 4, motion/react.

**Design doc:** `docs/plans/2026-02-19-recurring-events-rrule-design.md`

---

## Task 1: Install rrule package

**Files:**
- Modify: `package.json` (via bun)

**Step 1: Install**

```bash
bun add rrule
```

**Step 2: Verify types are available**

```bash
bun tsc --noEmit --skipLibCheck 2>&1 | grep rrule || echo "OK"
```

Expected: no rrule errors.

**Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add rrule package for recurring event expansion"
```

---

## Task 2: Schema — add eventRecurrenceRule, remove 4 redundant fields

**Files:**
- Modify: `src/server/db/schemas/publications.ts`
- Create: `drizzle/0005_recurrence_rrule.sql`
- Modify: `drizzle/meta/_journal.json`

**Step 1: Update Drizzle schema**

In `src/server/db/schemas/publications.ts`, find the recurrence fields block (around line 138–150) and replace:

```typescript
// ========== Event Recurrence (повторяющиеся события) ==========
// Тип повторения
eventRecurrenceType: eventRecurrenceTypeEnum("event_recurrence_type").default("none"),
// Интервал повторения (каждые N дней/недель/месяцев)
eventRecurrenceInterval: integer("event_recurrence_interval").default(1),
// День недели для еженедельных (0-6, воскресенье-суббота)
eventRecurrenceDayOfWeek: integer("event_recurrence_day_of_week"),
// День месяца для начала периода (для ежемесячных, например 18)
eventRecurrenceStartDay: integer("event_recurrence_start_day"),
// День месяца для конца периода (для ежемесячных, например 26)
eventRecurrenceEndDay: integer("event_recurrence_end_day"),
// Дата окончания повторений (null = бессрочно)
eventRecurrenceUntil: timestamp("event_recurrence_until", { withTimezone: true }),
```

With:

```typescript
// ========== Event Recurrence (повторяющиеся события) ==========
// Тип повторения — для быстрой фильтрации без парсинга RRULE
eventRecurrenceType: eventRecurrenceTypeEnum("event_recurrence_type").default("none"),
// RRULE строка (RFC 5545) — источник истины для паттерна повторения
// Примеры:
//   ежемесячно 20–25:  "FREQ=MONTHLY;BYMONTHDAY=20"
//   еженедельно пт:    "FREQ=WEEKLY;BYDAY=FR"
//   ежегодно 15 сен:   "FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=15"
eventRecurrenceRule: varchar("event_recurrence_rule", { length: 500 }),
// Дата окончания повторений (null = бессрочно) — для SQL фильтрации без парсинга RRULE
eventRecurrenceUntil: timestamp("event_recurrence_until", { withTimezone: true }),
```

Also remove `EventRecurrenceType` from the exports at the bottom if it's still there (it stays — the enum is kept).

**Step 2: Create migration file**

Create `drizzle/0005_recurrence_rrule.sql`:

```sql
ALTER TABLE "publication" ADD COLUMN "event_recurrence_rule" varchar(500);
ALTER TABLE "publication" DROP COLUMN IF EXISTS "event_recurrence_interval";
ALTER TABLE "publication" DROP COLUMN IF EXISTS "event_recurrence_day_of_week";
ALTER TABLE "publication" DROP COLUMN IF EXISTS "event_recurrence_start_day";
ALTER TABLE "publication" DROP COLUMN IF EXISTS "event_recurrence_end_day";
```

**Step 3: Update journal**

In `drizzle/meta/_journal.json`, add entry after idx 4:

```json
{
  "idx": 5,
  "version": "7",
  "when": 1771500000000,
  "tag": "0005_recurrence_rrule",
  "breakpoints": true
}
```

**Step 4: Apply migration to local DB**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:5432/sr2-community" \
  -f drizzle/0005_recurrence_rrule.sql
```

Expected output:
```
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
```

**Step 5: Verify schema**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:5432/sr2-community" \
  -c "\d publication" | grep -E "event_recurrence"
```

Expected: only `event_recurrence_type`, `event_recurrence_rule`, `event_recurrence_until` columns — no interval/day_of_week/start_day/end_day.

**Step 6: Commit**

```bash
git add src/server/db/schemas/publications.ts drizzle/0005_recurrence_rrule.sql drizzle/meta/_journal.json
git commit -m "feat(schema): replace flat recurrence columns with RRULE string field"
```

---

## Task 3: Shared date utilities

**Files:**
- Create: `src/lib/date-utils.ts`

**Step 1: Create utility file**

```typescript
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
```

**Step 2: Verify no TS errors**

```bash
bun run check 2>&1 | head -20
```

Expected: 0 errors related to date-utils.ts.

**Step 3: Commit**

```bash
git add src/lib/date-utils.ts
git commit -m "feat: add Moscow timezone date utilities for RRULE integration"
```

---

## Task 4: Update tRPC router — schemas and weeklyAgenda

**Files:**
- Modify: `src/server/api/routers/publications.ts`

**Step 1: Update imports at top of router**

Add after existing imports:

```typescript
import { RRule } from "rrule";
import { buildRRuleDtstart, toMoscowDateStr } from "~/lib/date-utils";
```

**Step 2: Replace eventFieldsSchema recurrence fields (lines ~51–57)**

Remove:
```typescript
eventRecurrenceInterval: z.number().int().min(1).max(365).optional(),
eventRecurrenceDayOfWeek: z.number().int().min(0).max(6).optional(),
eventRecurrenceStartDay: z.number().int().min(1).max(31).optional(),
eventRecurrenceEndDay: z.number().int().min(1).max(31).optional(),
```

Replace the entire recurrence block in `eventFieldsSchema` with:
```typescript
// Recurrence fields
eventRecurrenceType: eventRecurrenceTypeSchema.optional(),
eventRecurrenceRule: z.string().max(500).optional(),
eventRecurrenceUntil: z.date().optional(),
linkedArticleId: z.string().uuid().optional(),
```

**Step 3: Replace recurrence fields in updatePublicationSchema (lines ~122–127)**

Remove:
```typescript
eventRecurrenceInterval: z.number().int().min(1).max(365).nullable().optional(),
eventRecurrenceDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
eventRecurrenceStartDay: z.number().int().min(1).max(31).nullable().optional(),
eventRecurrenceEndDay: z.number().int().min(1).max(31).nullable().optional(),
```

Replace with:
```typescript
eventRecurrenceRule: z.string().max(500).nullable().optional(),
```

**Step 4: Update create mutation insert**

Find the event recurrence fields in the create mutation insert (around line 354) and replace the 4 removed fields with `eventRecurrenceRule`:

```typescript
// Remove these lines:
eventRecurrenceInterval: input.eventRecurrenceInterval,
eventRecurrenceDayOfWeek: input.eventRecurrenceDayOfWeek,
eventRecurrenceStartDay: input.eventRecurrenceStartDay,
eventRecurrenceEndDay: input.eventRecurrenceEndDay,

// Add this line:
eventRecurrenceRule: input.eventRecurrenceRule,
```

**Step 5: Update update mutation similarly**

Find the update mutation and replace the same 4 field assignments with:
```typescript
eventRecurrenceRule: input.eventRecurrenceRule,
```

**Step 6: Replace the weeklyAgenda procedure**

Find and replace the entire `weeklyAgenda` procedure (lines 746–816) with:

```typescript
weeklyAgenda: publicProcedure.query(async ({ ctx }) => {
  const now = new Date();
  const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const DAY_MS = 24 * 60 * 60 * 1000;

  const items = await ctx.db.query.publications.findMany({
    where: and(
      eq(publications.status, "published"),
      eq(publications.type, "event"),
      or(isNull(publications.publishAt), lte(publications.publishAt, now)),
      or(
        // Non-recurring: falls within the 14-day window
        and(
          or(
            eq(publications.eventRecurrenceType, "none"),
            isNull(publications.eventRecurrenceType),
          ),
          lte(publications.eventStartAt, twoWeeksLater),
          or(
            gte(publications.eventEndAt, now),
            and(isNull(publications.eventEndAt), gte(publications.eventStartAt, now)),
          ),
        ),
        // Recurring: series has not ended
        and(
          not(eq(publications.eventRecurrenceType, "none")),
          isNotNull(publications.eventRecurrenceType),
          or(
            isNull(publications.eventRecurrenceUntil),
            gte(publications.eventRecurrenceUntil, now),
          ),
        ),
      ),
    ),
    with: {
      author: { columns: { id: true, name: true, image: true } },
      building: true,
    },
    orderBy: [publications.eventStartAt],
  });

  // Group events by Moscow-local date
  const grouped: Record<string, typeof items> = {};

  const addToDay = (day: string, event: (typeof items)[number]) => {
    if (!grouped[day]) grouped[day] = [];
    if (!grouped[day]?.some((e) => e.id === event.id)) {
      grouped[day]?.push(event);
    }
  };

  const nowDateStr = toMoscowDateStr(now);
  const twoWeeksLaterStr = toMoscowDateStr(twoWeeksLater);

  for (const event of items) {
    if (!event.eventStartAt) continue;

    // --- Recurring events ---
    if (event.eventRecurrenceType && event.eventRecurrenceType !== "none" && event.eventRecurrenceRule) {
      const ruleOptions = RRule.parseString(event.eventRecurrenceRule);
      ruleOptions.dtstart = buildRRuleDtstart(event.eventStartAt);
      const rule = new RRule(ruleOptions);

      // Expand occurrences within the window
      const occurrences = rule.between(
        // Start from beginning of today (Moscow midnight in UTC)
        new Date(now.getTime() - (now.getTime() % DAY_MS)),
        twoWeeksLater,
        true,
      );
      if (occurrences.length === 0) continue;

      // Place the event on its first (next) occurrence date only — one card in list
      const nextOcc = occurrences[0]!;
      const agendaDate = toMoscowDateStr(nextOcc);
      if (agendaDate >= nowDateStr && agendaDate <= twoWeeksLaterStr) {
        addToDay(agendaDate, event);
      }
      continue;
    }

    // --- Non-recurring: all-day range events ---
    if (event.eventAllDay && event.eventEndAt) {
      const startStr = toMoscowDateStr(event.eventStartAt);
      const endStr = toMoscowDateStr(event.eventEndAt);
      const cursor = new Date(event.eventStartAt);
      while (toMoscowDateStr(cursor) <= endStr) {
        const day = toMoscowDateStr(cursor);
        if (day >= nowDateStr && day <= twoWeeksLaterStr) {
          addToDay(day, event);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      void startStr; // used implicitly via cursor init
      continue;
    }

    // --- Non-recurring: single timed event ---
    const day = toMoscowDateStr(event.eventStartAt);
    addToDay(day, event);
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => ({ date, events }));
}),
```

**Step 7: Run typecheck**

```bash
bun run check 2>&1 | head -40
```

Expected: 0 errors. If errors about `not` or `isNotNull`, add to imports from `drizzle-orm`.

**Step 8: Commit**

```bash
git add src/server/api/routers/publications.ts
git commit -m "feat(router): update weeklyAgenda to expand RRULE recurring events"
```

---

## Task 5: Fix accent color hover in WeeklyAgendaClient

**Files:**
- Modify: `src/components/weekly-agenda-client.tsx`

**Step 1: Add hoveredEventColor state**

Find the existing state declarations (around line 67–68):
```typescript
const [hoveredDate, setHoveredDate] = useState<string | null>(null);
const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
```

Add after:
```typescript
const [hoveredEventColor, setHoveredEventColor] = useState<string | null>(null);
```

**Step 2: Update event card mouse handlers**

Find `onMouseEnter={() => setHoveredEventId(event.id)}` (around line 225) and replace with:
```typescript
onMouseEnter={() => {
  setHoveredEventId(event.id);
  setHoveredEventColor(color.hex);
}}
onMouseLeave={() => {
  setHoveredEventId(null);
  setHoveredEventColor(null);
}}
```

Remove the existing `onMouseLeave={() => setHoveredEventId(null)}`.

**Step 3: Fix date circle boxShadow to use accent color**

Find the `motion.div` animate for the date circle (around line 121–127):
```typescript
animate={
  isHighlighted
    ? { scale: 1.15, boxShadow: "0 0 0 2px currentColor" }
    : isHovered
      ? { scale: 1.08 }
      : { scale: 1, boxShadow: "none" }
}
```

Replace with:
```typescript
animate={
  isHighlighted
    ? {
        scale: 1.15,
        boxShadow: `0 0 0 2px ${hoveredEventColor ?? "#f59e0b"}`,
      }
    : isHovered
      ? { scale: 1.08 }
      : { scale: 1, boxShadow: "none" }
}
```

**Step 4: Run typecheck**

```bash
bun run check 2>&1 | head -20
```

**Step 5: Commit**

```bash
git add src/components/weekly-agenda-client.tsx
git commit -m "fix(calendar): use event accent color for date highlight on hover"
```

---

## Task 6: Update server component to pass recurrence info to client

**Files:**
- Modify: `src/components/weekly-agenda.tsx`

**Step 1: Add eventRecurrenceRule and eventRecurrenceType to AgendaEvent interface**

In `src/components/weekly-agenda-client.tsx`, update the `AgendaEvent` interface (around line 26):

```typescript
export interface AgendaEvent {
  id: string;
  title: string;
  eventAllDay: boolean;
  eventStartAt: string | null;
  eventEndAt: string | null;
  eventLocation: string | null;
  eventRecurrenceType: string | null;
  eventRecurrenceRule: string | null;   // ← add
  eventRecurrenceStartDay: number | null; // ← remove (no longer in schema)
  eventRecurrenceEndDay: number | null;   // ← remove
  colorIndex: number;
}
```

Replace the full interface with:
```typescript
export interface AgendaEvent {
  id: string;
  title: string;
  eventAllDay: boolean;
  eventStartAt: string | null;
  eventEndAt: string | null;
  eventLocation: string | null;
  eventRecurrenceType: string | null;
  eventRecurrenceRule: string | null;
  colorIndex: number;
}
```

**Step 2: Update server component serialization**

In `src/components/weekly-agenda.tsx`, update the `clientAgenda` map (around line 125–138):

Replace:
```typescript
eventRecurrenceType: event.eventRecurrenceType ?? null,
eventRecurrenceStartDay: event.eventRecurrenceStartDay ?? null,
eventRecurrenceEndDay: event.eventRecurrenceEndDay ?? null,
```

With:
```typescript
eventRecurrenceType: event.eventRecurrenceType ?? null,
eventRecurrenceRule: event.eventRecurrenceRule ?? null,
```

**Step 3: Update dotMap logic in server component**

In `src/components/weekly-agenda.tsx`, the dotMap section currently uses `eventRecurrenceStartDay`/`eventRecurrenceEndDay` (around lines 104–120). Replace the monthly recurrence block with RRULE-based dot expansion:

Find:
```typescript
// For monthly recurrence with a day range, mark dots on all days in range
if (
  event.eventRecurrenceType === "monthly" &&
  event.eventRecurrenceStartDay &&
  event.eventRecurrenceEndDay
) {
  const start = event.eventRecurrenceStartDay;
  const end = event.eventRecurrenceEndDay;
  for (const { dateStr, dayNum } of weekDayNums) {
    if (dateStr === date) continue;
    if (dayNum >= start && dayNum <= end) {
      if (!dotMap[dateStr]) dotMap[dateStr] = [];
      dotMap[dateStr]?.push(colorIdx);
      eventDateMap[event.id]?.push(dateStr);
    }
  }
}
```

Replace with:
```typescript
// For recurring events with RRULE: mark dots on all occurrences in the 2-week window
if (
  event.eventRecurrenceType &&
  event.eventRecurrenceType !== "none" &&
  event.eventRecurrenceRule &&
  !processedEventExtraDates.has(event.id)
) {
  processedEventExtraDates.add(event.id);
  const { RRule } = await import("rrule");
  const { buildRRuleDtstart } = await import("~/lib/date-utils");
  const ruleOptions = RRule.parseString(event.eventRecurrenceRule);
  ruleOptions.dtstart = buildRRuleDtstart(event.eventStartAt);
  const rule = new RRule(ruleOptions);
  const windowStart = new Date(monday.getTime());
  const windowEnd = new Date(monday.getTime() + 14 * 24 * 60 * 60 * 1000);
  const occurrences = rule.between(windowStart, windowEnd, true);

  const durationMs =
    event.eventEndAt ? event.eventEndAt.getTime() - event.eventStartAt.getTime() : 0;

  for (const occ of occurrences) {
    const occDateStr = toMoscowDateStr(occ);
    if (occDateStr !== date) {
      if (!dotMap[occDateStr]) dotMap[occDateStr] = [];
      dotMap[occDateStr]?.push(colorIdx);
      eventDateMap[event.id]?.push(occDateStr);
    }
    // Mark duration range (e.g. monthly 20–25)
    if (durationMs > 0) {
      let d = new Date(occ.getTime() + 24 * 60 * 60 * 1000);
      const occEnd = new Date(occ.getTime() + durationMs);
      while (d <= occEnd) {
        const dStr = toMoscowDateStr(d);
        if (dStr !== date && weekDays.some((w) => w.dateStr === dStr)) {
          if (!dotMap[dStr]) dotMap[dStr] = [];
          dotMap[dStr]?.push(colorIdx);
          if (!eventDateMap[event.id]?.includes(dStr)) {
            eventDateMap[event.id]?.push(dStr);
          }
        }
        d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      }
    }
  }
}
```

Also add import at top of `weekly-agenda.tsx`:
```typescript
import { toMoscowDateStr } from "~/lib/date-utils";
```

And remove the `TZ_OFFSET_MS` constant and its usages — replace them all with `toMoscowDateStr()`.

**Step 4: Run typecheck**

```bash
bun run check 2>&1 | head -40
```

**Step 5: Commit**

```bash
git add src/components/weekly-agenda.tsx src/components/weekly-agenda-client.tsx
git commit -m "feat(calendar): use RRULE for dot expansion in weekly agenda strip"
```

---

## Task 7: Admin form — new event page recurrence UI

**Files:**
- Modify: `src/app/(admin)/admin/events/new/page.tsx`

**Step 1: Update state — replace old recurrence state with new**

Find and remove:
```typescript
const [eventRecurrenceStartDay, setEventRecurrenceStartDay] = useState<string>("");
const [eventRecurrenceEndDay, setEventRecurrenceEndDay] = useState<string>("");
```

Add instead:
```typescript
const [eventRecurrenceRule, setEventRecurrenceRule] = useState<string>("");
const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);
const [recurrenceUntilEnabled, setRecurrenceUntilEnabled] = useState(false);
```

**Step 2: Add buildRRuleString import**

Add to imports:
```typescript
import { buildRRuleString } from "~/lib/date-utils";
```

**Step 3: Add computed RRULE generation effect**

Add a `useEffect` that recalculates `eventRecurrenceRule` whenever relevant deps change:

```typescript
useEffect(() => {
  if (
    !eventRecurrenceType ||
    eventRecurrenceType === "none" ||
    !eventStartAt
  ) {
    setEventRecurrenceRule("");
    return;
  }

  const rule = buildRRuleString({
    type: eventRecurrenceType as "weekly" | "monthly" | "yearly",
    startAt: eventStartAt,
    selectedWeekdays: eventRecurrenceType === "weekly" ? recurrenceWeekdays : undefined,
    until: recurrenceUntilEnabled && eventRecurrenceUntil ? eventRecurrenceUntil : null,
  });
  setEventRecurrenceRule(rule);
}, [eventRecurrenceType, eventStartAt, recurrenceWeekdays, recurrenceUntilEnabled, eventRecurrenceUntil]);
```

**Step 4: Replace old recurrence UI with new**

Find the recurrence card section (the card that contains `eventRecurrenceStartDay` inputs) and replace the entire recurrence card content with:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Повторение</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Type selector */}
    <div className="space-y-2">
      <Label>Тип повторения</Label>
      <Select
        value={eventRecurrenceType ?? "none"}
        onValueChange={(v) => setEventRecurrenceType(v as EventRecurrenceType)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Без повторения</SelectItem>
          <SelectItem
            value="monthly"
            disabled={
              !eventStartAt ||
              !eventEndAt ||
              toMoscowLocalParts(eventStartAt).month !== toMoscowLocalParts(eventEndAt).month
            }
          >
            Ежемесячно
          </SelectItem>
          <SelectItem
            value="weekly"
            disabled={
              !eventStartAt ||
              (!!eventEndAt &&
                toMoscowLocalParts(eventStartAt).day !== toMoscowLocalParts(eventEndAt).day &&
                eventEndAt.getTime() - eventStartAt.getTime() > 7 * 24 * 60 * 60 * 1000)
            }
          >
            Еженедельно
          </SelectItem>
          <SelectItem value="yearly" disabled={!eventStartAt}>
            Ежегодно
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* Monthly: show computed period */}
    {eventRecurrenceType === "monthly" && eventStartAt && (
      <div className="text-muted-foreground rounded-md bg-muted/50 p-3 text-sm">
        {eventEndAt && eventStartAt.getDate() !== eventEndAt.getDate()
          ? `${eventStartAt.getDate()} — ${eventEndAt.getDate()} числа каждого месяца`
          : `${eventStartAt.getDate()} числа каждого месяца`}
      </div>
    )}

    {/* Weekly: day-of-week picker */}
    {eventRecurrenceType === "weekly" && (
      <div className="space-y-2">
        <Label>Дни недели</Label>
        <div className="flex gap-1">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setRecurrenceWeekdays((prev) =>
                  prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx],
                );
              }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                recurrenceWeekdays.includes(idx)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    )}

    {/* Yearly: show computed date */}
    {eventRecurrenceType === "yearly" && eventStartAt && (
      <div className="text-muted-foreground rounded-md bg-muted/50 p-3 text-sm">
        {new Intl.DateTimeFormat("ru-RU", {
          day: "numeric",
          month: "long",
          timeZone: "Europe/Moscow",
        }).format(eventStartAt)}{" "}
        каждый год
      </div>
    )}

    {/* Until date */}
    {eventRecurrenceType && eventRecurrenceType !== "none" && (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={recurrenceUntilEnabled}
            onCheckedChange={setRecurrenceUntilEnabled}
          />
          <Label>Дата окончания</Label>
        </div>
        {recurrenceUntilEnabled && (
          <DatePicker
            value={eventRecurrenceUntil ?? undefined}
            onChange={(d) => setEventRecurrenceUntil(d ?? null)}
          />
        )}
      </div>
    )}

    {/* Debug: show generated RRULE */}
    {eventRecurrenceRule && (
      <p className="text-muted-foreground font-mono text-xs">{eventRecurrenceRule}</p>
    )}
  </CardContent>
</Card>
```

**Step 5: Add toMoscowLocalParts import**

Add to imports from `~/lib/date-utils`:
```typescript
import { buildRRuleString, toMoscowLocalParts } from "~/lib/date-utils";
```

**Step 6: Update mutation call**

In the `createMutation.mutate(...)` call, replace old fields with:
```typescript
eventRecurrenceRule: eventRecurrenceRule || undefined,
// Remove: eventRecurrenceStartDay, eventRecurrenceEndDay
```

**Step 7: Run typecheck**

```bash
bun run check 2>&1 | head -40
```

**Step 8: Commit**

```bash
git add "src/app/(admin)/admin/events/new/page.tsx"
git commit -m "feat(admin): redesign recurrence UI — derive from date pickers, RRULE output"
```

---

## Task 8: Admin form — edit event page recurrence UI

**Files:**
- Modify: `src/app/(admin)/admin/events/[id]/page.tsx`

Apply the same changes as Task 7 to the edit page:

1. Replace `eventRecurrenceStartDay`/`eventRecurrenceEndDay` state with `eventRecurrenceRule`, `recurrenceWeekdays`, `recurrenceUntilEnabled`
2. Add the `useEffect` for RRULE computation
3. Replace the recurrence card UI with the new one (identical to new page)
4. In the `useEffect` that initializes from server data, set initial state from `event.eventRecurrenceRule`:
   ```typescript
   // If existing event has RRULE, parse weekdays for weekly events
   if (event.eventRecurrenceType === "weekly" && event.eventRecurrenceRule) {
     const { RRule } = await import("rrule");
     const parsed = RRule.parseString(event.eventRecurrenceRule);
     const DAY_MAP: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
     const days = (parsed.byweekday as number[] | undefined)?.map((d) => d) ?? [];
     setRecurrenceWeekdays(days);
   }
   setRecurrenceUntilEnabled(!!event.eventRecurrenceUntil);
   ```
5. Update mutation call to use `eventRecurrenceRule`
6. Run `bun run check`

**Commit:**
```bash
git add "src/app/(admin)/admin/events/[id]/page.tsx"
git commit -m "feat(admin): update edit event page with RRULE recurrence UI"
```

---

## Task 9: Final verification

**Step 1: Run full typecheck**

```bash
bun run check
```

Expected: 0 errors, 0 warnings.

**Step 2: Run build**

```bash
bun run build 2>&1 | tail -20
```

Expected: successful build, no TS errors.

**Step 3: Manual smoke test**

1. Open http://localhost:3000
2. Create a new monthly event: start=20th, end=25th, recurrence=Monthly
3. Verify admin form shows "20 — 25 числа каждого месяца" and RRULE `FREQ=MONTHLY;BYMONTHDAY=20`
4. Create a weekly event: start=Friday, recurrence=Weekly, select Mon+Fri
5. Verify RRULE `FREQ=WEEKLY;BYDAY=MO,FR`
6. Open homepage — verify calendar strip shows dots on correct dates
7. Hover event card — verify dates highlight with the event's accent color (not black)
8. Verify recurring event card shows only once in the agenda list

**Step 4: Push and update PR**

```bash
git push origin feature/ui-calendar-storybook
```
