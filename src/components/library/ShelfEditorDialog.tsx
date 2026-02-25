import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { AppIcon } from "../common/AppIcon";
import { useShelvesStore } from "../../store/shelvesSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useMetadataStore } from "../../store/metadataSlice";
import {
  extractAllGenres,
  extractAllSteamTags,
  extractAllCategories,
  extractAllSources,
} from "../../utils/filtering";
import { useLibraryStore } from "../../store/librarySlice";
import { GAME_SOURCE_LABELS } from "../../types/game";
import type { GameSource } from "../../types/game";
import { DEFAULT_SHELF_FILTERS, SHELF_PRESET_CONFIGS } from "../../types/shelf";
import type {
  ShelfConfig,
  ShelfPreset,
  ShelfDisplayMode,
  ShelfFilters,
} from "../../types/shelf";
import type { SortBy, SortOrder } from "../../types";
import { logger } from "../../utils/logger";
import "./ShelfEditorDialog.css";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "playtime", label: "Playtime" },
  { value: "lastPlayed", label: "Last Played" },
  { value: "recentlyAdded", label: "Recently Added" },
  { value: "size", label: "Size" },
  { value: "metacritic", label: "Metacritic" },
  { value: "source", label: "Launcher" },
];

const DISPLAY_MODES: {
  value: ShelfDisplayMode;
  label: string;
  iconName: import("../../utils/icons").IconName;
}[] = [
  { value: "collapsed", label: "Collapsed (1 row)", iconName: "shelf-collapsed" },
  { value: "extended", label: "Extended (2 rows)", iconName: "shelf-extended" },
  { value: "expanded", label: "Expanded (all)", iconName: "shelf-expanded" },
];

const PRESETS: { value: ShelfPreset; label: string }[] = [
  { value: "all", label: "All Games" },
  { value: "recently-played", label: "Recently Played" },
  { value: "favorites", label: "Favorites" },
  { value: "installed", label: "Installed" },
  { value: "custom", label: "Custom" },
];

const MAX_GAMES_OPTIONS: { value: number | null; label: string }[] = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: null, label: "Unlimited" },
];

/* ── Collapsible chip section ───────────────────────────────── */

interface ChipSectionProps {
  label: string;
  selectedCount: number;
  defaultOpen?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  children: React.ReactNode;
}

function ChipSection({
  label,
  selectedCount,
  defaultOpen = false,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  children,
}: ChipSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="shelf-editor__chip-section">
      <button
        type="button"
        className="shelf-editor__chip-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="shelf-editor__chip-header-label">{label}</span>
        {selectedCount > 0 && (
          <span className="shelf-editor__chip-header-count">{selectedCount}</span>
        )}
        <span
          className={`shelf-editor__chip-header-arrow${open ? " shelf-editor__chip-header-arrow--open" : ""}`}
        >
          <AppIcon name="sort-desc" size={12} />
        </span>
      </button>
      {open && (
        <div className="shelf-editor__chip-body">
          {onSearchChange && (
            <input
              className="shelf-editor__chip-search"
              type="text"
              placeholder={searchPlaceholder ?? "Search..."}
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          )}
          <div className="shelf-editor__chips">{children}</div>
        </div>
      )}
    </div>
  );
}

/* ── Main dialog ────────────────────────────────────────────── */

interface ShelfEditorDialogProps {
  editingShelfId: string;
  onClose: () => void;
  onSave: (shelf: ShelfConfig) => void;
}

