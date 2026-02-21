import type { JSONContent } from "@tiptap/react";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { extractPlainText } from "~/lib/editor";
import { logger } from "~/lib/logger";
import { deleteImage } from "~/lib/upload/image-processor";
import { news, newsStatusEnum, newsTags, newsTypeEnum } from "~/server/db/schema";
import { sendTelegramNotificationAsync } from "~/server/notifications/telegram";

import { adminProcedureWithFeature, createTRPCRouter, publicProcedure } from "../trpc";

// ============================================================================
// Validation Schemas
// ============================================================================

const newsTypeSchema = z.enum(newsTypeEnum.enumValues);
const newsStatusSchema = z.enum(newsStatusEnum.enumValues);

const createNewsSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(),
  excerpt: z.string().max(500).optional(),
  coverImage: z.string().optional(),
  content: z.any() as z.ZodType<JSONContent>,
  type: newsTypeSchema.default("announcement"),
  status: newsStatusSchema.default("draft"),
  publishAt: z.date().optional(),
  isPinned: z.boolean().default(false),
  isHighlighted: z.boolean().default(false),
  isAnonymous: z.boolean().default(false),
  tagIds: z.array(z.string()).optional(),
});

const updateNewsSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).optional(),
  excerpt: z.string().max(500).optional(),
  coverImage: z.string().nullable().optional(),
  content: (z.any() as z.ZodType<JSONContent>).optional(),
  type: newsTypeSchema.optional(),
  status: newsStatusSchema.optional(),
  publishAt: z.date().nullable().optional(),
  isPinned: z.boolean().optional(),
  isHighlighted: z.boolean().optional(),
  isAnonymous: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
});

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate slug from title and date
 */
function generateSlug(title: string, date: Date = new Date()): string {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);

  return `${dateStr}-${titleSlug}`;
}

/**
 * Convert TipTap JSON to Telegram-compatible text
 */
