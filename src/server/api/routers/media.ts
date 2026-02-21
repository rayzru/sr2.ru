import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "~/lib/logger";
import { media, mediaTags, mediaToTags, mediaTypeEnum } from "~/server/db/schema";

import { adminProcedureWithFeature, createTRPCRouter, protectedProcedure } from "../trpc";

// ============================================================================
// Validation Schemas
// ============================================================================

const mediaTypeSchema = z.enum(mediaTypeEnum.enumValues);

const createMediaSchema = z.object({
  filename: z.string().min(1).max(255),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive(),
  path: z.string().min(1).max(500),
  url: z.string().min(1).max(500),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  type: mediaTypeSchema.default("image"),
  alt: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  description: z.string().optional(),
});

const updateMediaSchema = z.object({
  id: z.string().uuid(),
  alt: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  description: z.string().optional(),
});

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .optional(),
});

const updateTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .optional(),
});

// ============================================================================
// Router
// ============================================================================

export const mediaRouter = createTRPCRouter({
  // ========================================
  // Protected Procedures (for authenticated users)
  // ========================================

  /**
   * List media items with pagination
   */
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(24),
        type: mediaTypeSchema.optional(),
        search: z.string().optional(),
        tagIds: z.array(z.string().uuid()).optional(),
        onlyMine: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, type, search, tagIds, onlyMine } = input;
      const offset = (page - 1) * limit;

      const conditions = [];

      // Filter by type
      if (type) {
        conditions.push(eq(media.type, type));
      }

      // Filter by owner if onlyMine
      if (onlyMine) {
        conditions.push(eq(media.uploadedBy, ctx.session.user.id));
      }

      // Search by filename, alt text, or tags
      if (search) {
        // First, find tags matching search
        const matchingTags = await ctx.db.query.mediaTags.findMany({
          where: ilike(mediaTags.name, `%${search}%`),
          columns: { id: true },
        });

        const tagMatchingMediaIds =
          matchingTags.length > 0
            ? await ctx.db
                .select({ mediaId: mediaToTags.mediaId })
                .from(mediaToTags)
                .where(
                  inArray(
                    mediaToTags.tagId,
                    matchingTags.map((t) => t.id)
                  )
                )
            : [];

        conditions.push(
          or(
            ilike(media.originalFilename, `%${search}%`),
            ilike(media.alt, `%${search}%`),
            ilike(media.title, `%${search}%`),
            tagMatchingMediaIds.length > 0
              ? inArray(
                  media.id,
                  tagMatchingMediaIds.map((t) => t.mediaId)
                )
              : undefined
          )
        );
      }

      // Filter by specific tags
      if (tagIds && tagIds.length > 0) {
        const mediaIdsWithTags = await ctx.db
          .select({ mediaId: mediaToTags.mediaId })
          .from(mediaToTags)
          .where(inArray(mediaToTags.tagId, tagIds));

        if (mediaIdsWithTags.length > 0) {
          conditions.push(
            inArray(
              media.id,
              mediaIdsWithTags.map((m) => m.mediaId)
            )
          );
        } else {
          // No media with these tags, return empty
          return {
            items: [],
            total: 0,
            page,
            totalPages: 0,
          };
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalCount] = await Promise.all([
        ctx.db.query.media.findMany({
          where: whereClause,
          orderBy: [desc(media.createdAt)],
          limit,
          offset,
          with: {
            uploader: {
              columns: {
                id: true,
                name: true,
                image: true,
              },
            },
            tags: {
              with: {
                tag: true,
              },
            },
          },
        }),
        ctx.db.select({ count: count() }).from(media).where(whereClause),
      ]);

      return {
        items,
        total: totalCount[0]?.count ?? 0,
        page,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / limit),
      };
    }),

  /**
   * Get single media item by ID
   */
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.id),
        with: {
          uploader: {
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
          message: "Медиафайл не найден",
        });
      }

      return item;
    }),

  /**
   * Create media record (called after file upload)
   */
  create: protectedProcedure.input(createMediaSchema).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(media)
      .values({
        ...input,
        uploadedBy: ctx.session.user.id,
      })
      .returning();

    return created;
  }),

  /**
   * Update media metadata
   */
  update: protectedProcedure.input(updateMediaSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;

    // Check existence and ownership
    const existing = await ctx.db.query.media.findFirst({
      where: eq(media.id, id),
    });

    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Медиафайл не найден",
      });
    }

    // Allow update only if owner or admin
    const isAdmin = ctx.session.user.roles?.some((role) =>
      ["Root", "SuperAdmin", "Admin"].includes(role)
    );
    if (existing.uploadedBy !== ctx.session.user.id && !isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Нет прав на редактирование",
      });
    }

    const [updated] = await ctx.db.update(media).set(data).where(eq(media.id, id)).returning();

    return updated;
  }),

  /**
   * Delete media item
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Медиафайл не найден",
        });
      }

      // Allow delete only if owner or admin
      const isAdmin = ctx.session.user.roles?.some((role) =>
        ["Root", "SuperAdmin", "Admin"].includes(role)
      );
      if (existing.uploadedBy !== ctx.session.user.id && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Нет прав на удаление",
        });
      }

      // Delete file from S3
      try {
        const { deleteFromS3, extractS3Key } = await import("~/lib/s3/client");
        const s3Key = extractS3Key(existing.url);
        if (s3Key) {
          await deleteFromS3(s3Key);
          logger.info(`[Media] Deleted file from S3: ${s3Key}`);
        }
      } catch (error) {
        logger.error("[Media] Failed to delete file from S3:", error);
      }

      await ctx.db.delete(media).where(eq(media.id, input.id));

      return { success: true };
    }),

  // ========================================
  // Tag Management
  // ========================================

  /**
   * List all tags
   */
  listTags: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.mediaTags.findMany({
      orderBy: [desc(mediaTags.name)],
    });
  }),

  /**
   * Create new tag
   */
  createTag: protectedProcedure.input(createTagSchema).mutation(async ({ ctx, input }) => {
    // Generate slug from name
    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const [created] = await ctx.db
      .insert(mediaTags)
      .values({
        name: input.name,
        slug,
        color: input.color,
      })
      .returning();

    return created;
  }),

  /**
   * Update tag
   */
  updateTag: protectedProcedure.input(updateTagSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;

    // Check if tag exists
    const existing = await ctx.db.query.mediaTags.findFirst({
      where: eq(mediaTags.id, id),
    });

    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Тег не найден",
      });
    }

    // Update slug if name changed
    const updates: any = { ...data };
    if (data.name) {
      updates.slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    const [updated] = await ctx.db
      .update(mediaTags)
      .set(updates)
      .where(eq(mediaTags.id, id))
      .returning();

    return updated;
  }),

  /**
   * Delete tag
   */
  deleteTag: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.mediaTags.findFirst({
        where: eq(mediaTags.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Тег не найден",
        });
      }

      await ctx.db.delete(mediaTags).where(eq(mediaTags.id, input.id));

      return { success: true };
    }),

  /**
   * Add tags to media
   */
  addTagsToMedia: protectedProcedure
    .input(
      z.object({
        mediaId: z.string().uuid(),
        tagIds: z.array(z.string().uuid()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check media exists
      const mediaItem = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.mediaId),
      });

      if (!mediaItem) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Медиафайл не найден",
        });
      }

      // Insert tag associations
      const values = input.tagIds.map((tagId) => ({
        mediaId: input.mediaId,
        tagId,
      }));

      await ctx.db.insert(mediaToTags).values(values).onConflictDoNothing();

      return { success: true };
    }),

  /**
   * Remove tags from media
   */
  removeTagsFromMedia: protectedProcedure
    .input(
      z.object({
        mediaId: z.string().uuid(),
        tagIds: z.array(z.string().uuid()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(mediaToTags)
        .where(
          and(eq(mediaToTags.mediaId, input.mediaId), inArray(mediaToTags.tagId, input.tagIds))
        );

      return { success: true };
    }),

  // ========================================
  // Admin Procedures
  // ========================================

  /**
   * Admin: Get all media with full info
   */
  adminList: adminProcedureWithFeature("directory:manage")
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(24),
        type: mediaTypeSchema.optional(),
        search: z.string().optional(),
        uploadedBy: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, type, search, uploadedBy } = input;
      const offset = (page - 1) * limit;

      const conditions = [];

      if (type) {
        conditions.push(eq(media.type, type));
      }

      if (uploadedBy) {
        conditions.push(eq(media.uploadedBy, uploadedBy));
      }

      if (search) {
        conditions.push(
          or(
            ilike(media.originalFilename, `%${search}%`),
            ilike(media.alt, `%${search}%`),
            ilike(media.title, `%${search}%`)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalCount] = await Promise.all([
        ctx.db.query.media.findMany({
          where: whereClause,
          orderBy: [desc(media.createdAt)],
          limit,
          offset,
          with: {
            uploader: {
              columns: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        }),
        ctx.db.select({ count: count() }).from(media).where(whereClause),
      ]);

      return {
        items,
        total: totalCount[0]?.count ?? 0,
        page,
        totalPages: Math.ceil((totalCount[0]?.count ?? 0) / limit),
      };
    }),

  /**
   * Admin: Get media stats
   */
  stats: adminProcedureWithFeature("directory:manage").query(async ({ ctx }) => {
    const [imageCount, documentCount, totalCount, totalSize] = await Promise.all([
      ctx.db.select({ count: count() }).from(media).where(eq(media.type, "image")),
      ctx.db.select({ count: count() }).from(media).where(eq(media.type, "document")),
      ctx.db.select({ count: count() }).from(media),
      ctx.db.select({ total: count() }).from(media),
    ]);

    return {
      images: imageCount[0]?.count ?? 0,
      documents: documentCount[0]?.count ?? 0,
      total: totalCount[0]?.count ?? 0,
    };
  }),
});
