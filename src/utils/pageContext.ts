/**
 * Page Context Injection — Phase E (v1.12.1)
 *
 * Builds a lightweight context string (~20-30 tokens) describing the user's
 * current page and relevant UI state. This is passed with each AI message so
 * the assistant knows what the user is looking at.
 *
 * Uses Zustand `getState()` (non-hook access) so it can be called from
 * anywhere without React context.
 */

import { useUIStore } from "../store/uiSlice";

/** Active library filters formatted as a compact string list. */
function describeActiveFilters(): string[] {
  const { filters, sortBy, sortOrder, viewMode } = useUIStore.getState();
  const parts: string[] = [];

  // View mode
  parts.push(`view:${viewMode}`);

  // Sort
  parts.push(`sort:${sortBy}:${sortOrder}`);

  // Quick filters
  if (filters.searchQuery) parts.push(`search:"${filters.searchQuery}"`);
  if (filters.showInstalledOnly) parts.push("filter:installed");
  if (filters.showFavoritesOnly) parts.push("filter:favorites");
  if (filters.showHiddenOnly) parts.push("filter:hidden");
  if (filters.showUpdatePendingOnly) parts.push("filter:update-pending");
  if (filters.filterByRated === "rated") parts.push("filter:rated");
  if (filters.filterByRated === "unrated") parts.push("filter:unrated");

  // Source filters
  if (filters.filterBySource.length > 0) {
    parts.push(`sources:[${filters.filterBySource.join(",")}]`);
  }

  // Tag filters (names)
  if (filters.filterBySteamTagNames.length > 0) {
    parts.push(`tags:[${filters.filterBySteamTagNames.join(",")}]`);
  }

  return parts;
}

/** Map pathname to a human-readable page label. */
function pageLabel(pathname: string): string {
  if (pathname.startsWith("/library")) return "Library";
  if (pathname.startsWith("/assistant")) return "Assistant";
  if (pathname.startsWith("/activity")) return "Activity";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/notes")) return "Notes";
  if (pathname.startsWith("/news")) return "News Feed";
  if (pathname.startsWith("/storage")) return "Storage";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/debug")) return "Debug";
  return "Unknown";
}

/**
 * Build a compact page context string for injection into AI messages.
 *
 * Output example:
 *   "Page: Library | view:grid, sort:playtime:desc, filter:installed"
 *   "Page: Settings"
 *   "Page: News Feed"
 *
 * Returns an empty string if context cannot be determined.
 */
export function buildPageContext(): string {
  let pathname: string;
  try {
    pathname = window.location.pathname;
  } catch {
    return "";
  }

  const page = pageLabel(pathname);

  // Only include detailed state for library (where filters/sort matter)
  if (pathname.startsWith("/library")) {
    const details = describeActiveFilters();
    return `Page: ${page} | ${details.join(", ")}`;
  }

  return `Page: ${page}`;
}
