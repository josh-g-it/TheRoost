import { useCallback, useRef, useState } from "react";
import { assistantApi } from "../services/tauri";
import type { PreparedImage } from "../types";
import { logger } from "../utils/logger";
import { getErrorMessage } from "../utils/errors";

const MAX_IMAGES = 5;

export function useImageAttachment() {
  const [pendingImages, setPendingImages] = useState<PreparedImage[]>([]);
  const [preparingCount, setPreparingCount] = useState(0);
  // Ref mirrors preparingCount for synchronous checks in send handlers,
  // avoiding the React re-render lag that causes the race condition.
  const preparingRef = useRef(0);

  /** Open file picker and prepare selected images. */
  const attachImage = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
        ],
      });
      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      preparingRef.current += paths.length;
      setPreparingCount((c) => c + paths.length);
      for (const path of paths) {
        const filePath = typeof path === "string" ? path : path.path;
        try {
          const prepared = await assistantApi.prepareChatImage(filePath);
          setPendingImages((prev) => {
            if (prev.length >= MAX_IMAGES) return prev;
            return [...prev, prepared];
          });
        } catch (err) {
          logger.warn("useImageAttachment", "ai", "Failed to prepare image", {
            path: filePath,
            error: getErrorMessage(err),
          });
        } finally {
          preparingRef.current = Math.max(0, preparingRef.current - 1);
          setPreparingCount((c) => Math.max(0, c - 1));
        }
      }
    } catch (err) {
      logger.warn("useImageAttachment", "ai", "File picker failed", {
        error: getErrorMessage(err),
      });
    }
  }, []);

  /** Prepare an image from a pasted File (clipboard). */
  const pasteImage = useCallback(async (file: File) => {
    preparingRef.current += 1;
    setPreparingCount((c) => c + 1);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      // Convert to base64
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const prepared = await assistantApi.prepareChatImage(undefined, base64);
      setPendingImages((prev) => {
        if (prev.length >= MAX_IMAGES) return prev;
        return [...prev, prepared];
      });
    } catch (err) {
      logger.warn("useImageAttachment", "ai", "Failed to prepare pasted image", {
        error: getErrorMessage(err),
      });
    } finally {
      preparingRef.current = Math.max(0, preparingRef.current - 1);
      setPreparingCount((c) => Math.max(0, c - 1));
    }
  }, []);

  /** Remove an image by index. */
  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** Return all pending images and clear the state. Called on send. */
  const consumeImages = useCallback((): PreparedImage[] => {
    let consumed: PreparedImage[] = [];
    setPendingImages((prev) => {
      consumed = prev;
      return [];
    });
    return consumed;
  }, []);

  return {
    pendingImages,
    isPreparing: preparingCount > 0,
    preparingCount,
    /** Ref for synchronous preparing checks — avoids React re-render lag. */
    isPreparingRef: preparingRef,
    attachImage,
    pasteImage,
    removeImage,
    consumeImages,
    isFull: pendingImages.length >= MAX_IMAGES,
  };
}
