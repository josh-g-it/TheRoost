import { useSavedFiltersStore } from "../../store/savedFiltersSlice";
import { useUIStore } from "../../store/uiSlice";
import { AppIcon } from "../common/AppIcon";
import type { LibraryFilters, SortBy, SortOrder } from "../../types";
import "./SavedFilterChips.css";

export function SavedFilterChips() {
  const savedFilters = useSavedFiltersStore((s) => s.savedFilters);
  const deleteFilter = useSavedFiltersStore((s) => s.deleteFilter);
  const setSorting = useUIStore((s) => s.setSorting);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const setShowInstalledOnly = useUIStore((s) => s.setShowInstalledOnly);
  const setShowFavoritesOnly = useUIStore((s) => s.setShowFavoritesOnly);
  const setFilterByTagIds = useUIStore((s) => s.setFilterByTagIds);
  const setShowHiddenOnly = useUIStore((s) => s.setShowHiddenOnly);
  const setFilterByGenreIds = useUIStore((s) => s.setFilterByGenreIds);
  const setFilterBySteamTagNames = useUIStore((s) => s.setFilterBySteamTagNames);
  const setFilterByCategoryIds = useUIStore((s) => s.setFilterByCategoryIds);
  const setFilterBySource = useUIStore((s) => s.setFilterBySource);

  if (savedFilters.length === 0) return null;

  const applyFilter = (filter: {
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
    if (filter.sortBy) {
      setSorting(filter.sortBy, filter.sortOrder);
    }
  };

  return (
    <div className="saved-filter-chips">
      {savedFilters.map((sf) => (
        <div key={sf.id} className="saved-filter-chips__chip">
          <button
            className="saved-filter-chips__label"
            onClick={() => applyFilter(sf)}
            title={`Apply "${sf.name}" filter`}
          >
            {sf.name}
          </button>
          <button
            className="saved-filter-chips__remove"
            onClick={() => deleteFilter(sf.id)}
            aria-label={`Delete "${sf.name}" filter`}
          >
            <AppIcon name="close" size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