export function ShelfEditorDialog({
  editingShelfId,
  onClose,
  onSave,
}: ShelfEditorDialogProps) {
  const existingShelf = useShelvesStore((s) =>
    s.shelves.find((sh) => sh.id === editingShelfId),
  );
  const isNew = editingShelfId === "__new__";

  const tags = useTagsStore((s) => s.tags);
  const cache = useMetadataStore((s) => s.cache);
  const allGenres = useMemo(() => extractAllGenres(cache), [cache]);
  const allSteamTags = useMemo(() => extractAllSteamTags(cache), [cache]);
  const allCategories = useMemo(() => extractAllCategories(cache), [cache]);
  const library = useLibraryStore((s) => s.library);
  const allSources = useMemo(() => extractAllSources(library?.games ?? []), [library]);

  // Search state for filterable sections
  const [genreSearch, setGenreSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [featureSearch, setFeatureSearch] = useState("");

  // Form state
  const [preset, setPreset] = useState<ShelfPreset>(existingShelf?.preset ?? "all");
  const [name, setName] = useState(existingShelf?.name ?? "All Games");
  const [sortBy, setSortBy] = useState<SortBy>(existingShelf?.sortBy ?? "name");
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    existingShelf?.sortOrder ?? "asc",
  );
  const [displayMode, setDisplayMode] = useState<ShelfDisplayMode>(
    existingShelf?.displayMode ?? "expanded",
  );
  const [groupByGenre, setGroupByGenre] = useState(existingShelf?.groupByGenre ?? false);
  const [maxVisibleGames, setMaxVisibleGames] = useState<number | null>(
    existingShelf?.maxVisibleGames ?? null,
  );
  const [pinnedGameIds, setPinnedGameIds] = useState<string[]>(() => {
    const ids = existingShelf?.pinnedGameIds ?? [];
    const knownIds = new Set(library?.games.map((g) => g.gameId) ?? []);
    return ids.filter((id) => knownIds.has(id));
  });

  const gameNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of library?.games ?? []) map.set(g.gameId, g.name);
    return map;
  }, [library]);

  const [filters, setFilters] = useState<ShelfFilters>(() => {
    const raw: Partial<ShelfFilters> = existingShelf?.filters ?? {};
    return {
      ...DEFAULT_SHELF_FILTERS,
      ...raw,
      filterByTagIds: (raw.filterByTagIds ?? []).map(Number),
      filterByCategoryIds: (raw.filterByCategoryIds ?? []).map(Number),
      filterBySource: raw.filterBySource ?? [],
    };
  });

  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const firstInput = el.querySelector<HTMLElement>("input, button, select");
    firstInput?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handlePresetChange = useCallback((newPreset: ShelfPreset) => {
    setPreset(newPreset);
    if (newPreset !== "custom") {
      const config = SHELF_PRESET_CONFIGS[newPreset];
      setName(config.name);
      setSortBy(config.sortBy);
      setSortOrder(config.sortOrder);
      setFilters({ ...DEFAULT_SHELF_FILTERS, ...config.filters });
      setMaxVisibleGames(config.maxVisibleGames);
    }
  }, []);

  const handleTagToggle = useCallback((tagId: number) => {
    setFilters((prev) => {
      const has = prev.filterByTagIds.includes(tagId);
      return {
        ...prev,
        filterByTagIds: has
          ? prev.filterByTagIds.filter((id) => id !== tagId)
          : [...prev.filterByTagIds, tagId],
      };
    });
  }, []);

  const handleGenreToggle = useCallback((genreId: string) => {
    setFilters((prev) => {
      const has = prev.filterByGenreIds.includes(genreId);
      return {
        ...prev,
        filterByGenreIds: has
          ? prev.filterByGenreIds.filter((id) => id !== genreId)
          : [...prev.filterByGenreIds, genreId],
      };
    });
  }, []);

  const handleSteamTagToggle = useCallback((tagName: string) => {
    setFilters((prev) => {
      const has = prev.filterBySteamTagNames.includes(tagName);
      return {
        ...prev,
        filterBySteamTagNames: has
          ? prev.filterBySteamTagNames.filter((n) => n !== tagName)
          : [...prev.filterBySteamTagNames, tagName],
      };
    });
  }, []);

  const handleCategoryToggle = useCallback((catId: number) => {
    setFilters((prev) => {
      const has = prev.filterByCategoryIds.includes(catId);
      return {
        ...prev,
        filterByCategoryIds: has
          ? prev.filterByCategoryIds.filter((id) => id !== catId)
          : [...prev.filterByCategoryIds, catId],
      };
    });
  }, []);

  const handleSourceToggle = useCallback((source: GameSource) => {
    setFilters((prev) => {
      const current = prev.filterBySource ?? [];
      const has = current.includes(source);
      return {
        ...prev,
        filterBySource: has ? current.filter((s) => s !== source) : [...current, source],
      };
    });
  }, []);

  // Filtered lists for searchable sections
  const filteredGenres = useMemo(() => {
    if (!genreSearch.trim()) return allGenres;
    const q = genreSearch.toLowerCase().trim();
    return allGenres.filter((g) => g.description.toLowerCase().includes(q));
  }, [allGenres, genreSearch]);

  const filteredSteamTags = useMemo(() => {
    if (!tagSearch.trim()) return allSteamTags.slice(0, 30);
    const q = tagSearch.toLowerCase().trim();
    return allSteamTags.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 30);
  }, [allSteamTags, tagSearch]);

  const filteredCategories = useMemo(() => {
    if (!featureSearch.trim()) return allCategories;
    const q = featureSearch.toLowerCase().trim();
    return allCategories.filter((c) => c.description.toLowerCase().includes(q));
  }, [allCategories, featureSearch]);

  const handleSave = useCallback(() => {
    const shelf: ShelfConfig = {
      id: isNew ? crypto.randomUUID() : editingShelfId,
      name: name.trim() || "Untitled Shelf",
      preset,
      filters,
      sortBy,
      sortOrder,
      displayMode,
      groupByGenre,
      maxVisibleGames,
      pinnedGameIds,
    };
    logger.info("ShelfEditorDialog", "shelf", isNew ? "Shelf created" : "Shelf updated", {
      id: shelf.id,
      name: shelf.name,
      preset: shelf.preset,
    });
    onSave(shelf);
  }, [
    isNew,
    editingShelfId,
    name,
    preset,
    filters,
    sortBy,
    sortOrder,
    displayMode,
    groupByGenre,
    maxVisibleGames,
    pinnedGameIds,
    onSave,
  ]);

  return (
    <div className="shelf-editor__overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="shelf-editor"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "Add shelf" : "Edit shelf"}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="shelf-editor__title">{isNew ? "Add Shelf" : "Edit Shelf"}</h2>

        {/* Preset picker */}
        <div className="shelf-editor__section">
          <label className="shelf-editor__label">Preset</label>
          <div className="shelf-editor__preset-grid">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                className={`shelf-editor__preset-btn ${preset === p.value ? "shelf-editor__preset-btn--active" : ""}`}
                onClick={() => handlePresetChange(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="shelf-editor__section">
          <label className="shelf-editor__label">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Shelf name..."
          />
        </div>

        {/* Sort */}
        <div className="shelf-editor__section shelf-editor__row">
          <div className="shelf-editor__field">
            <label className="shelf-editor__label">Sort by</label>
            <select
              className="shelf-editor__select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="shelf-editor__field">
            <label className="shelf-editor__label">Order</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
              aria-label={`Sort order: ${sortOrder}`}
            >
              <AppIcon name={sortOrder === "asc" ? "sort-asc" : "sort-desc"} size={14} />{" "}
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="shelf-editor__section">
          <label className="shelf-editor__label">Filters</label>
          <div className="shelf-editor__filters">
            <label className="shelf-editor__checkbox">
              <input
                type="checkbox"
                checked={filters.showInstalledOnly}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, showInstalledOnly: e.target.checked }))
                }
              />
              <span>Installed only</span>
            </label>
            <label className="shelf-editor__checkbox">
              <input
                type="checkbox"
                checked={filters.showFavoritesOnly}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, showFavoritesOnly: e.target.checked }))
                }
              />
              <span>Favorites only</span>
            </label>
          </div>

          {/* My Tags (user-created) */}
          {tags.length > 0 && (
            <ChipSection
              label="My Tags"
              selectedCount={filters.filterByTagIds.length}
              defaultOpen={filters.filterByTagIds.length > 0}
            >
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  className={`shelf-editor__chip ${filters.filterByTagIds.includes(tag.id) ? "shelf-editor__chip--active" : ""}`}
                  onClick={() => handleTagToggle(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
            </ChipSection>
          )}

          {/* Genres */}
          {allGenres.length > 0 && (
            <ChipSection
              label="Genres"
              selectedCount={filters.filterByGenreIds.length}
              defaultOpen={filters.filterByGenreIds.length > 0}
              searchPlaceholder="Search genres..."
              searchValue={genreSearch}
              onSearchChange={setGenreSearch}
            >
              {filteredGenres.map((genre) => (
                <button
                  key={genre.id}
                  className={`shelf-editor__chip ${filters.filterByGenreIds.includes(genre.id) ? "shelf-editor__chip--active" : ""}`}
                  onClick={() => handleGenreToggle(genre.id)}
                >
                  {genre.description}
                </button>
              ))}
            </ChipSection>
          )}

          {/* Tags (community tags, formerly "Steam Tags") */}
          {allSteamTags.length > 0 && (
            <ChipSection
              label="Tags"
              selectedCount={filters.filterBySteamTagNames.length}
              defaultOpen={filters.filterBySteamTagNames.length > 0}
              searchPlaceholder="Search tags..."
              searchValue={tagSearch}
              onSearchChange={setTagSearch}
            >
              {filteredSteamTags.map((tag) => (
                <button
                  key={tag.name}
                  className={`shelf-editor__chip ${filters.filterBySteamTagNames.includes(tag.name) ? "shelf-editor__chip--active" : ""}`}
                  onClick={() => handleSteamTagToggle(tag.name)}
                >
                  {tag.name}
                </button>
              ))}
            </ChipSection>
          )}

          {/* Features (categories) */}
          {allCategories.length > 0 && (
            <ChipSection
              label="Features"
              selectedCount={filters.filterByCategoryIds.length}
              defaultOpen={filters.filterByCategoryIds.length > 0}
              searchPlaceholder="Search features..."
              searchValue={featureSearch}
              onSearchChange={setFeatureSearch}
            >
              {filteredCategories.map((cat) => (
                <button
                  key={cat.id}
                  className={`shelf-editor__chip ${filters.filterByCategoryIds.includes(cat.id) ? "shelf-editor__chip--active" : ""}`}
                  onClick={() => handleCategoryToggle(cat.id)}
                >
                  {cat.description}
                </button>
              ))}
            </ChipSection>
          )}

          {/* Launcher source */}
          {allSources.length > 1 && (
            <ChipSection
              label="Launcher"
              selectedCount={(filters.filterBySource ?? []).length}
              defaultOpen={(filters.filterBySource ?? []).length > 0}
            >
              {allSources.map(({ source }) => (
                <button
                  key={source}
                  className={`shelf-editor__chip ${(filters.filterBySource ?? []).includes(source) ? "shelf-editor__chip--active" : ""}`}
                  onClick={() => handleSourceToggle(source)}
                >
                  {GAME_SOURCE_LABELS[source]}
                </button>
              ))}
            </ChipSection>
          )}

          {/* Manually pinned games */}
          {pinnedGameIds.length > 0 && (
            <ChipSection
              label="Manually Pinned"
              selectedCount={pinnedGameIds.length}
              defaultOpen
            >
              {pinnedGameIds.map((id) => (
                <button
                  key={id}
                  className="shelf-editor__chip shelf-editor__chip--active"
                  onClick={() => setPinnedGameIds((prev) => prev.filter((p) => p !== id))}
                  title={`Remove ${gameNameMap.get(id) ?? id}`}
                >
                  {gameNameMap.get(id) ?? id}
                  <span className="shelf-editor__chip-x">&times;</span>
                </button>
              ))}
            </ChipSection>
          )}
        </div>

        {/* Display options */}
        <div className="shelf-editor__section">
          <label className="shelf-editor__label">Display</label>
          <div className="shelf-editor__display-modes">
            {DISPLAY_MODES.map((dm) => (
              <button
                key={dm.value}
                className={`shelf-editor__display-btn ${displayMode === dm.value ? "shelf-editor__display-btn--active" : ""}`}
                onClick={() => setDisplayMode(dm.value)}
              >
                <span className="shelf-editor__display-icon">
                  <AppIcon name={dm.iconName} size={16} />
                </span>
                <span>{dm.label}</span>
              </button>
            ))}
          </div>

          <div className="shelf-editor__max-games">
            <label className="shelf-editor__label">Max visible games</label>
            <div className="shelf-editor__max-games-options">
              {MAX_GAMES_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  className={`shelf-editor__max-games-btn ${maxVisibleGames === opt.value ? "shelf-editor__max-games-btn--active" : ""}`}
                  onClick={() => setMaxVisibleGames(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="shelf-editor__checkbox shelf-editor__genre-toggle">
            <input
              type="checkbox"
              checked={groupByGenre}
              onChange={(e) => setGroupByGenre(e.target.checked)}
            />
            <span>Group by genre</span>
          </label>
        </div>

        {/* Actions */}
        <div className="shelf-editor__actions">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            {isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
