import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { logger } from "~/lib/logger";
import { type UserRole } from "~/server/auth/rbac";
import {
  apartments,
  buildings,
  claimDocuments,
  claimHistory,
  entrances,
  floors,
  organizations,
  parkingFloors,
  parkings,
  parkingSpots,
  propertyClaims,
  userApartments,
  userInterestBuildings,
  userParkingSpots,
  userRoles,
} from "~/server/db/schema";
import { sendTelegramNotificationAsync } from "~/server/notifications/telegram";

import { adminProcedureWithFeature, createTRPCRouter, protectedProcedure } from "../trpc";

// Zod schemas
const claimTypeSchema = z.enum(["apartment", "parking", "commercial"]);
const claimStatusSchema = z.enum([
  "pending",
  "review",
  "approved",
  "rejected",
  "documents_requested",
]);

const resolutionTemplateSchema = z.enum([
  "approved_all_correct",
  "approved_custom",
  "rejected_no_documents",
  "rejected_invalid_documents",
  "rejected_no_reason",
  "rejected_custom",
]);

// Тексты шаблонов
const RESOLUTION_TEMPLATES: Record<string, string> = {
  approved_all_correct: "Все данные верны, заявка одобрена",
  rejected_no_documents: "Подтверждающие документы не получены",
  rejected_invalid_documents: "Подтверждающие документы не соответствуют требованиям",
  rejected_no_reason: "Заявка отклонена",
};

const claimedRoleSchema = z.enum([
  "ApartmentOwner",
  "ApartmentResident",
  "ParkingOwner",
  "ParkingResident",
  "StoreOwner",
  "StoreRepresenative",
]);

// Helper function to add building to user's interest buildings
async function addBuildingToUserInterests(
  db: typeof import("~/server/db").db,
  userId: string,
  buildingId: string
) {
  // Check if already added
  const existing = await db.query.userInterestBuildings.findFirst({
    where: and(
      eq(userInterestBuildings.userId, userId),
      eq(userInterestBuildings.buildingId, buildingId)
    ),
  });

  if (!existing) {
    await db.insert(userInterestBuildings).values({
      userId,
      buildingId,
      autoAdded: true,
    });
  }
}

