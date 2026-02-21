import { Newspaper } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { NewsCardGrid } from "~/components/news-card";
import { SectionHeader } from "~/components/ui/section-header";
import { formatRelativeDate } from "~/lib/format-date";
import { api } from "~/trpc/server";

interface LatestNewsProps {
  variant?: "grid" | "column";
}

export async function LatestNews({ variant = "grid" }: LatestNewsProps) {
  const news = await api.news.latest({ limit: 4 });

  if (news.length === 0) {
    return null;
  }

  if (variant === "column") {
    return (
      <section>
        {/* Header */}
        <SectionHeader icon={Newspaper} title="Новости" href="/news" />

        {/* News List */}
        <div className="space-y-3">
          {news.map((item) => (
            <Link
              key={item.id}
              href={`/news/${item.slug}`}
              className="bg-card group block overflow-hidden rounded-lg border transition-shadow hover:shadow-sm"
            >
              <div className="flex gap-3 p-3">
                {item.coverImage && (
                  <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={item.coverImage}
                      alt={item.title}
                      fill
                      className="object-cover"
                      unoptimized={item.coverImage.includes("/uploads/")}
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="group-hover:text-primary line-clamp-2 text-sm font-medium transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatRelativeDate(new Date(item.createdAt))}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="py-8">
      <SectionHeader icon={Newspaper} title="Новости" href="/news" linkLabel="Все новости" />

      {/* News Grid */}
      <NewsCardGrid
        news={news.map((item) => ({
          ...item,
          createdAt: new Date(item.createdAt),
          publishAt: item.publishAt ? new Date(item.publishAt) : null,
        }))}
      />
    </section>
  );
}
