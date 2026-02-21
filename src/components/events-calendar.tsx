"use client";

import { useMemo, useState } from "react";

import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

// ============================================================================
// Types
// ============================================================================

interface EventItem {
  id: string;
  title: string;
  eventAllDay: boolean;
  eventStartAt: Date | null;
  eventEndAt: Date | null;
  eventLocation: string | null;
  eventRecurrenceType: string | null;
  eventRecurrenceRule: string | null;
  occurrenceDate: string;
}

// ============================================================================
// Helpers
// ============================================================================

const WEEKDAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

function getMoscowToday(): { year: number; month: number; day: number } {
  const d = new Date(Date.now() + MOSCOW_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1, // 1-based
    day: d.getUTCDate(),
  };
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Returns 0=Mon...6=Sun for the 1st of given month */
function getFirstDayOfWeek(year: number, month: number): number {
  const jsDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0
}

function formatTime(isoDate: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(isoDate);
}

function formatOccurrenceDateLabel(occurrenceDate: string, today: { year: number; month: number; day: number }): string {
  const [y, m, d] = occurrenceDate.split("-").map(Number) as [number, number, number];
  const isToday = y === today.year && m === today.month && d === today.day;
  if (isToday) return "Сегодня";

  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  if (y === tomorrow.getUTCFullYear() && m === tomorrow.getUTCMonth() + 1 && d === tomorrow.getUTCDate()) {
    return "Завтра";
  }

  // e.g. "20 февраля"
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function formatWeekdayLabel(occurrenceDate: string): string {
  const [y, m, d] = occurrenceDate.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

// ============================================================================
// MiniCalendar
// ============================================================================

interface MiniCalendarProps {
  year: number;
  month: number; // 1-based
  eventDates: Set<string>; // YYYY-MM-DD
  selectedDate: string | null;
  today: { year: number; month: number; day: number };
  onSelectDate: (date: string | null) => void;
}

function MiniCalendar({ year, month, eventDates, selectedDate, today, onSelectDate }: MiniCalendarProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  // Build grid: leading empty cells + days
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDayOfWeek }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div className="select-none">
      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={cn(
              "text-muted-foreground py-1 text-[11px] font-medium uppercase tracking-wide",
              i >= 5 && "text-muted-foreground/60"
            )}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} />;

          const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
          const isToday = today.year === year && today.month === month && today.day === day;
          const hasEvent = eventDates.has(dateStr);
          const isSelected = selectedDate === dateStr;
          const isWeekend = (firstDayOfWeek + day - 1) % 7 >= 5;

          return (
            <button
              key={day}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              className={cn(
                "relative flex flex-col items-center justify-start rounded-md py-1 text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isWeekend && !isToday && !isSelected && "text-muted-foreground",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                isToday && !isSelected && "bg-primary/10 text-primary font-semibold"
              )}
            >
              <span className="leading-6">{day}</span>
              {hasEvent && (
                <span
                  className={cn(
                    "mt-0.5 h-1 w-1 rounded-full",
                    isSelected ? "bg-primary-foreground/70" : "bg-primary"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// EventsList
// ============================================================================

interface EventsListProps {
  events: EventItem[];
  today: { year: number; month: number; day: number };
  selectedDate: string | null;
}

function EventsList({ events, today, selectedDate }: EventsListProps) {
  const filtered = selectedDate ? events.filter((e) => e.occurrenceDate === selectedDate) : events;

  if (filtered.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center py-16 text-center text-sm">
        {selectedDate ? "Нет событий в этот день" : "В этом месяце событий нет"}
      </div>
    );
  }

  // Group by occurrenceDate
  const grouped = new Map<string, EventItem[]>();
  for (const event of filtered) {
    const group = grouped.get(event.occurrenceDate) ?? [];
    group.push(event);
    grouped.set(event.occurrenceDate, group);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([date, dayEvents]) => {
        const dayLabel = formatOccurrenceDateLabel(date, today);
        const weekdayLabel = formatWeekdayLabel(date);

        return (
          <div key={date}>
            {/* Date header */}
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-foreground text-sm font-semibold capitalize">{dayLabel}</span>
              <span className="text-muted-foreground text-xs capitalize">{weekdayLabel}</span>
            </div>

            {/* Events for this day */}
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <Link
                  key={`${event.id}-${date}`}
                  href={`/events/${event.id}`}
                  className="hover:border-border/80 hover:bg-muted/30 group block rounded-lg border bg-transparent p-3 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Color accent bar */}
                    <div className="mt-0.5 h-full w-0.5 shrink-0 self-stretch rounded-full bg-primary/40" />

                    <div className="min-w-0 flex-1">
                      <p className="group-hover:text-primary text-sm font-medium leading-snug transition-colors line-clamp-2">
                        {event.title}
                      </p>

                      <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        {event.eventAllDay ? (
                          <span>Весь день</span>
                        ) : event.eventStartAt ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(event.eventStartAt)}
                          </span>
                        ) : null}

                        {event.eventLocation && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{event.eventLocation}</span>
                          </span>
                        )}

                        {event.eventRecurrenceType && event.eventRecurrenceType !== "none" && (
                          <span className="text-muted-foreground/70">Повторяется</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Client Component
// ============================================================================

export function EventsCalendar() {
  const moscowToday = getMoscowToday();

  const [year, setYear] = useState(moscowToday.year);
  const [month, setMonth] = useState(moscowToday.month);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: events = [], isLoading } = api.publications.monthlyEvents.useQuery(
    { year, month },
    { staleTime: 60_000 }
  );

  const eventDates = useMemo(
    () => new Set(events.map((e) => e.occurrenceDate)),
    [events]
  );

  function prevMonth() {
    setSelectedDate(null);
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    setSelectedDate(null);
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function prevYear() { setSelectedDate(null); setYear(y => y - 1); }
  function nextYear() { setSelectedDate(null); setYear(y => y + 1); }

  const isCurrentMonth = year === moscowToday.year && month === moscowToday.month;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      {/* Left: Calendar + nav */}
      <div className="lg:w-72 lg:shrink-0">
        {/* Month/Year navigation */}
        <div className="mb-4 flex items-center justify-between gap-1">
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevYear} title="Предыдущий год">
              <ChevronLeft className="h-3.5 w-3.5" />
              <ChevronLeft className="-ml-2.5 h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth} title="Предыдущий месяц">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </div>

          <button
            onClick={() => {
              setYear(moscowToday.year);
              setMonth(moscowToday.month);
              setSelectedDate(null);
            }}
            className={cn(
              "flex-1 text-center text-sm font-semibold",
              !isCurrentMonth && "text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            )}
          >
            {MONTH_NAMES[month - 1]} {year}
          </button>

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth} title="Следующий месяц">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextYear} title="Следующий год">
              <ChevronRight className="h-3.5 w-3.5" />
              <ChevronRight className="-ml-2.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Calendar grid */}
        <MiniCalendar
          year={year}
          month={month}
          eventDates={eventDates}
          selectedDate={selectedDate}
          today={moscowToday}
          onSelectDate={setSelectedDate}
        />

        {/* Legend */}
        {eventDates.size > 0 && (
          <p className="text-muted-foreground mt-3 text-center text-xs">
            {eventDates.size === 1 ? "1 день с событиями" : `${eventDates.size} дней с событиями`}
          </p>
        )}
      </div>

      {/* Right: Events list */}
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {selectedDate
              ? formatOccurrenceDateLabel(selectedDate, moscowToday)
              : `${MONTH_NAMES[month - 1]} ${year}`}
          </h2>
          {selectedDate && (
            <button
              onClick={() => setSelectedDate(null)}
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              Показать все
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                <div className="bg-muted h-16 w-full animate-pulse rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <EventsList events={events} today={moscowToday} selectedDate={selectedDate} />
        )}
      </div>
    </div>
  );
}
