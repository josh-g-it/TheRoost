import { useState, useEffect, useRef, useMemo } from "react";
import { Input } from "../common/Input";
import { Button } from "../common/Button";
import { AppIcon } from "../common/AppIcon";
import { CardDisplayPopover } from "./CardDisplayPopover";
import { SteamTagFilterPopover } from "./SteamTagFilterPopover";
import { CategoryFilterPopover } from "./CategoryFilterPopover";
import { SourceFilterPopover } from "./SourceFilterPopover";
import { useUIStore } from "../../store/uiSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useMetadataStore } from "../../store/metadataSlice";
import { useSavedFiltersStore } from "../../store/savedFiltersSlice";
import { useInstallStore } from "../../store/installSlice";
import { extractAllGenres } from "../../utils/filtering";
import { steamInstallApi } from "../../services/tauri";
import type { SortBy, LibraryFilters, SortOrder } from "../../types";
import "./LibraryControls.css";

interface LibraryControlsProps {
  totalGames: number;
  onRefresh: () => void;
  isLoading: boolean;
  hiddenCount: number;
  shelvesEnabled?: boolean;
  updatePendingCount: number;
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "playtime", label: "Playtime" },
  { value: "lastPlayed", label: "Last Played" },
  { value: "recentlyAdded", label: "Recently Added" },
  { value: "size", label: "Size" },
  { value: "metacritic", label: "Metacritic" },
  { value: "personalRating", label: "My Rating" },
  { value: "source", label: "Launcher" },
];

