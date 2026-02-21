import { randomUUID } from "crypto";
import sharp from "sharp";

import { logger } from "~/lib/logger";
import { deleteFromS3, extractS3Key, generateS3Key, uploadToS3 } from "~/lib/s3/client";

// ============================================================================
// Types
// ============================================================================

export interface ImageProcessingOptions {
  /** Skip resizing and watermark, keep original */
  keepOriginal?: boolean;
  /** Max width for resizing (default: 1920) */
  maxWidth?: number;
  /** Max height for resizing (default: 1080) */
  maxHeight?: number;
  /** JPEG/WebP quality 1-100 (default: 85) */
  quality?: number;
  /** Add watermark (default: true) */
  addWatermark?: boolean;
  /** Watermark text (default: "sr2.ru") */
  watermarkText?: string;
  /** Output format (default: keeps original or converts to webp) */
  outputFormat?: "jpeg" | "png" | "webp" | "original";
  /** Custom filename (without extension) */
  customFilename?: string;
  /** Upload type: determines folder structure */
  uploadType?: "news" | "knowledge" | "publication" | "listing" | "media";
  /** User ID for private uploads (required for publication, listing, media) */
  userId?: string;
}

export interface ProcessedImage {
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
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** MIME type */
  mimeType: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_WIDTH = 1920;
const DEFAULT_MAX_HEIGHT = 1080;
const DEFAULT_QUALITY = 85;
const DEFAULT_WATERMARK = "sr2.ru";

const SUPPORTED_FORMATS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================================
// Watermark SVG Generator
// ============================================================================

function createWatermarkSvg(text: string, width: number): Buffer {
  const fontSize = Math.max(14, Math.min(24, Math.floor(width / 50)));
  const padding = 10;
  const textWidth = text.length * fontSize * 0.6;
  const svgWidth = textWidth + padding * 2;
  const svgHeight = fontSize + padding * 2;

  const svg = `
    <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.5"/>
        </filter>
      </defs>
      <text
        x="${padding}"
        y="${fontSize + padding / 2}"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="rgba(255, 255, 255, 0.7)"
        filter="url(#shadow)"
      >${text}</text>
    </svg>
  `;

  return Buffer.from(svg);
}

// ============================================================================
// Main Processing Function
// ============================================================================

export async function processAndSaveImage(
  file: File | Buffer,
  originalFilename: string,
  options: ImageProcessingOptions = {}
): Promise<ProcessedImage> {
  const {
    keepOriginal = false,
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    quality = DEFAULT_QUALITY,
    addWatermark = true,
    watermarkText = DEFAULT_WATERMARK,
    outputFormat = "webp",
    customFilename,
    uploadType = "media",
    userId,
  } = options;

  // Convert File to Buffer if needed
  const buffer = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;

  // Generate unique ID
  const id = randomUUID();

  // Initialize sharp instance
  let image = sharp(buffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Invalid image: could not read dimensions");
  }

  let finalWidth = metadata.width;
  let finalHeight = metadata.height;

  // Process image (resize + watermark) unless keepOriginal
  if (!keepOriginal) {
    // Resize if needed
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      image = image.resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });

      // Calculate new dimensions
      const ratio = Math.min(maxWidth / metadata.width, maxHeight / metadata.height);
      finalWidth = Math.round(metadata.width * ratio);
      finalHeight = Math.round(metadata.height * ratio);
    }

    // Add watermark
    if (addWatermark && watermarkText) {
      const watermarkSvg = createWatermarkSvg(watermarkText, finalWidth);
      const watermarkImage = await sharp(watermarkSvg).toBuffer();

      // Get watermark dimensions
      const watermarkMeta = await sharp(watermarkImage).metadata();
      const watermarkWidth = watermarkMeta.width ?? 100;
      const watermarkHeight = watermarkMeta.height ?? 30;

      // Position in bottom-right corner with padding
      const padding = 15;
      const left = finalWidth - watermarkWidth - padding;
      const top = finalHeight - watermarkHeight - padding;

      image = image.composite([
        {
          input: watermarkImage,
          left: Math.max(0, left),
          top: Math.max(0, top),
        },
      ]);
    }
  }

  // Determine output format
  let extension: string;
  let mimeType: string;
  const originalExt = originalFilename.split(".").pop()?.toLowerCase() || "";

  if (outputFormat === "original" || keepOriginal) {
    extension = originalExt || "webp";
    mimeType = metadata.format ? `image/${metadata.format}` : "image/webp";
  } else {
    extension = outputFormat;
    mimeType = `image/${outputFormat}`;
  }

  // Apply format and quality
  switch (extension) {
    case "jpeg":
    case "jpg":
      image = image.jpeg({ quality, mozjpeg: true });
      extension = "jpg";
      mimeType = "image/jpeg";
      break;
    case "png":
      image = image.png({ quality: Math.round(quality / 10), compressionLevel: 9 });
      mimeType = "image/png";
      break;
    case "webp":
      image = image.webp({ quality });
      mimeType = "image/webp";
      break;
    case "gif":
      // GIF - just pass through
      mimeType = "image/gif";
      break;
    default:
      image = image.webp({ quality });
      extension = "webp";
      mimeType = "image/webp";
  }

  // Generate filename
  const filename = customFilename ? `${customFilename}.${extension}` : `${id}.${extension}`;

  // Process image to buffer
  const outputBuffer = await image.toBuffer();

  // Get final metadata
  const finalMeta = await sharp(outputBuffer).metadata();

  // Upload to S3 with proper folder structure
  const s3Key = generateS3Key(filename, {
    type: uploadType,
    userId,
  });
  const url = await uploadToS3(outputBuffer, s3Key, mimeType, {
    originalFilename,
    uploadId: id,
    uploadType,
  });

  return {
    id,
    filename,
    relativePath: s3Key, // S3 key
    url, // Full public URL
    originalFilename,
    size: outputBuffer.length,
    width: finalMeta.width ?? finalWidth,
    height: finalMeta.height ?? finalHeight,
    mimeType,
  };
}

// ============================================================================
// Validation
// ============================================================================

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!SUPPORTED_FORMATS.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported format: ${file.type}. Supported: JPEG, PNG, WebP, GIF`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Delete Image
// ============================================================================

export async function deleteImage(urlOrPath: string): Promise<boolean> {
  try {
    // Extract S3 key from URL
    const s3Key = extractS3Key(urlOrPath);
    if (!s3Key) {
      logger.error("Invalid S3 URL:", urlOrPath);
      return false;
    }

    return await deleteFromS3(s3Key);
  } catch (error) {
    logger.error("Failed to delete image:", error);
    return false;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const imageProcessor = {
  process: processAndSaveImage,
  validate: validateImageFile,
  delete: deleteImage,
  SUPPORTED_FORMATS,
  MAX_FILE_SIZE,
};
