import { forwardRef, memo, useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { SpriteInfo } from "../../types";
import { spriteApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { SpriteRenderer } from "./SpriteRenderer";
import { AppIcon } from "../common/AppIcon";

interface AvatarSpriteLibraryProps {
  sprites: SpriteInfo[];
  currentSpriteFilename: string | null;
  avatarId: string;
  onSpriteAssigned: (filename: string) => void;
  onSpriteUploaded: (sprite: SpriteInfo) => void;
  onSpriteDeleted: (filename: string) => void;
  onSpriteRenamed?: (oldFilename: string, newInfo: SpriteInfo) => void;
  onGenerateClick: () => void;
}

export const AvatarSpriteLibrary = memo(
  forwardRef<HTMLDivElement, AvatarSpriteLibraryProps>(function AvatarSpriteLibrary(
    {
      sprites,
      currentSpriteFilename,
      avatarId,
      onSpriteAssigned,
      onSpriteUploaded,
      onSpriteDeleted,
      onSpriteRenamed,
      onGenerateClick,
    },
    ref,
  ) {
    // Cache of sprite data URLs keyed by filename
    const [spriteUrls, setSpriteUrls] = useState<Map<string, string>>(new Map());
    const [isUploading, setIsUploading] = useState(false);
    const [editingFilename, setEditingFilename] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [renameError, setRenameError] = useState("");
    const renameInputRef = useRef<HTMLInputElement>(null);

    // Load sprite thumbnails
    useEffect(() => {
      let canceled = false;
      const newUrls = new Map<string, string>();

      Promise.all(
        sprites.map(async (s) => {
          try {
            const dataUrl = await spriteApi.readSprite(s.filename);
            if (!canceled) {
              newUrls.set(s.filename, dataUrl);
            }
          } catch {
            // Skip sprites that fail to load
          }
        }),
      ).then(() => {
        if (!canceled) setSpriteUrls(new Map(newUrls));
      });

      return () => {
        canceled = true;
      };
    }, [sprites]);

    const handleSelectSprite = useCallback(
      async (filename: string) => {
        try {
          await spriteApi.setActiveSprite(avatarId, filename);
          onSpriteAssigned(filename);
        } catch (err) {
          logger.error("AvatarSpriteLibrary", "api", "Failed to assign sprite", {
            error: getErrorMessage(err),
          });
        }
      },
      [avatarId, onSpriteAssigned],
    );

    const handleUpload = useCallback(async () => {
      try {
        const path = await open({
          multiple: false,
          filters: [{ name: "PNG Image", extensions: ["png"] }],
        });
        if (!path) return;
        setIsUploading(true);
        const sprite = await spriteApi.importSpriteFromPath(path as string);
        onSpriteUploaded(sprite);
        logger.info("AvatarSpriteLibrary", "api", "Sprite uploaded", {
          filename: sprite.filename,
        });
      } catch (err) {
        logger.error("AvatarSpriteLibrary", "api", "Failed to upload sprite", {
          error: getErrorMessage(err),
        });
      } finally {
        setIsUploading(false);
      }
    }, [onSpriteUploaded]);

    const handleDelete = useCallback(
      async (filename: string) => {
        try {
          await spriteApi.deleteSprite(filename);
          onSpriteDeleted(filename);
        } catch (err) {
          logger.error("AvatarSpriteLibrary", "api", "Failed to delete sprite", {
            error: getErrorMessage(err),
          });
        }
      },
      [onSpriteDeleted],
    );

    const handleStartRename = useCallback((sprite: SpriteInfo) => {
      setEditingFilename(sprite.filename);
      setEditValue(sprite.displayName);
      setRenameError("");
      // Focus will be set by useEffect below
    }, []);

    // Auto-focus rename input when editing starts
    useEffect(() => {
      if (editingFilename && renameInputRef.current) {
        renameInputRef.current.focus();
        renameInputRef.current.select();
      }
    }, [editingFilename]);

    const handleConfirmRename = useCallback(
      async (oldFilename: string) => {
        const trimmed = editValue.trim();
        if (!trimmed) {
          setEditingFilename(null);
          return;
        }

        try {
          const newInfo = await spriteApi.renameSprite(oldFilename, trimmed);
          setEditingFilename(null);
          setRenameError("");

          // Update sprite URL cache with new key
          setSpriteUrls((prev) => {
            const next = new Map(prev);
            const url = next.get(oldFilename);
            if (url) {
              next.set(newInfo.filename, url);
              next.delete(oldFilename);
            }
            return next;
          });

          onSpriteRenamed?.(oldFilename, newInfo);
          logger.info("AvatarSpriteLibrary", "api", "Sprite renamed", {
            old: oldFilename,
            new: newInfo.filename,
          });
        } catch (err) {
          setRenameError(getErrorMessage(err));
        }
      },
      [editValue, onSpriteRenamed],
    );

    const handleCancelRename = useCallback(() => {
      setEditingFilename(null);
      setRenameError("");
    }, []);

    return (
      <div className="avatar-sprite-library" ref={ref}>
        <div className="avatar-sprite-library__header">
          <h4 className="avatar-sprite-library__title">Sprite Library</h4>
          <div className="avatar-sprite-library__header-actions">
            <button
              className="avatar-sprite-library__upload-btn"
              onClick={handleUpload}
              disabled={isUploading}
            >
              <AppIcon name="plus" size={14} />{" "}
              {isUploading ? "Uploading..." : "Upload Sprite"}
            </button>
            <button
              className="avatar-sprite-library__generate-btn"
              onClick={onGenerateClick}
            >
              <AppIcon name="sparkle" size={14} /> Generate
            </button>
          </div>
        </div>
        <div className="avatar-sprite-library__gallery">
          {sprites.length === 0 && (
            <p className="avatar-sprite-library__empty">
              No sprites yet. Upload a sprite sheet (PNG, min 256x128, 4x2 grid).
            </p>
          )}
          {sprites.map((sprite) => {
            const isCurrent = sprite.filename === currentSpriteFilename;
            const url = spriteUrls.get(sprite.filename) ?? null;
            const isPrebuilt = sprite.source === "prebuilt";

            return (
              <div
                key={sprite.filename}
                className={`avatar-sprite-library__card${isCurrent ? " avatar-sprite-library__card--current" : ""}`}
              >
                <button
                  className="avatar-sprite-library__card-btn"
                  onClick={() => handleSelectSprite(sprite.filename)}
                  title={`Assign "${sprite.displayName}" to avatar`}
                  aria-label={`Select sprite ${sprite.displayName}`}
                >
                  <SpriteRenderer
                    spriteDataUrl={url}
                    expression="neutral"
                    size={80}
                    fallbackText={sprite.displayName}
                  />
                </button>
                {editingFilename === sprite.filename ? (
                  <div className="avatar-sprite-library__rename-row">
                    <input
                      ref={renameInputRef}
                      className="avatar-sprite-library__rename-input"
                      type="text"
                      value={editValue}
                      onChange={(e) => {
                        setEditValue(e.target.value);
                        if (renameError) setRenameError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleConfirmRename(sprite.filename);
                        if (e.key === "Escape") handleCancelRename();
                      }}
                      onBlur={() => handleConfirmRename(sprite.filename)}
                      maxLength={60}
                    />
                    {renameError && (
                      <span className="avatar-sprite-library__rename-error">
                        {renameError}
                      </span>
                    )}
                  </div>
                ) : (
                  <span
                    className="avatar-sprite-library__card-name"
                    onDoubleClick={
                      !isPrebuilt ? () => handleStartRename(sprite) : undefined
                    }
                    title={!isPrebuilt ? "Double-click to rename" : undefined}
                  >
                    {sprite.displayName}
                  </span>
                )}
                {!isPrebuilt && editingFilename !== sprite.filename && (
                  <button
                    className="avatar-sprite-library__delete-btn"
                    onClick={() => handleDelete(sprite.filename)}
                    title={`Delete "${sprite.displayName}"`}
                    aria-label={`Delete sprite ${sprite.displayName}`}
                  >
                    <AppIcon name="close" size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }),
);
