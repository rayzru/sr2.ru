import { RRule } from "rrule";

import { buildRRuleDtstart, toMoscowDateStr } from "~/lib/date-utils";
import { api } from "~/trpc/server";

import { type AgendaDay, type WeekDay, WeeklyAgendaClient } from "./weekly-agenda-client";

function getDayName(dateStr: string): string {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" }).format(
    new Date(dateStr + "T12:00:00Z")
  );
}

function getDayNumber(dateStr: string): number {
  return parseInt(dateStr.slice(8, 10), 10);
}

export async function WeeklyAgenda() {
  const agenda = await api.publications.weeklyAgenda();

  // Compute Monday of current week in Moscow time
  const now = new Date();
  const todayStr = toMoscowDateStr(now);

  const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
  const nowMoscow = new Date(now.getTime() + MOSCOW_OFFSET_MS);
  const dayOfWeek = nowMoscow.getUTCDay(); // 0=Sun, 1=Mon...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(nowMoscow.getTime() + diffToMonday * 24 * 60 * 60 * 1000);

  // 14 days: current week + next week
  const weekDays: WeekDay[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(monday.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    return {
      dateStr,
      dayName: getDayName(dateStr),
      dayNum: getDayNumber(dateStr),
      isToday: dateStr === todayStr,
      isWeekend: i % 7 >= 5, // Сб=5, Вс=6 within each week row
    };
  });

  // Assign a color index to each unique event (by id)
  const eventColorMap = new Map<string, number>();
  let colorCounter = 0;
  for (const { events } of agenda) {
    for (const event of events) {
      if (!eventColorMap.has(event.id)) {
        eventColorMap.set(event.id, colorCounter++);
      }
    }
  }

  // dotMap: dateStr → array of colorIndex
  const weekDays14Strs = weekDays.map(({ dateStr }) => dateStr);

  const dotMap: Record<string, number[]> = {};
  // eventDateMap: eventId → dateStr[] (all dates this event has a dot on, for hover highlight)
  const eventDateMap: Record<string, string[]> = {};

  // Track which events have already had their extra dates added (for all-day range & recurrence)
  const processedEventExtraDates = new Set<string>();

  const windowStart = new Date(monday.getTime());
  const windowEnd = new Date(monday.getTime() + 14 * 24 * 60 * 60 * 1000);

  for (const { date, events } of agenda) {
    for (const event of events) {
      const colorIdx = eventColorMap.get(event.id) ?? 0;

      // All-day range events: handle dots + eventDateMap once via expansion below,
      // not per-day (router returns the event on every day of the range, causing duplicates)
      const isAllDayRange = event.eventAllDay && !!event.eventEndAt;
      const isRecurring = !!event.eventRecurrenceType && event.eventRecurrenceType !== "none";

      if (!isAllDayRange && !isRecurring) {
        // Single-day or timed events: mark dot on this day normally
        if (!dotMap[date]) dotMap[date] = [];
        dotMap[date]?.push(colorIdx);

        if (!eventDateMap[event.id]) eventDateMap[event.id] = [];
        eventDateMap[event.id]?.push(date);
      }

      // For all-day range events: mark dots on every day in [startDate, endDate] exactly once
      if (isAllDayRange && event.eventStartAt && !processedEventExtraDates.has(event.id)) {
        processedEventExtraDates.add(event.id);
        const startDay = toMoscowDateStr(event.eventStartAt);
        const endDay = toMoscowDateStr(event.eventEndAt!);
        if (!eventDateMap[event.id]) eventDateMap[event.id] = [];
        for (const dateStr of weekDays14Strs) {
          if (dateStr >= startDay && dateStr <= endDay) {
            if (!dotMap[dateStr]) dotMap[dateStr] = [];
            dotMap[dateStr]?.push(colorIdx);
            eventDateMap[event.id]?.push(dateStr);
          }
        }
      }

      // For recurring events with RRULE: mark dots on all occurrences in the 2-week window
      if (isRecurring && event.eventStartAt && event.eventRecurrenceRule && !processedEventExtraDates.has(event.id)) {
        processedEventExtraDates.add(event.id);
        const ruleOptions = RRule.parseString(event.eventRecurrenceRule);
        ruleOptions.dtstart = buildRRuleDtstart(event.eventStartAt);
        const rule = new RRule(ruleOptions);
        const occurrences = rule.between(windowStart, windowEnd, true);

        const durationMs = event.eventEndAt
          ? event.eventEndAt.getTime() - event.eventStartAt.getTime()
          : 0;

        if (!eventDateMap[event.id]) eventDateMap[event.id] = [];

        for (const occ of occurrences) {
          const occDateStr = toMoscowDateStr(occ);
          if (weekDays14Strs.includes(occDateStr)) {
            if (!dotMap[occDateStr]) dotMap[occDateStr] = [];
            dotMap[occDateStr]?.push(colorIdx);
            if (!eventDateMap[event.id]?.includes(occDateStr)) {
              eventDateMap[event.id]?.push(occDateStr);
            }
          }
          // Mark duration range (e.g. monthly 20–25)
          if (durationMs > 0) {
            let d = new Date(occ.getTime() + 24 * 60 * 60 * 1000);
            const occEnd = new Date(occ.getTime() + durationMs);
            while (d <= occEnd) {
              const dStr = toMoscowDateStr(d);
              if (weekDays14Strs.includes(dStr)) {
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
    }
  }

  // For all-day range events: show card only once (on earliest visible day).
  // Dots cover all days in range (handled above via dotMap/eventDateMap).
  const shownInAgenda = new Set<string>();

  // Serialize agenda for client — deduplicate multi-day all-day events
  const clientAgendaMap: Record<string, ReturnType<typeof buildAgendaEvent>[]> = {};

  function buildAgendaEvent(event: (typeof agenda)[number]["events"][number]) {
    return {
      id: event.id,
      title: event.title,
      eventAllDay: event.eventAllDay,
      eventStartAt: event.eventStartAt ? event.eventStartAt.toISOString() : null,
      eventEndAt: event.eventEndAt ? event.eventEndAt.toISOString() : null,
      eventLocation: event.eventLocation ?? null,
      eventRecurrenceType: event.eventRecurrenceType ?? null,
      eventRecurrenceRule: event.eventRecurrenceRule ?? null,
      colorIndex: eventColorMap.get(event.id) ?? 0,
    };
  }

  for (const { date, events } of agenda) {
    for (const event of events) {
      // All-day range events: only show card on the first day they appear in the window
      if (event.eventAllDay && event.eventEndAt) {
        if (shownInAgenda.has(event.id)) continue;
        shownInAgenda.add(event.id);
      }
      if (!clientAgendaMap[date]) clientAgendaMap[date] = [];
      clientAgendaMap[date]?.push(buildAgendaEvent(event));
    }
  }

  const clientAgenda: AgendaDay[] = Object.entries(clientAgendaMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, events]) => events.length > 0)
    .map(([date, events]) => ({ date, events }));

  return (
    <section>
      <WeeklyAgendaClient
        weekDays={weekDays}
        agenda={clientAgenda}
        dotMap={dotMap}
        todayStr={todayStr}
        eventDateMap={eventDateMap}
      />
    </section>
  );
}
