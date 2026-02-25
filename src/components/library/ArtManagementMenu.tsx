import { useState, useEffect, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { open } from "@tauri-apps/plugin-dialog";
import { coverArtApi } from "../../services/tauri";
import type { SgdbImageOption, CropArea, GameArtInfo } from "../../services/tauri";
import { clearAllImageCache, GameImage } from "./GameImage";
import { AppIcon } from "../common/AppIcon";
import { Button } from "../common/Button";
import { useUIStore } from "../../store/uiSlice";
import type { ArtPickerType } from "../../store/uiSlice";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import "./ArtManagementMenu.css";

interface ArtTypeConfig {
  type: ArtPickerType;
  label: string;
  dimensions: string;
  aspect: number;
}

const ART_TYPES: ArtTypeConfig[] = [
  { type: "grid", label: "Cover Art", dimensions: "920 x 430", aspect: 460 / 215 },
  { type: "hero", label: "Hero Banner", dimensions: "1920 x 620", aspect: 1920 / 620 },
  { type: "logo", label: "Icon / Logo", dimensions: "256 x 256", aspect: 1 },
];

interface Props {
  gameId: string;
  gameName: string;
  gameSource?: string;
  gameSourceId: string;
  onClose: () => void;
}

export function ArtManagementMenu({
  gameId,
  gameName,
  gameSource,
  gameSourceId,
  onClose,
}: Props) {
  const step = useUIStore((s) => s.artMenuStep);
  const imageType = useUIStore((s) => s.artMenuImageType);
  const cropSource = useUIStore((s) => s.artMenuCropSource);
  const setStep = useUIStore((s) => s.setArtMenuStep);
  const closeMenu = useUIStore((s) => s.closeArtMenu);
  const bumpArtVersion = useUIStore((s) => s.bumpArtVersion);

  const handleClose = useCallback(() => {
    closeMenu();
    onClose();
  }, [closeMenu, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (step === "crop" || step === "picker") {
          setStep("overview");
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, setStep, handleClose]);

  return (
    <div className="art-menu" onClick={handleClose}>
      <div className="art-menu__panel" onClick={(e) => e.stopPropagation()}>
        {step === "overview" && (
          <ArtOverview
            gameId={gameId}
            gameName={gameName}
            gameSource={gameSource}
            gameSourceId={gameSourceId}
            onSelectType={(t) => setStep("picker", t)}
            onArtChanged={() => {
              clearAllImageCache(gameId);
              bumpArtVersion(gameId);
            }}
            onClose={handleClose}
          />
        )}
        {step === "picker" && imageType && (
          <ArtPicker
            gameId={gameId}
            imageType={imageType}
            onSelectImage={(url) => setStep("crop", undefined, url)}
            onUpload={(filePath) => setStep("crop", undefined, filePath)}
            onBack={() => setStep("overview")}
          />
        )}
        {step === "crop" && imageType && cropSource && (
          <ArtCropper
            gameId={gameId}
            imageType={imageType}
            source={cropSource}
            onComplete={() => {
              clearAllImageCache(gameId);
              bumpArtVersion(gameId);
              setStep("overview");
            }}
            onBack={() => setStep("picker")}
          />
        )}
      </div>
    </div>
  );
}

// ── Step 1: Overview ──────────────────────────────────────────────

function ArtOverview({
  gameId,
  gameName,
  gameSource,
  gameSourceId,
  onSelectType,
  onArtChanged,
  onClose,
}: {
  gameId: string;
  gameName: string;
  gameSource?: string;
  gameSourceId: string;
  onSelectType: (type: ArtPickerType) => void;
  onArtChanged: () => void;
  onClose: () => void;
}) {
  const [artInfo, setArtInfo] = useState<GameArtInfo[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadArtInfo = useCallback(() => {
    coverArtApi
      .getGameArtInfo(gameId)
      .then(setArtInfo)
      .catch(() => {});
  }, [gameId]);

  useEffect(() => {
    loadArtInfo();
  }, [loadArtInfo]);

  const handleRemove = useCallback(
    async (artType: string) => {
      setRemoving(artType);
      try {
        await coverArtApi.removeCustomArt(gameId, artType);
        onArtChanged();
        loadArtInfo();
      } catch (e) {
        logger.error("ArtManagementMenu", "library", "Failed to remove custom art", {
          error: getErrorMessage(e),
        });
      } finally {
        setRemoving(null);
      }
    },
    [gameId, onArtChanged, loadArtInfo],
  );

  const getInfoForType = (artType: string): GameArtInfo | undefined =>
    artInfo.find((a) => a.imageType === artType);

  return (
    <>
      <div className="art-menu__header">
        <h4 className="art-menu__title">Manage Art — {gameName}</h4>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="art-menu__grid">
        {ART_TYPES.map((cfg) => {
          const info = getInfoForType(cfg.type);
          const hasCustom = info?.userSelected ?? false;
          const imageTypeMap: Record<string, "capsule" | "hero" | "logo"> = {
            grid: "capsule",
            hero: "hero",
            logo: "logo",
          };
          return (
            <div key={cfg.type} className="art-menu__card">
              <div
                className={`art-menu__card-preview art-menu__card-preview--${cfg.type}`}
              >
                <GameImage
                  gameId={gameId}
                  sourceId={gameSourceId}
                  source={gameSource as import("../../types/game").GameSource | undefined}
                  name={gameName}
                  type={imageTypeMap[cfg.type]}
                />
              </div>
              <div className="art-menu__card-info">
                <span className="art-menu__card-label">{cfg.label}</span>
                <span className="art-menu__card-dims">
                  Recommended: {cfg.dimensions}px
                </span>
                {hasCustom && (
                  <span className="art-menu__card-source">
                    {info?.localPath ? "Custom upload" : "Custom selection"}
                  </span>
                )}
              </div>
              <div className="art-menu__card-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSelectType(cfg.type)}
                >
                  Change
                </Button>
                {hasCustom && (
                  <Button
                    variant="danger"
                    size="sm"
                    loading={removing === cfg.type}
                    onClick={() => handleRemove(cfg.type)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Step 2: Picker ────────────────────────────────────────────────

function ArtPicker({
  gameId,
  imageType,
  onSelectImage,
  onUpload,
  onBack,
}: {
  gameId: string;
  imageType: ArtPickerType;
  onSelectImage: (url: string) => void;
  onUpload: (filePath: string) => void;
  onBack: () => void;
}) {
  const [options, setOptions] = useState<SgdbImageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const artConfig = ART_TYPES.find((c) => c.type === imageType)!;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOptions([]);
    setPage(0);
    setHasMore(true);

    coverArtApi
      .getCoverArtOptions(gameId, imageType, activeQuery, 0)
      .then((result) => {
        if (cancelled) return;
        setOptions(result);
        setHasMore(result.length >= 20);
        if (result.length === 0) {
          setError("No images found on SteamGridDB. Try a different search term.");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = getErrorMessage(e);
        if (msg.includes("not configured")) {
          setError(
            "SteamGridDB API key not configured. You can still upload a custom image.",
          );
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gameId, imageType, activeQuery]);

  const handleLoadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const result = await coverArtApi.getCoverArtOptions(
        gameId,
        imageType,
        activeQuery,
        nextPage,
      );
      setOptions((prev) => [...prev, ...result]);
      setPage(nextPage);
      setHasMore(result.length >= 20);
    } catch {
      // Silently stop pagination on error
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    setActiveQuery(trimmed || undefined);
  };

  const handleUploadClick = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (selected) {
        onUpload(selected as string);
      }
    } catch (e) {
      logger.error("ArtManagementMenu", "library", "File picker error", {
        error: getErrorMessage(e),
      });
    }
  };

  return (
    <>
      <div className="art-menu__header">
        <button className="art-menu__back" onClick={onBack}>
          <AppIcon name="chevron-left" size={14} /> Back
        </button>
        <h4 className="art-menu__title">Choose {artConfig.label}</h4>
      </div>
      <p className="art-menu__picker-hint">
        Recommended: {artConfig.dimensions}px. Select an image below or upload your own.
      </p>
      <div className="art-menu__picker-actions">
        <form className="art-menu__search" onSubmit={handleSearch}>
          <input
            className="art-menu__search-input"
            type="text"
            placeholder="Search SteamGridDB..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button variant="secondary" size="sm" type="submit" disabled={loading}>
            <AppIcon name="search" size={14} />
          </Button>
        </form>
        <Button variant="primary" size="sm" onClick={handleUploadClick}>
          <AppIcon name="plus" size={14} /> Upload
        </Button>
      </div>

      {loading && (
        <div className="art-menu__loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="art-menu__skeleton" />
          ))}
        </div>
      )}
      {error && <p className="art-menu__error">{error}</p>}
      {!loading && options.length > 0 && (
        <div className="art-menu__options-grid">
          {options.map((opt) => (
            <button
              key={opt.id}
              className="art-menu__option"
              onClick={() => onSelectImage(opt.url)}
              title={`${opt.width}x${opt.height}`}
            >
              <img
                src={opt.thumb}
                alt="Cover option"
                className="art-menu__option-thumb"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
      {!loading && hasMore && options.length > 0 && (
        <div className="art-menu__load-more">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
            loading={loadingMore}
          >
            Load More
          </Button>
        </div>
      )}
    </>
  );
}

// ── Step 3: Crop ──────────────────────────────────────────────────

function ArtCropper({
  gameId,
  imageType,
  source,
  onComplete,
  onBack,
}: {
  gameId: string;
  imageType: ArtPickerType;
  source: string;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const croppedRef = useRef<Area | null>(null);

  const artConfig = ART_TYPES.find((c) => c.type === imageType)!;
  const [imageSrc, setImageSrc] = useState<string | null>(
    source.startsWith("http") ? source : null,
  );

  // Load image for the cropper — remote URLs directly, local files via data URL
  useEffect(() => {
    setImageReady(false);
    setError(null);

    if (source.startsWith("http")) {
      // Remote URL — pre-load directly
      setImageSrc(source);
      const img = new window.Image();
      img.onload = () => setImageReady(true);
      img.onerror = () =>
        setError("Failed to load image for cropping. Try selecting it again.");
      img.src = source;
    } else {
      // Local file — read as data URL via backend (bypasses asset protocol issues)
      coverArtApi
        .readImageBase64(source)
        .then((dataUrl) => {
          setImageSrc(dataUrl);
          setImageReady(true);
        })
        .catch(() => {
          setError("Failed to read local image file.");
        });
    }
  }, [source]);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
    croppedRef.current = croppedPixels;
  }, []);

  const handleSave = async () => {
    const pixels = croppedRef.current ?? croppedAreaPixels;
    if (!pixels) return;

    setSaving(true);
    setError(null);

    const cropArea: CropArea = {
      x: Math.round(pixels.x),
      y: Math.round(pixels.y),
      width: Math.round(pixels.width),
      height: Math.round(pixels.height),
    };

    try {
      if (source.startsWith("http")) {
        await coverArtApi.cropRemoteArt(gameId, imageType, source, cropArea);
      } else {
        await coverArtApi.uploadCustomArt(gameId, imageType, source, cropArea);
      }
      onComplete();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="art-menu__header">
        <button className="art-menu__back" onClick={onBack}>
          <AppIcon name="chevron-left" size={14} /> Back
        </button>
        <h4 className="art-menu__title">Crop {artConfig.label}</h4>
      </div>
      <p className="art-menu__picker-hint">
        Recommended: {artConfig.dimensions}px. Pan and zoom to position the image.
      </p>
      <div className="art-menu__cropper-container">
        {imageReady && imageSrc ? (
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={artConfig.aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        ) : !error ? (
          <div className="art-menu__loading">
            <div className="art-menu__skeleton" />
          </div>
        ) : null}
      </div>
      <div className="art-menu__zoom">
        <span className="art-menu__zoom-label">Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </div>
      {error && <p className="art-menu__error">{error}</p>}
      <div className="art-menu__actions">
        <Button variant="ghost" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={saving}>
          Save
        </Button>
      </div>
    </>
  );
}
