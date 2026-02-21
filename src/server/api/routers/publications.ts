import type { JSONContent } from "@tiptap/react";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, not, or, sql } from "drizzle-orm";
import { z } from "zod";
import { RRule } from "rrule";

import { buildRRuleDtstart, toMoscowDateStr } from "~/lib/date-utils";
import { logger } from "~/lib/logger";
import { deleteImage } from "~/lib/upload/image-processor";
import {
  eventRecurrenceTypeEnum,
  knowledgeBaseArticles,
  news,
  publications,
  publicationStatusEnum,
  publicationTags,
  publicationTargets,
  publicationTypeEnum,
  userApartments,
  userInterestBuildings,
  userParkingSpots,
  userRoles,
} from "~/server/db/schema";
import { sendTelegramNotificationAsync } from "~/server/notifications/telegram";

import {
  adminProcedureWithFeature,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../trpc";

// ============================================================================
// Validation Schemas
// ============================================================================

const publicationTypeSchema = z.enum(publicationTypeEnum.enumValues);
const publicationStatusSchema = z.enum(publicationStatusEnum.enumValues);

// Event recurrence schema
const eventRecurrenceTypeSchema = z.enum(eventRecurrenceTypeEnum.enumValues);

// Event-specific fields schema
const eventFieldsSchema = z.object({
  eventAllDay: z.boolean().default(false),
  eventStartAt: z.date().optional(),
  eventEndAt: z.date().optional(),
  eventLocation: z.string().max(500).optional(),
  eventLatitude: z.string().optional(),
  eventLongitude: z.string().optional(),
  eventMaxAttendees: z.number().int().min(0).optional(),
  eventExternalUrl: z.string().url().max(500).optional(),
  eventOrganizer: z.string().max(255).optional(),
  eventOrganizerPhone: z.string().max(20).optional(),
  // Recurrence fields
  eventRecurrenceType: eventRecurrenceTypeSchema.optional(),
  eventRecurrenceRule: z.string().max(500).optional(),
  eventRecurrenceUntil: z.date().optional(),
  linkedContentIds: z.array(z.object({ id: z.string().uuid(), type: z.string(), title: z.string().optional() })).optional(),
});

// Target for publication binding
const publicationTargetSchema = z.object({
  targetType: z.enum(["complex", "uk", "building", "entrance", "floor"]),
  targetId: z.string().optional(), // null for complex/uk
});

const createPublicationSchema = z
  .object({
    title: z.string().min(1).max(255),
    content: z.any() as z.ZodType<JSONContent>,
    coverImage: z.string().optional(),
    type: publicationTypeSchema.default("announcement"),
    buildingId: z.string().optional(), // К какому строению относится (legacy)
    targets: z.array(publicationTargetSchema).optional(), // Новая система привязок
    isUrgent: z.boolean().default(false),
    isAnonymous: z.boolean().default(false), // Анонимная публикация
    publishAt: z.date().optional(), // Планируемая дата публикации
    publishToTelegram: z.boolean().default(false), // Публикация в Telegram
    tagIds: z.array(z.string()).optional(),
    // Event-specific fields (required when type is "event")
    ...eventFieldsSchema.shape,
  })
  .refine(
    (data) => {
      // If type is "event", eventStartAt is required
      if (data.type === "event" && !data.eventStartAt) {
        return false;
      }
      return true;
    },
    {
      message: "Дата начала события обязательна для мероприятий",
      path: ["eventStartAt"],
    }
  );

const updatePublicationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  content: (z.any() as z.ZodType<JSONContent>).optional(),
  coverImage: z.string().nullable().optional(),
  type: publicationTypeSchema.optional(),
  buildingId: z.string().nullable().optional(),
  targets: z.array(publicationTargetSchema).optional(),
  isUrgent: z.boolean().optional(),
  isAnonymous: z.boolean().optional(),
  publishAt: z.date().nullable().optional(),
  publishToTelegram: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
  // Event-specific fields
  eventAllDay: z.boolean().optional(),
  eventStartAt: z.date().nullable().optional(),
  eventEndAt: z.date().nullable().optional(),
  eventLocation: z.string().max(500).nullable().optional(),
  eventLatitude: z.string().nullable().optional(),
  eventLongitude: z.string().nullable().optional(),
  eventMaxAttendees: z.number().int().min(0).nullable().optional(),
  eventExternalUrl: z.string().url().max(500).nullable().optional(),
  eventOrganizer: z.string().max(255).nullable().optional(),
  eventOrganizerPhone: z.string().max(20).nullable().optional(),
  // Event recurrence fields
  eventRecurrenceType: eventRecurrenceTypeSchema.nullable().optional(),
  eventRecurrenceRule: z.string().max(500).nullable().optional(),
  eventRecurrenceUntil: z.date().nullable().optional(),
  linkedContentIds: z.array(z.object({ id: z.string().uuid(), type: z.string(), title: z.string().optional() })).nullable().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Roles that can create publications
 */
const PUBLICATION_ROLES = [
  "ApartmentOwner",
  "ApartmentResident",
  "ParkingOwner",
  "ParkingResident",
  "Editor",
  "Moderator",
  "Admin",
  "SuperAdmin",
  "Root",
  "ComplexChairman",
  "ComplexRepresenative",
  "BuildingChairman",
] as const;

/**
 * Check if user can create publications
 */
async function canUserPublish(
  db: typeof import("~/server/db").db,
  userId: string
): Promise<boolean> {
  // Check if user has any of the allowed roles
  const roles = await db.query.userRoles.findMany({
    where: eq(userRoles.userId, userId),
  });

  const userRoleNames = roles.map((r) => r.role);
  return userRoleNames.some((role) =>
    PUBLICATION_ROLES.includes(role as (typeof PUBLICATION_ROLES)[number])
  );
}

/**
 * Get user's buildings from property ownership and interest settings
 */
async function getUserBuildings(
  db: typeof import("~/server/db").db,
  userId: string
): Promise<string[]> {
  const buildingIds = new Set<string>();

  // From interest buildings
  const interests = await db.query.userInterestBuildings.findMany({
    where: eq(userInterestBuildings.userId, userId),
  });
  interests.forEach((i) => buildingIds.add(i.buildingId));

  // From owned/rented apartments
  const apartments = await db.query.userApartments.findMany({
    where: and(eq(userApartments.userId, userId), sql`${userApartments.revokedAt} IS NULL`),
    with: {
      apartment: {
        with: {
          floor: {
            with: {
              entrance: true,
            },
          },
        },
      },
    },
  });
  apartments.forEach((a) => {
    const buildingId = a.apartment?.floor?.entrance?.buildingId;
    if (buildingId) buildingIds.add(buildingId);
  });

  // From owned/rented parking spots
  const parkings = await db.query.userParkingSpots.findMany({
    where: and(eq(userParkingSpots.userId, userId), sql`${userParkingSpots.revokedAt} IS NULL`),
    with: {
      parkingSpot: {
        with: {
          floor: {
            with: {
              parking: true,
            },
          },
        },
      },
    },
  });
  parkings.forEach((p) => {
    const buildingId = p.parkingSpot?.floor?.parking?.buildingId;
    if (buildingId) buildingIds.add(buildingId);
  });

  return Array.from(buildingIds);
}

// ============================================================================
// Router
// ============================================================================

export const publicationsRouter = createTRPCRouter({
  // ==================== User Procedures ====================

  /**
   * Check if current user can create publications
   */
  canPublish: protectedProcedure.query(async ({ ctx }) => {
    return canUserPublish(ctx.db, ctx.session.user.id);
  }),

  /**
   * Get current user's publications
   */
  my: protectedProcedure
    .input(
      z.object({
        status: publicationStatusSchema.optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { page, limit, status } = input;
      const offset = (page - 1) * limit;

      const conditions = [eq(publications.authorId, userId)];
      if (status) {
        conditions.push(eq(publications.status, status));
      }

      const items = await ctx.db.query.publications.findMany({
        where: and(...conditions),
        with: {
          building: true,
          publicationTags: {
            with: {
              tag: true,
            },
          },
        },
        orderBy: desc(publications.createdAt),
        limit,
        offset,
      });

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(and(...conditions));

      return {
        items,
        total: totalResult?.count ?? 0,
        page,
        totalPages: Math.ceil((totalResult?.count ?? 0) / limit),
      };
    }),

  /**
   * Create a new publication
   */
  create: protectedProcedure.input(createPublicationSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    // Check if user can publish
    const canPublish = await canUserPublish(ctx.db, userId);
    if (!canPublish) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Для создания публикаций необходимо иметь подтверждённую собственность или соответствующую роль",
      });
    }

    // Validate building access if buildingId is provided
    if (input.buildingId) {
      const userBuildings = await getUserBuildings(ctx.db, userId);
      if (!userBuildings.includes(input.buildingId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "У вас нет доступа к этому строению",
        });
      }
    }

    // Create publication (goes to moderation for regular users)
    const userRolesData = await ctx.db.query.userRoles.findMany({
      where: eq(userRoles.userId, userId),
    });
    const isAdmin = userRolesData.some((r) =>
      ["Root", "SuperAdmin", "Admin", "Editor", "Moderator"].includes(r.role)
    );

    const [publication] = await ctx.db
      .insert(publications)
      .values({
        title: input.title,
        content: input.content,
        coverImage: input.coverImage,
        type: input.type,
        status: isAdmin ? "published" : "pending", // Admins bypass moderation
        buildingId: input.buildingId,
        isUrgent: input.isUrgent,
        isAnonymous: input.isAnonymous,
        publishAt: input.publishAt,
        publishToTelegram: isAdmin ? input.publishToTelegram : false, // Only admins can publish to TG
        authorId: userId,
        // Event-specific fields
        eventAllDay: input.eventAllDay ?? false,
        eventStartAt: input.eventStartAt,
        eventEndAt: input.eventEndAt,
        eventLocation: input.eventLocation,
        eventLatitude: input.eventLatitude,
        eventLongitude: input.eventLongitude,
        eventMaxAttendees: input.eventMaxAttendees,
        eventExternalUrl: input.eventExternalUrl,
        eventOrganizer: input.eventOrganizer,
        eventOrganizerPhone: input.eventOrganizerPhone,
        // Event recurrence fields
        eventRecurrenceType: input.eventRecurrenceType,
        eventRecurrenceRule: input.eventRecurrenceRule,
        eventRecurrenceUntil: input.eventRecurrenceUntil,
        linkedContentIds: input.linkedContentIds,
      })
      .returning();

    if (!publication) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Не удалось создать публикацию",
      });
    }

    // Add tags
    if (input.tagIds && input.tagIds.length > 0) {
      await ctx.db.insert(publicationTags).values(
        input.tagIds.map((tagId) => ({
          publicationId: publication.id,
          tagId,
        }))
      );
    }

    // Add targets
    if (input.targets && input.targets.length > 0) {
      await ctx.db.insert(publicationTargets).values(
        input.targets.map((target) => ({
          publicationId: publication.id,
          targetType: target.targetType,
          targetId: target.targetId ?? null,
        }))
      );
    }

    // Send Telegram notification
    const typeName: Record<string, string> = {
      announcement: "объявление",
      event: "мероприятие",
      help_request: "просьбу о помощи",
      lost_found: "сообщение о потере/находке",
      recommendation: "рекомендацию",
      poll: "опрос",
      discussion: "обсуждение",
      news: "новость",
      question: "вопрос",
    };
    const typeLabel = typeName[input.type] ?? "публикацию";

    sendTelegramNotificationAsync({
      event: isAdmin ? "publication_published" : "publication_created",
      title: isAdmin ? `Опубликовано ${typeLabel}` : `Создано ${typeLabel}`,
      description: input.title,
      metadata: {
        Тип: typeLabel,
        Статус: isAdmin ? "Опубликовано" : "На модерации",
        ...(input.isUrgent ? { Срочно: "Да" } : {}),
      },
      userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined,
    });

    return publication;
  }),

  /**
   * Update own publication (authors and admins can edit published items)
   */
  update: protectedProcedure.input(updatePublicationSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const { id, tagIds, ...updateData } = input;

    // Check if user is admin
    const userRolesData = await ctx.db.query.userRoles.findMany({
      where: eq(userRoles.userId, userId),
    });
    const isAdmin = userRolesData.some((r) =>
      ["Root", "SuperAdmin", "Admin", "Editor", "Moderator"].includes(r.role)
    );

    // Find publication
    const existing = await ctx.db.query.publications.findFirst({
      where: eq(publications.id, id),
    });

    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Публикация не найдена",
      });
    }

    const isAuthor = existing.authorId === userId;

    // Check permission: must be author or admin
    if (!isAuthor && !isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Вы не можете редактировать чужую публикацию",
      });
    }

    // Validate building access if changing buildingId (only for non-admins)
    if (!isAdmin && updateData.buildingId && updateData.buildingId !== existing.buildingId) {
      const userBuildings = await getUserBuildings(ctx.db, userId);
      if (!userBuildings.includes(updateData.buildingId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "У вас нет доступа к этому строению",
        });
      }
    }

    // Delete old cover image from S3 if it's being replaced
    if (updateData.coverImage !== undefined && existing.coverImage) {
      if (updateData.coverImage !== existing.coverImage) {
        try {
          await deleteImage(existing.coverImage);
          logger.info(`[Publications] Deleted old cover image: ${existing.coverImage}`);
        } catch (error) {
          logger.error("[Publications] Failed to delete old cover image:", error);
        }
      }
    }

    // Determine new status:
    // - Admins keep existing status (or published if was published)
    // - Authors editing their own: re-submit to moderation if it was published
    const newStatus = isAdmin
      ? existing.status
      : existing.status === "published"
        ? "pending"
        : existing.status;

    // Update publication
    await ctx.db
      .update(publications)
      .set({
        ...updateData,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(publications.id, id));

    // Update tags
    if (tagIds !== undefined) {
      await ctx.db.delete(publicationTags).where(eq(publicationTags.publicationId, id));

      if (tagIds.length > 0) {
        await ctx.db.insert(publicationTags).values(
          tagIds.map((tagId) => ({
            publicationId: id,
            tagId,
          }))
        );
      }
    }

    return { success: true };
  }),

  /**
   * Delete own publication
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.db.query.publications.findFirst({
        where: eq(publications.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Публикация не найдена",
        });
      }

      if (existing.authorId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Вы не можете удалить чужую публикацию",
        });
      }

      // Delete cover image from S3 if it exists
      if (existing.coverImage) {
        try {
          await deleteImage(existing.coverImage);
          logger.info(`[Publications] Deleted cover image from S3: ${existing.coverImage}`);
        } catch (error) {
          logger.error("[Publications] Failed to delete cover image from S3:", error);
        }
      }

      await ctx.db.delete(publications).where(eq(publications.id, input.id));

      return { success: true };
    }),

  /**
   * Submit draft for moderation
   */
  submit: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.db.query.publications.findFirst({
        where: eq(publications.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Публикация не найдена",
        });
      }

      if (existing.authorId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Вы не можете отправить чужую публикацию",
        });
      }

      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Только черновики можно отправить на модерацию",
        });
      }

      await ctx.db
        .update(publications)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(publications.id, input.id));

      return { success: true };
    }),

  // ==================== Public Procedures ====================

  /**
   * List published publications (public feed)
   */
  list: publicProcedure
    .input(
      z.object({
        type: publicationTypeSchema.optional(),
        buildingId: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, type, buildingId } = input;
      const offset = (page - 1) * limit;

      const conditions = [eq(publications.status, "published")];
      if (type) {
        conditions.push(eq(publications.type, type));
      }
      if (buildingId) {
        conditions.push(
          or(eq(publications.buildingId, buildingId), sql`${publications.buildingId} IS NULL`)!
        );
      }

      const items = await ctx.db.query.publications.findMany({
        where: and(...conditions),
        with: {
          author: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
          building: true,
          publicationTags: {
            with: {
              tag: true,
            },
          },
        },
        orderBy: [desc(publications.isPinned), desc(publications.createdAt)],
        limit,
        offset,
      });

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(and(...conditions));

      return {
        items,
        total: totalResult?.count ?? 0,
        page,
        totalPages: Math.ceil((totalResult?.count ?? 0) / limit),
      };
    }),

  /**
   * Get latest publications (for homepage widget)
   * Returns announcements, discussions, questions, etc. (not events)
   */
  latest: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(4),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      const items = await ctx.db.query.publications.findMany({
        where: and(
          eq(publications.status, "published"),
          ne(publications.type, "event"),
          or(isNull(publications.publishAt), lte(publications.publishAt, now))
        ),
        with: {
          author: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
          building: true,
        },
        orderBy: [desc(publications.isPinned), desc(publications.createdAt)],
        limit: input.limit,
      });

      return items;
    }),

  /**
   * Get upcoming events (for homepage widget)
   * Returns events that haven't ended yet, sorted by start date
   */
  upcomingEvents: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(4),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      const items = await ctx.db.query.publications.findMany({
        where: and(
          eq(publications.status, "published"),
          eq(publications.type, "event"),
          // Only if published (publishAt is null or in the past)
          or(isNull(publications.publishAt), lte(publications.publishAt, now)),
          // Event hasn't ended yet:
          // - endAt is in the future, OR
          // - endAt is null AND startAt is in the future
          or(
            gte(publications.eventEndAt, now),
            and(isNull(publications.eventEndAt), gte(publications.eventStartAt, now))
          )
        ),
        with: {
          author: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
          building: true,
        },
        // Sort by event start date (soonest first), then by pinned
        orderBy: [desc(publications.isPinned), publications.eventStartAt],
        limit: input.limit,
      });

      return items;
    }),

  /**
   * Get events for the next 7 days (weekly agenda for homepage)
   * Returns events grouped by day, using Moscow timezone (UTC+3)
   */
  weeklyAgenda: publicProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const DAY_MS = 24 * 60 * 60 * 1000;

    const items = await ctx.db.query.publications.findMany({
      where: and(
        eq(publications.status, "published"),
        eq(publications.type, "event"),
        or(isNull(publications.publishAt), lte(publications.publishAt, now)),
        or(
          // Non-recurring: falls within the 14-day window
          and(
            or(
              eq(publications.eventRecurrenceType, "none"),
              isNull(publications.eventRecurrenceType),
            ),
            lte(publications.eventStartAt, twoWeeksLater),
            or(
              gte(publications.eventEndAt, now),
              and(isNull(publications.eventEndAt), gte(publications.eventStartAt, now)),
            ),
          ),
          // Recurring: series has not ended
          and(
            not(eq(publications.eventRecurrenceType, "none")),
            isNotNull(publications.eventRecurrenceType),
            or(
              isNull(publications.eventRecurrenceUntil),
              gte(publications.eventRecurrenceUntil, now),
            ),
          ),
        ),
      ),
      with: {
        author: { columns: { id: true, name: true, image: true } },
        building: true,
      },
      orderBy: [publications.eventStartAt],
    });

    // Group events by Moscow-local date
    const grouped: Record<string, typeof items> = {};

    const addToDay = (day: string, event: (typeof items)[number]) => {
      if (!grouped[day]) grouped[day] = [];
      if (!grouped[day]?.some((e) => e.id === event.id)) {
        grouped[day]?.push(event);
      }
    };

    const nowDateStr = toMoscowDateStr(now);
    const twoWeeksLaterStr = toMoscowDateStr(twoWeeksLater);

    for (const event of items) {
      if (!event.eventStartAt) continue;

      // --- Recurring events ---
      if (event.eventRecurrenceType && event.eventRecurrenceType !== "none" && event.eventRecurrenceRule) {
        const ruleOptions = RRule.parseString(event.eventRecurrenceRule);
        ruleOptions.dtstart = buildRRuleDtstart(event.eventStartAt);
        const rule = new RRule(ruleOptions);

        // Expand occurrences within the window
        const occurrences = rule.between(
          // Start from beginning of today (Moscow midnight in UTC)
          new Date(now.getTime() - (now.getTime() % DAY_MS)),
          twoWeeksLater,
          true,
        );
        if (occurrences.length === 0) continue;

        // Place the event on its first (next) occurrence date only — one card in list
        const nextOcc = occurrences[0]!;
        const agendaDate = toMoscowDateStr(nextOcc);
        if (agendaDate >= nowDateStr && agendaDate <= twoWeeksLaterStr) {
          addToDay(agendaDate, event);
        }
        continue;
      }

      // --- Non-recurring: all-day range events ---
      if (event.eventAllDay && event.eventEndAt) {
        const endStr = toMoscowDateStr(event.eventEndAt);
        const cursor = new Date(event.eventStartAt);
        while (toMoscowDateStr(cursor) <= endStr) {
          const day = toMoscowDateStr(cursor);
          if (day >= nowDateStr && day <= twoWeeksLaterStr) {
            addToDay(day, event);
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        continue;
      }

      // --- Non-recurring: single timed event ---
      const day = toMoscowDateStr(event.eventStartAt);
      addToDay(day, event);
    }

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, events]) => ({ date, events }));
  }),

  /**
   * Get events for a given month (Moscow time).
   * Returns all events (non-recurring + recurring) that have at least one occurrence in the month.
   */
  monthlyEvents: publicProcedure
    .input(
      z.object({
        year: z.number().int().min(2020).max(2100),
        month: z.number().int().min(1).max(12), // 1-based
      })
    )
    .query(async ({ ctx, input }) => {
      const { year, month } = input;
      // Moscow is UTC+3; month boundaries in UTC
      const MOSCOW_OFFSET_SECONDS = 3 * 60 * 60;
      // Start of month in Moscow = UTC midnight of the 1st minus 3h (UTC+3)
      const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - MOSCOW_OFFSET_SECONDS * 1000);
      const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0) - MOSCOW_OFFSET_SECONDS * 1000); // exclusive

      const now = new Date();

      const items = await ctx.db.query.publications.findMany({
        where: and(
          eq(publications.status, "published"),
          eq(publications.type, "event"),
          or(isNull(publications.publishAt), lte(publications.publishAt, now)),
          or(
            // Non-recurring: overlaps with the month window
            and(
              or(
                eq(publications.eventRecurrenceType, "none"),
                isNull(publications.eventRecurrenceType),
              ),
              lte(publications.eventStartAt, monthEnd),
              or(
                gte(publications.eventEndAt, monthStart),
                and(isNull(publications.eventEndAt), gte(publications.eventStartAt, monthStart)),
              ),
            ),
            // Recurring: series started before month end and hasn't ended before month start
            and(
              not(eq(publications.eventRecurrenceType, "none")),
              isNotNull(publications.eventRecurrenceType),
              lte(publications.eventStartAt, monthEnd),
              or(
                isNull(publications.eventRecurrenceUntil),
                gte(publications.eventRecurrenceUntil, monthStart),
              ),
            ),
          ),
        ),
        with: {
          author: { columns: { id: true, name: true, image: true } },
          building: true,
        },
        orderBy: [publications.eventStartAt],
      });

      // Expand recurring events and determine their occurrence date(s) in this month
      const result: Array<{
        id: string;
        title: string;
        eventAllDay: boolean;
        eventStartAt: Date | null;
        eventEndAt: Date | null;
        eventLocation: string | null;
        eventRecurrenceType: string | null;
        eventRecurrenceRule: string | null;
        occurrenceDate: string; // YYYY-MM-DD (Moscow)
      }> = [];

      const toMoscow = (d: Date) => toMoscowDateStr(d);

      // YYYY-MM-DD boundaries for this month
      const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
      const monthEndStr = `${nextMonth.y}-${String(nextMonth.m).padStart(2, "0")}-01`; // exclusive

      for (const event of items) {
        if (!event.eventStartAt) continue;

        const baseRow = {
          id: event.id,
          title: event.title,
          eventAllDay: event.eventAllDay,
          eventStartAt: event.eventStartAt,
          eventEndAt: event.eventEndAt,
          eventLocation: event.eventLocation ?? null,
          eventRecurrenceType: event.eventRecurrenceType ?? null,
          eventRecurrenceRule: event.eventRecurrenceRule ?? null,
        };

        if (event.eventRecurrenceType && event.eventRecurrenceType !== "none" && event.eventRecurrenceRule) {
          const ruleOptions = RRule.parseString(event.eventRecurrenceRule);
          ruleOptions.dtstart = buildRRuleDtstart(event.eventStartAt);
          const rule = new RRule(ruleOptions);
          const occurrences = rule.between(monthStart, monthEnd, true);
          for (const occ of occurrences) {
            const dateStr = toMoscow(occ);
            if (dateStr >= monthStartStr && dateStr < monthEndStr) {
              // Deduplicate: only add one entry per event per day
              if (!result.some((r) => r.id === event.id && r.occurrenceDate === dateStr)) {
                result.push({ ...baseRow, occurrenceDate: dateStr });
              }
            }
          }
          continue;
        }

        // Non-recurring
        const startStr = toMoscow(event.eventStartAt);
        const endStr = event.eventEndAt ? toMoscow(event.eventEndAt) : startStr;

        // For all-day ranges spanning multiple days, emit entry for the start day
        const occDate = startStr >= monthStartStr ? startStr : monthStartStr;
        if (occDate >= monthStartStr && occDate < monthEndStr) {
          result.push({ ...baseRow, occurrenceDate: startStr >= monthStartStr ? startStr : monthStartStr });
        }
        void endStr; // endStr is used implicitly for range check above
      }

      // Sort by occurrence date then by time
      result.sort((a, b) => {
        if (a.occurrenceDate !== b.occurrenceDate) return a.occurrenceDate.localeCompare(b.occurrenceDate);
        const at = a.eventStartAt?.getTime() ?? 0;
        const bt = b.eventStartAt?.getTime() ?? 0;
        return at - bt;
      });

      return result;
    }),

  /**
   * Get a single publication by ID
   */
  byId: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const publication = await ctx.db.query.publications.findFirst({
      where: eq(publications.id, input.id),
      with: {
        author: {
          columns: {
            id: true,
            name: true,
            image: true,
          },
        },
        building: true,
        publicationTags: {
          with: {
            tag: true,
          },
        },
      },
    });

    if (!publication) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Публикация не найдена",
      });
    }

    // Only published publications are publicly accessible
    if (publication.status !== "published") {
      const session = ctx.session;
      const isAuthor = session?.user?.id === publication.authorId;
      const isAdmin = session?.user?.isAdmin;

      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Публикация не найдена",
        });
      }
    }

    return publication;
  }),

  /**
   * Search across all content types for linking
   * Returns publications (events, announcements), news, and knowledge articles
   */
  searchContent: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.query}%`;
      const limit = 8;

      const [pubResults, newsResults, kbResults] = await Promise.all([
        ctx.db
          .select({ id: publications.id, title: publications.title, type: publications.type })
          .from(publications)
          .where(
            and(
              ilike(publications.title, pattern),
              or(
                eq(publications.status, "published"),
                eq(publications.status, "pending")
              )
            )
          )
          .orderBy(desc(publications.createdAt))
          .limit(limit),
        ctx.db
          .select({ id: news.id, title: news.title })
          .from(news)
          .where(and(ilike(news.title, pattern), eq(news.status, "published")))
          .orderBy(desc(news.createdAt))
          .limit(limit),
        ctx.db
          .select({ id: knowledgeBaseArticles.id, title: knowledgeBaseArticles.title })
          .from(knowledgeBaseArticles)
          .where(and(ilike(knowledgeBaseArticles.title, pattern), eq(knowledgeBaseArticles.status, "published")))
          .orderBy(desc(knowledgeBaseArticles.createdAt))
          .limit(limit),
      ]);

      return [
        ...pubResults.map((r) => ({
          id: r.id,
          title: r.title,
          type: r.type === "event" ? "event" : "publication",
        })),
        ...newsResults.map((r) => ({ id: r.id, title: r.title, type: "news" as const })),
        ...kbResults.map((r) => ({ id: r.id, title: r.title, type: "knowledge" as const })),
      ];
    }),

  // ==================== Admin Procedures ====================

  admin: createTRPCRouter({
    /**
     * List all publications for moderation
     */
    list: adminProcedureWithFeature("content:moderate")
      .input(
        z.object({
          status: publicationStatusSchema.optional(),
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(20),
        })
      )
      .query(async ({ ctx, input }) => {
        const { page, limit, status } = input;
        const offset = (page - 1) * limit;

        const conditions = [];
        if (status) {
          conditions.push(eq(publications.status, status));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const items = await ctx.db.query.publications.findMany({
          where: whereClause,
          with: {
            author: {
              columns: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            building: true,
            moderator: {
              columns: {
                id: true,
                name: true,
              },
            },
            publicationTags: {
              with: {
                tag: true,
              },
            },
          },
          orderBy: desc(publications.createdAt),
          limit,
          offset,
        });

        const [totalResult] = await ctx.db
          .select({ count: count() })
          .from(publications)
          .where(whereClause);

        return {
          items,
          total: totalResult?.count ?? 0,
          page,
          totalPages: Math.ceil((totalResult?.count ?? 0) / limit),
        };
      }),

    /**
     * Moderate a publication (approve/reject)
     */
    moderate: adminProcedureWithFeature("content:moderate")
      .input(
        z.object({
          id: z.string().uuid(),
          status: z.enum(["published", "rejected"]),
          comment: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await ctx.db.query.publications.findFirst({
          where: eq(publications.id, input.id),
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Публикация не найдена",
          });
        }

        await ctx.db
          .update(publications)
          .set({
            status: input.status,
            moderatedBy: ctx.session.user.id,
            moderatedAt: new Date(),
            moderationComment: input.comment,
            updatedAt: new Date(),
          })
          .where(eq(publications.id, input.id));

        // Send Telegram notification
        const typeName: Record<string, string> = {
          announcement: "объявление",
          event: "мероприятие",
          help_request: "просьба о помощи",
          lost_found: "сообщение о потере/находке",
          recommendation: "рекомендация",
          poll: "опрос",
          discussion: "обсуждение",
          news: "новость",
          question: "вопрос",
        };
        const typeLabel = typeName[existing.type] ?? "публикация";

        sendTelegramNotificationAsync({
          event: "publication_moderated",
          title: input.status === "published" ? `Публикация одобрена` : `Публикация отклонена`,
          description: existing.title,
          metadata: {
            Тип: typeLabel,
            Статус: input.status === "published" ? "Опубликовано" : "Отклонено",
            ...(input.comment ? { Комментарий: input.comment } : {}),
          },
          userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined,
        });

        return { success: true };
      }),

    /**
     * Toggle pin status
     */
    togglePin: adminProcedureWithFeature("content:moderate")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const existing = await ctx.db.query.publications.findFirst({
          where: eq(publications.id, input.id),
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Публикация не найдена",
          });
        }

        await ctx.db
          .update(publications)
          .set({
            isPinned: !existing.isPinned,
            updatedAt: new Date(),
          })
          .where(eq(publications.id, input.id));

        return { success: true, isPinned: !existing.isPinned };
      }),

    /**
     * Admin delete publication
     */
    delete: adminProcedureWithFeature("content:moderate")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        // Get existing publication to check for cover image
        const existing = await ctx.db.query.publications.findFirst({
          where: eq(publications.id, input.id),
        });

        // Delete cover image from S3 if it exists
        if (existing?.coverImage) {
          try {
            await deleteImage(existing.coverImage);
            logger.info(`[Publications] Admin deleted cover image from S3: ${existing.coverImage}`);
          } catch (error) {
            logger.error("[Publications] Failed to delete cover image from S3:", error);
          }
        }

        await ctx.db.delete(publications).where(eq(publications.id, input.id));
        return { success: true };
      }),

    /**
     * Get moderation statistics
     */
    stats: adminProcedureWithFeature("content:moderate").query(async ({ ctx }) => {
      const [pending] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(eq(publications.status, "pending"));

      const [published] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(eq(publications.status, "published"));

      const [rejected] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(eq(publications.status, "rejected"));

      return {
        pending: pending?.count ?? 0,
        published: published?.count ?? 0,
        rejected: rejected?.count ?? 0,
        total: (pending?.count ?? 0) + (published?.count ?? 0) + (rejected?.count ?? 0),
      };
    }),

    /**
     * Get event-specific statistics
     */
    eventStats: adminProcedureWithFeature("content:moderate").query(async ({ ctx }) => {
      const now = new Date();

      // Total events
      const [total] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(eq(publications.type, "event"));

      // Pending moderation
      const [pending] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(and(eq(publications.type, "event"), eq(publications.status, "pending")));

      // Published events
      const [published] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(and(eq(publications.type, "event"), eq(publications.status, "published")));

      // Upcoming events (published, eventStartAt > now)
      const [upcoming] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(
          and(
            eq(publications.type, "event"),
            eq(publications.status, "published"),
            gte(publications.eventStartAt, now)
          )
        );

      return {
        total: total?.count ?? 0,
        pending: pending?.count ?? 0,
        published: published?.count ?? 0,
        upcoming: upcoming?.count ?? 0,
      };
    }),
  }),
});
