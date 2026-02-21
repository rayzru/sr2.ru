import { adminRouter } from "~/server/api/routers/admin";
import { analyticsRouter } from "~/server/api/routers/analytics";
import { auditRouter } from "~/server/api/routers/audit";
import { authRouter } from "~/server/api/routers/auth";
import { claimsRouter } from "~/server/api/routers/claims";
import { directoryRouter } from "~/server/api/routers/directory";
import { feedbackRouter } from "~/server/api/routers/feedback";
import { knowledgeRouter } from "~/server/api/routers/knowledge";
import { listingsRouter } from "~/server/api/routers/listings";
import { mediaRouter } from "~/server/api/routers/media";
import { newsRouter } from "~/server/api/routers/news";
import { notificationsRouter } from "~/server/api/routers/notifications";
import { postRouter } from "~/server/api/routers/post";
import { profileRouter } from "~/server/api/routers/profile";
import { publicationsRouter } from "~/server/api/routers/publications";
import { settingsRouter } from "~/server/api/routers/settings";
import { statsRouter } from "~/server/api/routers/stats";
import { tagsRouter } from "~/server/api/routers/tags";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  admin: adminRouter,
  analytics: analyticsRouter,
  audit: auditRouter,
  auth: authRouter,
  profile: profileRouter,
  claims: claimsRouter,
  feedback: feedbackRouter,
  knowledge: knowledgeRouter,
  listings: listingsRouter,
  directory: directoryRouter,
  media: mediaRouter,
  news: newsRouter,
  notifications: notificationsRouter,
  publications: publicationsRouter,
  settings: settingsRouter,
  stats: statsRouter,
  tags: tagsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
