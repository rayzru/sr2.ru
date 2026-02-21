import { Users, Newspaper, MessageSquare } from "lucide-react";

interface StatsSummary {
  usersCount: number;
  newsLast30: number;
  publicationsLast30: number;
}

export function StatsWidget({ stats }: { stats: StatsSummary }) {
  const items = [
    {
      icon: Users,
      label: "Жителей",
      value: stats.usersCount.toLocaleString("ru-RU"),
    },
    {
      icon: Newspaper,
      label: "Новостей за месяц",
      value: stats.newsLast30.toLocaleString("ru-RU"),
    },
    {
      icon: MessageSquare,
      label: "Публикаций за месяц",
      value: stats.publicationsLast30.toLocaleString("ru-RU"),
    },
  ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
        Сообщество
      </p>
      <div className="space-y-3">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </div>
            <span className="text-foreground text-sm font-semibold tabular-nums">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
