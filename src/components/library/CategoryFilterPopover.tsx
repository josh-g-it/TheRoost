import { useState, useEffect, useRef, useMemo } from "react";
import { useUIStore } from "../../store/uiSlice";
import { useMetadataStore } from "../../store/metadataSlice";
import { extractAllCategories } from "../../utils/filtering";
import type { StoreMetadata } from "../../types";
import "./CategoryFilterPopover.css";

/** Count how many games have each category */
function countByCategory(cache: Map<string, StoreMetadata>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const meta of cache.values()) {
    for (const cat of meta.categories) {
      counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
    }
  }
  return counts;
}

export function CategoryFilterPopover() {
  const filters = useUIStore((s) => s.filters);
  const setFilterByCategoryIds = useUIStore((s) => s.setFilterByCategoryIds);
  const cache = useMetadataStore((s) => s.cache);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const allCategories = useMemo(() => extractAllCategories(cache), [cache]);
  const categoryCounts = useMemo(() => countByCategory(cache), [cache]);

  const selectedIds = filters.filterByCategoryIds;

  const filteredCategories = useMemo(() => {
    let cats: typeof allCategories;
    if (!search.trim()) {
      cats = allCategories;
    } else {
      const q = search.toLowerCase().trim();
      cats = allCategories.filter((c) => c.description.toLowerCase().includes(q));
    }
    const selectedSet = new Set(selectedIds);
    const isSelected = (c: (typeof allCategories)[0]) =>
      selectedSet.has(c.id) || c.aliasIds.some((a) => selectedSet.has(a));
    const selected = cats.filter(isSelected);
    const unselected = cats.filter((c) => !isSelected(c));
    return { selected, unselected };
  }, [allCategories, search, selectedIds]);

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

  const handleToggle = (catId: number) => {
    const cat = allCategories.find((c) => c.id === catId);
    const allIds = cat ? [cat.id, ...cat.aliasIds] : [catId];
    const current = filters.filterByCategoryIds;
    const isCurrentlySelected = allIds.some((id) => current.includes(id));
    if (isCurrentlySelected) {
      const removeSet = new Set(allIds);
      setFilterByCategoryIds(current.filter((id) => !removeSet.has(id)));
    } else {
      const merged = new Set([...current, ...allIds]);
      setFilterByCategoryIds([...merged]);
    }
  };

  const selectedCount = filters.filterByCategoryIds.length;

  if (allCategories.length === 0) return null;

  return (
    <div className="category-filter" ref={ref}>
      <button
        className={`category-filter__trigger ${selectedCount > 0 ? "category-filter__trigger--active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="Filter by features"
        aria-expanded={open}
      >
        {selectedCount > 0 ? `Features (${selectedCount})` : "Features"}
      </button>
      {open && (
        <div className="category-filter__popover" role="menu">
          <div className="category-filter__header">
            <span>Filter by features</span>
            {selectedCount > 0 && (
              <button
                className="category-filter__clear"
                onClick={() => setFilterByCategoryIds([])}
              >
                Clear
              </button>
            )}
          </div>
          <input
            className="category-filter__search"
            type="text"
            placeholder="Search features..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="category-filter__list">
            {filteredCategories.selected.map((cat) => (
              <label key={cat.id} className="category-filter__item">
                <input type="checkbox" checked onChange={() => handleToggle(cat.id)} />
                <span className="category-filter__item-name">{cat.description}</span>
                <span className="category-filter__item-count">
                  {categoryCounts.get(cat.id) ?? 0}
                </span>
              </label>
            ))}
            {filteredCategories.selected.length > 0 &&
              filteredCategories.unselected.length > 0 && (
                <div className="category-filter__selected-divider" />
              )}
            {filteredCategories.unselected.map((cat) => (
              <label key={cat.id} className="category-filter__item">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => handleToggle(cat.id)}
                />
                <span className="category-filter__item-name">{cat.description}</span>
                <span className="category-filter__item-count">
                  {categoryCounts.get(cat.id) ?? 0}
                </span>
              </label>
            ))}
            {filteredCategories.selected.length === 0 &&
              filteredCategories.unselected.length === 0 && (
                <div className="category-filter__empty">No matching features</div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
