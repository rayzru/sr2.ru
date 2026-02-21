import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { generateSlug } from "~/lib/utils/slug";
import { adminProcedure, createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  buildings,
  directoryContacts,
  directoryEntries,
  directoryEntryTags,
  directoryTags,
  knowledgeBaseArticles,
  knowledgeBaseArticleTags,
  users,
} from "~/server/db/schema";

// ============== SCHEMAS ==============

const knowledgeBaseStatusSchema = z.enum(["draft", "published", "archived"]);

// ============== ROUTER ==============

export const knowledgeRouter = createTRPCRouter({
  // ============== PUBLIC PROCEDURES ==============

  // List published articles
  list: publicProcedure
    .input(
      z.object({
        tagSlug: z.string().optional(),
        buildingId: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { tagSlug, buildingId, limit, offset } = input;

      const conditions = [eq(knowledgeBaseArticles.status, "published")];

      if (buildingId) {
        conditions.push(eq(knowledgeBaseArticles.buildingId, buildingId));
      }

      // Filter by tag if specified
      let articleIdsFilter: string[] | null = null;
      if (tagSlug) {
        const tag = await ctx.db.query.directoryTags.findFirst({
          where: eq(directoryTags.slug, tagSlug),
        });

        if (tag) {
          // Get all child tag IDs recursively
          const tagIds = [tag.id];
          const collectChildIds = async (parentId: string) => {
            const children = await ctx.db.query.directoryTags.findMany({
              where: eq(directoryTags.parentId, parentId),
            });
            for (const child of children) {
              tagIds.push(child.id);
              await collectChildIds(child.id);
            }
          };
          await collectChildIds(tag.id);

          const articleIdsWithTag = await ctx.db
            .selectDistinct({ articleId: knowledgeBaseArticleTags.articleId })
            .from(knowledgeBaseArticleTags)
            .where(inArray(knowledgeBaseArticleTags.tagId, tagIds));

          articleIdsFilter = articleIdsWithTag.map((a) => a.articleId);
          if (articleIdsFilter.length === 0) {
            return { articles: [], total: 0, hasMore: false };
          }
          conditions.push(inArray(knowledgeBaseArticles.id, articleIdsFilter));
        }
      }

      const articles = await ctx.db
        .select()
        .from(knowledgeBaseArticles)
        .where(and(...conditions))
        .orderBy(desc(knowledgeBaseArticles.publishedAt), knowledgeBaseArticles.order)
        .limit(limit)
        .offset(offset);

      // Get tags for each article
      const articlesWithTags = await Promise.all(
        articles.map(async (article) => {
          const articleTags = await ctx.db
            .select({ tag: directoryTags })
            .from(knowledgeBaseArticleTags)
            .innerJoin(directoryTags, eq(knowledgeBaseArticleTags.tagId, directoryTags.id))
            .where(eq(knowledgeBaseArticleTags.articleId, article.id));

          return {
            ...article,
            tags: articleTags.map((at) => at.tag),
          };
        })
      );

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(knowledgeBaseArticles)
        .where(and(...conditions));

      return {
        articles: articlesWithTags,
        total: totalResult?.count ?? 0,
        hasMore: offset + limit < (totalResult?.count ?? 0),
      };
    }),

  // List articles grouped by root tags (for catalog view)
  listGroupedByTags: publicProcedure.query(async ({ ctx }) => {
    // Get all tags to build hierarchy
    const allTags = await ctx.db.query.directoryTags.findMany();
    const tagMap = new Map(allTags.map((t) => [t.id, t]));

    // Helper to find root tag (tag without parentId)
    const findRootTag = (tagId: string): (typeof allTags)[0] | null => {
      const tag = tagMap.get(tagId);
      if (!tag) return null;
      if (!tag.parentId) return tag;
      return findRootTag(tag.parentId);
    };

    // Get all published articles with their tags
    const articles = await ctx.db
      .select()
      .from(knowledgeBaseArticles)
      .where(eq(knowledgeBaseArticles.status, "published"))
      .orderBy(knowledgeBaseArticles.order, knowledgeBaseArticles.title);

    // Get tags for each article
    const articlesWithTags = await Promise.all(
      articles.map(async (article) => {
        const articleTags = await ctx.db
          .select({ tag: directoryTags })
          .from(knowledgeBaseArticleTags)
          .innerJoin(directoryTags, eq(knowledgeBaseArticleTags.tagId, directoryTags.id))
          .where(eq(knowledgeBaseArticleTags.articleId, article.id))
          .orderBy(directoryTags.order, directoryTags.name);

        return {
          ...article,
          tags: articleTags.map((at) => at.tag),
        };
      })
    );

    // Group by ROOT tag (find root parent)
    const grouped = new Map<
      string,
      {
        tag: { id: string; name: string; slug: string; order: number | null };
        articles: typeof articlesWithTags;
        childTagIds: Set<string>;
      }
    >();

    // Also track articles without tags
    const uncategorized: typeof articlesWithTags = [];

    for (const article of articlesWithTags) {
      const primaryTag = article.tags[0];
      if (!primaryTag) {
        uncategorized.push(article);
      } else {
        // Find root tag
        const rootTag = findRootTag(primaryTag.id);
        if (!rootTag) {
          uncategorized.push(article);
          continue;
        }

        if (!grouped.has(rootTag.id)) {
          grouped.set(rootTag.id, {
            tag: {
              id: rootTag.id,
              name: rootTag.name,
              slug: rootTag.slug,
              order: rootTag.order,
            },
            articles: [],
            childTagIds: new Set(),
          });
        }
        const group = grouped.get(rootTag.id)!;
        group.articles.push(article);
        // Collect all tag IDs used in this category
        article.tags.forEach((t) => group.childTagIds.add(t.id));
      }
    }

    // Get entries grouped by child tags (e.g., "Строение 1", "Строение 2")
    const categoriesWithContacts = await Promise.all(
      Array.from(grouped.values()).map(async (group) => {
        // Get direct children of root tag (first level: "Строение 1", "Строение 2", etc.)
        const childTags = allTags
          .filter((t) => t.parentId === group.tag.id)
          .sort((a, b) => {
            const orderA = a.order ?? 999;
            const orderB = b.order ?? 999;
            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name, "ru");
          });

        // For each child tag, get all entries (including from grandchildren tags)
        const subcategories = await Promise.all(
          childTags.map(async (childTag) => {
            // Collect this tag + all its descendants
            const collectDescendantIds = (parentId: string): string[] => {
              const children = allTags.filter((t) => t.parentId === parentId);
              return [parentId, ...children.flatMap((child) => collectDescendantIds(child.id))];
            };
            const tagIds = collectDescendantIds(childTag.id);

            // Get entries linked to any of these tags
            const entriesResult = await ctx.db
              .selectDistinct({
                id: directoryEntries.id,
                slug: directoryEntries.slug,
                title: directoryEntries.title,
                subtitle: directoryEntries.subtitle,
                icon: directoryEntries.icon,
                order: directoryEntries.order,
              })
              .from(directoryEntries)
              .innerJoin(directoryEntryTags, eq(directoryEntryTags.entryId, directoryEntries.id))
              .where(
                and(eq(directoryEntries.isActive, 1), inArray(directoryEntryTags.tagId, tagIds))
              )
              .orderBy(directoryEntries.order, directoryEntries.title)
              .limit(20);

            // Get primary contacts for each entry
            const entriesWithContacts = await Promise.all(
              entriesResult.map(async (entry) => {
                const contacts = await ctx.db
                  .select({
                    type: directoryContacts.type,
                    value: directoryContacts.value,
                    label: directoryContacts.label,
                    isPrimary: directoryContacts.isPrimary,
                    hasWhatsApp: directoryContacts.hasWhatsApp,
                    hasTelegram: directoryContacts.hasTelegram,
                  })
                  .from(directoryContacts)
                  .where(eq(directoryContacts.entryId, entry.id))
                  .orderBy(desc(directoryContacts.isPrimary), directoryContacts.order)
                  .limit(3);

                return { ...entry, contacts };
              })
            );

            return {
              tag: {
                id: childTag.id,
                name: childTag.name,
                slug: childTag.slug,
                order: childTag.order,
              },
              entries: entriesWithContacts,
            };
          })
        );

        // Filter out empty subcategories
        const nonEmptySubcategories = subcategories.filter((sub) => sub.entries.length > 0);

        return {
          tag: group.tag,
          articles: group.articles,
          subcategories: nonEmptySubcategories,
        };
      })
    );

    // Sort categories by order, then by name
    const categories = categoriesWithContacts.sort((a, b) => {
      const orderA = a.tag.order ?? 999;
      const orderB = b.tag.order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.tag.name.localeCompare(b.tag.name, "ru");
    });

    return {
      categories,
      uncategorized,
      total: articlesWithTags.length,
    };
  }),

  // Get article by slug
  getBySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
    const article = await ctx.db.query.knowledgeBaseArticles.findFirst({
      where: and(
        eq(knowledgeBaseArticles.slug, input.slug),
        eq(knowledgeBaseArticles.status, "published")
      ),
    });

    if (!article) return null;

    // Increment view count
    await ctx.db
      .update(knowledgeBaseArticles)
      .set({ viewCount: sql`${knowledgeBaseArticles.viewCount} + 1` })
      .where(eq(knowledgeBaseArticles.id, article.id));

    // Get tags
    const articleTags = await ctx.db
      .select({ tag: directoryTags })
      .from(knowledgeBaseArticleTags)
      .innerJoin(directoryTags, eq(knowledgeBaseArticleTags.tagId, directoryTags.id))
      .where(eq(knowledgeBaseArticleTags.articleId, article.id));

    // Get building if linked
    let building = null;
    if (article.buildingId) {
      building = await ctx.db.query.buildings.findFirst({
        where: eq(buildings.id, article.buildingId),
      });
    }

    // Get author
    let author = null;
    if (article.authorId) {
      author = await ctx.db.query.users.findFirst({
        where: eq(users.id, article.authorId),
        columns: { id: true, name: true, image: true },
      });
    }

    return {
      ...article,
      tags: articleTags.map((at) => at.tag),
      building,
      author,
    };
  }),

  // Search articles (for directory search integration)
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(2).max(100),
        tagIds: z.array(z.string()).optional(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, tagIds, limit } = input;
      const searchPattern = `%${query}%`;

      const conditions = [
        eq(knowledgeBaseArticles.status, "published"),
        or(
          ilike(knowledgeBaseArticles.title, searchPattern),
          ilike(knowledgeBaseArticles.excerpt, searchPattern)
        ),
      ];

      // Filter by tags if specified
      if (tagIds && tagIds.length > 0) {
        const articleIdsWithTags = await ctx.db
          .selectDistinct({ articleId: knowledgeBaseArticleTags.articleId })
          .from(knowledgeBaseArticleTags)
          .where(inArray(knowledgeBaseArticleTags.tagId, tagIds));

        const articleIds = articleIdsWithTags.map((a) => a.articleId);
        if (articleIds.length === 0) {
          return { articles: [], total: 0 };
        }
        conditions.push(inArray(knowledgeBaseArticles.id, articleIds));
      }

      const articles = await ctx.db
        .select({
          id: knowledgeBaseArticles.id,
          slug: knowledgeBaseArticles.slug,
          title: knowledgeBaseArticles.title,
          excerpt: knowledgeBaseArticles.excerpt,
          icon: knowledgeBaseArticles.icon,
        })
        .from(knowledgeBaseArticles)
        .where(and(...conditions))
        .orderBy(desc(knowledgeBaseArticles.viewCount))
        .limit(limit);

      // Get tags for each article
      const articlesWithTags = await Promise.all(
        articles.map(async (article) => {
          const articleTags = await ctx.db
            .select({ tag: directoryTags })
            .from(knowledgeBaseArticleTags)
            .innerJoin(directoryTags, eq(knowledgeBaseArticleTags.tagId, directoryTags.id))
            .where(eq(knowledgeBaseArticleTags.articleId, article.id));

          return {
            ...article,
            tags: articleTags.map((at) => ({
              id: at.tag.id,
              name: at.tag.name,
              slug: at.tag.slug,
            })),
          };
        })
      );

      return {
        articles: articlesWithTags,
        total: articles.length,
      };
    }),

  // Get articles by tag slug (for directory integration)
  getByTag: publicProcedure
    .input(
      z.object({
        tagSlug: z.string(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { tagSlug, limit } = input;

      // Find the tag
      const tag = await ctx.db.query.directoryTags.findFirst({
        where: eq(directoryTags.slug, tagSlug),
      });

      if (!tag) {
        return { articles: [], total: 0 };
      }

      // Get all child tag IDs recursively
      const tagIds = [tag.id];
      const collectChildIds = async (parentId: string) => {
        const children = await ctx.db.query.directoryTags.findMany({
          where: eq(directoryTags.parentId, parentId),
        });
        for (const child of children) {
          tagIds.push(child.id);
          await collectChildIds(child.id);
        }
      };
      await collectChildIds(tag.id);

      // Get articles linked to any of these tags
      const articleIdsWithTag = await ctx.db
        .selectDistinct({ articleId: knowledgeBaseArticleTags.articleId })
        .from(knowledgeBaseArticleTags)
        .where(inArray(knowledgeBaseArticleTags.tagId, tagIds));

      if (articleIdsWithTag.length === 0) {
        return { articles: [], total: 0 };
      }

      const articleIds = articleIdsWithTag.map((a) => a.articleId);

      const articles = await ctx.db
        .select({
          id: knowledgeBaseArticles.id,
          slug: knowledgeBaseArticles.slug,
          title: knowledgeBaseArticles.title,
          excerpt: knowledgeBaseArticles.excerpt,
          icon: knowledgeBaseArticles.icon,
        })
        .from(knowledgeBaseArticles)
        .where(
          and(
            eq(knowledgeBaseArticles.status, "published"),
            inArray(knowledgeBaseArticles.id, articleIds)
          )
        )
        .orderBy(desc(knowledgeBaseArticles.viewCount))
        .limit(limit);

      // Get tags for each article
      const articlesWithTags = await Promise.all(
        articles.map(async (article) => {
          const articleTags = await ctx.db
            .select({ tag: directoryTags })
            .from(knowledgeBaseArticleTags)
            .innerJoin(directoryTags, eq(knowledgeBaseArticleTags.tagId, directoryTags.id))
            .where(eq(knowledgeBaseArticleTags.articleId, article.id));

          return {
            ...article,
            tags: articleTags.map((at) => ({
              id: at.tag.id,
              name: at.tag.name,
              slug: at.tag.slug,
            })),
          };
        })
      );

      return {
        articles: articlesWithTags,
        total: articlesWithTags.length,
      };
    }),

  // Get popular articles
  getPopular: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      const articles = await ctx.db
        .select({
          id: knowledgeBaseArticles.id,
          slug: knowledgeBaseArticles.slug,
          title: knowledgeBaseArticles.title,
          excerpt: knowledgeBaseArticles.excerpt,
          icon: knowledgeBaseArticles.icon,
          viewCount: knowledgeBaseArticles.viewCount,
        })
        .from(knowledgeBaseArticles)
        .where(eq(knowledgeBaseArticles.status, "published"))
        .orderBy(desc(knowledgeBaseArticles.viewCount))
        .limit(input.limit);

      return articles;
    }),

  // Rate article (helpful/not helpful)
  rate: publicProcedure
    .input(
      z.object({
        articleId: z.string(),
        helpful: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { articleId, helpful } = input;

      if (helpful) {
        await ctx.db
          .update(knowledgeBaseArticles)
          .set({ helpfulCount: sql`${knowledgeBaseArticles.helpfulCount} + 1` })
          .where(eq(knowledgeBaseArticles.id, articleId));
      } else {
        await ctx.db
          .update(knowledgeBaseArticles)
          .set({ notHelpfulCount: sql`${knowledgeBaseArticles.notHelpfulCount} + 1` })
          .where(eq(knowledgeBaseArticles.id, articleId));
      }

      return { success: true };
    }),

  // Latest published articles for homepage feed
  latest: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(4) }))
    .query(async ({ ctx, input }) => {
      const articles = await ctx.db
        .select({
          id: knowledgeBaseArticles.id,
          slug: knowledgeBaseArticles.slug,
          title: knowledgeBaseArticles.title,
          excerpt: knowledgeBaseArticles.excerpt,
          icon: knowledgeBaseArticles.icon,
          createdAt: knowledgeBaseArticles.createdAt,
          updatedAt: knowledgeBaseArticles.updatedAt,
        })
        .from(knowledgeBaseArticles)
        .where(eq(knowledgeBaseArticles.status, "published"))
        .orderBy(desc(knowledgeBaseArticles.updatedAt))
        .limit(input.limit);

      return articles;
    }),

  // ============== ADMIN PROCEDURES ==============

  admin: createTRPCRouter({
    // List articles for admin (includes drafts)
    list: adminProcedure
      .input(
        z.object({
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(20),
          status: knowledgeBaseStatusSchema.optional(),
          search: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const { page, limit, status, search } = input;
        const offset = (page - 1) * limit;

        const conditions = [];
        if (status) {
          conditions.push(eq(knowledgeBaseArticles.status, status));
        }
        if (search) {
          conditions.push(
            or(
              ilike(knowledgeBaseArticles.title, `%${search}%`),
              ilike(knowledgeBaseArticles.excerpt, `%${search}%`)
            )
          );
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const articles = await ctx.db.query.knowledgeBaseArticles.findMany({
          where: whereClause,
          orderBy: [desc(knowledgeBaseArticles.updatedAt)],
          limit,
          offset,
        });

        // Get tags and author for each article
        const articlesWithDetails = await Promise.all(
          articles.map(async (article) => {
            const articleTags = await ctx.db
              .select({ tag: directoryTags })
              .from(knowledgeBaseArticleTags)
              .innerJoin(directoryTags, eq(knowledgeBaseArticleTags.tagId, directoryTags.id))
              .where(eq(knowledgeBaseArticleTags.articleId, article.id));

            let author = null;
            if (article.authorId) {
              author = await ctx.db.query.users.findFirst({
                where: eq(users.id, article.authorId),
                columns: { id: true, name: true, image: true },
              });
            }

            return {
              ...article,
              tags: articleTags.map((at) => at.tag),
              author,
            };
          })
        );

        const [totalResult] = await ctx.db
          .select({ count: count() })
          .from(knowledgeBaseArticles)
          .where(whereClause);

        const total = totalResult?.count ?? 0;
        const totalPages = Math.ceil(total / limit);

        return {
          articles: articlesWithDetails,
          total,
          totalPages,
          page,
        };
      }),

    // Get article by ID for admin
    get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
      const article = await ctx.db.query.knowledgeBaseArticles.findFirst({
        where: eq(knowledgeBaseArticles.id, input.id),
      });

      if (!article) return null;

      // Get tags
      const articleTags = await ctx.db
        .select({ tag: directoryTags })
        .from(knowledgeBaseArticleTags)
        .innerJoin(directoryTags, eq(knowledgeBaseArticleTags.tagId, directoryTags.id))
        .where(eq(knowledgeBaseArticleTags.articleId, article.id));

      // Get building if linked
      let building = null;
      if (article.buildingId) {
        building = await ctx.db.query.buildings.findFirst({
          where: eq(buildings.id, article.buildingId),
        });
      }

      // Get author
      let author = null;
      if (article.authorId) {
        author = await ctx.db.query.users.findFirst({
          where: eq(users.id, article.authorId),
          columns: { id: true, name: true, image: true },
        });
      }

      return {
        ...article,
        tags: articleTags.map((at) => at.tag),
        building,
        author,
      };
    }),

    // Create article
    create: adminProcedure
      .input(
        z.object({
          title: z.string().min(1).max(255),
          excerpt: z.string().max(500).optional(),
          content: z.string().optional(),
          status: knowledgeBaseStatusSchema.default("draft"),
          buildingId: z.string().optional(),
          icon: z.string().max(50).optional(),
          order: z.number().default(0),
          tagIds: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { tagIds, ...articleData } = input;
        const authorId = ctx.session.user.id;

        // Generate slug
        let slug = generateSlug(input.title);
        let counter = 1;

        while (true) {
          const existing = await ctx.db.query.knowledgeBaseArticles.findFirst({
            where: eq(knowledgeBaseArticles.slug, slug),
          });
          if (!existing) break;
          slug = `${generateSlug(input.title)}-${counter}`;
          counter++;
        }

        // Create article
        const articleId = crypto.randomUUID();
        const publishedAt = input.status === "published" ? new Date() : null;

        await ctx.db.insert(knowledgeBaseArticles).values({
          id: articleId,
          slug,
          authorId,
          publishedAt,
          ...articleData,
        });

        // Link tags
        if (tagIds && tagIds.length > 0) {
          await ctx.db.insert(knowledgeBaseArticleTags).values(
            tagIds.map((tagId) => ({
              articleId,
              tagId,
            }))
          );
        }

        return { id: articleId, slug };
      }),

    // Update article
    update: adminProcedure
      .input(
        z.object({
          id: z.string(),
          title: z.string().min(1).max(255).optional(),
          excerpt: z.string().max(500).optional(),
          content: z.string().optional(),
          status: knowledgeBaseStatusSchema.optional(),
          buildingId: z.string().nullish(),
          icon: z.string().max(50).nullish(),
          order: z.number().optional(),
          tagIds: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, tagIds, ...updateData } = input;

        // Get current article to check status change
        const currentArticle = await ctx.db.query.knowledgeBaseArticles.findFirst({
          where: eq(knowledgeBaseArticles.id, id),
        });

        // Set publishedAt if transitioning to published
        let publishedAt: Date | undefined;
        if (input.status === "published" && currentArticle?.status !== "published") {
          publishedAt = new Date();
        }

        // Update article
        await ctx.db
          .update(knowledgeBaseArticles)
          .set({
            ...updateData,
            publishedAt,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeBaseArticles.id, id));

        // Update tags if provided
        if (tagIds !== undefined) {
          // Delete existing tag links
          await ctx.db
            .delete(knowledgeBaseArticleTags)
            .where(eq(knowledgeBaseArticleTags.articleId, id));

          // Insert new tag links
          if (tagIds.length > 0) {
            await ctx.db.insert(knowledgeBaseArticleTags).values(
              tagIds.map((tagId) => ({
                articleId: id,
                tagId,
              }))
            );
          }
        }

        return { success: true };
      }),

    // Delete article
    delete: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
      // Delete tag links first
      await ctx.db
        .delete(knowledgeBaseArticleTags)
        .where(eq(knowledgeBaseArticleTags.articleId, input.id));

      // Delete article
      await ctx.db.delete(knowledgeBaseArticles).where(eq(knowledgeBaseArticles.id, input.id));

      return { success: true };
    }),

    // Get stats
    getStats: adminProcedure.query(async ({ ctx }) => {
      const [draftCount] = await ctx.db
        .select({ count: count() })
        .from(knowledgeBaseArticles)
        .where(eq(knowledgeBaseArticles.status, "draft"));

      const [publishedCount] = await ctx.db
        .select({ count: count() })
        .from(knowledgeBaseArticles)
        .where(eq(knowledgeBaseArticles.status, "published"));

      const [archivedCount] = await ctx.db
        .select({ count: count() })
        .from(knowledgeBaseArticles)
        .where(eq(knowledgeBaseArticles.status, "archived"));

      const [totalViewsResult] = await ctx.db
        .select({ sum: sql<number>`COALESCE(SUM(${knowledgeBaseArticles.viewCount}), 0)` })
        .from(knowledgeBaseArticles);

      return {
        draft: draftCount?.count ?? 0,
        published: publishedCount?.count ?? 0,
        archived: archivedCount?.count ?? 0,
        totalViews: totalViewsResult?.sum ?? 0,
      };
    }),

    // Regenerate slugs for all articles (one-time migration helper)
    regenerateSlugs: adminProcedure.mutation(async ({ ctx }) => {
      const articles = await ctx.db
        .select({ id: knowledgeBaseArticles.id, title: knowledgeBaseArticles.title })
        .from(knowledgeBaseArticles);

      let updated = 0;
      const usedSlugs = new Set<string>();

      for (const article of articles) {
        let slug = generateSlug(article.title);
        let counter = 1;

        // Ensure unique slug
        while (usedSlugs.has(slug)) {
          slug = `${generateSlug(article.title)}-${counter}`;
          counter++;
        }
        usedSlugs.add(slug);

        await ctx.db
          .update(knowledgeBaseArticles)
          .set({ slug })
          .where(eq(knowledgeBaseArticles.id, article.id));

        updated++;
      }

      return { updated };
    }),
  }),
});
