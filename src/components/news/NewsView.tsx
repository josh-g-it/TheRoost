import { useEffect, useCallback, useState, useMemo } from "react";
import { Header } from "../layout/Header";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { AppIcon } from "../common/AppIcon";
import { NewsArticleCard } from "./NewsArticleCard";
import { NewsGameFilter } from "./NewsGameFilter";
import { NewsArticleDetail } from "./NewsArticleDetail";
import { useNewsStore } from "../../store/newsSlice";
import type { FeedNewsItem } from "../../types";
import "./NewsView.css";

type SourceFilter = "all" | "official" | "third-party";

const SOURCE_FILTER_LABELS: Record<SourceFilter, string> = {
  all: "All Sources",
  official: "Official Only",
  "third-party": "Third Party Only",
};

export function NewsView() {
  const feed = useNewsStore((s) => s.feed);
  const feedLoading = useNewsStore((s) => s.feedLoading);
  const feedError = useNewsStore((s) => s.feedError);
  const fetchNewsFeed = useNewsStore((s) => s.fetchNewsFeed);
  const markNewsRead = useNewsStore((s) => s.markNewsRead);
  const markAllFeedRead = useNewsStore((s) => s.markAllFeedRead);

  const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [expandedArticle, setExpandedArticle] = useState<FeedNewsItem | null>(null);

  useEffect(() => {
    fetchNewsFeed();
  }, [fetchNewsFeed]);

  // Derive unique games from feed for the filter dropdown
  const feedGames = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of feed) map.set(item.gameId, item.gameName);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [feed]);

  // Check if feed has both source types (only show filter if relevant)
  const hasExternal = useMemo(() => feed.some((i) => i.isExternal), [feed]);
  const hasOfficial = useMemo(() => feed.some((i) => !i.isExternal), [feed]);
  const showSourceFilter = hasExternal && hasOfficial;

  // Apply all filters
  const filteredFeed = useMemo(() => {
    let result = feed;
    if (selectedGameIds.size > 0) {
      result = result.filter((item) => selectedGameIds.has(item.gameId));
    }
    if (sourceFilter === "official") {
      result = result.filter((item) => !item.isExternal);
    } else if (sourceFilter === "third-party") {
      result = result.filter((item) => item.isExternal);
    }
    return result;
  }, [feed, selectedGameIds, sourceFilter]);

  const isFiltering = selectedGameIds.size > 0 || sourceFilter !== "all";
  const unreadCount = feed.filter((i) => !i.isRead).length;

  const handleSelect = useCallback(
    (item: FeedNewsItem) => {
      if (!item.isRead) {
        markNewsRead(item.newsId, item.gameId);
      }
      setExpandedArticle(item);
    },
    [markNewsRead],
  );

  const handleCloseDetail = useCallback(() => {
    setExpandedArticle(null);
  }, []);

  return (
    <div className="news-view">
      <Header
        title="News Feed"
        subtitle={
          feed.length > 0
            ? `${filteredFeed.length}${isFiltering ? ` of ${feed.length}` : ""} articles${unreadCount > 0 ? ` \u00b7 ${unreadCount} unread` : ""}`
            : undefined
        }
        actions={
          <>
            {feedGames.length > 1 && (
              <NewsGameFilter
                games={feedGames}
                selected={selectedGameIds}
                onChange={setSelectedGameIds}
              />
            )}
            {showSourceFilter && (
              <div className="news-source-filter">
                {(Object.keys(SOURCE_FILTER_LABELS) as SourceFilter[]).map((key) => (
                  <button
                    key={key}
                    className={`news-source-filter__btn${sourceFilter === key ? " news-source-filter__btn--active" : ""}`}
                    onClick={() => setSourceFilter(key)}
                  >
                    {SOURCE_FILTER_LABELS[key]}
                  </button>
                ))}
              </div>
            )}
            {unreadCount > 0 && (
              <button
                className="news-view__action-btn"
                onClick={markAllFeedRead}
                title="Mark all as read"
              >
                <AppIcon name="eye" size={14} />
                Mark All Read
              </button>
            )}
            <button
              className="news-view__action-btn"
              onClick={() => fetchNewsFeed(true)}
              disabled={feedLoading}
              title="Refresh feed (bypass cache)"
            >
              <AppIcon name="refresh" size={14} />
              Refresh
            </button>
          </>
        }
      />

      <div className="news-view__content">
        {feedLoading && feed.length === 0 && (
          <LoadingSpinner size="md" message="Loading news feed..." />
        )}

        {feedError && !feedLoading && (
          <div className="news-view__error">
            <p>Failed to load news feed: {feedError}</p>
            <button className="news-view__action-btn" onClick={() => fetchNewsFeed(true)}>
              Try Again
            </button>
          </div>
        )}

        {!feedLoading && !feedError && feed.length === 0 && (
          <div className="news-view__empty">
            <AppIcon name="news" size={48} />
            <h3>No news yet</h3>
            <p>
              Favorite some games or play recently to populate your news feed. Articles
              from your Steam games will appear here.
            </p>
          </div>
        )}

        {feed.length > 0 && (
          <div className="news-view__feed">
            {filteredFeed.map((item) => (
              <NewsArticleCard key={item.newsId} item={item} onSelect={handleSelect} />
            ))}
          </div>
        )}
      </div>

      {expandedArticle && (
        <NewsArticleDetail item={expandedArticle} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
