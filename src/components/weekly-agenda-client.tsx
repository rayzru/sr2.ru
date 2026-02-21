"use client";

import { useState } from "react";

import { MapPin } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { cn } from "~/lib/utils";

// 7 colors evenly spaced across the hue wheel at 360/7 ≈ 51° apart
// hsl(h, 75%, 52%) — same saturation/lightness, only hue varies
const EVENT_COLORS = [
  "hsl(  0, 75%, 52%)", // red
  "hsl( 51, 75%, 52%)", // yellow-green
  "hsl(103, 75%, 42%)", // green (lightness down slightly — greens read bright)
  "hsl(154, 75%, 42%)", // teal
  "hsl(205, 75%, 52%)", // sky-blue
  "hsl(257, 75%, 62%)", // violet (lightness up — purples read dark)
  "hsl(308, 75%, 55%)", // pink-magenta
] as const;

// eventId → Set of dates this event appears on (for hover highlight)
type EventDateMap = Record<string, string[]>;

export interface AgendaEvent {
  id: string;
  title: string;
  eventAllDay: boolean;
  eventStartAt: string | null; // ISO string
  eventEndAt: string | null; // ISO string
  eventLocation: string | null;
  eventRecurrenceType: string | null;
  eventRecurrenceRule: string | null;
  colorIndex: number;
}

export interface AgendaDay {
  date: string; // YYYY-MM-DD
  events: AgendaEvent[];
}

export interface WeekDay {
  dateStr: string;
  dayName: string;
  dayNum: number;
  isToday: boolean;
  isWeekend: boolean;
}

interface WeeklyAgendaClientProps {
  weekDays: WeekDay[]; // 14 days
  agenda: AgendaDay[];
  dotMap: Record<string, number[]>; // dateStr → colorIndex[]
  todayStr: string;
  eventDateMap: EventDateMap; // eventId → dateStr[]
}