export const claimsRouter = createTRPCRouter({
  // Get current user's claims
  my: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const claims = await ctx.db.query.propertyClaims.findMany({
      where: eq(propertyClaims.userId, userId),
      with: {
        apartment: {
          with: {
            floor: {
              with: {
                entrance: {
                  with: {
                    building: true,
                  },
                },
              },
            },
          },
        },
        parkingSpot: {
          with: {
            floor: {
              with: {
                parking: {
                  with: {
                    building: true,
                  },
                },
              },
            },
          },
        },
        organization: {
          with: {
            building: true,
          },
        },
        documents: true,
        history: {
          orderBy: desc(claimHistory.createdAt),
        },
      },
      orderBy: desc(propertyClaims.createdAt),
    });

    return claims;
  }),

  // Get history for a specific claim (user's own claims only)
  myClaimHistory: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify the claim belongs to the user
      const claim = await ctx.db.query.propertyClaims.findFirst({
        where: and(eq(propertyClaims.id, input.claimId), eq(propertyClaims.userId, userId)),
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Заявка не найдена",
        });
      }

      const history = await ctx.db.query.claimHistory.findMany({
        where: eq(claimHistory.claimId, input.claimId),
        orderBy: desc(claimHistory.createdAt),
      });

      return history;
    }),

  // Create a new claim
  create: protectedProcedure
    .input(
      z.object({
        claimType: claimTypeSchema,
        claimedRole: claimedRoleSchema,
        apartmentId: z.string().optional(),
        parkingSpotId: z.string().optional(),
        organizationId: z.string().optional(),
        userComment: z.string().max(1000).optional(),
        documents: z
          .array(
            z.object({
              id: z.string(),
              documentType: z.enum(["egrn", "contract", "passport", "other"]),
              fileUrl: z.string(),
              fileName: z.string(),
              fileSize: z.string(),
              mimeType: z.string(),
              thumbnailUrl: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Validate that the correct property ID is provided based on claim type
      if (input.claimType === "apartment" && !input.apartmentId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Apartment ID is required for apartment claims",
        });
      }
      if (input.claimType === "parking" && !input.parkingSpotId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Parking spot ID is required for parking claims",
        });
      }
      if (input.claimType === "commercial" && !input.organizationId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization ID is required for commercial claims",
        });
      }

      // Validate role matches claim type
      const validRoleForType: Record<string, string[]> = {
        apartment: ["ApartmentOwner", "ApartmentResident"],
        parking: ["ParkingOwner", "ParkingResident"],
        commercial: ["StoreOwner", "StoreRepresenative"],
      };

      if (!validRoleForType[input.claimType]?.includes(input.claimedRole)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid role for this claim type",
        });
      }

      // Check if user already has a pending claim for this property
      const existingClaim = await ctx.db.query.propertyClaims.findFirst({
        where: and(
          eq(propertyClaims.userId, userId),
          input.apartmentId
            ? eq(propertyClaims.apartmentId, input.apartmentId)
            : input.parkingSpotId
              ? eq(propertyClaims.parkingSpotId, input.parkingSpotId)
              : eq(propertyClaims.organizationId, input.organizationId!),
          eq(propertyClaims.status, "pending")
        ),
      });

      if (existingClaim) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "У вас уже есть активная заявка на этот объект",
        });
      }

      // Create the claim
      const [claim] = await ctx.db
        .insert(propertyClaims)
        .values({
          userId,
          claimType: input.claimType,
          claimedRole: input.claimedRole,
          apartmentId: input.apartmentId,
          parkingSpotId: input.parkingSpotId,
          organizationId: input.organizationId,
          userComment: input.userComment,
          status: "pending",
        })
        .returning();

      // Add documents if provided
      if (input.documents && input.documents.length > 0 && claim) {
        await ctx.db.insert(claimDocuments).values(
          input.documents.map((doc) => ({
            claimId: claim.id,
            documentType: doc.documentType,
            fileUrl: doc.fileUrl,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            thumbnailUrl: doc.thumbnailUrl,
          }))
        );
      }

      // Send Telegram notification
      const claimTypeName = {
        apartment: "квартиру",
        parking: "парковку",
        commercial: "коммерческую недвижимость",
      }[input.claimType];

      sendTelegramNotificationAsync({
        event: "claim_created",
        title: "Новая заявка на собственность",
        description: `Пользователь подал заявку на ${claimTypeName}`,
        metadata: {
          Тип: claimTypeName,
          Роль: input.claimedRole,
          Статус: "Ожидает рассмотрения",
        },
        userId: ctx.session.user.id,
        userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined,
      });

      return claim;
    }),

  // Cancel a claim (only pending claims can be cancelled)
  cancel: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const claim = await ctx.db.query.propertyClaims.findFirst({
        where: and(eq(propertyClaims.id, input.claimId), eq(propertyClaims.userId, userId)),
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Заявка не найдена",
        });
      }

      if (claim.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Можно отменить только заявки со статусом 'Ожидает'",
        });
      }

      await ctx.db.delete(propertyClaims).where(eq(propertyClaims.id, input.claimId));

      return { success: true };
    }),

  // Add document to a claim
  addDocument: protectedProcedure
    .input(
      z.object({
        claimId: z.string(),
        documentType: z.enum(["egrn", "contract", "passport", "other"]),
        fileUrl: z.string(),
        fileName: z.string(),
        fileSize: z.string(),
        mimeType: z.string(),
        thumbnailUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify the claim belongs to the user
      const claim = await ctx.db.query.propertyClaims.findFirst({
        where: and(eq(propertyClaims.id, input.claimId), eq(propertyClaims.userId, userId)),
        with: {
          documents: true,
        },
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Заявка не найдена",
        });
      }

      // Check if claim is in a state that allows adding documents
      if (!["pending", "review", "documents_requested"].includes(claim.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Нельзя добавить документы к заявке в текущем статусе",
        });
      }

      // Check document limit
      if (claim.documents.length >= 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Достигнут лимит документов (максимум 10)",
        });
      }

      // Add document
      const [document] = await ctx.db
        .insert(claimDocuments)
        .values({
          claimId: input.claimId,
          documentType: input.documentType,
          fileUrl: input.fileUrl,
          fileName: input.fileName,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
        })
        .returning();

      return document;
    }),

  // Remove document from a claim
  removeDocument: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Get document with claim
      const document = await ctx.db.query.claimDocuments.findFirst({
        where: eq(claimDocuments.id, input.documentId),
        with: {
          claim: true,
        },
      });

      if (!document) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Документ не найден",
        });
      }

      // Verify ownership
      if (document.claim.userId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Нет доступа к этому документу",
        });
      }

      // Check if claim allows document removal
      if (!["pending", "review", "documents_requested"].includes(document.claim.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Нельзя удалить документ из заявки в текущем статусе",
        });
      }

      // Delete document record
      await ctx.db.delete(claimDocuments).where(eq(claimDocuments.id, input.documentId));

      // Note: Physical file deletion should be handled separately
      // The file URL is: document.fileUrl

      return { success: true, deletedFileUrl: document.fileUrl };
    }),

  // Revoke own property assignment (self-revoke)
  revokeMyProperty: protectedProcedure
    .input(
      z.object({
        propertyType: z.enum(["apartment", "parking"]),
        propertyId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (input.propertyType === "apartment") {
        // Find the user's apartment assignment
        const assignment = await ctx.db.query.userApartments.findFirst({
          where: and(
            eq(userApartments.userId, userId),
            eq(userApartments.apartmentId, input.propertyId),
            sql`${userApartments.revokedAt} IS NULL`
          ),
        });

        if (!assignment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Связь с объектом не найдена",
          });
        }

        const roleToCheck = assignment.role;

        // Revoke the assignment (soft delete)
        await ctx.db
          .update(userApartments)
          .set({
            revokedAt: new Date(),
            revokedBy: userId,
            revocationTemplate: "role_owner_change",
            revocationReason: "Отозвано пользователем",
          })
          .where(
            and(eq(userApartments.userId, userId), eq(userApartments.apartmentId, input.propertyId))
          );

        // Check if user has other properties with the same role
        const otherApartments = await ctx.db.query.userApartments.findFirst({
          where: and(
            eq(userApartments.userId, userId),
            eq(userApartments.role, roleToCheck),
            sql`${userApartments.revokedAt} IS NULL`
          ),
        });

        // If no other apartments with same role, check parking spots
        if (!otherApartments) {
          const parkingRole = roleToCheck === "ApartmentOwner" ? "ParkingOwner" : "ParkingResident";
          const otherParkingWithSimilarRole = await ctx.db.query.userParkingSpots.findFirst({
            where: and(
              eq(userParkingSpots.userId, userId),
              eq(userParkingSpots.role, parkingRole),
              sql`${userParkingSpots.revokedAt} IS NULL`
            ),
          });

          // If no other properties with this role type, remove the role
          if (!otherParkingWithSimilarRole) {
            await ctx.db
              .delete(userRoles)
              .where(and(eq(userRoles.userId, userId), eq(userRoles.role, roleToCheck)));
          }
        }
      } else {
        // Parking spot
        const assignment = await ctx.db.query.userParkingSpots.findFirst({
          where: and(
            eq(userParkingSpots.userId, userId),
            eq(userParkingSpots.parkingSpotId, input.propertyId),
            sql`${userParkingSpots.revokedAt} IS NULL`
          ),
        });

        if (!assignment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Связь с объектом не найдена",
          });
        }

        const roleToCheck = assignment.role;

        // Revoke the assignment (soft delete)
        await ctx.db
          .update(userParkingSpots)
          .set({
            revokedAt: new Date(),
            revokedBy: userId,
            revocationTemplate: "role_owner_change",
            revocationReason: "Отозвано пользователем",
          })
          .where(
            and(
              eq(userParkingSpots.userId, userId),
              eq(userParkingSpots.parkingSpotId, input.propertyId)
            )
          );

        // Check if user has other parking spots with the same role
        const otherParkingSpots = await ctx.db.query.userParkingSpots.findFirst({
          where: and(
            eq(userParkingSpots.userId, userId),
            eq(userParkingSpots.role, roleToCheck),
            sql`${userParkingSpots.revokedAt} IS NULL`
          ),
        });

        // If no other parking spots with same role, check apartments
        if (!otherParkingSpots) {
          const apartmentRole =
            roleToCheck === "ParkingOwner" ? "ApartmentOwner" : "ApartmentResident";
          const otherApartmentsWithSimilarRole = await ctx.db.query.userApartments.findFirst({
            where: and(
              eq(userApartments.userId, userId),
              eq(userApartments.role, apartmentRole),
              sql`${userApartments.revokedAt} IS NULL`
            ),
          });

          // If no other properties with this role type, remove the role
          if (!otherApartmentsWithSimilarRole) {
            await ctx.db
              .delete(userRoles)
              .where(and(eq(userRoles.userId, userId), eq(userRoles.role, roleToCheck)));
          }
        }
      }

      return { success: true };
    }),

  // Get available properties for claiming (buildings/apartments/parking)
  availableProperties: protectedProcedure.query(async ({ ctx }) => {
    // Get all buildings with their apartments and parking spots
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

  // Owner: manage tenant claims on owned properties
  owner: createTRPCRouter({
    // Get user's confirmed properties
    myProperties: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      // Get apartments owned by user
      const ownedApartments = await ctx.db.query.userApartments.findMany({
        where: and(
          eq(userApartments.userId, userId),
          eq(userApartments.role, "ApartmentOwner"),
          sql`${userApartments.revokedAt} IS NULL`
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
        },
      });

      // Get parking spots owned by user
      const ownedParkingSpots = await ctx.db.query.userParkingSpots.findMany({
        where: and(
          eq(userParkingSpots.userId, userId),
          eq(userParkingSpots.role, "ParkingOwner"),
          sql`${userParkingSpots.revokedAt} IS NULL`
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
        },
      });

      return {
        apartments: ownedApartments,
        parkingSpots: ownedParkingSpots,
      };
    }),

    // Get pending tenant claims on properties I own
    pendingTenantClaims: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      // Get apartment IDs owned by user
      const ownedApartmentIds = await ctx.db
        .select({ id: userApartments.apartmentId })
        .from(userApartments)
        .where(
          and(
            eq(userApartments.userId, userId),
            eq(userApartments.role, "ApartmentOwner"),
            sql`${userApartments.revokedAt} IS NULL`
          )
        );

      // Get parking spot IDs owned by user
      const ownedParkingSpotIds = await ctx.db
        .select({ id: userParkingSpots.parkingSpotId })
        .from(userParkingSpots)
        .where(
          and(
            eq(userParkingSpots.userId, userId),
            eq(userParkingSpots.role, "ParkingOwner"),
            sql`${userParkingSpots.revokedAt} IS NULL`
          )
        );

      const apartmentIds = ownedApartmentIds.map((a) => a.id);
      const parkingSpotIds = ownedParkingSpotIds.map((p) => p.id);

      if (apartmentIds.length === 0 && parkingSpotIds.length === 0) {
        return [];
      }

      // Get pending tenant claims on owned properties
      const claims = await ctx.db.query.propertyClaims.findMany({
        where: and(
          eq(propertyClaims.status, "pending"),
          sql`(
            (${propertyClaims.claimedRole} = 'ApartmentResident' AND ${propertyClaims.apartmentId} IN (${
              apartmentIds.length > 0
                ? sql.join(
                    apartmentIds.map((id) => sql`${id}`),
                    sql`, `
                  )
                : sql`NULL`
            }))
            OR
            (${propertyClaims.claimedRole} = 'ParkingResident' AND ${propertyClaims.parkingSpotId} IN (${
              parkingSpotIds.length > 0
                ? sql.join(
                    parkingSpotIds.map((id) => sql`${id}`),
                    sql`, `
                  )
                : sql`NULL`
            }))
          )`
        ),
        with: {
          user: true,
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
        orderBy: desc(propertyClaims.createdAt),
      });

      return claims;
    }),

    // Owner reviews tenant claim
    reviewTenantClaim: protectedProcedure
      .input(
        z.object({
          claimId: z.string(),
          status: z.enum(["approved", "rejected"]),
          comment: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.session.user.id;

        // Get the claim
        const claim = await ctx.db.query.propertyClaims.findFirst({
          where: eq(propertyClaims.id, input.claimId),
        });

        if (!claim) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Заявка не найдена",
          });
        }

        // Verify user owns the property
        let isOwner = false;
        if (claim.apartmentId && claim.claimedRole === "ApartmentResident") {
          const ownership = await ctx.db.query.userApartments.findFirst({
            where: and(
              eq(userApartments.userId, userId),
              eq(userApartments.apartmentId, claim.apartmentId),
              eq(userApartments.role, "ApartmentOwner"),
              sql`${userApartments.revokedAt} IS NULL`
            ),
          });
          isOwner = !!ownership;
        } else if (claim.parkingSpotId && claim.claimedRole === "ParkingResident") {
          const ownership = await ctx.db.query.userParkingSpots.findFirst({
            where: and(
              eq(userParkingSpots.userId, userId),
              eq(userParkingSpots.parkingSpotId, claim.parkingSpotId),
              eq(userParkingSpots.role, "ParkingOwner"),
              sql`${userParkingSpots.revokedAt} IS NULL`
            ),
          });
          isOwner = !!ownership;
        }

        if (!isOwner) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Вы не являетесь собственником этого объекта",
          });
        }

        const previousStatus = claim.status;
        const resolutionText =
          input.status === "approved"
            ? "Подтверждено собственником"
            : (input.comment ?? "Отклонено собственником");

        // Update claim
        await ctx.db
          .update(propertyClaims)
          .set({
            status: input.status,
            adminComment: resolutionText,
            reviewedBy: userId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(propertyClaims.id, input.claimId));

        // Add to history
        await ctx.db.insert(claimHistory).values({
          claimId: input.claimId,
          fromStatus: previousStatus,
          toStatus: input.status,
          resolutionTemplate: input.status === "approved" ? "approved_custom" : "rejected_custom",
          resolutionText,
          changedBy: userId,
        });

        // If approved, create user-property relationship
        if (input.status === "approved") {
          let buildingId: string | null = null;

          if (claim.apartmentId) {
            await ctx.db.insert(userApartments).values({
              userId: claim.userId,
              apartmentId: claim.apartmentId,
              status: "approved",
              role: claim.claimedRole,
            });

            // Get building ID from apartment
            const apartment = await ctx.db.query.apartments.findFirst({
              where: eq(apartments.id, claim.apartmentId),
              with: {
                floor: {
                  with: {
                    entrance: true,
                  },
                },
              },
            });
            buildingId = apartment?.floor?.entrance?.buildingId ?? null;
          } else if (claim.parkingSpotId) {
            await ctx.db.insert(userParkingSpots).values({
              userId: claim.userId,
              parkingSpotId: claim.parkingSpotId,
              status: "approved",
              role: claim.claimedRole,
            });

            // Get building ID from parking spot
            const spot = await ctx.db.query.parkingSpots.findFirst({
              where: eq(parkingSpots.id, claim.parkingSpotId),
              with: {
                floor: {
                  with: {
                    parking: true,
                  },
                },
              },
            });
            buildingId = spot?.floor?.parking?.buildingId ?? null;
          }

          // Add building to user's interest buildings
          if (buildingId) {
            await addBuildingToUserInterests(ctx.db, claim.userId, buildingId);
          }

          // Assign role
          const existingRole = await ctx.db.query.userRoles.findFirst({
            where: and(eq(userRoles.userId, claim.userId), eq(userRoles.role, claim.claimedRole)),
          });

          if (!existingRole) {
            await ctx.db.insert(userRoles).values({
              userId: claim.userId,
              role: claim.claimedRole,
            });
          }
        }

        return { success: true };
      }),

    // Get claim history for a specific property (all claims, grouped timeline)
    propertyHistory: protectedProcedure
      .input(
        z.object({
          propertyType: z.enum(["apartment", "parking"]),
          propertyId: z.string(),
        })
      )
      .query(async ({ ctx, input }) => {
        const userId = ctx.session.user.id;

        // Verify user has access to this property:
        // 1. Has active property assignment (owner or resident), OR
        // 2. Has made any claim on this property
        let hasAccess = false;

        if (input.propertyType === "apartment") {
          // Check active assignment
          const userProperty = await ctx.db.query.userApartments.findFirst({
            where: and(
              eq(userApartments.userId, userId),
              eq(userApartments.apartmentId, input.propertyId),
              sql`${userApartments.revokedAt} IS NULL`
            ),
          });
          hasAccess = !!userProperty;

          // Also check if user has any claim on this property
          if (!hasAccess) {
            const userClaim = await ctx.db.query.propertyClaims.findFirst({
              where: and(
                eq(propertyClaims.userId, userId),
                eq(propertyClaims.apartmentId, input.propertyId)
              ),
            });
            hasAccess = !!userClaim;
          }
        } else {
          // Check active assignment
          const userProperty = await ctx.db.query.userParkingSpots.findFirst({
            where: and(
              eq(userParkingSpots.userId, userId),
              eq(userParkingSpots.parkingSpotId, input.propertyId),
              sql`${userParkingSpots.revokedAt} IS NULL`
            ),
          });
          hasAccess = !!userProperty;

          // Also check if user has any claim on this property
          if (!hasAccess) {
            const userClaim = await ctx.db.query.propertyClaims.findFirst({
              where: and(
                eq(propertyClaims.userId, userId),
                eq(propertyClaims.parkingSpotId, input.propertyId)
              ),
            });
            hasAccess = !!userClaim;
          }
        }

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "У вас нет доступа к этому объекту",
          });
        }

        // Get all claims for this property
        const claims = await ctx.db.query.propertyClaims.findMany({
          where:
            input.propertyType === "apartment"
              ? eq(propertyClaims.apartmentId, input.propertyId)
              : eq(propertyClaims.parkingSpotId, input.propertyId),
          with: {
            user: true,
            apartment: {
              with: {
                floor: {
                  with: {
                    entrance: {
                      with: {
                        building: true,
                      },
                    },
                  },
                },
              },
            },
            parkingSpot: {
              with: {
                floor: {
                  with: {
                    parking: {
                      with: {
                        building: true,
                      },
                    },
                  },
                },
              },
            },
            documents: true,
            history: {
              with: {
                changedByUser: {
                  with: {
                    roles: true,
                  },
                },
              },
              orderBy: desc(claimHistory.createdAt),
            },
          },
          orderBy: desc(propertyClaims.createdAt),
        });

        return claims;
      }),
  }),

  // Admin: list all claims
  admin: createTRPCRouter({
    list: adminProcedureWithFeature("claims:view")
      .input(
        z.object({
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(20),
          status: claimStatusSchema.optional(),
          type: claimTypeSchema.optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const { page, limit, status, type } = input;
        const offset = (page - 1) * limit;

        // Build conditions
        const conditions = [];
        if (status) {
          conditions.push(eq(propertyClaims.status, status));
        }
        if (type) {
          conditions.push(eq(propertyClaims.claimType, type));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const claims = await ctx.db.query.propertyClaims.findMany({
          where: whereClause,
          with: {
            user: true,
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
            organization: {
              with: { building: true },
            },
            documents: true,
          },
          orderBy: desc(propertyClaims.createdAt),
          limit,
          offset,
        });

        const [totalResult] = await ctx.db
          .select({ count: count() })
          .from(propertyClaims)
          .where(whereClause);

        return {
          claims,
          total: totalResult?.count ?? 0,
          page,
          totalPages: Math.ceil((totalResult?.count ?? 0) / limit),
        };
      }),

    // Review a claim (approve/reject)
    review: adminProcedureWithFeature("claims:review")
      .input(
        z.object({
          claimId: z.string(),
          status: z.enum(["approved", "rejected", "documents_requested"]),
          resolutionTemplate: resolutionTemplateSchema,
          customText: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const claim = await ctx.db.query.propertyClaims.findFirst({
          where: eq(propertyClaims.id, input.claimId),
        });

        if (!claim) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Заявка не найдена",
          });
        }

        // Определяем текст решения
        const resolutionText = input.resolutionTemplate.endsWith("_custom")
          ? (input.customText ?? "")
          : (RESOLUTION_TEMPLATES[input.resolutionTemplate] ?? "");

        const previousStatus = claim.status;

        // Update claim status
        await ctx.db
          .update(propertyClaims)
          .set({
            status: input.status,
            adminComment: resolutionText,
            reviewedBy: ctx.session.user.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(propertyClaims.id, input.claimId));

        // Записываем в историю
        await ctx.db.insert(claimHistory).values({
          claimId: input.claimId,
          fromStatus: previousStatus,
          toStatus: input.status,
          resolutionTemplate: input.resolutionTemplate,
          resolutionText,
          changedBy: ctx.session.user.id,
        });

        // Mark documents for deletion after approved/rejected
        if (input.status === "approved" || input.status === "rejected") {
          const scheduledDate = new Date();
          scheduledDate.setDate(scheduledDate.getDate() + 60); // 60 days from now

          await ctx.db
            .update(claimDocuments)
            .set({ scheduledForDeletion: scheduledDate })
            .where(eq(claimDocuments.claimId, input.claimId));
        }

        // If approved, create user-property relationship and assign role
        if (input.status === "approved") {
          let buildingId: string | null = null;

          if (claim.apartmentId) {
            await ctx.db.insert(userApartments).values({
              userId: claim.userId,
              apartmentId: claim.apartmentId,
              status: "approved",
              role: claim.claimedRole,
            });

            // Get building ID from apartment
            const apartment = await ctx.db.query.apartments.findFirst({
              where: eq(apartments.id, claim.apartmentId),
              with: {
                floor: {
                  with: {
                    entrance: true,
                  },
                },
              },
            });
            buildingId = apartment?.floor?.entrance?.buildingId ?? null;
          } else if (claim.parkingSpotId) {
            await ctx.db.insert(userParkingSpots).values({
              userId: claim.userId,
              parkingSpotId: claim.parkingSpotId,
              status: "approved",
              role: claim.claimedRole,
            });

            // Get building ID from parking spot
            const spot = await ctx.db.query.parkingSpots.findFirst({
              where: eq(parkingSpots.id, claim.parkingSpotId),
              with: {
                floor: {
                  with: {
                    parking: true,
                  },
                },
              },
            });
            buildingId = spot?.floor?.parking?.buildingId ?? null;
          }

          // Add building to user's interest buildings
          if (buildingId) {
            await addBuildingToUserInterests(ctx.db, claim.userId, buildingId);
          }

          // Assign the claimed role to the user
          const existingRole = await ctx.db.query.userRoles.findFirst({
            where: and(eq(userRoles.userId, claim.userId), eq(userRoles.role, claim.claimedRole)),
          });

          if (!existingRole) {
            await ctx.db.insert(userRoles).values({
              userId: claim.userId,
              role: claim.claimedRole,
            });
          }
        }

        // Send Telegram notification about review
        const claimTypeName = {
          apartment: "квартиру",
          parking: "парковку",
          commercial: "коммерческую недвижимость",
        }[claim.claimType];

        sendTelegramNotificationAsync({
          event: input.status === "approved" ? "claim_approved" : "claim_rejected",
          title: `Заявка ${input.status === "approved" ? "одобрена" : "отклонена"}`,
          description: `Заявка на ${claimTypeName} была ${input.status === "approved" ? "одобрена" : "отклонена"} администратором`,
          metadata: {
            Тип: claimTypeName,
            Роль: claim.claimedRole,
            Причина: resolutionText,
          },
          userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined,
        });

        return { success: true };
      }),

    // Get claim history
    getHistory: adminProcedureWithFeature("claims:view")
      .input(z.object({ claimId: z.string() }))
      .query(async ({ ctx, input }) => {
        const history = await ctx.db.query.claimHistory.findMany({
          where: eq(claimHistory.claimId, input.claimId),
          with: {
            changedByUser: true,
          },
          orderBy: desc(claimHistory.createdAt),
        });

        return history;
      }),

    // Get statistics
    stats: adminProcedureWithFeature("claims:view").query(async ({ ctx }) => {
      const [pending] = await ctx.db
        .select({ count: count() })
        .from(propertyClaims)
        .where(eq(propertyClaims.status, "pending"));

      const [underReview] = await ctx.db
        .select({ count: count() })
        .from(propertyClaims)
        .where(eq(propertyClaims.status, "review"));

      const [approved] = await ctx.db
        .select({ count: count() })
        .from(propertyClaims)
        .where(eq(propertyClaims.status, "approved"));

      const [rejected] = await ctx.db
        .select({ count: count() })
        .from(propertyClaims)
        .where(eq(propertyClaims.status, "rejected"));

      return {
        pending: pending?.count ?? 0,
        underReview: underReview?.count ?? 0,
        approved: approved?.count ?? 0,
        rejected: rejected?.count ?? 0,
        total:
          (pending?.count ?? 0) +
          (underReview?.count ?? 0) +
          (approved?.count ?? 0) +
          (rejected?.count ?? 0),
      };
    }),

    // Bulk delete claims (for spam)
    bulkDelete: adminProcedureWithFeature("claims:review")
      .input(
        z.object({
          claimIds: z.array(z.string().uuid()).min(1).max(100),
          reason: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { claimIds, reason } = input;

        // Use transaction for atomicity
        await ctx.db.transaction(async (tx) => {
          // Delete claim documents from database (S3 cleanup handled separately)
          await tx.delete(claimDocuments).where(inArray(claimDocuments.claimId, claimIds));

          // Delete claim history
          await tx.delete(claimHistory).where(inArray(claimHistory.claimId, claimIds));

          // Delete claims
          await tx.delete(propertyClaims).where(inArray(propertyClaims.id, claimIds));
        });

        // Log outside transaction
        logger.info("[Bulk Delete] Deleted claims", {
          count: claimIds.length,
          adminId: ctx.session.user.id,
          reason,
        });

        return { deleted: claimIds.length };
      }),
  }),
});
