import { type NextRequest, NextResponse } from "next/server";

import { logger } from "~/lib/logger";
import {
  MAX_DOCUMENT_SIZE,
  processAndSaveDocument,
  SUPPORTED_DOCUMENT_FORMATS,
  validateDocumentFile,
} from "~/lib/upload/document-processor";
import { auth } from "~/server/auth";

/**
 * POST /api/upload/documents
 *
 * Upload documents for property claims.
 * Supports: PDF, JPEG, PNG
 * Max size: 5MB
 *
 * Form data:
 * - file: File (required) - The document file to upload
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не предоставлен" }, { status: 400 });
    }

    // Validate file
    const validation = validateDocumentFile(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Parse upload type for folder structure
    const uploadType = formData.get("uploadType") as string | null;

    // Process and save document
    const result = await processAndSaveDocument(file, file.name, file.type, {
      generateThumbnail: file.type.startsWith("image/"),
      uploadType:
        uploadType && ["news", "knowledge", "publication", "listing", "media"].includes(uploadType)
          ? (uploadType as "news" | "knowledge" | "publication" | "listing" | "media")
          : "media",
      userId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      document: result,
    });
  } catch (error) {
    logger.error("Document upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка загрузки" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/upload/documents
 *
 * Returns upload configuration and limits for documents
 */
export async function GET() {
  return NextResponse.json({
    maxFileSize: MAX_DOCUMENT_SIZE,
    supportedFormats: SUPPORTED_DOCUMENT_FORMATS,
    maxDocumentsPerClaim: 10,
    supportedExtensions: ["pdf", "jpg", "jpeg", "png"],
  });
}