export function WeeklyAgendaClient({
  weekDays,
  agenda,
  dotMap,
  todayStr,
  eventDateMap,
}: WeeklyAgendaClientProps) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [hoveredEventColor, setHoveredEventColor] = useState<string | null>(null);

  // Which dates are highlighted (from hovering an event card)
  const highlightedDates = hoveredEventId ? new Set(eventDateMap[hoveredEventId] ?? []) : null;

  // Which events are highlighted (from hovering a date cell) — ALL events whose dot appears on that date.
  // Uses eventDateMap (eventId → dates[]) in reverse: find all eventIds that include hoveredDate.
  // This correctly handles multi-day all-day events whose card lives on a different day.
  const highlightedEventIds = hoveredDate
    ? new Set(
        Object.entries(eventDateMap)
          .filter(([, dates]) => dates.includes(hoveredDate))
          .map(([eventId]) => eventId)
      )
    : null;

  // Week rows: 2 rows of 7
  const week1 = weekDays.slice(0, 7);
  const week2 = weekDays.slice(7, 14);
  const dayHeaders = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  return (
    <>
      {/* Week strip — 2 weeks */}
      <div className="mb-4 mt-3 select-none">
        {/* Day-of-week header row (shown once) */}
        <div className="mb-1 grid grid-cols-7 gap-1">
          {dayHeaders.map((name, i) => (
            <div key={name} className="flex justify-center">
              <span
                className={cn(
                  "text-[10px] capitalize",
                  i >= 5 ? "text-red-400 dark:text-red-500" : "text-muted-foreground"
                )}
              >
                {name}
              </span>
            </div>
          ))}
        </div>

        {/* Two rows of date cells */}
        {[week1, week2].map((row, rowIdx) => (
          <div key={rowIdx} className="mb-1 grid grid-cols-7 gap-1">
            {row.map(({ dateStr, dayNum, isToday, isWeekend }) => {
              const dots = dotMap[dateStr] ?? [];
              const isHighlighted = highlightedDates?.has(dateStr) ?? false;
              const isHovered = hoveredDate === dateStr;

              return (
                <div
                  key={dateStr}
                  className="flex cursor-default flex-col items-center gap-1 rounded-lg py-1 transition-colors"
                  onMouseEnter={() => setHoveredDate(dateStr)}
                  onMouseLeave={() => setHoveredDate(null)}
                >
                  <motion.div
                    animate={
                      isHighlighted
                        ? {
                            scale: 1.18,
                            boxShadow: `0 0 0 1px ${hoveredEventColor ?? "#f59e0b"}`,
                          }
                        : isHovered
                          ? { scale: 1.12, boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }
                          : { scale: 1, boxShadow: "none" }
                    }
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : isHighlighted
                          ? "bg-muted"
                          : isHovered
                            ? "bg-accent text-accent-foreground"
                            : isWeekend
                              ? "text-red-400 dark:text-red-500"
                              : "text-foreground"
                    )}
                  >
                    {dayNum}
                  </motion.div>
                  {/* Event dots */}
                  <div className="flex h-2 items-center gap-0.5">
                    {dots.slice(0, 3).map((colorIdx, i) => (
                      <motion.div
                        key={i}
                        animate={isHovered || isHighlighted ? { scale: 1.4 } : { scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 20,
                          delay: i * 0.03,
                        }}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: EVENT_COLORS[colorIdx % EVENT_COLORS.length] }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Agenda */}
      {agenda.length === 0 ? (
        <p className="text-muted-foreground mt-2 py-4 text-center text-sm">
          Нет событий на ближайшие две недели
        </p>
      ) : (
        <div className="space-y-4">
          {agenda.map(({ date, events }) => {
            const dayDate = new Date(date + "T00:00:00+03:00");
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

            const isToday = dayDate.toDateString() === today.toDateString();
            const isTomorrow = dayDate.toDateString() === tomorrow.toDateString();

            const dayLabel = isToday ? "Сегодня" : isTomorrow ? "Завтра" : formatDayLabel(dayDate);

            return (
              <div key={date}>
                {/* Day header */}
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      isToday
                        ? "text-red-500"
                        : isTomorrow
                          ? "text-orange-500"
                          : "text-muted-foreground"
                    )}
                  >
                    {dayLabel}
                  </span>
                  <div className="bg-border h-px flex-1" />
                </div>

                {/* Events */}
                <div className="space-y-2">
                  {events.map((event) => {
                    const color = EVENT_COLORS[event.colorIndex % EVENT_COLORS.length]!;
                    const startAt = event.eventStartAt ? new Date(event.eventStartAt) : null;
                    const endAt = event.eventEndAt ? new Date(event.eventEndAt) : null;

                    const isEventHighlighted =
                      (highlightedEventIds?.has(event.id) ?? false) || hoveredEventId === event.id;

                    return (
                      <motion.div
                        key={event.id}
                        animate={
                          isEventHighlighted
                            ? { outline: `2px solid ${color}`, outlineOffset: -1, scale: 1.01 }
                            : { outline: "2px solid transparent", outlineOffset: -1, scale: 1 }
                        }
                        transition={{ duration: 0.15 }}
                        className="rounded-lg"
                        onMouseEnter={() => {
                          setHoveredEventId(event.id);
                          setHoveredEventColor(color);
                        }}
                        onMouseLeave={() => {
                          setHoveredEventId(null);
                          setHoveredEventColor(null);
                        }}
                      >
                        <Link
                          href={`/events/${event.id}`}
                          className={cn(
                            "bg-card group flex overflow-hidden rounded-lg border transition-shadow",
                            isEventHighlighted ? "shadow-lg" : "hover:shadow-sm"
                          )}
                        >
                          {/* Color bar */}
                          <div className="w-1 shrink-0 transition-all" style={{ backgroundColor: color }} />

                          {/* Content */}
                          <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                            {/* Title — primary focus, up to 2 lines */}
                            <p className="group-hover:text-primary line-clamp-2 text-sm font-medium leading-snug transition-colors">
                              {event.title}
                            </p>

                            {/* Bottom row: date/time + location */}
                            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                              {event.eventAllDay && startAt ? (
                                <span>
                                  {endAt && formatDateOnly(startAt) !== formatDateOnly(endAt)
                                    ? `${formatDateOnly(startAt)} — ${formatDateOnly(endAt)}`
                                    : formatDateOnly(startAt)}
                                </span>
                              ) : startAt ? (
                                <span>
                                  {endAt
                                    ? `${formatDateTime(startAt)} — ${formatDateTime(endAt)}`
                                    : formatDateTime(startAt)}
                                </span>
                              ) : null}
                              {event.eventLocation && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  {event.eventLocation}
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function formatDateOnly(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}
