import { describe, it, expect, beforeEach } from "vitest";
import { buildPageContext } from "./pageContext";
import { useUIStore } from "../store/uiSlice";

describe("buildPageContext", () => {
  beforeEach(() => {
    // Reset UI store to defaults before each test
    useUIStore.setState({
      viewMode: "grid",
      sortBy: "name",
      sortOrder: "asc",
      filters: {
        searchQuery: "",
        showInstalledOnly: false,
        showFavoritesOnly: false,
        filterByTagIds: [],
        showHiddenOnly: false,
        filterByGenreIds: [],
        filterBySteamTagNames: [],
        filterByCategoryIds: [],
        filterBySource: [],
        filterByRated: "all",
        filterByMinRating: 0,
        showUpdatePendingOnly: false,
      },
    });
  });

  it("returns page label for non-library routes", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/settings" },
      writable: true,
    });
    expect(buildPageContext()).toBe("Page: Settings");
  });

  it("returns library context with default state", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/library" },
      writable: true,
    });
    const result = buildPageContext();
    expect(result).toContain("Page: Library");
    expect(result).toContain("view:grid");
    expect(result).toContain("sort:name:asc");
  });

  it("includes active filters for library", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/library" },
      writable: true,
    });
    useUIStore.setState({
      viewMode: "list",
      sortBy: "playtime",
      sortOrder: "desc",
      filters: {
        searchQuery: "elden",
        showInstalledOnly: true,
        showFavoritesOnly: false,
        filterByTagIds: [],
        showHiddenOnly: false,
        filterByGenreIds: ["1", "3"],
        filterBySteamTagNames: ["Open World"],
        filterByCategoryIds: [],
        filterBySource: [],
        filterByRated: "rated",
        filterByMinRating: 0,
        showUpdatePendingOnly: false,
      },
    });

    const result = buildPageContext();
    expect(result).toContain("view:list");
    expect(result).toContain("sort:playtime:desc");
    expect(result).toContain('search:"elden"');
    expect(result).toContain("filter:installed");
    expect(result).toContain("filter:rated");
    expect(result).toContain("tags:[Open World]");
  });

  it("maps all known routes to labels", () => {
    const routes: Record<string, string> = {
      "/library": "Library",
      "/assistant": "Assistant",
      "/activity": "Activity",
      "/profile": "Profile",
      "/notes": "Notes",
      "/news": "News Feed",
      "/storage": "Storage",
      "/settings": "Settings",
      "/debug": "Debug",
    };

    for (const [path, label] of Object.entries(routes)) {
      Object.defineProperty(window, "location", {
        value: { pathname: path },
        writable: true,
      });
      expect(buildPageContext()).toContain(`Page: ${label}`);
    }
  });

  it("returns Unknown for unrecognized routes", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/some-unknown-page" },
      writable: true,
    });
    expect(buildPageContext()).toBe("Page: Unknown");
  });

  it("includes source filters when active", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/library" },
      writable: true,
    });
    useUIStore.setState((state) => ({
      filters: { ...state.filters, filterBySource: ["Steam", "Epic"] as never[] },
    }));

    const result = buildPageContext();
    expect(result).toContain("sources:[Steam,Epic]");
  });

  it("includes favorites and hidden filters", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/library" },
      writable: true,
    });
    useUIStore.setState((state) => ({
      filters: {
        ...state.filters,
        showFavoritesOnly: true,
        showHiddenOnly: true,
        showUpdatePendingOnly: true,
      },
    }));

    const result = buildPageContext();
    expect(result).toContain("filter:favorites");
    expect(result).toContain("filter:hidden");
    expect(result).toContain("filter:update-pending");
  });

  it("includes unrated filter", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/library" },
      writable: true,
    });
    useUIStore.setState((state) => ({
      filters: { ...state.filters, filterByRated: "unrated" },
    }));

    const result = buildPageContext();
    expect(result).toContain("filter:unrated");
  });
});
