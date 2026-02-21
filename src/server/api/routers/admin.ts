import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  BLOCK_CATEGORIES,
  type BlockCategory,
  RULES_VIOLATIONS,
  type RuleViolation,
} from "~/lib/block-reasons";
import { logger } from "~/lib/logger";
import {
  checkChatMember,
  getAdminChatId,
  getBotInfo,
  getChatAdministrators,
  isAdminChatConfigured,
} from "~/lib/telegram";
import { hasFeatureAccess, type UserRole } from "~/server/auth/rbac";
import {
  accounts,
  apartments,
  buildings,
  deletionRequests,
  directoryEntries,
  entrances,
  feedback,
  floors,
  knowledgeBaseArticles,
  listings,
  media,
  news,
  parkingFloors,
  parkings,
  parkingSpots,
  propertyClaims,
  publications,
  sessions,
  userApartments,
  userBlocks,
  userParkingSpots,
  userProfiles,
  userRoles,
  users,
} from "~/server/db/schema";

import {
  adminProcedure,
  adminProcedureWithFeature,
  createTRPCRouter,
  superAdminProcedure,
} from "../trpc";

// Zod schema for revocation templates
const revocationTemplateSchema = z.enum([
  "community_rules_violation",
  "role_owner_change",
  "custom",
]);

// Тексты шаблонов отзыва прав
const REVOCATION_TEMPLATES: Record<string, string> = {
  community_rules_violation: "Нарушение правил сообщества",
  role_owner_change: "Смена роли, смена владельца, изменение правового состояния",
};

// Zod schema for user role enum
const userRoleSchema = z.enum([
  "Root",
  "SuperAdmin",
  "Admin",
  "ApartmentOwner",
  "ApartmentResident",
  "ParkingOwner",
  "ParkingResident",
  "Editor",
  "Moderator",
  "Guest",
  "BuildingChairman",
  "ComplexChairman",
  "ComplexRepresenative",
  "StoreOwner",
  "StoreRepresenative",
]);

// Zod schema for block category
const blockCategorySchema = z.enum(["rules_violation", "fraud", "spam", "abuse", "other"]);

// Zod schema for rules violation
const rulesViolationSchema = z.enum([
  "3.1",
  "3.2",
  "3.3",
  "3.4",
  "3.5",
  "4.1",
  "4.2",
  "4.3",
  "5.1",
  "5.2",
]);