export function LibraryControls({
  totalGames,
  onRefresh,
  isLoading,
  hiddenCount,
  shelvesEnabled = false,
  updatePendingCount,
}: LibraryControlsProps) {
  const {
    viewMode,
    sortBy,
    sortOrder,
    filters,
    setViewMode,
    setSorting,
    setSearchQuery,
    setShowInstalledOnly,
    setShowFavoritesOnly,
    setFilterByTagIds,
    setShowHiddenOnly,
    setFilterByGenreIds,
    setFilterBySteamTagNames,
    setFilterByCategoryIds,
    setFilterBySource,
    setFilterByRated,
    setShowUpdatePendingOnly,
  } = useUIStore();

  const activeInstalls = useInstallStore((s) => s.activeInstalls);

  const tags = useTagsStore((s) => s.tags);
  const cache = useMetadataStore((s) => s.cache);
  const saveFilter = useSavedFiltersStore((s) => s.saveFilter);
  const savedFilters = useSavedFiltersStore((s) => s.savedFilters);
  const deleteFilter = useSavedFiltersStore((s) => s.deleteFilter);
  const [localSearch, setLocalSearch] = useState(filters.searchQuery);
  const [genrePopoverOpen, setGenrePopoverOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savedFiltersOpen, setSavedFiltersOpen] = useState(false);
  const savedFiltersRef = useRef<HTMLDivElement>(null);
  const [saveFilterName, setSaveFilterName] = useState("");
  const [duplicateFilterId, setDuplicateFilterId] = useState<number | null>(null);
  const genreRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(localSearch), 300);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery]);

  // Close genre popover on outside click
  useEffect(() => {
    if (!genrePopoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (genreRef.current && !genreRef.current.contains(e.target as Node)) {
        setGenrePopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [genrePopoverOpen]);

  // Close saved filters popover on outside click
  useEffect(() => {
    if (!savedFiltersOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        savedFiltersRef.current &&
        !savedFiltersRef.current.contains(e.target as Node)
      ) {
        setSavedFiltersOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [savedFiltersOpen]);

  const applySavedFilter = (filter: {
    filters: LibraryFilters;
    sortBy?: SortBy;
    sortOrder?: SortOrder;
  }) => {
    const f = filter.filters;
    setSearchQuery(f.searchQuery);
    setShowInstalledOnly(f.showInstalledOnly);
    setShowFavoritesOnly(f.showFavoritesOnly);
    setFilterByTagIds(f.filterByTagIds);
    setShowHiddenOnly(f.showHiddenOnly ?? false);
    setFilterByGenreIds(f.filterByGenreIds ?? []);
    setFilterBySteamTagNames(f.filterBySteamTagNames ?? []);
    setFilterByCategoryIds(f.filterByCategoryIds ?? []);
    setFilterBySource(f.filterBySource ?? []);
    setFilterByRated(f.filterByRated ?? "all");
    setShowUpdatePendingOnly(f.showUpdatePendingOnly ?? false);
    if (filter.sortBy) {
      setSorting(filter.sortBy, filter.sortOrder);
    }
    setLocalSearch(f.searchQuery);
    setSavedFiltersOpen(false);
  };

  const handleTagFilterChange = (tagId: number) => {
    const current = filters.filterByTagIds;
    if (current.includes(tagId)) {
      setFilterByTagIds(current.filter((id) => id !== tagId));
    } else {
      setFilterByTagIds([...current, tagId]);
    }
  };

  const handleGenreToggle = (genreId: string) => {
    const current = filters.filterByGenreIds;
    if (current.includes(genreId)) {
      setFilterByGenreIds(current.filter((id) => id !== genreId));
    } else {
      setFilterByGenreIds([...current, genreId]);
    }
  };

  const allGenres = useMemo(() => extractAllGenres(cache), [cache]);

  const hasActiveFilters =
    filters.showInstalledOnly ||
    filters.showFavoritesOnly ||
    filters.filterByTagIds.length > 0 ||
    filters.filterByGenreIds.length > 0 ||
    filters.filterBySteamTagNames.length > 0 ||
    filters.filterByCategoryIds.length > 0 ||
    (filters.filterBySource ?? []).length > 0 ||
    filters.filterByRated !== "all" ||
    filters.showUpdatePendingOnly ||
    filters.searchQuery.length > 0;

  const handleSaveFilter = async () => {
    const name = saveFilterName.trim();
    if (!name) return;

    // Check for duplicate name
    const existing = savedFilters.find(
      (f) => f.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing && duplicateFilterId === null) {
      setDuplicateFilterId(existing.id);
      return;
    }

    try {
      // If overwriting, delete old one first
      if (duplicateFilterId !== null) {
        await deleteFilter(duplicateFilterId);
      }
      await saveFilter(name, filters, sortBy, sortOrder);
      setSaveFilterName("");
      setDuplicateFilterId(null);
      setSaveDialogOpen(false);
    } catch {
      // Error logged by store
    }
  };

  const handleCancelSaveDialog = () => {
    setSaveDialogOpen(false);
    setSaveFilterName("");
    setDuplicateFilterId(null);
  };

  return (
    <div className="library-controls">
      <div className="library-controls__left">
        <Input
          placeholder="Search games..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          icon={<AppIcon name="search" size={16} />}
        />
        <span className="library-controls__count">{totalGames} games</span>
      </div>

      <div className="library-controls__right">
        {!shelvesEnabled && (
          <>
            <label className="library-controls__checkbox">
              <input
                type="checkbox"
                checked={filters.showInstalledOnly}
                onChange={(e) => setShowInstalledOnly(e.target.checked)}
              />
              <span>Installed only</span>
            </label>

            <label className="library-controls__checkbox">
              <input
                type="checkbox"
                checked={filters.showFavoritesOnly}
                onChange={(e) => setShowFavoritesOnly(e.target.checked)}
              />
              <span>
                <AppIcon name="star-filled" size={14} /> Favorites
              </span>
            </label>

            <label className="library-controls__checkbox">
              <input
                type="checkbox"
                checked={filters.showHiddenOnly}
                onChange={(e) => setShowHiddenOnly(e.target.checked)}
              />
              <span>Hidden{hiddenCount > 0 ? ` (${hiddenCount})` : ""}</span>
            </label>

            {updatePendingCount > 0 && (
              <button
                className={`library-controls__update-badge ${filters.showUpdatePendingOnly ? "library-controls__update-badge--active" : ""}`}
                onClick={() => {
                  const newValue = !filters.showUpdatePendingOnly;
                  setShowUpdatePendingOnly(newValue);
                  if (newValue) setViewMode("list");
                }}
                title={`${updatePendingCount} update${updatePendingCount !== 1 ? "s" : ""} pending`}
              >
                <AppIcon name="refresh" size={12} />
                {updatePendingCount} update{updatePendingCount !== 1 ? "s" : ""} pending
              </button>
            )}

            {filters.showUpdatePendingOnly && updatePendingCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  for (const progress of activeInstalls.values()) {
                    if (progress.status === "update_required") {
                      steamInstallApi.updateGame(progress.sourceId);
                    }
                  }
                }}
                title="Trigger updates for all pending games via Steam"
              >
                Update All
              </Button>
            )}

            {tags.length > 0 && (
              <div className="library-controls__tag-filter">
                <select
                  className="library-controls__sort"
                  value=""
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) handleTagFilterChange(id);
                  }}
                  aria-label="Filter by tag"
                >
                  <option value="">
                    {filters.filterByTagIds.length > 0
                      ? `Tags (${filters.filterByTagIds.length})`
                      : "Filter by tag"}
                  </option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {filters.filterByTagIds.includes(tag.id) ? "\u2713 " : ""}
                      {tag.name}
                    </option>
                  ))}
                </select>
                {filters.filterByTagIds.length > 0 && (
                  <button
                    className="library-controls__clear-tags"
                    onClick={() => setFilterByTagIds([])}
                    aria-label="Clear tag filter"
                    title="Clear tag filter"
                  >
                    <AppIcon name="close" size={10} />
                  </button>
                )}
              </div>
            )}

            {allGenres.length > 0 && (
              <div className="library-controls__genre-filter" ref={genreRef}>
                <button
                  className={`library-controls__genre-trigger ${filters.filterByGenreIds.length > 0 ? "library-controls__genre-trigger--active" : ""}`}
                  onClick={() => setGenrePopoverOpen(!genrePopoverOpen)}
                  aria-label="Filter by genre"
                  aria-expanded={genrePopoverOpen}
                >
                  {filters.filterByGenreIds.length > 0
                    ? `Genres (${filters.filterByGenreIds.length})`
                    : "Genres"}
                </button>
                {genrePopoverOpen && (
                  <div className="library-controls__genre-popover" role="menu">
                    <div className="library-controls__genre-header">
                      <span>Filter by genre</span>
                      {filters.filterByGenreIds.length > 0 && (
                        <button
                          className="library-controls__genre-clear"
                          onClick={() => setFilterByGenreIds([])}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="library-controls__genre-chips">
                      {allGenres.map((genre) => (
                        <button
                          key={genre.id}
                          className={`library-controls__genre-chip ${filters.filterByGenreIds.includes(genre.id) ? "library-controls__genre-chip--active" : ""}`}
                          onClick={() => handleGenreToggle(genre.id)}
                        >
                          {genre.description}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <SteamTagFilterPopover />

            <CategoryFilterPopover />

            <SourceFilterPopover />

            <select
              className="library-controls__sort"
              value={filters.filterByRated}
              onChange={(e) =>
                setFilterByRated(e.target.value as "all" | "rated" | "unrated")
              }
              aria-label="Filter by rating"
            >
              <option value="all">All games</option>
              <option value="rated">Rated</option>
              <option value="unrated">Unrated</option>
            </select>

            {savedFilters.length > 0 && (
              <div className="library-controls__saved-filters" ref={savedFiltersRef}>
                <button
                  className="library-controls__saved-trigger"
                  onClick={() => setSavedFiltersOpen(!savedFiltersOpen)}
                  aria-label="Saved filters"
                  aria-expanded={savedFiltersOpen}
                >
                  <AppIcon name="star-filled" size={12} />
                  Saved Filters ({savedFilters.length})
                </button>
                {savedFiltersOpen && (
                  <div className="library-controls__saved-popover" role="menu">
                    <div className="library-controls__saved-header">Saved Filters</div>
                    {savedFilters.map((sf) => (
                      <div key={sf.id} className="library-controls__saved-item">
                        <button
                          className="library-controls__saved-apply"
                          onClick={() => applySavedFilter(sf)}
                          title={`Apply "${sf.name}"`}
                        >
                          {sf.name}
                        </button>
                        <button
                          className="library-controls__saved-delete"
                          onClick={() => deleteFilter(sf.id)}
                          aria-label={`Delete "${sf.name}"`}
                        >
                          <AppIcon name="close" size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSaveDialogOpen(true)}
                title="Save current filter"
                aria-label="Save current filter"
              >
                Save filter
              </Button>
            )}

            <select
              className="library-controls__sort"
              value={sortBy}
              onChange={(e) => setSorting(e.target.value as SortBy)}
              aria-label="Sort games by"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSorting(sortBy, sortOrder === "asc" ? "desc" : "asc")}
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
              aria-label={`Sort order: ${sortOrder === "asc" ? "ascending" : "descending"}. Click to toggle.`}
            >
              <AppIcon name={sortOrder === "asc" ? "sort-asc" : "sort-desc"} size={16} />
            </Button>
          </>
        )}

        <div className="library-controls__view-toggle">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grid")}
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <AppIcon name="grid-view" size={16} />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            title="List view"
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <AppIcon name="list-view" size={16} />
          </Button>
        </div>

        <CardDisplayPopover />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => useUIStore.getState().openCustomGameDialog()}
          title="Add a custom game"
          aria-label="Add custom game"
        >
          <AppIcon name="plus" size={16} /> Add Game
        </Button>

        <Button variant="ghost" size="sm" onClick={onRefresh} loading={isLoading}>
          Refresh
        </Button>
      </div>

      {/* Save Filter Dialog */}
      {saveDialogOpen && (
        <div className="library-controls__save-overlay" onClick={handleCancelSaveDialog}>
          <div
            className="library-controls__save-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="library-controls__save-title">Save Filter Preset</h3>
            {duplicateFilterId !== null ? (
              <>
                <p className="library-controls__save-warning">
                  A filter named &ldquo;{saveFilterName.trim()}&rdquo; already exists.
                  Overwrite it?
                </p>
                <div className="library-controls__save-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDuplicateFilterId(null)}
                  >
                    Rename
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleSaveFilter}>
                    Overwrite
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Input
                  placeholder="Preset name..."
                  value={saveFilterName}
                  onChange={(e) => setSaveFilterName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveFilter();
                    if (e.key === "Escape") handleCancelSaveDialog();
                  }}
                  autoFocus
                />
                <div className="library-controls__save-actions">
                  <Button variant="ghost" size="sm" onClick={handleCancelSaveDialog}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveFilter}
                    disabled={!saveFilterName.trim()}
                  >
                    Save
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
