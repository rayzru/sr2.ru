import {
  HelpCircle,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Search,
  ThumbsUp,
  User,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardFooter } from "~/components/ui/card";
import { SectionHeader } from "~/components/ui/section-header";
import { formatRelativeDate } from "~/lib/format-date";
import { cn } from "~/lib/utils";
import type { PublicationType } from "~/server/db/schema";
import { api } from "~/trpc/server";

// ============================================================================
// Constants
// ============================================================================

const PUBLICATION_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Megaphone; color: string }
> = {
  help_request: {
    label: "Помощь",
    icon: HelpCircle,
    color: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  lost_found: {
    label: "Потеряно/найдено",
    icon: Search,
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  recommendation: {
    label: "Рекомендация",
    icon: ThumbsUp,
    color: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
  question: {
    label: "Вопрос",
    icon: MessageSquare,
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  discussion: {
    label: "Обсуждение",
    icon: MessagesSquare,
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
  // Legacy types for backward compatibility
  announcement: {
    label: "Объявление",
    icon: Megaphone,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
};

// ============================================================================
// Component
// ============================================================================

interface LatestPublicationsProps {
  variant?: "grid" | "column";
}

export async function LatestPublications({ variant = "grid" }: LatestPublicationsProps) {
  const publications = await api.publications.latest({ limit: 4 });

  if (publications.length === 0) {
    return null;
  }

  if (variant === "column") {
    return (
      <section>
        {/* Header */}
        <SectionHeader icon={MessageSquare} title="Публикации" href="/publications" />

        {/* Publications List */}
        <div className="space-y-3">
          {publications.map((pub) => {
            const typeConfig =
              PUBLICATION_TYPE_CONFIG[pub.type] ?? PUBLICATION_TYPE_CONFIG.discussion!;
            const Icon = typeConfig.icon;

            return (
              <Link
                key={pub.id}
                href={`/publications/${pub.id}`}
                className="bg-card group block overflow-hidden rounded-lg border transition-shadow hover:shadow-sm"
              >
                <div className="p-3">
                  {/* Type Badge */}
                  <Badge
                    variant="secondary"
                    className={cn("mb-2 gap-1 px-1.5 py-0 text-[10px]", typeConfig.color)}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {typeConfig.label}
                  </Badge>

                  {/* Title */}
                  <h3 className="group-hover:text-primary line-clamp-2 text-sm font-medium transition-colors">
                    {pub.title}
                  </h3>

                  {/* Author & Date */}
                  <div className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
                    {pub.author && !pub.isAnonymous ? (
                      <>
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={pub.author.image ?? undefined} />
                          <AvatarFallback className="text-[8px]">
                            <User className="h-2 w-2" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="max-w-[80px] truncate">{pub.author.name}</span>
                        <span>•</span>
                      </>
                    ) : null}
                    <time dateTime={pub.createdAt.toISOString()}>
                      {formatRelativeDate(pub.createdAt)}
                    </time>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="py-8">
      <SectionHeader
        icon={MessageSquare}
        title="Публикации"
        href="/publications"
        linkLabel="Все публикации"
      />

      {/* Publications Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {publications.map((pub) => {
          const typeConfig =
            PUBLICATION_TYPE_CONFIG[pub.type] ?? PUBLICATION_TYPE_CONFIG.discussion!;
          const Icon = typeConfig.icon;

          return (
            <Card key={pub.id} className="group overflow-hidden transition-shadow hover:shadow-md">
              {/* Cover Image */}
              {pub.coverImage ? (
                <div className="relative aspect-video overflow-hidden">
                  <Image
                    src={pub.coverImage}
                    alt={pub.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    unoptimized={pub.coverImage.includes("/uploads/")}
                  />
                </div>
              ) : (
                <div className="bg-muted flex aspect-video items-center justify-center">
                  <Icon className="text-muted-foreground/50 h-8 w-8" />
                </div>
              )}

              <CardContent className="p-4">
                {/* Type Badge */}
                <Badge variant="secondary" className={cn("mb-2 gap-1", typeConfig.color)}>
                  <Icon className="h-3 w-3" />
                  {typeConfig.label}
                </Badge>

                {/* Title */}
                <h3 className="group-hover:text-primary line-clamp-2 font-medium transition-colors">
                  <Link href={`/publications/${pub.id}`}>{pub.title}</Link>
                </h3>
              </CardContent>

              <CardFooter className="px-4 pb-4 pt-0">
                {/* Author & Date */}
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  {pub.author && !pub.isAnonymous ? (
                    <>
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={pub.author.image ?? undefined} />
                        <AvatarFallback>
                          <User className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="max-w-[100px] truncate">{pub.author.name}</span>
                      <span>•</span>
                    </>
                  ) : null}
                  <time dateTime={pub.createdAt.toISOString()}>
                    {formatRelativeDate(pub.createdAt)}
                  </time>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
