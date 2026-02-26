import { describe, it, expect, vi, beforeEach } from "vitest";
import { useNewsStore } from "./newsSlice";
import type { FeedNewsItem } from "../types";

// Mock tauri service
vi.mock("../services/tauri", () => ({
  newsApi: {
    fetchGameNews: vi.fn().mockResolvedValue([]),
    fetchFollowedGames: vi.fn().mockResolvedValue([]),
    fetchNewsFeed: vi.fn().mockResolvedValue([]),
    markNewsRead: vi.fn().mockResolvedValue(undefined),
    getUnreadNewsCount: vi.fn().mockResolvedValue(0),
  },
}));

// Need to import after mock so we get the mocked version
import { newsApi } from "../services/tauri";

function makeFeedItem(overrides: Partial<FeedNewsItem> = {}): FeedNewsItem {
  return {
    newsId: "news-1",
    gameId: "g1",
    gameName: "Test Game",
    sourceId: "12345",
    title: "Test Article",
    url: "https://example.com/article",
    author: "Author",
    contents: "Article content",
    date: 1700000000,
    feedLabel: "Community",
    isExternal: false,
    isRead: false,
    ...overrides,
  };
}

describe("newsSlice — feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useNewsStore.setState({
      cache: new Map(),
      loading: new Set(),
      followedGameIds: null,
      feed: [],
      feedLoading: false,
      feedError: null,
      unreadCount: 0,
    });
  });

  it("fetchNewsFeed populates feed and computes unreadCount", async () => {
    const items = [
      makeFeedItem({ newsId: "n1", isRead: false }),
      makeFeedItem({ newsId: "n2", isRead: true }),
      makeFeedItem({ newsId: "n3", isRead: false }),
    ];
    vi.mocked(newsApi.fetchNewsFeed).mockResolvedValueOnce(items);

    await useNewsStore.getState().fetchNewsFeed();

    const state = useNewsStore.getState();
    expect(state.feed).toHaveLength(3);
    expect(state.unreadCount).toBe(2);
    expect(state.feedLoading).toBe(false);
    expect(state.feedError).toBeNull();
  });

  it("fetchNewsFeed sets feedLoading during fetch", async () => {
    let resolvePromise: (value: FeedNewsItem[]) => void;
    const promise = new Promise<FeedNewsItem[]>((r) => {
      resolvePromise = r;
    });
    vi.mocked(newsApi.fetchNewsFeed).mockReturnValueOnce(promise);

    const fetchPromise = useNewsStore.getState().fetchNewsFeed();
    expect(useNewsStore.getState().feedLoading).toBe(true);

    resolvePromise!([]);
    await fetchPromise;
    expect(useNewsStore.getState().feedLoading).toBe(false);
  });

  it("fetchNewsFeed sets feedError on failure", async () => {
    vi.mocked(newsApi.fetchNewsFeed).mockRejectedValueOnce(new Error("Network error"));

    await useNewsStore.getState().fetchNewsFeed();

    const state = useNewsStore.getState();
    expect(state.feedError).toBe("Network error");
    expect(state.feedLoading).toBe(false);
  });

  it("fetchNewsFeed deduplicates concurrent calls", async () => {
    vi.mocked(newsApi.fetchNewsFeed).mockResolvedValue([]);

    // Call twice in quick succession
    const p1 = useNewsStore.getState().fetchNewsFeed();
    const p2 = useNewsStore.getState().fetchNewsFeed();
    await Promise.all([p1, p2]);

    expect(newsApi.fetchNewsFeed).toHaveBeenCalledTimes(1);
  });

  it("markNewsRead updates item and decrements unreadCount", async () => {
    const items = [
      makeFeedItem({ newsId: "n1", isRead: false }),
      makeFeedItem({ newsId: "n2", isRead: false }),
    ];
    useNewsStore.setState({ feed: items, unreadCount: 2 });

    await useNewsStore.getState().markNewsRead("n1", "g1");

    const state = useNewsStore.getState();
    expect(state.feed[0].isRead).toBe(true);
    expect(state.feed[1].isRead).toBe(false);
    expect(state.unreadCount).toBe(1);
    expect(newsApi.markNewsRead).toHaveBeenCalledWith("n1", "g1");
  });

  it("markAllFeedRead marks all items and sets unreadCount to 0", async () => {
    const items = [
      makeFeedItem({ newsId: "n1", gameId: "g1", isRead: false }),
      makeFeedItem({ newsId: "n2", gameId: "g2", isRead: false }),
      makeFeedItem({ newsId: "n3", gameId: "g1", isRead: true }),
    ];
    useNewsStore.setState({ feed: items, unreadCount: 2 });

    await useNewsStore.getState().markAllFeedRead();

    const state = useNewsStore.getState();
    expect(state.feed.every((i) => i.isRead)).toBe(true);
    expect(state.unreadCount).toBe(0);
    // Should only call markNewsRead for unread items
    expect(newsApi.markNewsRead).toHaveBeenCalledTimes(2);
  });

  it("markAllFeedRead is no-op when nothing unread", async () => {
    const items = [makeFeedItem({ newsId: "n1", isRead: true })];
    useNewsStore.setState({ feed: items, unreadCount: 0 });

    await useNewsStore.getState().markAllFeedRead();

    expect(newsApi.markNewsRead).not.toHaveBeenCalled();
  });

  it("refreshUnreadCount fetches from API", async () => {
    vi.mocked(newsApi.getUnreadNewsCount).mockResolvedValueOnce(42);

    await useNewsStore.getState().refreshUnreadCount();

    expect(useNewsStore.getState().unreadCount).toBe(42);
  });
});
