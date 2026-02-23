import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../../common/AppIcon";
import { useTagsStore } from "../../../store/tagsSlice";
import { useLibraryStore } from "../../../store/librarySlice";
import { useMetadataStore } from "../../../store/metadataSlice";
import { GAME_SOURCE_LABELS } from "../../../types/game";
import type { GameSource } from "../../../types/game";
import type { StoreMetadata } from "../../../types/metadata";
import "./ChartFilterMenu.css";

interface ChartFilterMenuProps {
  filterByTagIds: number[];
  filterBySource: string[];
  filterByGenreIds: string[];
  filterBySteamTagNames: string[];
  filterByCategoryIds: number[];
  /** Game IDs that appear in the data set — used to scope filter options */
  playedGameIds: Set<string>;
  onChange: (opts: {
    filterByTagIds?: number[];
    filterBySource?: string[];
    filterByGenreIds?: string[];
    filterBySteamTagNames?: string[];
    filterByCategoryIds?: number[];
  }) => void;
}

// ── Scoped extraction helpers (only games in the data set) ────

function extractScopedGenres(
  metadataCache: Map<string, StoreMetadata>,
  gameIds: Set<string>,
) {
  const genreMap = new Map<string, { description: string; count: number }>();
  for (const id of gameIds) {
    const meta = metadataCache.get(id);
    if (!meta) continue;
    for (const genre of meta.genres) {
      const existing = genreMap.get(genre.id);
      if (existing) existing.count++;
      else genreMap.set(genre.id, { description: genre.description, count: 1 });
    }
  }
  return [...genreMap.entries()]
    .map(([id, { description, count }]) => ({ id, description, count }))
    .sort((a, b) => b.count - a.count);
}

