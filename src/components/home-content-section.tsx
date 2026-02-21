import { BookOpen, Newspaper } from "lucide-react";
import Link from "next/link";

import { FeedNewsThumb } from "~/components/feed-news-thumb";

import { StatsWidget } from "~/components/stats-widget";
import { TodayDateWidget } from "~/components/today-date-widget";
import Weather from "~/components/weather";
import { WeeklyAgenda } from "~/components/weekly-agenda";
import { formatRelativeDate } from "~/lib/format-date";
import type { WeatherData } from "~/lib/weather";
import { api } from "~/trpc/server";

// ============================================================================
// Types
// ============================================================================

interface StatsSummary {
  usersCount: number;
  newsLast30: number;
  publicationsLast30: number;
}

type FeedItem =
  | { type: "news"; id: string; title: string; href: string; date: Date; label: string; coverImage: string | null }
  | { type: "publication"; id: string; title: string; href: string; date: Date; label: string }
  | {
      type: "knowledge";
      id: string;
      title: string;
      href: string;
      date: Date;
      label: string;
      icon: string | null;
    };

// ============================================================================
// Thumbnail — 40×40 rounded square
// ============================================================================

function NewsThumbPlaceholder() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/40">
      <Newspaper className="h-5 w-5 text-sky-500 dark:text-sky-400" />
    </div>
  );
}

function FeedThumb({ item }: { item: FeedItem }) {
  if (item.type === "news") {
    if (item.coverImage) {
      return <FeedNewsThumb src={item.coverImage} />;
    }
    return <NewsThumbPlaceholder />;
  }

  if (item.type === "knowledge") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
        <BookOpen className="h-5 w-5 text-amber-500 dark:text-amber-400" />
      </div>
    );
  }

  // publication
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
      <span className="text-sm font-semibold text-violet-500 dark:text-violet-400">
        {item.title.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

// ============================================================================
// Unified feed — fetches news + publications + knowledge, merges chronologically
// ============================================================================

async function HomeFeed() {
  const [newsItems, pubItems, kbItems] = await Promise.all([
    api.news.latest({ limit: 5 }),
    api.publications.latest({ limit: 5 }),
    api.knowledge.latest({ limit: 4 }),
  ]);

  const feed: FeedItem[] = [
    ...newsItems.map((n) => ({
      type: "news" as const,
      id: n.id,
      title: n.title,
      href: `/news/${n.slug}`,
      date: new Date(n.createdAt),
      label: "Новость",
      coverImage: n.coverImage ?? null,
    })),
    ...pubItems.map((p) => ({
      type: "publication" as const,
      id: p.id,
      title: p.title,
      href: `/live/${p.id}`,
      date: new Date(p.createdAt),
      label: "Публикация",
    })),
    ...kbItems.map((k) => ({
      type: "knowledge" as const,
      id: k.id,
      title: k.title,
      href: `/howtos/${k.slug}`,
      date: new Date(k.updatedAt),
      label: "HOWTO",
      icon: k.icon,
    })),
  ];

  // Sort by date descending
  feed.sort((a, b) => b.date.getTime() - a.date.getTime());

  const TYPE_COLOR: Record<FeedItem["type"], string> = {
    news: "text-sky-600 dark:text-sky-400",
    publication: "text-violet-600 dark:text-violet-400",
    knowledge: "text-amber-600 dark:text-amber-400",
  };

  return (
    <section>
      <div className="space-y-1">
        {feed.map((item) => (
          <Link
            key={`${item.type}-${item.id}`}
            href={item.href}
            className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/50"
          >
            <FeedThumb item={item} />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide ${TYPE_COLOR[item.type]}`}
                >
                  {item.label}
                </span>
              </div>
              <p className="group-hover:text-primary line-clamp-2 text-sm font-medium leading-snug transition-colors">
                {item.title}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {formatRelativeDate(item.date)}
              </p>
            </div>
          </Link>
        ))}
        {feed.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">Нет публикаций</p>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href="/news"
          className="text-muted-foreground hover:text-primary flex items-center gap-1 text-xs transition-colors"
        >
          Все новости →
        </Link>
        <span className="text-muted-foreground/30">·</span>
        <Link
          href="/live"
          className="text-muted-foreground hover:text-primary flex items-center gap-1 text-xs transition-colors"
        >
          Все публикации →
        </Link>
        <span className="text-muted-foreground/30">·</span>
        <Link
          href="/howtos"
          className="text-muted-foreground hover:text-primary flex items-center gap-1 text-xs transition-colors"
        >
          <BookOpen className="h-3 w-3" />
          Знания →
        </Link>
      </div>
    </section>
  );
}

// ============================================================================
// Main export — 3-column grid
// ============================================================================

export async function HomeContentSection({
  weather,
  stats,
}: {
  weather: WeatherData;
  stats: StatsSummary;
}) {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      {/* Column 1: Unified chronological feed */}
      <HomeFeed />

      {/* Column 2: Date + Calendar */}
      <div className="space-y-4">
        <WeeklyAgenda />
      </div>

      {/* Column 3: Weather + Community stats */}
      <div className="space-y-4">
        <TodayDateWidget />
        <Weather {...weather} />
        <StatsWidget stats={stats} />
      </div>
    </div>
  );
}
