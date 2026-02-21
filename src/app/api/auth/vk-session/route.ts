import { encode } from "@auth/core/jwt";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "~/lib/logger";
import { db } from "~/server/db";
import { sessions, users } from "~/server/db/schema";

const NEXTAUTH_URL = process.env.NEXTAUTH_URL!;
const AUTH_SECRET = process.env.AUTH_SECRET!;
const isDev = process.env.NODE_ENV === "development";
// Use secure cookies if URL is HTTPS (even in dev with ngrok)
const useSecureCookies = NEXTAUTH_URL?.startsWith("https://");

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
 * Verify the signed token from vk-complete
 */
function verifySessionToken(userId: string, token: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64").toString();
    const [tokenUserId, timestamp, signature] = decoded.split(":");

    if (tokenUserId !== userId) return false;

    // Check timestamp is within 5 minutes
    const tokenTime = parseInt(timestamp || "0", 10);
    const now = Date.now();
    if (now - tokenTime > 5 * 60 * 1000) return false;

    // Verify signature
    const expectedSig = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(`${userId}:${timestamp}`)
      .digest("hex")
      .substring(0, 16);

    return signature === expectedSig;
  } catch {
    return false;
  }
}

/**
 * Complete VK session by creating auth.js session directly
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const callbackUrl = request.nextUrl.searchParams.get("callbackUrl") || "/my";

  const cookieStore = await cookies();
  const credsCookie = cookieStore.get("vk_session_creds")?.value;

  if (!credsCookie) {
    logger.error("[VK Session] No credentials cookie found");
    return NextResponse.redirect(new URL("/login?error=NoCredentials", baseUrl));
  }

  try {
    const { userId, token } = JSON.parse(Buffer.from(credsCookie, "base64").toString());

    // Verify the token
    if (!verifySessionToken(userId, token)) {
      logger.error("[VK Session] Invalid token");
      return NextResponse.redirect(new URL("/login?error=InvalidToken", baseUrl));
    }

    // Get user from database
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      logger.error("[VK Session] User not found:", userId);
      return NextResponse.redirect(new URL("/login?error=UserNotFound", baseUrl));
    }

    logger.info("[VK Session] Creating session for user:", userId);

    const response = NextResponse.redirect(new URL(callbackUrl, baseUrl));

    // Clear credentials cookie
    response.cookies.delete("vk_session_creds");

    // Cookie name depends on whether URL uses HTTPS
    const cookieName = useSecureCookies ? "__Secure-authjs.session-token" : "authjs.session-token";

    if (isDev) {
      // JWT strategy in development
      const sessionToken = await encode({
        token: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.image,
        },
        secret: AUTH_SECRET,
        salt: cookieName, // Salt must match cookie name
      });

      response.cookies.set(cookieName, sessionToken, {
        httpOnly: true,
        secure: useSecureCookies,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });

      logger.info("[VK Session] Set JWT cookie:", cookieName, "secure:", useSecureCookies);
    } else {
      // Database strategy in production
      const sessionToken = crypto.randomUUID();
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Create session in database
      await db.insert(sessions).values({
        sessionToken,
        userId: user.id,
        expires,
      });

      // Set secure cookie
      response.cookies.set(cookieName, sessionToken, {
        httpOnly: true,
        secure: useSecureCookies,
        sameSite: "lax",
        path: "/",
        expires,
      });

      logger.info("[VK Session] Set DB session cookie:", cookieName);
    }

    logger.info("[VK Session] Session created, redirecting to:", callbackUrl);
    return response;
  } catch (err) {
    logger.error("[VK Session] Error:", err);
    return NextResponse.redirect(new URL("/login?error=SessionError", baseUrl));
  }
}
