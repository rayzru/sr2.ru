import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "~/lib/logger";
import { db } from "~/server/db";
import { accounts, userRoles, users } from "~/server/db/schema";

const NEXTAUTH_URL = process.env.NEXTAUTH_URL!;
const AUTH_SECRET = process.env.AUTH_SECRET!;
const isDev = process.env.NODE_ENV === "development";

/**
 * Generate a signed token for VK session authentication
 * Token format: base64(userId:timestamp:signature)
 */
function generateSessionToken(userId: string): string {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(`${userId}:${timestamp}`)
    .digest("hex")
    .substring(0, 16);

  return Buffer.from(`${userId}:${timestamp}:${signature}`).toString("base64");
}

/**
 * Get the base URL for redirects
 */
function getBaseUrl(request: NextRequest): string {
  if (NEXTAUTH_URL) {
    return NEXTAUTH_URL;
  }
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

/**
 * Complete VK ID authentication
 * Creates or updates user and redirects to dashboard
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("vk_session_temp")?.value;

  if (!sessionCookie) {
    logger.error("[VK Complete] No session cookie found");
    return NextResponse.redirect(new URL("/login?error=NoSession", baseUrl));
  }

  try {
    const sessionData = JSON.parse(Buffer.from(sessionCookie, "base64").toString());
    logger.info("[VK Complete] Session data:", sessionData);

    const { user: vkUser, accessToken, refreshToken } = sessionData;

    if (!vkUser?.id) {
      logger.error("[VK Complete] No user ID in session");
      return NextResponse.redirect(new URL("/login?error=NoUserId", baseUrl));
    }

    // Find or create user
    let existingAccount = await db.query.accounts.findFirst({
      where: eq(accounts.providerAccountId, vkUser.id),
    });

    let userId: string;

    if (existingAccount) {
      // Update existing account
      userId = existingAccount.userId;
      logger.info("[VK Complete] Existing user found:", userId);

      await db
        .update(accounts)
        .set({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        .where(and(eq(accounts.provider, "vk"), eq(accounts.providerAccountId, vkUser.id)));
    } else {
      // Create new user
      logger.info("[VK Complete] Creating new user for VK ID:", vkUser.id);

      // Check if user with this email exists
      let existingUser = null;
      if (vkUser.email) {
        existingUser = await db.query.users.findFirst({
          where: eq(users.email, vkUser.email),
        });
      }

      if (existingUser) {
        userId = existingUser.id;
        logger.info("[VK Complete] Linking to existing user by email:", userId);
      } else {
        // Create new user
        const [newUser] = await db
          .insert(users)
          .values({
            name: vkUser.name,
            email: vkUser.email || `vk_${vkUser.id}@vk.local`,
            image: vkUser.image,
            emailVerified: vkUser.email ? new Date() : null,
          })
          .returning();

        userId = newUser!.id;
        logger.info("[VK Complete] Created new user:", userId);

        // Assign Guest role
        await db.insert(userRoles).values({
          userId,
          role: "Guest",
        });
      }

      // Create account link
      await db.insert(accounts).values({
        userId,
        type: "oauth",
        provider: "vk",
        providerAccountId: vkUser.id,
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }

    logger.info("[VK Complete] User authenticated:", userId);

    // Generate signed token for session creation
    const sessionToken = generateSessionToken(userId);

    // Store credentials in a cookie for the client-side signIn
    const credsCookie = Buffer.from(JSON.stringify({ userId, token: sessionToken })).toString(
      "base64"
    );

    // Redirect to a client page that will complete the signIn
    const response = NextResponse.redirect(
      new URL("/api/auth/vk-session?callbackUrl=/my", baseUrl)
    );

    // Clear temp VK session cookie
    response.cookies.delete("vk_session_temp");

    // Set credentials cookie for session creation
    response.cookies.set("vk_session_creds", credsCookie, {
      httpOnly: true,
      secure: !isDev, // Only secure in production
      sameSite: "lax",
      maxAge: 60, // 1 minute
      path: "/",
    });

    return response;
  } catch (err) {
    logger.error("[VK Complete] Error:", err);
    return NextResponse.redirect(new URL("/login?error=CompleteError", baseUrl));
  }
}
