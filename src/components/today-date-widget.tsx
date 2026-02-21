// Server component — renders current date in Moscow timezone
export function TodayDateWidget() {
  const now = new Date();

  const dayOfWeek = now.toLocaleDateString("ru-RU", {
    weekday: "long",
    timeZone: "Europe/Moscow",
  });

  const day = now.toLocaleDateString("ru-RU", {
    day: "numeric",
    timeZone: "Europe/Moscow",
  });

  const month = now.toLocaleDateString("ru-RU", {
    month: "long",
    timeZone: "Europe/Moscow",
  });

  const year = now.toLocaleDateString("ru-RU", {
    year: "numeric",
    timeZone: "Europe/Moscow",
  });

  // Capitalize first letter of day name
  const dayName = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {dayName}
      </p>
      <p className="mt-0.5 text-3xl font-bold tabular-nums leading-none">
        {day}
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        {month} {year}
      </p>
    </div>
  );
}