export const adminRouter = createTRPCRouter({
  // Get paginated list of users
  users: createTRPCRouter({
    list: adminProcedureWithFeature("users:view")
      .input(
        z.object({
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(20),
          search: z.string().optional(),
          roleFilter: userRoleSchema.optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const { page, limit, search, roleFilter } = input;
        const offset = (page - 1) * limit;

        // Build where conditions - always exclude deleted users
        const baseCondition = eq(users.isDeleted, false);
        const searchCondition = search
          ? and(
              baseCondition,
              or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
            )
          : baseCondition;

        // Get users with pagination (including tagline from profiles)
        const usersQuery = ctx.db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            image: users.image,
            emailVerified: users.emailVerified,
            createdAt: users.createdAt,
            tagline: userProfiles.tagline,
          })
          .from(users)
          .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
          .where(searchCondition)
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset(offset);

        const usersResult = await usersQuery;

        // Get total count
        const totalResult = await ctx.db
          .select({ count: count() })
          .from(users)
          .where(searchCondition);
        const total = totalResult[0]?.count ?? 0;

        // Get roles for each user
        const userIds = usersResult.map((u) => u.id);
        const rolesResult =
          userIds.length > 0
            ? await ctx.db
                .select({
                  userId: userRoles.userId,
                  role: userRoles.role,
                })
                .from(userRoles)
                .where(or(...userIds.map((id) => eq(userRoles.userId, id))) ?? undefined)
            : [];

        // Group roles by user
        const rolesByUser = rolesResult.reduce(
          (acc, { userId, role }) => {
            if (!acc[userId]) acc[userId] = [];
            acc[userId].push(role);
            return acc;
          },
          {} as Record<string, UserRole[]>
        );

        // Filter by role if specified
        let filteredUsers = usersResult.map((user) => ({
          ...user,
          roles: rolesByUser[user.id] ?? [],
          tagline: user.tagline ?? null,
        }));

        if (roleFilter) {
          filteredUsers = filteredUsers.filter((user) => user.roles.includes(roleFilter));
        }

        return {
          users: filteredUsers,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        };
      }),

    // Get single user by ID
    getById: adminProcedureWithFeature("users:view")
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, input.userId),
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        const roles = await ctx.db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, input.userId));

        return {
          ...user,
          roles: roles.map((r) => r.role),
        };
      }),

    // Update user roles
    updateRoles: adminProcedureWithFeature("users:roles")
      .input(
        z.object({
          userId: z.string().uuid(),
          roles: z.array(userRoleSchema),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { userId, roles: newRoles } = input;

        // Verify user exists
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Check if current user can assign these roles
        // Root can assign any role, SuperAdmin can assign non-Root roles
        const currentUserRoles = ctx.userRoles;
        const isRoot = currentUserRoles.includes("Root");
        const isSuperAdmin = currentUserRoles.includes("SuperAdmin");

        if (!isRoot && newRoles.includes("Root")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only Root can assign Root role",
          });
        }

        if (!isRoot && !isSuperAdmin && newRoles.includes("SuperAdmin")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only Root or SuperAdmin can assign SuperAdmin role",
          });
        }

        // Delete existing roles
        await ctx.db.delete(userRoles).where(eq(userRoles.userId, userId));

        // Insert new roles
        if (newRoles.length > 0) {
          await ctx.db.insert(userRoles).values(
            newRoles.map((role) => ({
              userId,
              role,
            }))
          );
        }

        return { success: true };
      }),

    // Delete user
    delete: adminProcedureWithFeature("users:delete")
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { userId } = input;

        // Prevent self-deletion
        if (userId === ctx.session.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot delete yourself",
          });
        }

        // Verify user exists
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Check if target user is Root (cannot be deleted)
        const targetRoles = await ctx.db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, userId));

        if (targetRoles.some((r) => r.role === "Root")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot delete Root user",
          });
        }

        // Delete user (cascades to roles, sessions, etc.)
        await ctx.db.delete(users).where(eq(users.id, userId));

        return { success: true };
      }),

    // Bulk delete users (for spam/bot accounts)
    bulkDelete: adminProcedureWithFeature("users:delete")
      .input(
        z.object({
          userIds: z.array(z.string().uuid()).min(1).max(50),
          reason: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { userIds, reason } = input;

        // Prevent self-deletion
        if (userIds.includes(ctx.session.user.id)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot delete yourself",
          });
        }

        // Fetch users to check for Root
        const usersToDelete = await ctx.db.query.users.findMany({
          where: inArray(users.id, userIds),
          with: {
            roles: {
              columns: {
                role: true,
              },
            },
          },
        });

        // Check if any user is Root
        const hasRoot = usersToDelete.some((user) => user.roles.some((r) => r.role === "Root"));

        if (hasRoot) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot delete Root user",
          });
        }

        // Check for blocking dependencies
        const usersWithDependencies: string[] = [];

        for (const userId of userIds) {
          const dependencies: string[] = [];

          // Check for publications
          const [publicationsCount] = await ctx.db
            .select({ count: count() })
            .from(publications)
            .where(eq(publications.authorId, userId));
          if (publicationsCount && publicationsCount.count > 0) {
            dependencies.push("публикации");
          }

          // Check for listings
          const [listingsCount] = await ctx.db
            .select({ count: count() })
            .from(listings)
            .where(eq(listings.userId, userId));
          if (listingsCount && listingsCount.count > 0) {
            dependencies.push("объявления");
          }

          // Check for news
          const [newsCount] = await ctx.db
            .select({ count: count() })
            .from(news)
            .where(eq(news.authorId, userId));
          if (newsCount && newsCount.count > 0) {
            dependencies.push("новости");
          }

          if (dependencies.length > 0) {
            const user = usersToDelete.find((u) => u.id === userId);
            usersWithDependencies.push(`${user?.name ?? userId}: ${dependencies.join(", ")}`);
          }
        }

        // If there are users with blocking dependencies, return error
        if (usersWithDependencies.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Невозможно удалить следующих пользователей из-за зависимостей:\n${usersWithDependencies.join("\n")}`,
          });
        }

        // Use transaction for atomicity
        await ctx.db.transaction(async (tx) => {
          // Delete in correct order (foreign key constraints)
          await tx.delete(userProfiles).where(inArray(userProfiles.userId, userIds));
          await tx.delete(userRoles).where(inArray(userRoles.userId, userIds));
          await tx.delete(sessions).where(inArray(sessions.userId, userIds));
          await tx.delete(accounts).where(inArray(accounts.userId, userIds));
          await tx.delete(users).where(inArray(users.id, userIds));
        });

        // Log outside transaction
        logger.info("[Bulk Delete] Deleted users", {
          count: userIds.length,
          adminId: ctx.session.user.id,
          reason,
        });

        return { deleted: userIds.length };
      }),

    // Hard delete user with dependency checks
    hardDelete: adminProcedureWithFeature("users:hard-delete")
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { userId } = input;

        // Prevent self-deletion
        if (userId === ctx.session.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot delete yourself",
          });
        }

        // Verify user exists
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, userId),
          with: {
            roles: { columns: { role: true } },
          },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Check if target user is Root (cannot be deleted)
        if (user.roles.some((r) => r.role === "Root")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot delete Root user",
          });
        }

        // Check for blocking dependencies
        const dependencies: string[] = [];

        // Check for publications
        const [publicationsCount] = await ctx.db
          .select({ count: count() })
          .from(publications)
          .where(eq(publications.authorId, userId));
        if (publicationsCount && publicationsCount.count > 0) {
          dependencies.push(`${publicationsCount.count} публикаций`);
        }

        // Check for listings
        const [listingsCount] = await ctx.db
          .select({ count: count() })
          .from(listings)
          .where(eq(listings.userId, userId));
        if (listingsCount && listingsCount.count > 0) {
          dependencies.push(`${listingsCount.count} объявлений`);
        }

        // Check for news
        const [newsCount] = await ctx.db
          .select({ count: count() })
          .from(news)
          .where(eq(news.authorId, userId));
        if (newsCount && newsCount.count > 0) {
          dependencies.push(`${newsCount.count} новостей`);
        }

        // If there are blocking dependencies, return error
        if (dependencies.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Невозможно удалить пользователя. Найдены зависимости: ${dependencies.join(", ")}. Сначала удалите или переназначьте эти данные.`,
          });
        }

        // Proceed with hard delete in transaction
        await ctx.db.transaction(async (tx) => {
          // Delete in correct order (foreign key constraints)
          await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));
          await tx.delete(userRoles).where(eq(userRoles.userId, userId));
          await tx.delete(sessions).where(eq(sessions.userId, userId));
          await tx.delete(accounts).where(eq(accounts.userId, userId));
          await tx.delete(users).where(eq(users.id, userId));
        });

        logger.info("[Hard Delete] Permanently deleted user", {
          userId,
          userName: user.name,
          adminId: ctx.session.user.id,
        });

        return { success: true };
      }),

    // Get user's tagline (for admin editing)
    getTagline: adminProcedureWithFeature("users:manage")
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { userId } = input;

        const profile = await ctx.db.query.userProfiles.findFirst({
          where: eq(userProfiles.userId, userId),
          columns: {
            tagline: true,
            taglineSetByAdmin: true,
          },
        });

        return {
          tagline: profile?.tagline ?? null,
          taglineSetByAdmin: profile?.taglineSetByAdmin ?? false,
        };
      }),

    // Update user's tagline (admin only)
    updateTagline: adminProcedureWithFeature("users:manage")
      .input(
        z.object({
          userId: z.string().uuid(),
          tagline: z.string().max(100).nullable(),
          setByAdmin: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { userId, tagline, setByAdmin } = input;

        // Verify user exists
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Check if profile exists
        const existingProfile = await ctx.db.query.userProfiles.findFirst({
          where: eq(userProfiles.userId, userId),
        });

        if (existingProfile) {
          // Update existing profile
          await ctx.db
            .update(userProfiles)
            .set({
              tagline,
              taglineSetByAdmin: setByAdmin,
            })
            .where(eq(userProfiles.userId, userId));
        } else {
          // Create new profile with tagline
          await ctx.db.insert(userProfiles).values({
            userId,
            tagline,
            taglineSetByAdmin: setByAdmin,
          });
        }

        return { success: true };
      }),

    // Get user's property bindings (apartments and parking spots)
    getProperties: adminProcedureWithFeature("users:view")
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { userId } = input;

        // Get apartment bindings (only non-revoked ones)
        const apartmentBindings = await ctx.db.query.userApartments.findMany({
          where: and(eq(userApartments.userId, userId), isNull(userApartments.revokedAt)),
          with: {
            apartment: {
              with: {
                floor: {
                  with: {
                    entrance: {
                      with: { building: true },
                    },
                  },
                },
              },
            },
          },
        });

        // Get parking bindings (only non-revoked ones)
        const parkingBindings = await ctx.db.query.userParkingSpots.findMany({
          where: and(eq(userParkingSpots.userId, userId), isNull(userParkingSpots.revokedAt)),
          with: {
            parkingSpot: {
              with: {
                floor: {
                  with: {
                    parking: {
                      with: { building: true },
                    },
                  },
                },
              },
            },
          },
        });

        return {
          apartments: apartmentBindings,
          parkingSpots: parkingBindings,
        };
      }),

    // Revoke apartment binding
    revokeApartment: adminProcedureWithFeature("users:roles")
      .input(
        z.object({
          userId: z.string().uuid(),
          apartmentId: z.string(),
          revocationTemplate: revocationTemplateSchema,
          customReason: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { userId, apartmentId, revocationTemplate, customReason } = input;

        // Check if binding exists
        const binding = await ctx.db.query.userApartments.findFirst({
          where: and(
            eq(userApartments.userId, userId),
            eq(userApartments.apartmentId, apartmentId),
            isNull(userApartments.revokedAt)
          ),
        });

        if (!binding) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Привязка не найдена",
          });
        }

        // Determine revocation reason text
        const revocationReason =
          revocationTemplate === "custom"
            ? (customReason ?? "")
            : (REVOCATION_TEMPLATES[revocationTemplate] ?? "");

        // Soft-delete the binding
        await ctx.db
          .update(userApartments)
          .set({
            revokedAt: new Date(),
            revokedBy: ctx.session.user.id,
            revocationTemplate,
            revocationReason,
          })
          .where(
            and(eq(userApartments.userId, userId), eq(userApartments.apartmentId, apartmentId))
          );

        // Archive related listings for this apartment
        await ctx.db
          .update(listings)
          .set({
            status: "archived",
            archiveReason: "rights_revoked",
            archivedComment: `Отзыв прав на собственность: ${revocationReason}`,
            archivedBy: ctx.session.user.id,
            archivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(listings.userId, userId),
              eq(listings.apartmentId, apartmentId),
              or(
                eq(listings.status, "draft"),
                eq(listings.status, "pending_moderation"),
                eq(listings.status, "approved")
              )
            )
          );

        return { success: true };
      }),

    // Revoke parking spot binding
    revokeParkingSpot: adminProcedureWithFeature("users:roles")
      .input(
        z.object({
          userId: z.string().uuid(),
          parkingSpotId: z.string(),
          revocationTemplate: revocationTemplateSchema,
          customReason: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { userId, parkingSpotId, revocationTemplate, customReason } = input;

        // Check if binding exists
        const binding = await ctx.db.query.userParkingSpots.findFirst({
          where: and(
            eq(userParkingSpots.userId, userId),
            eq(userParkingSpots.parkingSpotId, parkingSpotId),
            isNull(userParkingSpots.revokedAt)
          ),
        });

        if (!binding) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Привязка не найдена",
          });
        }

        // Determine revocation reason text
        const revocationReason =
          revocationTemplate === "custom"
            ? (customReason ?? "")
            : (REVOCATION_TEMPLATES[revocationTemplate] ?? "");

        // Soft-delete the binding
        await ctx.db
          .update(userParkingSpots)
          .set({
            revokedAt: new Date(),
            revokedBy: ctx.session.user.id,
            revocationTemplate,
            revocationReason,
          })
          .where(
            and(
              eq(userParkingSpots.userId, userId),
              eq(userParkingSpots.parkingSpotId, parkingSpotId)
            )
          );

        // Archive related listings for this parking spot
        await ctx.db
          .update(listings)
          .set({
            status: "archived",
            archiveReason: "rights_revoked",
            archivedComment: `Отзыв прав на собственность: ${revocationReason}`,
            archivedBy: ctx.session.user.id,
            archivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(listings.userId, userId),
              eq(listings.parkingSpotId, parkingSpotId),
              or(
                eq(listings.status, "draft"),
                eq(listings.status, "pending_moderation"),
                eq(listings.status, "approved")
              )
            )
          );

        return { success: true };
      }),

    // Get revocation history for user
    getRevocationHistory: adminProcedureWithFeature("users:view")
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { userId } = input;

        // Get revoked apartment bindings
        const revokedApartments = await ctx.db.query.userApartments.findMany({
          where: and(
            eq(userApartments.userId, userId),
            eq(userApartments.revokedAt, userApartments.revokedAt) // not null check hack
          ),
          with: {
            apartment: {
              with: {
                floor: {
                  with: {
                    entrance: {
                      with: { building: true },
                    },
                  },
                },
              },
            },
            revokedByUser: true,
          },
        });

        // Get revoked parking bindings
        const revokedParkings = await ctx.db.query.userParkingSpots.findMany({
          where: and(
            eq(userParkingSpots.userId, userId),
            eq(userParkingSpots.revokedAt, userParkingSpots.revokedAt) // not null check hack
          ),
          with: {
            parkingSpot: {
              with: {
                floor: {
                  with: {
                    parking: {
                      with: { building: true },
                    },
                  },
                },
              },
            },
            revokedByUser: true,
          },
        });

        // Filter only those that have revokedAt set
        return {
          apartments: revokedApartments.filter((a) => a.revokedAt !== null),
          parkingSpots: revokedParkings.filter((p) => p.revokedAt !== null),
        };
      }),

    // Get active block for user
    getActiveBlock: adminProcedureWithFeature("users:view")
      .input(z.object({ userId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const block = await ctx.db.query.userBlocks.findFirst({
          where: and(eq(userBlocks.userId, input.userId), eq(userBlocks.isActive, true)),
          with: {
            blockedByUser: true,
          },
        });

        return block ?? null;
      }),

    // Get block history for user
    getBlockHistory: adminProcedureWithFeature("users:view")
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const blocks = await ctx.db.query.userBlocks.findMany({
          where: eq(userBlocks.userId, input.userId),
          with: {
            blockedByUser: true,
            unblockedByUser: true,
          },
          orderBy: [desc(userBlocks.createdAt)],
        });

        return blocks;
      }),

    // Block user
    block: adminProcedureWithFeature("users:roles")
      .input(
        z.object({
          userId: z.string().uuid(),
          category: blockCategorySchema,
          violatedRules: z.array(rulesViolationSchema).optional(),
          reason: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { userId, category, violatedRules, reason } = input;

        // Prevent self-blocking
        if (userId === ctx.session.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Нельзя заблокировать себя",
          });
        }

        // Check if user exists
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Пользователь не найден",
          });
        }

        // Check if target user is Root (cannot be blocked)
        const targetRoles = await ctx.db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, userId));

        if (targetRoles.some((r) => r.role === "Root")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Невозможно заблокировать Root пользователя",
          });
        }

        // Check if user is already blocked
        const existingBlock = await ctx.db.query.userBlocks.findFirst({
          where: and(eq(userBlocks.userId, userId), eq(userBlocks.isActive, true)),
        });

        if (existingBlock) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Пользователь уже заблокирован",
          });
        }

        // Validate: rules_violation must have violatedRules
        if (category === "rules_violation" && (!violatedRules || violatedRules.length === 0)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "При блокировке за нарушение правил необходимо указать пункты",
          });
        }

        // Validate: other must have reason
        if (category === "other" && (!reason || reason.trim().length === 0)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "При блокировке с категорией 'другое' необходимо указать причину",
          });
        }

        // Create block record
        const [block] = await ctx.db
          .insert(userBlocks)
          .values({
            userId,
            blockedBy: ctx.session.user.id,
            category,
            violatedRules: violatedRules ? JSON.stringify(violatedRules) : null,
            reason: reason ?? null,
            isActive: true,
          })
          .returning();

        // Delete all user sessions to force logout
        await ctx.db.delete(sessions).where(eq(sessions.userId, userId));

        return block;
      }),

    // Unblock user
    unblock: adminProcedureWithFeature("users:roles")
      .input(
        z.object({
          userId: z.string().uuid(),
          reason: z.string().max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { userId, reason } = input;

        // Find active block
        const activeBlock = await ctx.db.query.userBlocks.findFirst({
          where: and(eq(userBlocks.userId, userId), eq(userBlocks.isActive, true)),
        });

        if (!activeBlock) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Пользователь не заблокирован",
          });
        }

        // Update block record
        await ctx.db
          .update(userBlocks)
          .set({
            isActive: false,
            unblockedAt: new Date(),
            unblockedBy: ctx.session.user.id,
            unblockReason: reason,
          })
          .where(eq(userBlocks.id, activeBlock.id));

        return { success: true };
      }),

    // Search users for mentions
    search: adminProcedure
      .input(z.object({ query: z.string().min(1).max(100) }))
      .query(async ({ ctx, input }) => {
        const results = await ctx.db
          .select({
            id: users.id,
            name: users.name,
            image: users.image,
          })
          .from(users)
          .where(and(eq(users.isDeleted, false), ilike(users.name, `%${input.query}%`)))
          .limit(10);

        return results.map((user) => ({
          id: user.id,
          label: user.name ?? "Без имени",
          type: "user" as const,
          image: user.image ?? undefined,
        }));
      }),

    // Force delete user without approval process (SuperAdmin only)
    // Completely removes user and all their content from the database
    forceDelete: superAdminProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          reason: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { userId, reason } = input;

        // Prevent self-deletion
        if (userId === ctx.session.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Нельзя удалить собственный аккаунт",
          });
        }

        // Check if user exists
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Пользователь не найден",
          });
        }

        // Check if target user is Root (cannot be deleted)
        const targetRoles = await ctx.db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, userId));

        if (targetRoles.some((r) => r.role === "Root")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Невозможно удалить Root пользователя",
          });
        }

        // Use transaction to ensure atomicity
        await ctx.db.transaction(async (tx) => {
          // 1. Delete user-related content first (foreign keys)

          // Delete notifications (where user is recipient or sender)
          await tx.execute(
            sql`DELETE FROM info_web_notification WHERE user_id = ${userId} OR from_user_id = ${userId}`
          );

          // Delete messages (where user is sender)
          await tx.execute(sql`DELETE FROM info_web_message WHERE sender_id = ${userId}`);

          // Delete message recipients (where user is recipient)
          await tx.execute(
            sql`DELETE FROM info_web_message_recipient WHERE recipient_id = ${userId}`
          );

          // Delete message threads (where user is creator)
          await tx.execute(sql`DELETE FROM info_web_message_thread WHERE created_by = ${userId}`);

          // Delete message quotas
          await tx.execute(sql`DELETE FROM info_web_message_quota WHERE user_id = ${userId}`);

          // Delete publications (cascade will handle attachments, votes, history)
          await tx.execute(sql`DELETE FROM info_web_publication WHERE author_id = ${userId}`);

          // Delete news (cascade will handle related tables)
          await tx.execute(sql`DELETE FROM info_web_news WHERE author_id = ${userId}`);

          // Delete listings (cascade will handle photos)
          await tx.execute(sql`DELETE FROM info_web_listing WHERE user_id = ${userId}`);

          // Delete feedback
          await tx.execute(sql`DELETE FROM info_web_feedback WHERE user_id = ${userId}`);

          // Delete claims
          await tx.execute(sql`DELETE FROM info_web_claim WHERE user_id = ${userId}`);

          // Delete media
          await tx.execute(sql`DELETE FROM info_web_media WHERE uploaded_by = ${userId}`);

          // Delete posts
          await tx.execute(sql`DELETE FROM info_web_post WHERE created_by = ${userId}`);

          // Delete deletion requests
          await tx.execute(sql`DELETE FROM info_web_deletion_request WHERE user_id = ${userId}`);

          // 2. Delete user property bindings
          await tx.execute(sql`DELETE FROM info_web_user_apartment WHERE user_id = ${userId}`);

          await tx.execute(sql`DELETE FROM info_web_user_parking_spot WHERE user_id = ${userId}`);

          await tx.execute(
            sql`DELETE FROM info_web_user_interest_building WHERE user_id = ${userId}`
          );

          // 3. Delete user auth data
          await tx.execute(sql`DELETE FROM info_web_user_block WHERE user_id = ${userId}`);

          await tx.execute(
            sql`DELETE FROM info_web_telegram_auth_token WHERE telegram_id IN (
              SELECT telegram_id FROM info_web_user_profile WHERE user_id = ${userId}
            )`
          );

          await tx.execute(
            sql`DELETE FROM info_web_email_verification_token WHERE user_id = ${userId}`
          );

          await tx.execute(
            sql`DELETE FROM info_web_password_reset_token WHERE user_id = ${userId}`
          );

          await tx.execute(sql`DELETE FROM info_web_user_profile WHERE user_id = ${userId}`);

          await tx.execute(sql`DELETE FROM info_web_user_role WHERE user_id = ${userId}`);

          await tx.execute(sql`DELETE FROM info_web_session WHERE user_id = ${userId}`);

          await tx.execute(sql`DELETE FROM info_web_account WHERE user_id = ${userId}`);

          // 4. Finally delete the user
          await tx.execute(sql`DELETE FROM info_web_user WHERE id = ${userId}`);
        });

        // Log the action (outside transaction to ensure it's recorded)
        logger.info(
          `[ADMIN] User ${userId} force-deleted by ${ctx.session.user.id}. Reason: ${reason ?? "No reason provided"}`
        );

        return { success: true };
      }),
  }),

  // Structure search for mentions (#b1, #b1e2, #b1kv123, #b1p45)
  structures: createTRPCRouter({
    search: adminProcedure
      .input(z.object({ query: z.string().min(1).max(50) }))
      .query(async ({ ctx, input }) => {
        const query = input.query.toLowerCase();
        const results: Array<{
          id: string;
          code: string;
          label: string;
          type: "building" | "entrance" | "apartment" | "parking";
        }> = [];

        // Parse query pattern: #b<num>, #b<num>e<num>, #b<num>kv<num>, #b<num>p<num>
        const buildingMatch = /^#?b(\d+)$/.exec(query);
        const entranceMatch = /^#?b(\d+)e(\d+)$/.exec(query);
        const apartmentMatch = /^#?b(\d+)kv(\d+)$/.exec(query);
        const parkingMatch = /^#?b(\d+)p(\d+)$/.exec(query);

        if (buildingMatch) {
          // Search building by number
          const buildingNum = parseInt(buildingMatch[1]!);
          const building = await ctx.db.query.buildings.findFirst({
            where: eq(buildings.number, buildingNum),
          });
          if (building) {
            results.push({
              id: building.id,
              code: `#b${building.number}`,
              label: `Строение ${building.number}${building.title ? ` (${building.title})` : ""}`,
              type: "building",
            });
          }
        } else if (entranceMatch) {
          // Search entrance
          const buildingNum = parseInt(entranceMatch[1]!);
          const entranceNum = parseInt(entranceMatch[2]!);
          const building = await ctx.db.query.buildings.findFirst({
            where: eq(buildings.number, buildingNum),
            with: {
              entrances: {
                where: eq(entrances.entranceNumber, entranceNum),
              },
            },
          });
          if (building?.entrances[0]) {
            results.push({
              id: building.entrances[0].id,
              code: `#b${building.number}e${entranceNum}`,
              label: `Строение ${building.number}, подъезд ${entranceNum}`,
              type: "entrance",
            });
          }
        } else if (apartmentMatch) {
          // Search apartment
          const buildingNum = parseInt(apartmentMatch[1]!);
          const aptNum = apartmentMatch[2]!;
          const building = await ctx.db.query.buildings.findFirst({
            where: eq(buildings.number, buildingNum),
            with: {
              entrances: {
                with: {
                  floors: {
                    with: {
                      apartments: true,
                    },
                  },
                },
              },
            },
          });
          if (building) {
            for (const entrance of building.entrances) {
              for (const floor of entrance.floors) {
                const apt = floor.apartments.find((a) => a.number === aptNum);
                if (apt) {
                  results.push({
                    id: apt.id,
                    code: `#b${building.number}kv${aptNum}`,
                    label: `Строение ${building.number}, кв. ${aptNum}`,
                    type: "apartment",
                  });
                  break;
                }
              }
              if (results.length > 0) break;
            }
          }
        } else if (parkingMatch) {
          // Search parking spot
          const buildingNum = parseInt(parkingMatch[1]!);
          const spotNum = parseInt(parkingMatch[2]!);
          const building = await ctx.db.query.buildings.findFirst({
            where: eq(buildings.number, buildingNum),
            with: {
              parkings: {
                with: {
                  floors: {
                    with: {
                      spots: true,
                    },
                  },
                },
              },
            },
          });
          if (building) {
            for (const parking of building.parkings) {
              for (const floor of parking.floors) {
                const spot = floor.spots.find((s) => s.number === String(spotNum));
                if (spot) {
                  results.push({
                    id: spot.id,
                    code: `#b${building.number}p${spotNum}`,
                    label: `Строение ${building.number}, м/м ${spotNum}`,
                    type: "parking",
                  });
                  break;
                }
              }
              if (results.length > 0) break;
            }
          }
        } else if (query.startsWith("#b") || query.startsWith("b")) {
          // Suggest buildings if just typing #b or b
          const allBuildings = await ctx.db.query.buildings.findMany({
            where: eq(buildings.active, true),
            orderBy: (b, { asc }) => [asc(b.number)],
            limit: 10,
          });
          for (const b of allBuildings) {
            if (b.number) {
              results.push({
                id: b.id,
                code: `#b${b.number}`,
                label: `Строение ${b.number}${b.title ? ` (${b.title})` : ""}`,
                type: "building",
              });
            }
          }
        }

        return results;
      }),
  }),

  // Buildings management
  buildings: createTRPCRouter({
    // Get all buildings with full hierarchy
    list: adminProcedureWithFeature("buildings:view").query(async ({ ctx }) => {
      const buildingsData = await ctx.db.query.buildings.findMany({
        with: {
          entrances: {
            with: {
              floors: {
                with: {
                  apartments: true,
                },
                orderBy: (floors, { asc }) => [asc(floors.floorNumber)],
              },
            },
            orderBy: (entrances, { asc }) => [asc(entrances.entranceNumber)],
          },
          parkings: {
            with: {
              floors: {
                with: {
                  spots: true,
                },
                orderBy: (floors, { asc }) => [asc(floors.floorNumber)],
              },
            },
          },
        },
        orderBy: (buildings, { asc }) => [asc(buildings.number)],
      });

      return buildingsData;
    }),

    // Get single building by ID
    getById: adminProcedureWithFeature("buildings:view")
      .input(z.object({ buildingId: z.string() }))
      .query(async ({ ctx, input }) => {
        const building = await ctx.db.query.buildings.findFirst({
          where: eq(buildings.id, input.buildingId),
          with: {
            entrances: {
              with: {
                floors: {
                  with: {
                    apartments: true,
                  },
                  orderBy: (floors, { asc }) => [asc(floors.floorNumber)],
                },
              },
              orderBy: (entrances, { asc }) => [asc(entrances.entranceNumber)],
            },
            parkings: {
              with: {
                floors: {
                  with: {
                    spots: true,
                  },
                  orderBy: (floors, { asc }) => [asc(floors.floorNumber)],
                },
              },
            },
          },
        });

        if (!building) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Building not found",
          });
        }

        return building;
      }),

    // Get stats for buildings
    stats: adminProcedureWithFeature("buildings:view").query(async ({ ctx }) => {
      const [buildingsCount] = await ctx.db.select({ count: count() }).from(buildings);
      const [entrancesCount] = await ctx.db.select({ count: count() }).from(entrances);
      const [floorsCount] = await ctx.db.select({ count: count() }).from(floors);
      const [apartmentsCount] = await ctx.db.select({ count: count() }).from(apartments);
      const [parkingsCount] = await ctx.db.select({ count: count() }).from(parkings);
      const [parkingSpotsCount] = await ctx.db.select({ count: count() }).from(parkingSpots);

      return {
        buildings: buildingsCount?.count ?? 0,
        entrances: entrancesCount?.count ?? 0,
        floors: floorsCount?.count ?? 0,
        apartments: apartmentsCount?.count ?? 0,
        parkings: parkingsCount?.count ?? 0,
        parkingSpots: parkingSpotsCount?.count ?? 0,
      };
    }),
  }),

  // Get dashboard stats with moderation counts
  dashboardStats: adminProcedure.query(async ({ ctx }) => {
    const userRolesData = ctx.userRoles;

    // Helper to get today's start
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Initialize result
    const result: {
      users?: { pending: number; todayNew: number };
      claims?: { pending: number; todayNew: number };
      listings?: { pending: number; todayNew: number };
      publications?: { pending: number; todayNew: number };
      news?: { pending: number; todayNew: number };
      feedback?: { pending: number; todayNew: number };
      deletionRequests?: { pending: number; todayNew: number };
    } = {};

    // Users stats (if has users:view)
    if (hasFeatureAccess(userRolesData, "users:view")) {
      const [pendingDeletions] = await ctx.db
        .select({ count: count() })
        .from(deletionRequests)
        .where(eq(deletionRequests.status, "pending"));

      const [todayUsers] = await ctx.db
        .select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, todayStart));

      result.users = {
        pending: pendingDeletions?.count ?? 0,
        todayNew: todayUsers?.count ?? 0,
      };
    }

    // Claims stats (if has claims:view)
    if (hasFeatureAccess(userRolesData, "claims:view")) {
      const [pendingClaims] = await ctx.db
        .select({ count: count() })
        .from(propertyClaims)
        .where(eq(propertyClaims.status, "pending"));

      const [todayClaims] = await ctx.db
        .select({ count: count() })
        .from(propertyClaims)
        .where(gte(propertyClaims.createdAt, todayStart));

      result.claims = {
        pending: pendingClaims?.count ?? 0,
        todayNew: todayClaims?.count ?? 0,
      };
    }

    // Listings stats (if has listings:view)
    if (hasFeatureAccess(userRolesData, "listings:view")) {
      const [pendingListings] = await ctx.db
        .select({ count: count() })
        .from(listings)
        .where(eq(listings.status, "pending_moderation"));

      const [todayListings] = await ctx.db
        .select({ count: count() })
        .from(listings)
        .where(gte(listings.createdAt, todayStart));

      result.listings = {
        pending: pendingListings?.count ?? 0,
        todayNew: todayListings?.count ?? 0,
      };
    }

    // Publications stats (if has content:moderate)
    if (hasFeatureAccess(userRolesData, "content:moderate")) {
      const [pendingPubs] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(eq(publications.status, "pending"));

      const [todayPubs] = await ctx.db
        .select({ count: count() })
        .from(publications)
        .where(gte(publications.createdAt, todayStart));

      result.publications = {
        pending: pendingPubs?.count ?? 0,
        todayNew: todayPubs?.count ?? 0,
      };

      // News stats
      const [pendingNews] = await ctx.db
        .select({ count: count() })
        .from(news)
        .where(eq(news.status, "draft"));

      const [todayNews] = await ctx.db
        .select({ count: count() })
        .from(news)
        .where(gte(news.createdAt, todayStart));

      result.news = {
        pending: pendingNews?.count ?? 0,
        todayNew: todayNews?.count ?? 0,
      };
    }

    // Feedback stats (if has users:manage)
    if (hasFeatureAccess(userRolesData, "users:manage")) {
      const [pendingFeedback] = await ctx.db
        .select({ count: count() })
        .from(feedback)
        .where(eq(feedback.status, "new"));

      const [todayFeedback] = await ctx.db
        .select({ count: count() })
        .from(feedback)
        .where(gte(feedback.createdAt, todayStart));

      result.feedback = {
        pending: pendingFeedback?.count ?? 0,
        todayNew: todayFeedback?.count ?? 0,
      };
    }

    // Deletion requests stats (if has users:delete)
    if (hasFeatureAccess(userRolesData, "users:delete")) {
      const [pendingDeletions] = await ctx.db
        .select({ count: count() })
        .from(deletionRequests)
        .where(eq(deletionRequests.status, "pending"));

      const [todayDeletions] = await ctx.db
        .select({ count: count() })
        .from(deletionRequests)
        .where(gte(deletionRequests.createdAt, todayStart));

      result.deletionRequests = {
        pending: pendingDeletions?.count ?? 0,
        todayNew: todayDeletions?.count ?? 0,
      };
    }

    return result;
  }),

  // Navigation menu counts for badges
  navCounts: adminProcedure.query(async ({ ctx }) => {
    const userRolesData = ctx.userRoles;

    const result: Record<string, number> = {};

    // Run all count queries in parallel for better performance
    const queries: Promise<void>[] = [];

    // Users count
    if (hasFeatureAccess(userRolesData, "users:view")) {
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(users)
          .where(eq(users.isDeleted, false))
          .then(([r]) => {
            result.users = r?.count ?? 0;
          })
      );
    }

    // Deletion requests (pending)
    if (hasFeatureAccess(userRolesData, "users:delete")) {
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(deletionRequests)
          .where(eq(deletionRequests.status, "pending"))
          .then(([r]) => {
            result.deletionRequests = r?.count ?? 0;
          })
      );
    }

    // Feedback (new/pending)
    if (hasFeatureAccess(userRolesData, "users:manage")) {
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(feedback)
          .where(eq(feedback.status, "new"))
          .then(([r]) => {
            result.feedback = r?.count ?? 0;
          })
      );
    }

    // Buildings count
    if (hasFeatureAccess(userRolesData, "buildings:view")) {
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(buildings)
          .then(([r]) => {
            result.buildings = r?.count ?? 0;
          })
      );
    }

    // Claims (pending)
    if (hasFeatureAccess(userRolesData, "claims:view")) {
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(propertyClaims)
          .where(eq(propertyClaims.status, "pending"))
          .then(([r]) => {
            result.claims = r?.count ?? 0;
          })
      );
    }

    // Listings (pending moderation)
    if (hasFeatureAccess(userRolesData, "listings:view")) {
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(listings)
          .where(eq(listings.status, "pending_moderation"))
          .then(([r]) => {
            result.listings = r?.count ?? 0;
          })
      );
    }

    // News (draft/pending)
    if (hasFeatureAccess(userRolesData, "content:moderate")) {
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(news)
          .where(eq(news.status, "draft"))
          .then(([r]) => {
            result.news = r?.count ?? 0;
          })
      );

      // Publications (pending)
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(publications)
          .where(eq(publications.status, "pending"))
          .then(([r]) => {
            result.publications = r?.count ?? 0;
          })
      );
    }

    // Directory entries
    if (hasFeatureAccess(userRolesData, "directory:manage")) {
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(directoryEntries)
          .then(([r]) => {
            result.directory = r?.count ?? 0;
          })
      );

      // Knowledge base articles (howtos)
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(knowledgeBaseArticles)
          .then(([r]) => {
            result.howtos = r?.count ?? 0;
          })
      );

      // Media files
      queries.push(
        ctx.db
          .select({ count: count() })
          .from(media)
          .then(([r]) => {
            result.media = r?.count ?? 0;
          })
      );
    }

    await Promise.all(queries);

    return result;
  }),

  // Deletion requests management
  deletionRequests: createTRPCRouter({
    // Get aggregated counts by status
    counts: adminProcedureWithFeature("users:delete").query(async ({ ctx }) => {
      const allRequests = await ctx.db.query.deletionRequests.findMany({
        columns: { status: true },
      });

      const counts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        completed: 0,
        total: allRequests.length,
      };

      for (const request of allRequests) {
        if (request.status in counts) {
          counts[request.status as keyof typeof counts]++;
        }
      }

      return counts;
    }),

    // List all deletion requests
    list: adminProcedureWithFeature("users:delete")
      .input(
        z.object({
          status: z.enum(["pending", "approved", "rejected", "completed"]).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const { status } = input;

        const requests = await ctx.db.query.deletionRequests.findMany({
          where: status ? eq(deletionRequests.status, status) : undefined,
          with: {
            user: true,
          },
          orderBy: [desc(deletionRequests.createdAt)],
        });

        return requests;
      }),

    // Approve deletion request
    approve: adminProcedureWithFeature("users:delete")
      .input(
        z.object({
          requestId: z.string().uuid(),
          adminNotes: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { requestId, adminNotes } = input;

        const request = await ctx.db.query.deletionRequests.findFirst({
          where: eq(deletionRequests.id, requestId),
        });

        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Заявка не найдена",
          });
        }

        if (request.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Заявка уже обработана",
          });
        }

        // Update request status
        await ctx.db
          .update(deletionRequests)
          .set({
            status: "approved",
            adminNotes,
            processedBy: ctx.session.user.id,
            processedAt: new Date(),
          })
          .where(eq(deletionRequests.id, requestId));

        return { success: true };
      }),

    // Reject deletion request
    reject: adminProcedureWithFeature("users:delete")
      .input(
        z.object({
          requestId: z.string().uuid(),
          adminNotes: z.string().max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { requestId, adminNotes } = input;

        const request = await ctx.db.query.deletionRequests.findFirst({
          where: eq(deletionRequests.id, requestId),
        });

        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Заявка не найдена",
          });
        }

        if (request.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Заявка уже обработана",
          });
        }

        // Update request status
        await ctx.db
          .update(deletionRequests)
          .set({
            status: "rejected",
            adminNotes,
            processedBy: ctx.session.user.id,
            processedAt: new Date(),
          })
          .where(eq(deletionRequests.id, requestId));

        return { success: true };
      }),

    // Create deletion request (by admin for a user)
    create: adminProcedureWithFeature("users:delete")
      .input(
        z.object({
          userId: z.string().uuid(),
          reason: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { userId, reason } = input;

        // Prevent self-deletion request
        if (userId === ctx.session.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Нельзя создать заявку на удаление своего аккаунта",
          });
        }

        // Check if user exists
        const user = await ctx.db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Пользователь не найден",
          });
        }

        // Check if user is Root (cannot be deleted)
        const targetRoles = await ctx.db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, userId));

        if (targetRoles.some((r) => r.role === "Root")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Невозможно удалить Root пользователя",
          });
        }

        // Check if there's already a pending request for this user
        const existingRequest = await ctx.db.query.deletionRequests.findFirst({
          where: and(eq(deletionRequests.userId, userId), eq(deletionRequests.status, "pending")),
        });

        if (existingRequest) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Уже существует заявка на удаление этого пользователя",
          });
        }

        // Create deletion request
        const [request] = await ctx.db
          .insert(deletionRequests)
          .values({
            userId,
            reason: reason ?? "Удаление по решению администрации",
          })
          .returning();

        return request;
      }),

    // Execute approved deletion (soft delete user)
    execute: adminProcedureWithFeature("users:delete")
      .input(
        z.object({
          requestId: z.string().uuid(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { requestId } = input;

        const request = await ctx.db.query.deletionRequests.findFirst({
          where: eq(deletionRequests.id, requestId),
        });

        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Заявка не найдена",
          });
        }

        if (request.status !== "approved") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Заявка должна быть сначала одобрена",
          });
        }

        const userId = request.userId;

        // Check if user is Root (cannot be deleted)
        const targetRoles = await ctx.db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, userId));

        if (targetRoles.some((r) => r.role === "Root")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Невозможно удалить Root пользователя",
          });
        }

        // Soft delete: mark user as deleted, remove personal data
        await ctx.db
          .update(users)
          .set({
            isDeleted: true,
            deletedAt: new Date(),
            name: "[Удалён]",
            email: `deleted_${userId}@deleted.local`,
            image: null,
          })
          .where(eq(users.id, userId));

        // Delete user profile (personal data)
        await ctx.db.delete(userProfiles).where(eq(userProfiles.userId, userId));

        // Delete accounts (OAuth connections)
        await ctx.db.delete(accounts).where(eq(accounts.userId, userId));

        // Delete sessions
        await ctx.db.delete(sessions).where(eq(sessions.userId, userId));

        // Delete roles
        await ctx.db.delete(userRoles).where(eq(userRoles.userId, userId));

        // Revoke all property bindings
        await ctx.db
          .update(userApartments)
          .set({
            revokedAt: new Date(),
            revokedBy: ctx.session.user.id,
            revocationReason: "Удаление аккаунта пользователя",
          })
          .where(and(eq(userApartments.userId, userId), isNull(userApartments.revokedAt)));

        await ctx.db
          .update(userParkingSpots)
          .set({
            revokedAt: new Date(),
            revokedBy: ctx.session.user.id,
            revocationReason: "Удаление аккаунта пользователя",
          })
          .where(and(eq(userParkingSpots.userId, userId), isNull(userParkingSpots.revokedAt)));

        // Archive all listings
        await ctx.db
          .update(listings)
          .set({
            status: "archived",
            archiveReason: "admin",
            archivedComment: "Удаление аккаунта пользователя",
            archivedBy: ctx.session.user.id,
            archivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(listings.userId, userId),
              or(
                eq(listings.status, "draft"),
                eq(listings.status, "pending_moderation"),
                eq(listings.status, "approved")
              )
            )
          );

        // Mark deletion request as completed
        await ctx.db
          .update(deletionRequests)
          .set({
            status: "completed",
            processedAt: new Date(),
          })
          .where(eq(deletionRequests.id, requestId));

        return { success: true };
      }),
  }),

  // ==================== ADMIN OPERATIONS ====================
  operations: createTRPCRouter({
    // Check if Telegram admin chat sync is available
    telegramSyncStatus: adminProcedureWithFeature("users:manage").query(async () => {
      return {
        configured: isAdminChatConfigured(),
        chatId: getAdminChatId(),
      };
    }),

    // Get admin Telegram sync data
    // Compares system admins with Telegram chat members
    getTelegramSync: adminProcedureWithFeature("users:manage").query(async ({ ctx }) => {
      if (!isAdminChatConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Telegram admin chat не настроен",
        });
      }

      // Get bot info to exclude it from the list
      const botInfo = await getBotInfo();

      // Get all chat members (administrators and members)
      const chatAdmins = await getChatAdministrators();

      if (!chatAdmins) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Не удалось получить список участников чата",
        });
      }

      // Get all system admins (users with admin roles)
      const systemAdmins = await ctx.db
        .select({
          userId: userRoles.userId,
          role: userRoles.role,
        })
        .from(userRoles)
        .where(
          or(
            eq(userRoles.role, "Root"),
            eq(userRoles.role, "SuperAdmin"),
            eq(userRoles.role, "Admin"),
            eq(userRoles.role, "Editor"),
            eq(userRoles.role, "Moderator"),
            eq(userRoles.role, "BuildingChairman"),
            eq(userRoles.role, "ComplexChairman")
          )
        );

      // Get user profiles with Telegram IDs for system admins
      const adminUserIds = [...new Set(systemAdmins.map((a) => a.userId))];
      const adminProfiles =
        adminUserIds.length > 0
          ? await ctx.db.query.userProfiles.findMany({
              where: or(...adminUserIds.map((id) => eq(userProfiles.userId, id))),
              columns: {
                userId: true,
                telegramId: true,
                telegramUsername: true,
              },
            })
          : [];

      // Get user details
      const adminUsers =
        adminUserIds.length > 0
          ? await ctx.db.query.users.findMany({
              where: or(...adminUserIds.map((id) => eq(users.id, id))),
              columns: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            })
          : [];

      // Map profiles by user ID
      const profileByUserId = new Map(adminProfiles.map((p) => [p.userId, p]));
      const userById = new Map(adminUsers.map((u) => [u.id, u]));

      // Group roles by user
      const rolesByUserId = systemAdmins.reduce(
        (acc, { userId, role }) => {
          if (!acc[userId]) acc[userId] = [];
          acc[userId].push(role);
          return acc;
        },
        {} as Record<string, string[]>
      );

      // Filter out bot and creator from chat members
      const creatorId = chatAdmins.find((m) => m.status === "creator")?.user.id;
      const filteredChatMembers = chatAdmins.filter(
        (m) => !m.user.is_bot && m.status !== "creator" && m.user.id !== botInfo?.id
      );

      // Build result lists
      // 1. System admins NOT in Telegram chat (need to add)
      const notInChat: Array<{
        userId: string;
        name: string | null;
        email: string | null;
        image: string | null;
        roles: string[];
        telegramId: string | null;
        telegramUsername: string | null;
      }> = [];

      // 2. System admins IN Telegram chat (synced)
      const inChat: Array<{
        userId: string;
        name: string | null;
        email: string | null;
        image: string | null;
        roles: string[];
        telegramId: string | null;
        telegramUsername: string | null;
        chatStatus: string;
      }> = [];

      // 3. Telegram members NOT system admins (should be removed)
      const extraInChat: Array<{
        telegramId: number;
        firstName: string;
        lastName: string | null;
        username: string | null;
        chatStatus: string;
      }> = [];

      // Check each system admin
      for (const userId of adminUserIds) {
        const profile = profileByUserId.get(userId);
        const user = userById.get(userId);
        const telegramId = profile?.telegramId ? parseInt(profile.telegramId) : null;

        if (!telegramId) {
          // No Telegram linked - needs to add
          notInChat.push({
            userId,
            name: user?.name ?? null,
            email: user?.email ?? null,
            image: user?.image ?? null,
            roles: rolesByUserId[userId] ?? [],
            telegramId: null,
            telegramUsername: null,
          });
          continue;
        }

        // Check if this Telegram ID is in the chat
        const chatMember = chatAdmins.find((m) => m.user.id === telegramId);

        if (chatMember && chatMember.status !== "left" && chatMember.status !== "kicked") {
          inChat.push({
            userId,
            name: user?.name ?? null,
            email: user?.email ?? null,
            image: user?.image ?? null,
            roles: rolesByUserId[userId] ?? [],
            telegramId: profile?.telegramId ?? null,
            telegramUsername: profile?.telegramUsername ?? null,
            chatStatus: chatMember.status,
          });
        } else {
          notInChat.push({
            userId,
            name: user?.name ?? null,
            email: user?.email ?? null,
            image: user?.image ?? null,
            roles: rolesByUserId[userId] ?? [],
            telegramId: profile?.telegramId ?? null,
            telegramUsername: profile?.telegramUsername ?? null,
          });
        }
      }

      // Find Telegram members who are not system admins
      const systemTelegramIds = new Set(
        adminProfiles.filter((p) => p.telegramId).map((p) => parseInt(p.telegramId!))
      );

      for (const member of filteredChatMembers) {
        if (!systemTelegramIds.has(member.user.id)) {
          extraInChat.push({
            telegramId: member.user.id,
            firstName: member.user.first_name,
            lastName: member.user.last_name ?? null,
            username: member.user.username ?? null,
            chatStatus: member.status,
          });
        }
      }

      return {
        notInChat,
        inChat,
        extraInChat,
        botId: botInfo?.id ?? null,
        creatorId: creatorId ?? null,
        totalSystemAdmins: adminUserIds.length,
        totalChatMembers: chatAdmins.length,
      };
    }),

    // Quick search for users (for blocking widget)
    quickSearch: adminProcedureWithFeature("users:manage")
      .input(
        z.object({
          query: z.string().min(1).max(100),
          limit: z.number().min(1).max(20).default(10),
        })
      )
      .query(async ({ ctx, input }) => {
        const { query, limit } = input;

        // Search by name or email
        const results = await ctx.db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            image: users.image,
          })
          .from(users)
          .where(
            and(
              eq(users.isDeleted, false),
              or(ilike(users.name, `%${query}%`), ilike(users.email, `%${query}%`))
            )
          )
          .limit(limit);

        // Get roles for found users
        const userIds = results.map((u) => u.id);
        const rolesResult =
          userIds.length > 0
            ? await ctx.db
                .select({
                  userId: userRoles.userId,
                  role: userRoles.role,
                })
                .from(userRoles)
                .where(or(...userIds.map((id) => eq(userRoles.userId, id))))
            : [];

        // Get active blocks
        const blocksResult =
          userIds.length > 0
            ? await ctx.db
                .select({
                  userId: userBlocks.userId,
                })
                .from(userBlocks)
                .where(
                  and(
                    or(...userIds.map((id) => eq(userBlocks.userId, id))),
                    eq(userBlocks.isActive, true)
                  )
                )
            : [];

        const rolesByUser = rolesResult.reduce(
          (acc, { userId, role }) => {
            if (!acc[userId]) acc[userId] = [];
            acc[userId].push(role);
            return acc;
          },
          {} as Record<string, string[]>
        );

        const blockedUsers = new Set(blocksResult.map((b) => b.userId));

        return results.map((user) => ({
          ...user,
          roles: rolesByUser[user.id] ?? [],
          isBlocked: blockedUsers.has(user.id),
        }));
      }),
  }),
});