function extractScopedSteamTags(
  metadataCache: Map<string, StoreMetadata>,
  gameIds: Set<string>,
) {
  const tagCounts = new Map<string, number>();
  for (const id of gameIds) {
    const meta = metadataCache.get(id);
    if (!meta) continue;
    for (const tag of meta.steamTags) {
      tagCounts.set(tag.name, (tagCounts.get(tag.name) ?? 0) + 1);
    }
  }
  return [...tagCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function extractScopedCategories(
  metadataCache: Map<string, StoreMetadata>,
  gameIds: Set<string>,
) {
  const catMap = new Map<number, { description: string; count: number }>();
  for (const id of gameIds) {
    const meta = metadataCache.get(id);
    if (!meta) continue;
    for (const cat of meta.categories) {
      const existing = catMap.get(cat.id);
      if (existing) existing.count++;
      else catMap.set(cat.id, { description: cat.description, count: 1 });
    }
  }
  return [...catMap.entries()]
    .map(([id, { description, count }]) => ({ id, description, count }))
    .sort((a, b) => b.count - a.count);
}

function extractScopedSources(
  games: { gameId: string; source: string }[],
  gameIds: Set<string>,
) {
  const counts = new Map<string, number>();
  for (const game of games) {
    if (!gameIds.has(game.gameId)) continue;
    counts.set(game.source, (counts.get(game.source) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Collapsible Section ─────────────────────────────────────

function FilterSection({
  label,
  count,
  defaultOpen,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="chart-filter-menu__section">
      <button
        className="chart-filter-menu__section-header"
        onClick={() => setOpen(!open)}
      >
        <span className="chart-filter-menu__section-label">{label}</span>
        {count > 0 && <span className="chart-filter-menu__section-badge">{count}</span>}
        <AppIcon name={open ? "chevron-up" : "chevron-down"} size={10} />
      </button>
      {open && <div className="chart-filter-menu__section-body">{children}</div>}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export function ChartFilterMenu({
  filterByTagIds,
  filterBySource,
  filterByGenreIds,
  filterBySteamTagNames,
  filterByCategoryIds,
  playedGameIds,
  onChange,
}: ChartFilterMenuProps) {
  const tags = useTagsStore((s) => s.tags);
  const library = useLibraryStore((s) => s.library);
  const metadataCache = useMetadataStore((s) => s.cache);
  const [open, setOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Scoped data — only games that appear in this chart's data
  const allGenres = useMemo(
    () => extractScopedGenres(metadataCache, playedGameIds),
    [metadataCache, playedGameIds],
  );
  const allSteamTags = useMemo(
    () => extractScopedSteamTags(metadataCache, playedGameIds),
    [metadataCache, playedGameIds],
  );
  const allCategories = useMemo(
    () => extractScopedCategories(metadataCache, playedGameIds),
    [metadataCache, playedGameIds],
  );
  const allSources = useMemo(
    () => extractScopedSources(library?.games ?? [], playedGameIds),
    [library, playedGameIds],
  );

  // Scoped custom tags — only tags assigned to played games
  const gameTagMap = useTagsStore((s) => s.gameTagMap);
  const scopedTags = useMemo(() => {
    const relevantTagIds = new Set<number>();
    for (const id of playedGameIds) {
      const tagIds = gameTagMap.get(id);
      if (tagIds) tagIds.forEach((t) => relevantTagIds.add(t));
    }
    return tags.filter((t) => relevantTagIds.has(t.id));
  }, [tags, gameTagMap, playedGameIds]);

  const filteredSteamTags = useMemo(() => {
    if (!tagSearch) return allSteamTags.slice(0, 40);
    const q = tagSearch.toLowerCase();
    return allSteamTags.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 40);
  }, [allSteamTags, tagSearch]);

  // Position the portal dropdown relative to the trigger button
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Position below-right of trigger, but keep within viewport
    const panelWidth = 300;
    let left = rect.right - panelWidth;
    if (left < 8) left = 8;
    setPos({ top: rect.bottom + 4, left });
  }, []);

  useEffect(() => {
    if (!open) {
      setTagSearch("");
      return;
    }
    updatePosition();
    // Reposition on scroll/resize
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selectedTagSet = new Set(filterByTagIds);
  const selectedSourceSet = new Set(filterBySource);
  const selectedGenreSet = new Set(filterByGenreIds);
  const selectedSteamTagSet = new Set(filterBySteamTagNames);
  const selectedCategorySet = new Set(filterByCategoryIds);

  const totalActive =
    filterByTagIds.length +
    filterBySource.length +
    filterByGenreIds.length +
    filterBySteamTagNames.length +
    filterByCategoryIds.length;

  const toggle = (
    key: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    current: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selected: Set<any>,
  ) => {
    if (selected.has(value)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange({ [key]: current.filter((v: any) => v !== value) });
    } else {
      onChange({ [key]: [...current, value] });
    }
  };

  const clearAll = () => {
    onChange({
      filterByTagIds: [],
      filterBySource: [],
      filterByGenreIds: [],
      filterBySteamTagNames: [],
      filterByCategoryIds: [],
    });
    setOpen(false);
  };

  const hasCustomTags = scopedTags.length > 0;
  const hasGenres = allGenres.length > 0;
  const hasSteamTags = allSteamTags.length > 0;
  const hasCategories = allCategories.length > 0;
  const hasSources = allSources.length > 1;
  const hasAnything =
    hasCustomTags || hasGenres || hasSteamTags || hasCategories || hasSources;

  const dropdown = open && (
    <div
      ref={panelRef}
      className="chart-filter-menu__panel"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Header */}
      <div className="chart-filter-menu__header">
        <span className="chart-filter-menu__header-title">Filters</span>
        {totalActive > 0 && (
          <button className="chart-filter-menu__header-clear" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>

      {!hasAnything && (
        <div className="chart-filter-menu__empty">
          No filters available — add tags or scan games
        </div>
      )}

      <div className="chart-filter-menu__body">
        {hasGenres && (
          <FilterSection label="Genre" count={filterByGenreIds.length} defaultOpen>
            <div className="chart-filter-menu__chips">
              {allGenres.map((genre) => (
                <button
                  key={genre.id}
                  className={`chart-filter-menu__chip${selectedGenreSet.has(genre.id) ? " chart-filter-menu__chip--active" : ""}`}
                  onClick={() =>
                    toggle(
                      "filterByGenreIds",
                      filterByGenreIds,
                      genre.id,
                      selectedGenreSet,
                    )
                  }
                >
                  {genre.description}
                </button>
              ))}
            </div>
          </FilterSection>
        )}

        {hasSteamTags && (
          <FilterSection label="Steam Tags" count={filterBySteamTagNames.length}>
            <input
              className="chart-filter-menu__search"
              type="text"
              placeholder="Search tags..."
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              autoFocus
            />
            <div className="chart-filter-menu__list">
              {filteredSteamTags.map((tag) => (
                <label key={tag.name} className="chart-filter-menu__item">
                  <input
                    type="checkbox"
                    checked={selectedSteamTagSet.has(tag.name)}
                    onChange={() =>
                      toggle(
                        "filterBySteamTagNames",
                        filterBySteamTagNames,
                        tag.name,
                        selectedSteamTagSet,
                      )
                    }
                  />
                  <span className="chart-filter-menu__item-name">{tag.name}</span>
                  <span className="chart-filter-menu__item-count">{tag.count}</span>
                </label>
              ))}
              {filteredSteamTags.length === 0 && (
                <div className="chart-filter-menu__empty">No matching tags</div>
              )}
            </div>
          </FilterSection>
        )}

        {hasCategories && (
          <FilterSection label="Features" count={filterByCategoryIds.length}>
            <div className="chart-filter-menu__list">
              {allCategories.map((cat) => (
                <label key={cat.id} className="chart-filter-menu__item">
                  <input
                    type="checkbox"
                    checked={selectedCategorySet.has(cat.id)}
                    onChange={() =>
                      toggle(
                        "filterByCategoryIds",
                        filterByCategoryIds,
                        cat.id,
                        selectedCategorySet,
                      )
                    }
                  />
                  <span className="chart-filter-menu__item-name">{cat.description}</span>
                  <span className="chart-filter-menu__item-count">{cat.count}</span>
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {hasCustomTags && (
          <FilterSection label="Custom Tags" count={filterByTagIds.length}>
            <div className="chart-filter-menu__chips">
              {scopedTags.map((tag) => (
                <button
                  key={tag.id}
                  className={`chart-filter-menu__chip${selectedTagSet.has(tag.id) ? " chart-filter-menu__chip--active" : ""}`}
                  onClick={() =>
                    toggle("filterByTagIds", filterByTagIds, tag.id, selectedTagSet)
                  }
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </FilterSection>
        )}

        {hasSources && (
          <FilterSection label="Launcher" count={filterBySource.length}>
            <div className="chart-filter-menu__list">
              {allSources.map(({ source, count }) => (
                <label key={source} className="chart-filter-menu__item">
                  <input
                    type="checkbox"
                    checked={selectedSourceSet.has(source)}
                    onChange={() =>
                      toggle("filterBySource", filterBySource, source, selectedSourceSet)
                    }
                  />
                  <span className="chart-filter-menu__item-name">
                    {GAME_SOURCE_LABELS[source as GameSource] ?? source}
                  </span>
                  <span className="chart-filter-menu__item-count">{count}</span>
                </label>
              ))}
            </div>
          </FilterSection>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        className={`chart-filter-menu__trigger${totalActive > 0 ? " chart-filter-menu__trigger--active" : ""}`}
        onClick={() => setOpen(!open)}
        title="Filter chart data"
      >
        <AppIcon name="filter" size={12} />
        <span>{totalActive > 0 ? `Filter (${totalActive})` : "Filter"}</span>
      </button>
      {dropdown && createPortal(dropdown, document.body)}
    </>
  );
}
