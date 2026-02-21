import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import path from "path";
import sharp from "sharp";

import { logger } from "~/lib/logger";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { userProfiles } from "~/server/db/schema";

// ============================================================================
// Constants
// ============================================================================

const AVATAR_SIZE = 400; // 400x400 pixels
const AVATAR_QUALITY = 90;
const AVATAR_DIR = path.join(process.cwd(), "public", "uploads", "avatars");
const SUPPORTED_FORMATS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ============================================================================
// POST - Upload avatar
// ============================================================================

/**
 * POST /api/avatar
 *
 * Upload and process avatar image.
 * Accepts pre-cropped image data (already cropped on client side).
 * Resizes to 400x400 and converts to WebP.
 *
 * Form data:
 * - file: File (required) - The cropped image file
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported format: ${file.type}. Supported: JPEG, PNG, WebP, GIF` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Max: 5MB` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Process image with sharp
    // Resize to 400x400, center crop, convert to webp
    const processedImage = await sharp(buffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: "cover",
        position: "center",
      })
      .webp({ quality: AVATAR_QUALITY })
      .toBuffer();

    // Generate unique filename
    const id = randomUUID();
    const filename = `${id}.webp`;

    // Ensure avatar directory exists
    await fs.mkdir(AVATAR_DIR, { recursive: true });

    // Save file
    const filePath = path.join(AVATAR_DIR, filename);
    await fs.writeFile(filePath, processedImage);

    const avatarUrl = `/uploads/avatars/${filename}`;

    // Get old avatar to delete
    const existingProfile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, session.user.id),
      columns: { avatar: true },
    });

    // Update user profile with new avatar
    await db
      .update(userProfiles)
      .set({ avatar: avatarUrl })
      .where(eq(userProfiles.userId, session.user.id));

    // Delete old avatar file if exists (handle both old /avatars/ and new /uploads/avatars/ paths)
    if (existingProfile?.avatar) {
      let oldFilePath: string | null = null;
      if (existingProfile.avatar.startsWith("/uploads/avatars/")) {
        const oldFilename = existingProfile.avatar.replace("/uploads/avatars/", "");
        oldFilePath = path.join(AVATAR_DIR, oldFilename);
      } else if (existingProfile.avatar.startsWith("/avatars/")) {
        // Legacy path - try to delete from old location
        const oldFilename = existingProfile.avatar.replace("/avatars/", "");
        oldFilePath = path.join(process.cwd(), "public", "avatars", oldFilename);
      }
      if (oldFilePath) {
        try {
          await fs.unlink(oldFilePath);
        } catch {
          // Ignore errors when deleting old file
        }
      }
    }

    return NextResponse.json({
      success: true,
      url: avatarUrl,
    });
  } catch (error) {
    logger.error("Avatar upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Remove avatar
// ============================================================================

/**
 * DELETE /api/avatar
 *
 * Remove current user's avatar
 */
export async function DELETE() {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current avatar
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, session.user.id),
      columns: { avatar: true },
    });

    // Delete file (handle both old /avatars/ and new /uploads/avatars/ paths)
    if (profile?.avatar) {
      let filePath: string | null = null;
      if (profile.avatar.startsWith("/uploads/avatars/")) {
        const filename = profile.avatar.replace("/uploads/avatars/", "");
        filePath = path.join(AVATAR_DIR, filename);
      } else if (profile.avatar.startsWith("/avatars/")) {
        // Legacy path
        const filename = profile.avatar.replace("/avatars/", "");
        filePath = path.join(process.cwd(), "public", "avatars", filename);
      }
      if (filePath) {
        try {
          await fs.unlink(filePath);
        } catch {
          // Ignore errors when deleting file
        }
      }
    }

    // Clear avatar in profile
    await db
      .update(userProfiles)
      .set({ avatar: null })
      .where(eq(userProfiles.userId, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Avatar delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
