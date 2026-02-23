import { useState, useEffect, useCallback, useRef } from "react";
import { coverArtApi } from "../../services/tauri";
import type { SgdbImageOption } from "../../services/tauri";
import { clearAllImageCache } from "./GameImage";
import { AppIcon } from "../common/AppIcon";
import { Button } from "../common/Button";
import { getErrorMessage } from "../../utils/errors";
import "./CoverArtPicker.css";

interface CoverArtPickerProps {
  gameId: string;
  imageType: "grid" | "hero" | "logo";
  onSelected: () => void;
  onClose: () => void;
}

const TITLES: Record<string, string> = {
  grid: "Choose Cover Art",
  hero: "Choose Hero Banner",
  logo: "Choose Icon Art",
};

export function CoverArtPicker({
  gameId,
  imageType,
  onSelected,
  onClose,
}: CoverArtPickerProps) {
  const [options, setOptions] = useState<SgdbImageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch options (re-runs when activeQuery changes)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOptions([]);

    coverArtApi
      .getCoverArtOptions(gameId, imageType, activeQuery)
      .then((results) => {
        if (!cancelled) {
          setOptions(results);
          if (results.length === 0) {
            setError("No images found on SteamGridDB");
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gameId, imageType, activeQuery]);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = searchInput.trim();
      setActiveQuery(trimmed || undefined);
    },
    [searchInput],
  );

  const handleSelect = useCallback(
    async (option: SgdbImageOption) => {
      setSelecting(option.id);
      try {
        await coverArtApi.setCoverArt(gameId, imageType, option.url);
        clearAllImageCache(gameId);
        onSelected();
      } catch {
        setError("Failed to save selection");
        setSelecting(null);
      }
    },
    [gameId, imageType, onSelected],
  );

  return (
    <div className="cover-art-picker" onClick={onClose}>
      <div className="cover-art-picker__panel" onClick={(e) => e.stopPropagation()}>
        <div className="cover-art-picker__header">
          <h4 className="cover-art-picker__title">{TITLES[imageType] ?? "Choose Art"}</h4>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>

        <form className="cover-art-picker__search" onSubmit={handleSearch}>
          <input
            ref={searchRef}
            type="text"
            className="cover-art-picker__search-input"
            placeholder="Search SteamGridDB..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button
            type="submit"
            className="cover-art-picker__search-btn"
            disabled={loading}
            aria-label="Search"
          >
            <AppIcon name="search" size={16} />
          </button>
        </form>

        {loading && (
          <div className="cover-art-picker__loading">
            <div className="cover-art-picker__skeleton" />
            <div className="cover-art-picker__skeleton" />
            <div className="cover-art-picker__skeleton" />
          </div>
        )}

        {error && !loading && <p className="cover-art-picker__error">{error}</p>}

        {!loading && options.length > 0 && (
          <div className="cover-art-picker__grid">
            {options.map((option) => (
              <button
                key={option.id}
                className={`cover-art-picker__option ${selecting === option.id ? "cover-art-picker__option--selecting" : ""}`}
                onClick={() => handleSelect(option)}
                disabled={selecting !== null}
              >
                <img
                  src={option.thumb}
                  alt={`Option ${option.id}`}
                  className="cover-art-picker__thumb"
                  loading="lazy"
                />
                {selecting === option.id && (
                  <div className="cover-art-picker__option-loading" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
