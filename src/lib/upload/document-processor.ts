import { randomUUID } from "crypto";
import sharp from "sharp";

import { logger } from "~/lib/logger";
import { deleteFromS3, extractS3Key, generateS3Key, uploadToS3 } from "~/lib/s3/client";

import {
  MAX_DOCUMENT_SIZE,
  MAX_DOCUMENTS_PER_CLAIM,
  SUPPORTED_DOCUMENT_FORMATS,
} from "./document-constants";

// Re-export constants for server-side usage
export { MAX_DOCUMENT_SIZE, MAX_DOCUMENTS_PER_CLAIM, SUPPORTED_DOCUMENT_FORMATS };

// ============================================================================
// Types
// ============================================================================

export interface ProcessedDocument {
  /** Generated unique ID */
  id: string;
  /** Filename with extension */
  filename: string;
  /** S3 key (path in bucket) */
  relativePath: string;
  /** Full public URL */
  url: string;
  /** Original filename */
  originalFilename: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Thumbnail URL (for images only) */
  thumbnailUrl?: string;
}

export interface DocumentProcessingOptions {
  /** Custom filename (without extension) */
  customFilename?: string;
  /** Generate thumbnail for images (default: true) */
  generateThumbnail?: boolean;
  /** Thumbnail size (default: 200) */
  thumbnailSize?: number;
  /** Upload type: determines folder structure */
  uploadType?: "news" | "knowledge" | "publication" | "listing" | "media";
  /** User ID for private uploads (required for publication, listing, media) */
  userId?: string;
}

// ============================================================================
// Constants
// ============================================================================

const THUMBNAIL_SIZE = 200;

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// ============================================================================
// Main Processing Function
// ============================================================================

export async function processAndSaveDocument(
  file: File | Buffer,
  originalFilename: string,
  mimeType: string,
  options: DocumentProcessingOptions = {}
): Promise<ProcessedDocument> {
  const {
    customFilename,
    generateThumbnail = true,
    thumbnailSize = THUMBNAIL_SIZE,
    uploadType = "media",
    userId,
  } = options;

  // Convert File to Buffer if needed
  const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;

  // Generate unique ID
  const id = randomUUID();

  // Determine extension from MIME type
  const extension = MIME_TO_EXT[mimeType] ?? "bin";

  // Generate filename
  const filename = customFilename ? `${customFilename}.${extension}` : `${id}.${extension}`;

  // Upload document to S3 with proper folder structure
  const s3Key = generateS3Key(filename, {
    type: uploadType,
    userId,
  });
  const url = await uploadToS3(buffer, s3Key, mimeType, {
    originalFilename,
    uploadId: id,
    uploadType,
  });

  // Generate thumbnail for images
  let thumbnailUrl: string | undefined;

  if (generateThumbnail && mimeType.startsWith("image/")) {
    try {
      const thumbnailFilename = `${id}_thumb.webp`;
      const thumbnailBuffer = await sharp(buffer)
        .resize(thumbnailSize, thumbnailSize, {
          fit: "cover",
          position: "center",
        })
        .webp({ quality: 80 })
        .toBuffer();

      // Upload thumbnail to S3
      const thumbnailKey = generateS3Key(thumbnailFilename, {
        type: uploadType,
        userId,
      });
      thumbnailUrl = await uploadToS3(thumbnailBuffer, thumbnailKey, "image/webp", {
        originalFilename,
        uploadId: id,
        isThumbnail: "true",
        uploadType,
      });
    } catch (error) {
      logger.error("Failed to generate thumbnail:", error);
      // Continue without thumbnail
    }
  }

  return {
    id,
    filename,
    relativePath: s3Key, // S3 key
    url, // Full public URL
    originalFilename,
    size: buffer.length,
    mimeType,
    thumbnailUrl,
  };
}

// ============================================================================
// Validation
// ============================================================================

export function validateDocumentFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!SUPPORTED_DOCUMENT_FORMATS.includes(file.type)) {
    return {
      valid: false,
      error: `Неподдерживаемый формат: ${file.type}. Поддерживаются: PDF, JPEG, PNG`,
    };
  }

  if (file.size > MAX_DOCUMENT_SIZE) {
    return {
      valid: false,
      error: `Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(2)}MB. Максимум: ${MAX_DOCUMENT_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Delete Document
// ============================================================================

export async function deleteDocument(urlOrPath: string): Promise<boolean> {
  try {
    // Extract S3 key from URL
    const s3Key = extractS3Key(urlOrPath);
    if (!s3Key) {
      logger.error("Invalid S3 URL:", urlOrPath);
      return false;
    }

    // Delete main document
    const deleted = await deleteFromS3(s3Key);

    // Try to delete thumbnail if exists
    const thumbnailKey = s3Key.replace(/\.[^.]+$/, "_thumb.webp");
    try {
      await deleteFromS3(thumbnailKey);
    } catch {
      // Thumbnail might not exist, ignore error
    }

    return deleted;
  } catch (error) {
    logger.error("Failed to delete document:", error);
    return false;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const documentProcessor = {
  process: processAndSaveDocument,
  validate: validateDocumentFile,
  delete: deleteDocument,
  SUPPORTED_FORMATS: SUPPORTED_DOCUMENT_FORMATS,
  MAX_FILE_SIZE: MAX_DOCUMENT_SIZE,
  MAX_DOCUMENTS: MAX_DOCUMENTS_PER_CLAIM,
};