export function contentToTelegramText(content: JSONContent): string {
  const parts: string[] = [];

  function processNode(node: JSONContent, depth = 0): void {
    switch (node.type) {
      case "doc":
        node.content?.forEach((child) => processNode(child, depth));
        break;

      case "paragraph":
        const paragraphText = processInlineContent(node.content);
        if (paragraphText) parts.push(paragraphText);
        parts.push(""); // Empty line after paragraph
        break;

      case "heading": {
        const headingText = processInlineContent(node.content);
        if (headingText) {
          // Use bold for headings in Telegram
          parts.push(`<b>${headingText}</b>`);
          parts.push("");
        }
        break;
      }

      case "bulletList":
        node.content?.forEach((item) => processNode(item, depth));
        break;

      case "orderedList":
        node.content?.forEach((item, index) => {
          // Add number prefix for ordered lists
          const itemText = processInlineContent(item.content?.[0]?.content);
          if (itemText) parts.push(`${index + 1}. ${itemText}`);
        });
        parts.push("");
        break;

      case "listItem": {
        const listItemText = processInlineContent(node.content?.[0]?.content);
        if (listItemText) parts.push(`• ${listItemText}`);
        break;
      }

      case "blockquote": {
        const quoteText = processInlineContent(node.content?.[0]?.content);
        if (quoteText) parts.push(`❝ ${quoteText}`);
        parts.push("");
        break;
      }

      case "codeBlock": {
        const codeText = processInlineContent(node.content);
        if (codeText) parts.push(`<code>${codeText}</code>`);
        parts.push("");
        break;
      }

      case "horizontalRule":
        parts.push("───────────────");
        break;

      default:
        // For other node types, try to extract text
        if (node.content) {
          node.content.forEach((child) => processNode(child, depth));
        }
    }
  }

  function processInlineContent(content?: JSONContent[]): string {
    if (!content) return "";

    return content
      .map((node) => {
        if (node.type === "text") {
          let text = node.text ?? "";

          // Apply marks
          if (node.marks) {
            for (const mark of node.marks) {
              switch (mark.type) {
                case "bold":
                  text = `<b>${text}</b>`;
                  break;
                case "italic":
                  text = `<i>${text}</i>`;
                  break;
                case "underline":
                  text = `<u>${text}</u>`;
                  break;
                case "strike":
                  text = `<s>${text}</s>`;
                  break;
                case "code":
                  text = `<code>${text}</code>`;
                  break;
                case "link": {
                  const href = (mark.attrs as { href?: string })?.href;
                  if (href) {
                    text = `<a href="${href}">${text}</a>`;
                  }
                  break;
                }
              }
            }
          }

          return text;
        }

        if (node.type === "hardBreak") {
          return "\n";
        }

        return "";
      })
      .join("");
  }

  processNode(content);

  // Clean up multiple empty lines
  return parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ============================================================================
// Router
// ============================================================================

export const newsRouter = createTRPCRouter({
  // ========================================
  // Public Procedures
  // ========================================

  /**
   * Get published news list for public display
   */
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
        cursor: z.string().uuid().optional(),
        type: newsTypeSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, type } = input;
      const now = new Date();

      const conditions = [
        eq(news.status, "published"),
        or(lte(news.publishAt, now), sql`${news.publishAt} IS NULL`),
      ];

      if (type) {
        conditions.push(eq(news.type, type));
      }

      const items = await ctx.db.query.news.findMany({
        where: and(...conditions),
        orderBy: [desc(news.isPinned), desc(news.publishAt), desc(news.createdAt)],
        limit: limit + 1,
        with: {
          author: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id;
      }

      // Hide author for anonymous posts
      const processedItems = items.map((item) => ({
        ...item,
        author: item.isAnonymous ? null : item.author,
      }));

      return {
        items: processedItems,
        nextCursor,
      };
    }),

  /**
   * Get latest news for homepage
   */
  latest: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(10).default(4) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();

      return ctx.db.query.news.findMany({
        where: and(
          eq(news.status, "published"),
          or(lte(news.publishAt, now), sql`${news.publishAt} IS NULL`)
        ),
        orderBy: [desc(news.isPinned), desc(news.publishAt), desc(news.createdAt)],
        limit: input.limit,
        columns: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          coverImage: true,
          type: true,
          publishAt: true,
          isPinned: true,
          isHighlighted: true,
          createdAt: true,
        },
      });
    }),

  /**
   * Get single news by slug
   */
  bySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
    const now = new Date();

    const item = await ctx.db.query.news.findFirst({
      where: and(
        eq(news.slug, input.slug),
        eq(news.status, "published"),
        or(lte(news.publishAt, now), sql`${news.publishAt} IS NULL`)
      ),
      with: {
        author: {
          columns: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    if (!item) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Новость не найдена",
      });
    }

    // Hide author for anonymous posts
    return {
      ...item,
      author: item.isAnonymous ? null : item.author,
    };
  }),

  // ========================================
  // Admin Procedures
  // ========================================

  /**
   * Admin: List all news (including drafts)
   */
  adminList: adminProcedureWithFeature("directory:manage")
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
        status: newsStatusSchema.optional(),
        type: newsTypeSchema.optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, status, type, search } = input;
      const offset = (page - 1) * limit;

      const conditions = [];

      if (status) {
        conditions.push(eq(news.status, status));
      }

      if (type) {
        conditions.push(eq(news.type, type));
      }

      if (search) {
        conditions.push(
          or(sql`${news.title} ILIKE ${`%${search}%`}`, sql`${news.excerpt} ILIKE ${`%${search}%`}`)
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalCount] = await Promise.all([
        ctx.db.query.news.findMany({
          where: whereClause,
          orderBy: [desc(news.createdAt)],
          limit,
          offset,
          with: {
            author: {
              columns: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        }),
        ctx.db.select({ count: count() }).from(news).where(whereClause),
      ]);

      return {
        items,
        total: totalCount[0]?.count ?? 0,
        page,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / limit),
      };
    }),

  /**
   * Admin: Get single news by ID
   */
  adminById: adminProcedureWithFeature("directory:manage")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.query.news.findFirst({
        where: eq(news.id, input.id),
        with: {
          author: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
          newsTags: {
            with: {
              tag: true,
            },
          },
        },
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Новость не найдена",
        });
      }

      // Transform tags for easier consumption
      return {
        ...item,
        tags: item.newsTags.map((nt) => nt.tag),
      };
    }),

  /**
   * Admin: Create news
   */
  create: adminProcedureWithFeature("directory:manage")
    .input(createNewsSchema)
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug ?? generateSlug(input.title);

      // Check slug uniqueness
      const existing = await ctx.db.query.news.findFirst({
        where: eq(news.slug, slug),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Новость с таким slug уже существует",
        });
      }

      // Convert empty strings to undefined for optional fields
      const coverImage = input.coverImage?.trim() || undefined;
      const excerpt = input.excerpt?.trim() || undefined;

      const { tagIds, ...newsData } = input;

      const [created] = await ctx.db
        .insert(news)
        .values({
          ...newsData,
          slug,
          coverImage,
          excerpt,
          authorId: ctx.session.user.id,
        })
        .returning();

      // Insert tags if provided
      if (created && tagIds && tagIds.length > 0) {
        await ctx.db.insert(newsTags).values(
          tagIds.map((tagId) => ({
            newsId: created.id,
            tagId,
          }))
        );
      }

      // Send Telegram notification
      const typeName: Record<string, string> = {
        announcement: "объявление",
        event: "мероприятие",
        maintenance: "техническое обслуживание",
        update: "обновление",
        community: "новость сообщества",
        article: "статья",
        guide: "руководство",
        urgent: "срочное сообщение",
      };
      const typeLabel = typeName[input.type] ?? "новость";

      sendTelegramNotificationAsync({
        event: input.status === "published" ? "news_published" : "news_created",
        title: input.status === "published" ? `Опубликована ${typeLabel}` : `Создана ${typeLabel}`,
        description: input.title,
        metadata: {
          Тип: typeLabel,
          Статус: input.status === "draft" ? "Черновик" : "Опубликовано",
          ...(input.isPinned ? { Закреплено: "Да" } : {}),
        },
        userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined,
      });

      return created;
    }),

  /**
   * Admin: Update news
   */
  update: adminProcedureWithFeature("directory:manage")
    .input(updateNewsSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Check existence
      const existing = await ctx.db.query.news.findFirst({
        where: eq(news.id, id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Новость не найдена",
        });
      }

      // Check slug uniqueness if changed
      if (data.slug && data.slug !== existing.slug) {
        const slugExists = await ctx.db.query.news.findFirst({
          where: and(eq(news.slug, data.slug), sql`${news.id} != ${id}`),
        });

        if (slugExists) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Новость с таким slug уже существует",
          });
        }
      }

      const { tagIds, ...newsData } = data;

      // If coverImage is being changed, delete old image from S3
      if (newsData.coverImage !== undefined && existing.coverImage) {
        // Check if the new image is different from the old one
        if (newsData.coverImage !== existing.coverImage) {
          try {
            await deleteImage(existing.coverImage);
            logger.info(`[News] Deleted old cover image: ${existing.coverImage}`);
          } catch (error) {
            logger.error("[News] Failed to delete old cover image:", error);
            // Continue with update even if deletion fails
          }
        }
      }

      const [updated] = await ctx.db.update(news).set(newsData).where(eq(news.id, id)).returning();

      // Send Telegram notification if status changed to published
      if (newsData.status === "published" && existing.status !== "published") {
        const typeName: Record<string, string> = {
          announcement: "объявление",
          event: "мероприятие",
          maintenance: "техническое обслуживание",
          update: "обновление",
          community: "новость сообщества",
          article: "статья",
          guide: "руководство",
          urgent: "срочное сообщение",
        };
        const typeLabel = typeName[updated?.type ?? existing.type] ?? "новость";

        sendTelegramNotificationAsync({
          event: "news_published",
          title: `Опубликована ${typeLabel}`,
          description: updated?.title ?? existing.title,
          metadata: {
            Тип: typeLabel,
            Статус: "Опубликовано",
          },
          userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined,
        });
      }

      // Update tags if provided
      if (tagIds !== undefined) {
        // Delete existing tags
        await ctx.db.delete(newsTags).where(eq(newsTags.newsId, id));

        // Insert new tags
        if (tagIds.length > 0) {
          await ctx.db.insert(newsTags).values(
            tagIds.map((tagId) => ({
              newsId: id,
              tagId,
            }))
          );
        }
      }

      return updated;
    }),

  /**
   * Admin: Delete news
   */
  delete: adminProcedureWithFeature("directory:manage")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.news.findFirst({
        where: eq(news.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Новость не найдена",
        });
      }

      // Delete cover image from S3 if exists
      if (existing.coverImage) {
        try {
          await deleteImage(existing.coverImage);
          logger.info(`[News] Deleted cover image from S3: ${existing.coverImage}`);
        } catch (error) {
          logger.error("[News] Failed to delete cover image from S3:", error);
          // Continue with news deletion even if S3 deletion fails
        }
      }

      await ctx.db.delete(news).where(eq(news.id, input.id));

      return { success: true };
    }),

  /**
   * Admin: Publish news immediately
   */
  publish: adminProcedureWithFeature("directory:manage")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(news)
        .set({
          status: "published",
          publishAt: new Date(),
        })
        .where(eq(news.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Новость не найдена",
        });
      }

      return updated;
    }),

  /**
   * Admin: Get stats for dashboard
   */
  stats: adminProcedureWithFeature("directory:manage").query(async ({ ctx }) => {
    const [draftCount, scheduledCount, publishedCount, totalCount] = await Promise.all([
      ctx.db.select({ count: count() }).from(news).where(eq(news.status, "draft")),
      ctx.db.select({ count: count() }).from(news).where(eq(news.status, "scheduled")),
      ctx.db.select({ count: count() }).from(news).where(eq(news.status, "published")),
      ctx.db.select({ count: count() }).from(news),
    ]);

    return {
      draft: draftCount[0]?.count ?? 0,
      scheduled: scheduledCount[0]?.count ?? 0,
      published: publishedCount[0]?.count ?? 0,
      total: totalCount[0]?.count ?? 0,
    };
  }),

  /**
   * Admin: Get Telegram preview
   */
  telegramPreview: adminProcedureWithFeature("directory:manage")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.query.news.findFirst({
        where: eq(news.id, input.id),
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Новость не найдена",
        });
      }

      const telegramText = contentToTelegramText(item.content);
      const sourceLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com"}/news/${item.slug}`;

      const fullMessage = `<b>${item.title}</b>\n\n${telegramText}\n\n<a href="${sourceLink}">Читать на сайте →</a>`;

      return {
        text: fullMessage,
        hasImage: !!item.coverImage,
        imageUrl: item.coverImage,
      };
    }),

  /**
   * Admin: Publish news to Telegram channel
   */
  publishToTelegram: adminProcedureWithFeature("directory:manage")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Dynamic import to avoid loading telegram module on client
      const { publishNewsToTelegram, isTelegramConfigured } = await import("~/lib/telegram");

      if (!isTelegramConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Telegram не настроен. Проверьте TELEGRAM_BOT_TOKEN и TELEGRAM_NEWS_CHANNEL_ID.",
        });
      }

      const item = await ctx.db.query.news.findFirst({
        where: eq(news.id, input.id),
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Новость не найдена",
        });
      }

      const telegramText = contentToTelegramText(item.content);
      const sourceUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com"}/news/${item.slug}`;

      const result = await publishNewsToTelegram({
        title: item.title,
        text: telegramText,
        sourceUrl,
        coverImage: item.coverImage,
      });

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Ошибка при публикации в Telegram",
        });
      }

      return {
        success: true,
        messageId: result.messageId,
      };
    }),

  /**
   * Admin: Generate unique slug from title
   */
  generateSlug: adminProcedureWithFeature("directory:manage")
    .input(
      z.object({
        title: z.string().min(1),
        excludeId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { title, excludeId } = input;

      // Generate base slug (fallback to date if title is empty)
      let baseSlug: string;
      if (!title.trim()) {
        const dateStr = new Date().toISOString().slice(0, 10);
        baseSlug = dateStr;
      } else {
        baseSlug = generateSlug(title);
      }

      // Check if slug is unique
      let finalSlug = baseSlug;
      let suffix = 1;

      while (true) {
        const existing = await ctx.db.query.news.findFirst({
          where: excludeId
            ? and(eq(news.slug, finalSlug), sql`${news.id} != ${excludeId}`)
            : eq(news.slug, finalSlug),
        });

        if (!existing) {
          break;
        }

        // Add numeric suffix
        finalSlug = `${baseSlug}-${suffix}`;
        suffix++;

        // Safety limit to prevent infinite loop
        if (suffix > 100) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Не удалось сгенерировать уникальный slug",
          });
        }
      }

      return { slug: finalSlug };
    }),
});
