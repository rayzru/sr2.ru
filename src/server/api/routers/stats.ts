import { and, count, eq, gte, or, isNull, lte, ne } from "drizzle-orm";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { news, publications, users } from "~/server/db/schema";

export const statsRouter = createTRPCRouter({
  summary: publicProcedure.query(async ({ ctx }) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const now = new Date();

    const [usersResult, newsResult, publicationsResult] = await Promise.all([
      ctx.db
        .select({ value: count() })
        .from(users)
        .where(eq(users.isDeleted, false)),

      ctx.db
        .select({ value: count() })
        .from(news)
        .where(
          and(
            eq(news.status, "published"),
            gte(news.createdAt, thirtyDaysAgo),
            or(isNull(news.publishAt), lte(news.publishAt, now))
          )
        ),

      ctx.db
        .select({ value: count() })
        .from(publications)
        .where(
          and(
            eq(publications.status, "published"),
            ne(publications.type, "event"),
            gte(publications.createdAt, thirtyDaysAgo)
          )
        ),
    ]);

    return {
      usersCount: usersResult[0]?.value ?? 0,
      newsLast30: newsResult[0]?.value ?? 0,
      publicationsLast30: publicationsResult[0]?.value ?? 0,
    };
  }),
});
