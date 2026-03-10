import { useState, useEffect, useRef, useMemo } from "react";
import { useUIStore } from "../../store/uiSlice";
import { useMetadataStore } from "../../store/metadataSlice";
import { extractAllSteamTags } from "../../utils/filtering";
import { getTagCategory, groupTagsByCategory } from "../../utils/tagTaxonomy";
import "./TagFilterPopover.css";

interface TagFilterPopoverProps {
  /** "genre" shows only Genre-category tags; "tags" shows everything else. */
  mode?: "genre" | "tags";
}

export function TagFilterPopover({ mode = "tags" }: TagFilterPopoverProps) {
  const filters = useUIStore((s) => s.filters);
  const setFilterBySteamTagNames = useUIStore((s) => s.setFilterBySteamTagNames);
  const cache = useMetadataStore((s) => s.cache);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const isGenreMode = mode === "genre";

  // Filter allTags by mode
  const allTags = useMemo(() => {
    const tags = extractAllSteamTags(cache);
    if (isGenreMode) {
      return tags.filter((t) => getTagCategory(t.name) === "Genre");
    }
    return tags.filter((t) => getTagCategory(t.name) !== "Genre");
  }, [cache, isGenreMode]);

  const selectedSet = filters.filterBySteamTagNames;
  const selectedNames = useMemo(() => new Set(selectedSet), [selectedSet]);

  // Count only tags relevant to this mode
  const selectedCount = useMemo(() => {
    return selectedSet.filter((name) => {
      const isGenre = getTagCategory(name) === "Genre";
      return isGenreMode ? isGenre : !isGenre;
    }).length;
  }, [selectedSet, isGenreMode]);

  const { selectedTags, groupedUnselected, flatUnselected } = useMemo(() => {
    // Always include ALL selected tags for this mode
    const selected = allTags.filter((t) => selectedNames.has(t.name));

    let unselected: typeof allTags;
    if (!search.trim()) {
      unselected = allTags.filter((t) => !selectedNames.has(t.name));
    } else {
      const q = search.toLowerCase().trim();
      unselected = allTags.filter(
        (t) => !selectedNames.has(t.name) && t.name.toLowerCase().includes(q),
      );
    }

    // Genre mode: flat list (all one category). Tags mode: grouped by category.
    const grouped = isGenreMode ? [] : groupTagsByCategory(unselected);

    // Also filter selected if searching
    let filteredSelected = selected;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      filteredSelected = selected.filter((t) => t.name.toLowerCase().includes(q));
    }

    return {
      selectedTags: filteredSelected,
      groupedUnselected: grouped,
      flatUnselected: isGenreMode ? unselected : [],
    };
  }, [allTags, search, selectedNames, isGenreMode]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = (tagName: string) => {
    const current = filters.filterBySteamTagNames;
    if (current.includes(tagName)) {
      setFilterBySteamTagNames(current.filter((n) => n !== tagName));
    } else {
      setFilterBySteamTagNames([...current, tagName]);
    }
  };

  // Clear only removes tags belonging to this mode
  const handleClear = () => {
    const remaining = selectedSet.filter((name) => {
      const isGenre = getTagCategory(name) === "Genre";
      return isGenreMode ? !isGenre : isGenre;
    });
    setFilterBySteamTagNames(remaining);
  };

  const label = isGenreMode ? "Genre" : "Tags";
  const headerText = isGenreMode ? "Filter by genre" : "Filter by tags";
  const searchPlaceholder = isGenreMode ? "Search genres..." : "Search tags...";

  if (allTags.length === 0) return null;

  return (
    <div className="tag-filter" ref={ref}>
      <button
        className={`tag-filter__trigger ${selectedCount > 0 ? "tag-filter__trigger--active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label={headerText}
        aria-expanded={open}
      >
        {selectedCount > 0 ? `${label} (${selectedCount})` : label}
      </button>
      {open && (
        <div className="tag-filter__popover" role="menu">
          <div className="tag-filter__header">
            <span>{headerText}</span>
            {selectedCount > 0 && (
              <button className="tag-filter__clear" onClick={handleClear}>
                Clear
              </button>
            )}
          </div>
          <input
            className="tag-filter__search"
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="tag-filter__list">
            {/* Selected tags always at top */}
            {selectedTags.length > 0 && (
              <div className="tag-filter__selected-section">
                <div className="tag-filter__selected-label">Selected</div>
                {selectedTags.map((tag) => (
                  <label key={tag.name} className="tag-filter__item">
                    <input
                      type="checkbox"
                      checked
                      onChange={() => handleToggle(tag.name)}
                    />
                    <span className="tag-filter__item-name">{tag.name}</span>
                    <span className="tag-filter__item-count">{tag.count}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Genre mode: flat unselected list */}
            {isGenreMode &&
              flatUnselected.map((tag) => (
                <label key={tag.name} className="tag-filter__item">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => handleToggle(tag.name)}
                  />
                  <span className="tag-filter__item-name">{tag.name}</span>
                  <span className="tag-filter__item-count">{tag.count}</span>
                </label>
              ))}

            {/* Tags mode: grouped unselected tags */}
            {!isGenreMode &&
              groupedUnselected.map((group) => (
                <div key={group.category}>
                  <div className="tag-filter__category-label">{group.category}</div>
                  {group.tags.map((tag) => (
                    <label key={tag.name} className="tag-filter__item">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => handleToggle(tag.name)}
                      />
                      <span className="tag-filter__item-name">{tag.name}</span>
                      <span className="tag-filter__item-count">{tag.count}</span>
                    </label>
                  ))}
                </div>
              ))}

            {selectedTags.length === 0 &&
              groupedUnselected.length === 0 &&
              flatUnselected.length === 0 && (
                <div className="tag-filter__empty">
                  No matching {isGenreMode ? "genres" : "tags"}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
