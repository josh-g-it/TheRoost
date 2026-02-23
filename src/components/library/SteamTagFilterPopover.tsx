import { useState, useEffect, useRef, useMemo } from "react";
import { useUIStore } from "../../store/uiSlice";
import { useMetadataStore } from "../../store/metadataSlice";
import { extractAllSteamTags } from "../../utils/filtering";
import "./SteamTagFilterPopover.css";

export function SteamTagFilterPopover() {
  const filters = useUIStore((s) => s.filters);
  const setFilterBySteamTagNames = useUIStore((s) => s.setFilterBySteamTagNames);
  const cache = useMetadataStore((s) => s.cache);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const allTags = useMemo(() => extractAllSteamTags(cache), [cache]);

  const filteredTags = useMemo(() => {
    if (!search.trim()) return allTags.slice(0, 50);
    const q = search.toLowerCase().trim();
    return allTags.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 50);
  }, [allTags, search]);

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

  const selectedCount = filters.filterBySteamTagNames.length;

  if (allTags.length === 0) return null;

  return (
    <div className="steam-tag-filter" ref={ref}>
      <button
        className={`steam-tag-filter__trigger ${selectedCount > 0 ? "steam-tag-filter__trigger--active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="Filter by tags"
        aria-expanded={open}
      >
        {selectedCount > 0 ? `Tags (${selectedCount})` : "Tags"}
      </button>
      {open && (
        <div className="steam-tag-filter__popover" role="menu">
          <div className="steam-tag-filter__header">
            <span>Filter by community tags</span>
            {selectedCount > 0 && (
              <button
                className="steam-tag-filter__clear"
                onClick={() => setFilterBySteamTagNames([])}
              >
                Clear
              </button>
            )}
          </div>
          <input
            className="steam-tag-filter__search"
            type="text"
            placeholder="Search tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="steam-tag-filter__list">
            {filteredTags.map((tag) => {
              const isSelected = filters.filterBySteamTagNames.includes(tag.name);
              return (
                <label key={tag.name} className="steam-tag-filter__item">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(tag.name)}
                  />
                  <span className="steam-tag-filter__item-name">{tag.name}</span>
                  <span className="steam-tag-filter__item-count">{tag.count}</span>
                </label>
              );
            })}
            {filteredTags.length === 0 && (
              <div className="steam-tag-filter__empty">No matching tags</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
