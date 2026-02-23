import { useState, useEffect, useRef, useMemo } from "react";
import { useUIStore } from "../../store/uiSlice";
import { useLibraryStore } from "../../store/librarySlice";
import { extractAllSources } from "../../utils/filtering";
import { GAME_SOURCE_LABELS } from "../../types/game";
import type { GameSource } from "../../types/game";
import "./SourceFilterPopover.css";

export function SourceFilterPopover() {
  const filters = useUIStore((s) => s.filters);
  const setFilterBySource = useUIStore((s) => s.setFilterBySource);
  const library = useLibraryStore((s) => s.library);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allSources = useMemo(() => extractAllSources(library?.games ?? []), [library]);

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

  const handleToggle = (source: GameSource) => {
    const current = filters.filterBySource;
    if (current.includes(source)) {
      setFilterBySource(current.filter((s) => s !== source));
    } else {
      setFilterBySource([...current, source]);
    }
  };

  const selectedCount = filters.filterBySource.length;

  // Only show if there's more than one source in the library
  if (allSources.length <= 1) return null;

  return (
    <div className="source-filter" ref={ref}>
      <button
        className={`source-filter__trigger ${selectedCount > 0 ? "source-filter__trigger--active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="Filter by launcher"
        aria-expanded={open}
      >
        {selectedCount > 0 ? `Launcher (${selectedCount})` : "Launcher"}
      </button>
      {open && (
        <div className="source-filter__popover" role="menu">
          <div className="source-filter__header">
            <span>Filter by launcher</span>
            {selectedCount > 0 && (
              <button
                className="source-filter__clear"
                onClick={() => setFilterBySource([])}
              >
                Clear
              </button>
            )}
          </div>
          <div className="source-filter__list">
            {allSources.map(({ source, count }) => {
              const isSelected = filters.filterBySource.includes(source);
              return (
                <label key={source} className="source-filter__item">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(source)}
                  />
                  <span className="source-filter__item-name">
                    {GAME_SOURCE_LABELS[source]}
                  </span>
                  <span className="source-filter__item-count">{count}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
