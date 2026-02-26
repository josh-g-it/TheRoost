import { useEffect, useCallback, useMemo } from "react";
import { open } from "@tauri-apps/plugin-shell";
import type { FeedNewsItem } from "../../types";
import { GameImage } from "../library/GameImage";
import { formatRelativeTime } from "../../utils/formatters";
import { parseNewsContent } from "../../utils/steamBBCode";

interface NewsArticleDetailProps {
  item: FeedNewsItem;
  onClose: () => void;
}

export function NewsArticleDetail({ item, onClose }: NewsArticleDetailProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleOpenInBrowser = useCallback(() => {
    open(item.url).catch(() => {});
  }, [item.url]);

  const bodyHtml = useMemo(
    () => (item.contents ? parseNewsContent(item.contents) : ""),
    [item.contents],
  );

  return (
    <div className="news-detail-overlay" onClick={onClose}>
      <div className="news-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="news-detail__hero">
          <GameImage
            gameId={item.gameId}
            sourceId={item.sourceId}
            source="steam"
            name={item.gameName}
            type="header"
          />
        </div>

        <div className="news-detail__content">
          <div className="news-detail__meta">
            <span className="news-detail__meta-game">{item.gameName}</span>
            <span className="news-detail__meta-separator">·</span>
            <span>{item.feedLabel}</span>
            <span className="news-detail__meta-separator">·</span>
            <span>{formatRelativeTime(item.date)}</span>
          </div>

          <h2 className="news-detail__title">{item.title}</h2>

          {item.author && <div className="news-detail__author">by {item.author}</div>}

          {bodyHtml && (
            <div
              className="news-detail__body"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          )}
        </div>

        <div className="news-detail__actions">
          <button className="news-detail__btn" onClick={onClose}>
            Close
          </button>
          <button
            className="news-detail__btn news-detail__btn--primary"
            onClick={handleOpenInBrowser}
          >
            Open in Browser
          </button>
        </div>
      </div>
    </div>
  );
}
