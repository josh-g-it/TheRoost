import { useState, useCallback, useEffect } from "react";
import type { GameSource } from "../../types/game";
import { coverArtApi } from "../../services/tauri";
import { logger } from "../../utils/logger";
import "./GameImage.css";

interface GameImageProps {
  gameId: string;
  sourceId: string;
  source?: GameSource;
  name: string;
  type?: "header" | "capsule" | "hero" | "logo";
  className?: string;
}

// Module-level cache: when any GameImage instance successfully loads a URL
// for a given key, store it so other instances can reuse it.
const IMAGE_CACHE_MAX = 1000;
const imageCache = new Map<string, string>();

// Track game IDs where cover art lookup returned null (no image available)
// so we don't re-fetch on every render.
const noImageSet = new Set<string>();

function cacheKey(gameId: string, type: string): string {
  return `${gameId}:${type}`;
}

function setCachedImage(key: string, url: string) {
  // Evict oldest entries when over capacity (Map preserves insertion order)
  if (imageCache.size >= IMAGE_CACHE_MAX && !imageCache.has(key)) {
    const oldest = imageCache.keys().next().value!;
    imageCache.delete(oldest);
  }
  imageCache.set(key, url);
}

/** Clear cached image for a game+type so it will be re-fetched on next render. */
export function clearImageCache(gameId: string, type: string): void {
  const key = cacheKey(gameId, type);
  imageCache.delete(key);
  noImageSet.delete(key);
}

/** Clear all cached images for a game (all types). Used after art picker selection. */
export function clearAllImageCache(gameId: string): void {
  for (const type of ["header", "capsule", "hero", "logo"]) {
    const key = cacheKey(gameId, type);
    imageCache.delete(key);
    noImageSet.delete(key);
  }
}

// Fallback chains: try the preferred format first, then alternatives.
const FALLBACK_CHAINS: Record<string, ((sourceId: string) => string)[]> = {
  header: [
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/header.jpg`,
    (id) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`,
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/capsule_616x353.jpg`,
    (id) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/capsule_616x353.jpg`,
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_hero.jpg`,
    (id) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_hero.jpg`,
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_600x900.jpg`,
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/capsule_231x87.jpg`,
  ],
  capsule: [
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_600x900.jpg`,
    (id) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/header.jpg`,
    (id) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`,
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/capsule_616x353.jpg`,
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_hero.jpg`,
  ],
  hero: [
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_hero.jpg`,
    (id) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_hero.jpg`,
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/header.jpg`,
    (id) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`,
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/capsule_616x353.jpg`,
    (id) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/capsule_616x353.jpg`,
    (id) => `https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_600x900.jpg`,
  ],
  logo: [],
};

/** Map GameImage type to SteamGridDB image type */
function mapImageType(type: string): string {
  if (type === "hero") return "hero";
  if (type === "logo") return "logo";
  return "grid";
}

function Placeholder({ name, className }: { name: string; className: string }) {
  return (
    <div className={`game-image game-image--placeholder ${className}`}>
      <span className="game-image__fallback-text">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

/** Steam games: use CDN fallback chains (existing behavior) */
function SteamImage({
  sourceId,
  name,
  type,
  className,
  cacheKeyStr,
}: {
  sourceId: string;
  name: string;
  type: string;
  className: string;
  cacheKeyStr: string;
}) {
  const cached = imageCache.get(cacheKeyStr);
  const [loaded, setLoaded] = useState(!!cached);
  const [fallbackIndex, setFallbackIndex] = useState(cached ? -1 : 0);
  const [exhausted, setExhausted] = useState(false);

  const chain = FALLBACK_CHAINS[type];

  const url =
    fallbackIndex === -1 && cached
      ? cached
      : fallbackIndex >= 0 && fallbackIndex < chain.length
        ? chain[fallbackIndex](sourceId)
        : null;

  const handleLoad = useCallback(() => {
    setLoaded(true);
    if (url) {
      setCachedImage(cacheKeyStr, url);
    }
  }, [cacheKeyStr, url]);

  const handleError = useCallback(() => {
    if (fallbackIndex === -1) {
      setFallbackIndex(0);
      setLoaded(false);
    } else {
      const nextIndex = fallbackIndex + 1;
      if (nextIndex < chain.length) {
        setFallbackIndex(nextIndex);
        setLoaded(false);
      } else {
        setExhausted(true);
      }
    }
  }, [fallbackIndex, chain]);

  if (exhausted || !url) {
    return <Placeholder name={name} className={className} />;
  }

  return (
    <div className={`game-image ${className}`}>
      {!loaded && <div className="game-image__skeleton" />}
      <img
        src={url}
        alt={name}
        className={`game-image__img ${loaded ? "game-image__img--loaded" : ""}`}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}

/** Direct image display for backend-resolved URLs (custom art, SteamGridDB cached, etc.) */
function DirectImage({
  url,
  name,
  className,
  cacheKeyStr,
}: {
  url: string;
  name: string;
  className: string;
  cacheKeyStr: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    setCachedImage(cacheKeyStr, url);
  }, [cacheKeyStr, url]);

  if (failed) {
    return <Placeholder name={name} className={className} />;
  }

  return (
    <div className={`game-image ${className}`}>
      {!loaded && <div className="game-image__skeleton" />}
      <img
        src={url}
        alt={name}
        className={`game-image__img ${loaded ? "game-image__img--loaded" : ""}`}
        loading="lazy"
        onLoad={handleLoad}
        onError={() => {
          logger.warn("GameImage", "library", `DirectImage failed to load: ${url}`);
          setFailed(true);
        }}
      />
    </div>
  );
}

/**
 * Unified game image component.
 * ALL games check the backend first for custom/cached art.
 * Steam games fall back to CDN chains if no custom art is set.
 * Non-Steam games show a placeholder if no art is found.
 */
export function GameImage({
  gameId,
  sourceId,
  source,
  name,
  type = "header",
  className = "",
}: GameImageProps) {
  const isSteam = !source || source === "steam";
  const key = cacheKey(gameId, type);
  const cached = imageCache.get(key);

  const [backendUrl, setBackendUrl] = useState<string | null>(cached ?? null);
  const [checked, setChecked] = useState(!!cached || noImageSet.has(key));

  useEffect(() => {
    if (cached || noImageSet.has(key)) return;

    let cancelled = false;
    coverArtApi
      .getCoverArtUrl(gameId, mapImageType(type))
      .then(async (url) => {
        if (cancelled) return;
        if (url) {
          let resolved: string;
          if (url.startsWith("local:")) {
            // Load local art as data URL via backend (avoids asset protocol issues)
            resolved = await coverArtApi.readImageBase64(url.slice(6));
          } else {
            resolved = url;
          }
          if (cancelled) return;
          setBackendUrl(resolved);
          setCachedImage(key, resolved);
        } else {
          noImageSet.add(key);
        }
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) {
          noImageSet.add(key);
          setChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [gameId, type, key, cached]);

  // Backend returned a URL (custom art or cached remote art) — use it
  if (backendUrl) {
    return (
      <DirectImage url={backendUrl} name={name} className={className} cacheKeyStr={key} />
    );
  }

  // Still checking — show skeleton
  if (!checked) {
    return (
      <div className={`game-image ${className}`}>
        <div className="game-image__skeleton" />
      </div>
    );
  }

  // Steam games with no custom art: fall back to CDN chains
  if (isSteam) {
    return (
      <SteamImage
        sourceId={sourceId}
        name={name}
        type={type}
        className={className}
        cacheKeyStr={key}
      />
    );
  }

  // Non-Steam games with no art: placeholder
  return <Placeholder name={name} className={className} />;
}
