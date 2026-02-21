import { MessageSquare } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { PageHeader } from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { formatRelativeDate } from "~/lib/format-date";
import { getPublicationTypeLabel } from "~/lib/constants/publication-types";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Публикации соседей | SR2",
  description: "Истории, обсуждения и жизнь жителей ЖК Сердце Ростова 2",
};

export default async function LivePage() {
  const items = await api.publications.latest({ limit: 20 });

  return (
    <div className="container py-8">
      <PageHeader
        title="Публикации соседей"
        description="Истории, обсуждения и жизнь жителей"
      />

      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="text-muted-foreground/50 mb-4 h-12 w-12" />
            <h3 className="font-semibold">Публикаций пока нет</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Скоро здесь появятся публикации жителей
            </p>
          </div>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={`/live/${item.id}`}
              className="bg-card group flex flex-col gap-2 rounded-lg border p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {getPublicationTypeLabel(item.type)}
                </Badge>
                {item.building && (
                  <span className="text-muted-foreground text-xs">
                    Строение {item.building.number}
                  </span>
                )}
              </div>
              <p className="group-hover:text-primary text-sm font-medium transition-colors">
                {item.title}
              </p>
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                {item.author?.name && <span>{item.author.name}</span>}
                <span>·</span>
                <span>{formatRelativeDate(new Date(item.createdAt))}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
