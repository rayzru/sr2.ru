import { decode as authDecode } from "@auth/core/jwt";
import { hkdf } from "@panva/hkdf";
import * as jose from "jose";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { logger } from "~/lib/logger";

const VK_CLIENT_ID = process.env.VK_CLIENT_ID!;
const VK_CLIENT_SECRET = process.env.VK_CLIENT_SECRET!;
const AUTH_SECRET = process.env.AUTH_SECRET!;
const NEXTAUTH_URL = process.env.NEXTAUTH_URL!;

/**
 * Get the base URL for redirects
 * Uses NEXTAUTH_URL in production, or X-Forwarded-Host header when behind proxy
 */
function getBaseUrl(request: NextRequest): string {
  // Use NEXTAUTH_URL if set (required for ngrok/proxy scenarios)
  if (NEXTAUTH_URL) {
    return NEXTAUTH_URL;
  }
  // Fallback to forwarded host or request origin
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

/**
 * Derive encryption key exactly like auth.js does
 * Uses @panva/hkdf with the same parameters as auth.js
 */
async function getEncryptionKey(secret: string): Promise<Uint8Array> {
  return await hkdf("sha512", secret, "", "Auth.js Generated Encryption Key", 64);
}

/**
 * Decrypt auth.js JWE cookie value
 * First tries auth.js's decode function, then falls back to manual decryption
 */
async function decryptJWE(jwe: string): Promise<string | null> {
  // Try auth.js's decode function with different salt values
  // The salt should match the cookie name used by auth.js
  const salts = [
    "__Secure-authjs.pkce.code_verifier", // Production (HTTPS)
    "authjs.pkce.code_verifier", // Development (HTTP)
    "pkce.code_verifier",
  ];

  for (const salt of salts) {
    try {
      logger.info("[VK ID Callback] Trying auth.js decode with salt:", salt);
      const decoded = await authDecode({
        token: jwe,
        secret: AUTH_SECRET,
        salt,
      });
      logger.info("[VK ID Callback] auth.js decode succeeded:", JSON.stringify(decoded));
      if (decoded && typeof decoded.value === "string") {
        return decoded.value;
      }
      if (decoded && typeof decoded === "object") {
        return JSON.stringify(decoded);
      }
    } catch (authErr) {
      logger.info("[VK ID Callback] auth.js decode with salt", salt, "failed");
    }
  }

  // Fallback to manual decryption
  try {
    // Parse JWE header to check algorithm
    const headerB64 = jwe.split(".")[0];
    if (!headerB64) {
      logger.error("[VK ID Callback] Invalid JWE format");
      return null;
    }
    const headerJson = Buffer.from(headerB64, "base64url").toString();
    logger.info("[VK ID Callback] JWE header:", headerJson);

    const key = await getEncryptionKey(AUTH_SECRET);
    logger.info("[VK ID Callback] Derived key length:", key.length, "bytes");

    // Try compactDecrypt
    const { plaintext } = await jose.compactDecrypt(jwe, key);
    const decoded = new TextDecoder().decode(plaintext);
    logger.info("[VK ID Callback] compactDecrypt succeeded, content:", decoded.substring(0, 100));

    if (decoded.startsWith("{")) {
      const parsed = JSON.parse(decoded);
      if (typeof parsed.value === "string") {
        return parsed.value;
      }
      return decoded;
    }
    return decoded;
  } catch (err) {
    logger.error("[VK ID Callback] JWE decryption error:", err);
    return null;
  }
}

/**
 * Custom VK ID callback handler
 *
 * VK ID requires non-standard OAuth2 parameters (device_id, state) in the token request.
 * NextAuth/auth.js doesn't support these, so we handle the callback manually.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Get callback parameters from VK ID
  const code = searchParams.get("code");
  const deviceId = searchParams.get("device_id");
  const state = searchParams.get("state");
  const extId = searchParams.get("ext_id");
  const type = searchParams.get("type");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  logger.info("[VK ID Callback] Received params:", {
    code: code?.substring(0, 20) + "...",
    deviceId: deviceId?.substring(0, 20) + "...",
    state: state || "(empty)",
    extId: extId?.substring(0, 20) + "...",
    type,
  });

  // Get base URL for all redirects
  const baseUrl = getBaseUrl(request);
  logger.info("[VK ID Callback] Using baseUrl:", baseUrl);

  // Handle VK ID errors
  if (error) {
    logger.error("[VK ID Callback] Error from VK:", {
      error,
      errorDescription,
    });
    return NextResponse.redirect(
      new URL(
        `/login?error=VKIDError&description=${encodeURIComponent(errorDescription || error)}`,
        baseUrl
      )
    );
  }

  if (!code || !deviceId) {
    logger.error("[VK ID Callback] Missing required params");
    return NextResponse.redirect(new URL("/login?error=MissingParams", baseUrl));
  }

  // Get PKCE code_verifier from cookie (encrypted by auth.js)
  const cookieStore = await cookies();
  const pkceJWE =
    cookieStore.get("authjs.pkce.code_verifier")?.value ||
    cookieStore.get("__Secure-authjs.pkce.code_verifier")?.value;

  logger.info("[VK ID Callback] PKCE JWE cookie:", pkceJWE ? "found" : "NOT FOUND");
  logger.info("[VK ID Callback] PKCE JWE length:", pkceJWE?.length || 0);
  logger.info("[VK ID Callback] PKCE JWE parts:", pkceJWE?.split(".").length || 0);

  if (!pkceJWE) {
    logger.error("[VK ID Callback] Missing PKCE code_verifier cookie");
    return NextResponse.redirect(new URL("/login?error=MissingPKCE", baseUrl));
  }

  // Decrypt the code_verifier
  const pkceCodeVerifier = await decryptJWE(pkceJWE);
  logger.info(
    "[VK ID Callback] Decrypted code_verifier:",
    pkceCodeVerifier ? `success (${pkceCodeVerifier.length} chars)` : "FAILED"
  );

  if (!pkceCodeVerifier) {
    logger.error("[VK ID Callback] Failed to decrypt PKCE code_verifier");
    return NextResponse.redirect(new URL("/login?error=PKCEDecrypt", baseUrl));
  }

  // Callback URL for token exchange (must match what was sent to VK)
  const callbackUrl = `${baseUrl}/api/auth/callback/vk`;
  logger.info("[VK ID Callback] callbackUrl:", callbackUrl);

  try {
    // Exchange code for tokens
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: VK_CLIENT_ID,
      client_secret: VK_CLIENT_SECRET,
      device_id: deviceId,
      code_verifier: pkceCodeVerifier,
    });

    // Add state only if not empty
    if (state && state.length > 0) {
      tokenBody.set("state", state);
    }

    logger.info("[VK ID Callback] Token request to:", "https://id.vk.com/oauth2/auth");
    logger.info(
      "[VK ID Callback] Token request body:",
      tokenBody.toString().replace(/client_secret=[^&]+/, "client_secret=***")
    );

    const tokenResponse = await fetch("https://id.vk.com/oauth2/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody,
    });

    const tokenData = await tokenResponse.json();
    logger.info("[VK ID Callback] Token response:", JSON.stringify(tokenData, null, 2));

    if (tokenData.error) {
      logger.error("[VK ID Callback] Token error:", tokenData);
      return NextResponse.redirect(
        new URL(
          `/login?error=TokenExchange&description=${encodeURIComponent(tokenData.error_description || tokenData.error)}`,
          baseUrl
        )
      );
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      logger.error("[VK ID Callback] No access_token in response");
      return NextResponse.redirect(new URL("/login?error=NoAccessToken", baseUrl));
    }

    // Get user info
    const userInfoBody = new URLSearchParams({
      access_token: accessToken,
      client_id: VK_CLIENT_ID,
    });

    const userInfoResponse = await fetch("https://id.vk.com/oauth2/user_info", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: userInfoBody,
    });

    const userInfoData = await userInfoResponse.json();
    logger.info("[VK ID Callback] User info response:", JSON.stringify(userInfoData, null, 2));

    if (!userInfoData.user) {
      logger.error("[VK ID Callback] No user in response");
      return NextResponse.redirect(new URL("/login?error=NoUserInfo", baseUrl));
    }

    const vkUser = userInfoData.user;

    // Now we need to create/update the user in our database and create a session
    // Redirect to a special endpoint that will handle this with auth.js
    const userData = {
      id: String(vkUser.user_id),
      name: [vkUser.first_name, vkUser.last_name].filter(Boolean).join(" "),
      email: vkUser.email || null,
      image: vkUser.avatar || null,
    };

    logger.info("[VK ID Callback] User data:", userData);

    // For now, redirect to login with success and user data encoded
    // In production, we'd create the session here using auth.js signIn
    // But auth.js doesn't expose a way to create a session from OAuth data directly

    // Let's try redirecting back to auth.js callback with modified parameters
    // Actually, let's store the tokens in a cookie and redirect to complete auth

    // Store tokens temporarily
    const sessionCookie = Buffer.from(
      JSON.stringify({
        accessToken,
        refreshToken: tokenData.refresh_token,
        user: userData,
        provider: "vk",
      })
    ).toString("base64");

    const response = NextResponse.redirect(new URL("/api/auth/vk-complete", baseUrl));
    response.cookies.set("vk_session_temp", sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60, // 1 minute
      path: "/",
    });

    return response;
  } catch (err) {
    logger.error("[VK ID Callback] Error:", err);
    return NextResponse.redirect(new URL("/login?error=CallbackError", baseUrl));
  }
}
