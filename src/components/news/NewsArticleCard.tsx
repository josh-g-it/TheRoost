import { useCallback, useMemo } from "react";
import type { FeedNewsItem } from "../../types";
import { GameImage } from "../library/GameImage";
import { formatRelativeTime } from "../../utils/formatters";
import { stripMarkup } from "../../utils/steamBBCode";

interface NewsArticleCardProps {
  item: FeedNewsItem;
  onSelect: (item: FeedNewsItem) => void;
}

export function NewsArticleCard({ item, onSelect }: NewsArticleCardProps) {
  const handleClick = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);

  const snippet = useMemo(
    () => (item.contents ? stripMarkup(item.contents) : ""),
    [item.contents],
  );

  return (
    <article
      className={`news-article-card${item.isRead ? "" : " news-article-card--unread"}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="news-article-card__hero">
        <GameImage
          gameId={item.gameId}
          sourceId={item.sourceId}
          source="steam"
          name={item.gameName}
          type="header"
        />
      </div>
      <div className="news-article-card__body">
        <div className="news-article-card__meta">
          <span className="news-article-card__game">{item.gameName}</span>
          <span className="news-article-card__separator">·</span>
          <span className="news-article-card__source">{item.feedLabel}</span>
          <span className="news-article-card__separator">·</span>
          <span className="news-article-card__date">{formatRelativeTime(item.date)}</span>
        </div>
        <h3 className="news-article-card__title">{item.title}</h3>
        {item.author && (
          <span className="news-article-card__author">by {item.author}</span>
        )}
        {snippet && <p className="news-article-card__snippet">{snippet}</p>}
      </div>
    </article>
  );
}
