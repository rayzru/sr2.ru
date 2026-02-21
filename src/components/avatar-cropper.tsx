"use client";

import { useCallback, useRef, useState } from "react";

import { Camera, Loader2, Trash2, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import ReactCrop, { centerCrop, type Crop, makeAspectCrop, type PixelCrop } from "react-image-crop";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Slider } from "~/components/ui/slider";
import { logger } from "~/lib/logger";
import { cn } from "~/lib/utils";

import "react-image-crop/dist/ReactCrop.css";

// ============================================================================
// Types
// ============================================================================

interface AvatarCropperProps {
  /** Current avatar URL */
  currentAvatar?: string | null;
  /** Fallback text for avatar (usually first letter of name) */
  fallback?: string;
  /** Called when avatar is successfully uploaded */
  onAvatarChange?: (url: string | null) => void;
  /** Avatar size class */
  size?: "sm" | "md" | "lg" | "xl";
  /** Ring color class */
  ringColor?: string;
  /** Badge color class for fallback */
  badgeColor?: string;
  /** Disabled state */
  disabled?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

async function getCroppedImage(
  image: HTMLImageElement,
  crop: PixelCrop,
  scale: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("No 2d context");
  }

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // Output size is always 400x400 (will be resized on server too)
  const outputSize = 400;
  canvas.width = outputSize;
  canvas.height = outputSize;

  ctx.imageSmoothingQuality = "high";

  const cropX = crop.x * scaleX;
  const cropY = crop.y * scaleY;
  const cropWidth = crop.width * scaleX;
  const cropHeight = crop.height * scaleY;

  // Calculate scaled dimensions
  const scaledWidth = cropWidth * scale;
  const scaledHeight = cropHeight * scale;

  // Center offset for zoom
  const offsetX = (scaledWidth - cropWidth) / 2;
  const offsetY = (scaledHeight - cropHeight) / 2;

  ctx.drawImage(
    image,
    cropX - offsetX / scaleX,
    cropY - offsetY / scaleY,
    cropWidth / scale,
    cropHeight / scale,
    0,
    0,
    outputSize,
    outputSize
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas is empty"));
        }
      },
      "image/webp",
      0.9
    );
  });
}

// ============================================================================
// Component
// ============================================================================

const sizeClasses = {
  sm: "h-16 w-16",
  md: "h-20 w-20",
  lg: "h-24 w-24",
  xl: "h-32 w-32",
};

export function AvatarCropper({
  currentAvatar,
  fallback = "?",
  onAvatarChange,
  size = "lg",
  ringColor = "ring-primary",
  badgeColor = "bg-primary",
  disabled = false,
}: AvatarCropperProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImageSrc(reader.result?.toString() ?? null);
        setScale(1);
        setIsOpen(true);
      });
      reader.readAsDataURL(e.target.files[0]!);
    }
    // Reset input
    e.target.value = "";
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }, []);

  const handleUpload = async () => {
    if (!imgRef.current || !completedCrop) return;

    setIsUploading(true);
    try {
      const blob = await getCroppedImage(imgRef.current, completedCrop, scale);
      const formData = new FormData();
      formData.append("file", blob, "avatar.webp");

      const response = await fetch("/api/avatar", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Upload failed");
      }

      onAvatarChange?.(result.url);
      setIsOpen(false);
      setImageSrc(null);
    } catch (error) {
      logger.error("Avatar upload error:", error);
      // Could show toast here
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch("/api/avatar", {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Delete failed");
      }

      onAvatarChange?.(null);
    } catch (error) {
      logger.error("Avatar delete error:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setImageSrc(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setScale(1);
  };

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onSelectFile}
        className="hidden"
        disabled={disabled}
      />

      {/* Avatar with upload button */}
      <div className="relative inline-block">
        <Avatar
          className={cn(
            sizeClasses[size],
            "ring-offset-background rounded-xl ring-[3px] ring-offset-2",
            ringColor
          )}
        >
          <AvatarImage
            src={currentAvatar ?? undefined}
            alt=""
            className="rounded-xl object-cover"
          />
          <AvatarFallback className={cn("rounded-xl text-3xl text-white", badgeColor)}>
            {fallback}
          </AvatarFallback>
        </Avatar>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute -bottom-1 -right-1 h-8 w-8 rounded-lg shadow-md"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || isUploading || isDeleting}
        >
          {isUploading || isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Crop Dialog */}
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Редактирование аватара</DialogTitle>
            <DialogDescription>
              Выберите область изображения для аватара. Результат будет квадратным.
            </DialogDescription>
          </DialogHeader>

          {imageSrc && (
            <div className="space-y-4">
              {/* Crop area */}
              <div className="bg-muted max-h-100 relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-lg">
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1}
                  circularCrop={false}
                  className="flex items-center justify-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imgRef}
                    alt="Crop"
                    src={imageSrc}
                    onLoad={onImageLoad}
                    className="max-h-100 max-w-full object-contain"
                    style={{
                      transform: `scale(${scale})`,
                      transformOrigin: "center center",
                    }}
                  />
                </ReactCrop>
              </div>

              {/* Zoom slider */}
              <div className="flex items-center gap-3">
                <ZoomOut className="text-muted-foreground h-4 w-4" />
                <Slider
                  value={[scale]}
                  onValueChange={(values) => setScale(values[0] ?? 1)}
                  min={1}
                  max={3}
                  step={0.1}
                  className="flex-1"
                />
                <ZoomIn className="text-muted-foreground h-4 w-4" />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {currentAvatar && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={isDeleting || isUploading}
                className="text-destructive hover:text-destructive sm:mr-auto"
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Удалить
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleClose}>
              <X className="mr-2 h-4 w-4" />
              Отмена
            </Button>
            <Button type="button" onClick={handleUpload} disabled={!completedCrop || isUploading}>
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
