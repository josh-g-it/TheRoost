import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { MediaSessionSnapshot, MediaBookmark } from "../../types";
import { mediaControlsApi, mediaBookmarksApi } from "../../services/tauri";
import { useOverlayVisible } from "./overlayVisibility";
import { AppIcon } from "../common/AppIcon";
import "./OverlayMediaControls.css";

const MEDIA_POLL_MS = 500;
const RAPID_POLL_FIRST_MS = 150;
const RAPID_POLL_SECOND_MS = 400;

/** Extracts a friendly source name from the AUMID. */
function formatSource(sourceAppId: string): string {
  if (!sourceAppId) return "";
  const name = sourceAppId.split("\\").pop()?.split("/").pop() ?? sourceAppId;
  return name.replace(/\.exe$/i, "");
}

// ── Carousel item sizing by distance from active ──────────────

const ITEM_BOX = 56;
const GAP = 12;
const STEP = ITEM_BOX + GAP;

function getItemStyle(index: number, activeIndex: number): React.CSSProperties {
  const distance = Math.abs(index - activeIndex);
  const scale = distance === 0 ? 1.0 : distance === 1 ? 0.75 : 0.55;
  const opacity = distance === 0 ? 1.0 : distance === 1 ? 0.6 : 0.3;
  return { transform: `scale(${scale})`, opacity };
}

function getFaviconSize(index: number, activeIndex: number): number {
  const distance = Math.abs(index - activeIndex);
  return distance === 0 ? 44 : distance === 1 ? 32 : 22;
}

// ── BookmarkFavicon with size prop ────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function BookmarkFavicon({
  bookmark,
  size = 32,
}: {
  bookmark: MediaBookmark;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);

  if (bookmark.icon) {
    return (
      <span className="media-carousel__emoji" style={{ fontSize: size * 0.85 }}>
        {bookmark.icon}
      </span>
    );
  }

  const domain = extractDomain(bookmark.url);
  if (!domain || imgError) {
    const letter = bookmark.title.charAt(0).toUpperCase() || "?";
    return (
      <span
        className="media-carousel__letter"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      className="media-carousel__favicon"
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=${Math.max(32, size)}`}
      alt=""
      width={size}
      height={size}
      onError={() => setImgError(true)}
    />
  );
}

// ── Emoji categories (full set from EmojiPicker) ─────────────

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Colors",
    emojis: [
      "🟥",
      "🟧",
      "🟨",
      "🟩",
      "🟦",
      "🟪",
      "🟫",
      "⬛",
      "⬜",
      "🔴",
      "🟠",
      "🟡",
      "🟢",
      "🔵",
      "🟣",
      "🟤",
      "⚫",
      "⚪",
    ],
  },
  {
    label: "Music",
    emojis: [
      "🎵",
      "🎶",
      "🎸",
      "🎹",
      "🥁",
      "🎺",
      "🎻",
      "🎤",
      "🎧",
      "🎼",
      "🎷",
      "📻",
      "📀",
      "💿",
      "🪗",
      "🪘",
      "🎚️",
      "🎛️",
    ],
  },
  {
    label: "Vibes",
    emojis: [
      "🔥",
      "❄️",
      "🌊",
      "⚡",
      "✨",
      "💫",
      "🌙",
      "☀️",
      "🌈",
      "🍂",
      "🌸",
      "☕",
      "🍷",
      "🌃",
      "🏖️",
      "🌌",
      "🎇",
      "💤",
    ],
  },
  {
    label: "Media",
    emojis: [
      "📺",
      "🎬",
      "🎥",
      "📹",
      "🎞️",
      "📡",
      "🔊",
      "🔉",
      "🔈",
      "🎙️",
      "📱",
      "💻",
      "🖥️",
      "📽️",
      "🎭",
      "📢",
    ],
  },
  {
    label: "Gaming",
    emojis: [
      "🎮",
      "🕹️",
      "👾",
      "🎯",
      "🏆",
      "🥇",
      "⚔️",
      "🛡️",
      "🗡️",
      "🧙",
      "🐉",
      "🚀",
      "🤖",
      "🎲",
      "♟️",
      "🃏",
    ],
  },
  {
    label: "Symbols",
    emojis: [
      "❤️",
      "💜",
      "💙",
      "💚",
      "💛",
      "🧡",
      "🖤",
      "🤍",
      "💎",
      "💡",
      "📌",
      "🔖",
      "📚",
      "🏠",
      "🎪",
      "⭐",
      "💥",
      "🔔",
      "🏁",
      "🎗️",
      "♾️",
      "⚜️",
      "🔱",
      "❇️",
    ],
  },
  {
    label: "Fun",
    emojis: [
      "😎",
      "🤘",
      "🎉",
      "🥳",
      "🤩",
      "😍",
      "🥰",
      "😊",
      "🤔",
      "👀",
      "💀",
      "👻",
      "🐔",
      "🦊",
      "🐺",
      "🦁",
      "🐱",
      "🐸",
      "🦄",
      "🐧",
      "🦉",
      "🎃",
      "👑",
      "🧸",
    ],
  },
];

// ── Inline Emoji Grid (categorized, scrollable) ──────────────

function InlineEmojiGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  return (
    <div className="media-carousel__emoji-section">
      <div className="media-carousel__emoji-header">
        <span className="media-carousel__emoji-label">Icon (optional)</span>
        {value && (
          <button
            className="media-carousel__emoji-clear"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onChange("")}
            type="button"
          >
            Clear {value}
          </button>
        )}
      </div>
      <div className="media-carousel__emoji-grid">
        {EMOJI_CATEGORIES.map((cat) => (
          <Fragment key={cat.label}>
            <span className="media-carousel__emoji-cat">{cat.label}</span>
            {cat.emojis.map((emoji) => (
              <button
                key={emoji}
                className={`media-carousel__emoji-btn${
                  value === emoji ? " media-carousel__emoji-btn--selected" : ""
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onChange(value === emoji ? "" : emoji)}
                type="button"
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Bookmark Carousel ─────────────────────────────────────────

interface BookmarkCarouselProps {
  bookmarks: MediaBookmark[];
  activeIndex: number;
  onSetActiveIndex: (i: number) => void;
  onOpenBookmark: (url: string) => void;
  onDeleteBookmark: (id: number) => void;
  showAddForm: boolean;
  onToggleAddForm: () => void;
  addTitle: string;
  addUrl: string;
  addIcon: string;
  onSetAddTitle: (v: string) => void;
  onSetAddUrl: (v: string) => void;
  onSetAddIcon: (v: string) => void;
  onSaveBookmark: () => void;
}

function BookmarkCarousel({
  bookmarks,
  activeIndex,
  onSetActiveIndex,
  onOpenBookmark,
  onDeleteBookmark,
  showAddForm,
  onToggleAddForm,
  addTitle,
  addUrl,
  addIcon,
  onSetAddTitle,
  onSetAddUrl,
  onSetAddIcon,
  onSaveBookmark,
}: BookmarkCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure viewport width
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setViewportWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Reset delete confirmation when active index changes
  useEffect(() => {
    setConfirmingDelete(false);
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, [activeIndex]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const count = bookmarks.length;

  // Compute translateX to center the active item.
  // For single items or before viewport measured, use no transform (CSS centers via justify-content).
  let trackTransform: string | undefined;
  if (count > 1 && viewportWidth > 0) {
    const activeCenter = activeIndex * STEP + ITEM_BOX / 2;
    const offsetPx = viewportWidth / 2 - activeCenter;
    trackTransform = `translateX(${offsetPx}px)`;
  }

  const handlePrev = useCallback(() => {
    if (count <= 1) return;
    onSetActiveIndex((activeIndex - 1 + count) % count);
  }, [activeIndex, count, onSetActiveIndex]);

  const handleNext = useCallback(() => {
    if (count <= 1) return;
    onSetActiveIndex((activeIndex + 1) % count);
  }, [activeIndex, count, onSetActiveIndex]);

  const handleItemClick = useCallback(
    (index: number) => {
      if (index === activeIndex) {
        onOpenBookmark(bookmarks[index].url);
      } else {
        onSetActiveIndex(index);
      }
    },
    [activeIndex, bookmarks, onOpenBookmark, onSetActiveIndex],
  );

  const handleDeleteClick = useCallback(() => {
    if (count === 0) return;
    const bm = bookmarks[activeIndex];
    if (!bm) return;

    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingDelete(false);
        confirmTimerRef.current = null;
      }, 3000);
      return;
    }

    // Second click: perform delete
    setConfirmingDelete(false);
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setDeletingId(bm.id);
    setTimeout(() => {
      onDeleteBookmark(bm.id);
      setDeletingId(null);
    }, 200);
  }, [activeIndex, bookmarks, count, confirmingDelete, onDeleteBookmark]);

  // ── Empty state ───────────────────────────────────────────
  if (count === 0 && !showAddForm) {
    return (
      <div className="media-carousel__empty">
        <span className="media-carousel__empty-text">No bookmarks yet</span>
        <button
          className="media-carousel__empty-add"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggleAddForm}
        >
          <AppIcon name="plus" size={14} />
          Add bookmark
        </button>
      </div>
    );
  }

  const activeBm = bookmarks[activeIndex];

  return (
    <>
      {/* Carousel */}
      {count > 0 && (
        <>
          <div className="media-carousel">
            {count > 1 && (
              <button
                className="media-carousel__arrow"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handlePrev}
                title="Previous"
              >
                <AppIcon name="chevron-left" size={14} />
              </button>
            )}

            <div
              className={`media-carousel__viewport${
                count <= 1 ? " media-carousel__viewport--single" : ""
              }`}
              ref={viewportRef}
            >
              <div
                className="media-carousel__track"
                style={trackTransform ? { transform: trackTransform } : undefined}
              >
                {bookmarks.map((bm, i) => (
                  <button
                    key={bm.id}
                    className={`media-carousel__item${
                      i === activeIndex ? " media-carousel__item--active" : ""
                    }${deletingId === bm.id ? " media-carousel__item--deleting" : ""}`}
                    style={getItemStyle(i, activeIndex)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => handleItemClick(i)}
                    title={bm.title}
                  >
                    <BookmarkFavicon
                      bookmark={bm}
                      size={getFaviconSize(i, activeIndex)}
                    />
                  </button>
                ))}
              </div>
            </div>

            {count > 1 && (
              <button
                className="media-carousel__arrow"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleNext}
                title="Next"
              >
                <AppIcon name="chevron-right" size={14} />
              </button>
            )}
          </div>

          {/* Label for active bookmark */}
          <span className="media-carousel__label">{activeBm?.title ?? ""}</span>

          {/* Actions bar */}
          <div className="media-carousel__actions">
            <button
              className="media-carousel__action-btn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onToggleAddForm}
              title="Add bookmark"
            >
              <AppIcon name="plus" size={14} />
            </button>

            {count <= 7 ? (
              <div className="media-carousel__dots">
                {bookmarks.map((_, i) => (
                  <span
                    key={i}
                    className={`media-carousel__dot${
                      i === activeIndex ? " media-carousel__dot--active" : ""
                    }`}
                  />
                ))}
              </div>
            ) : (
              <span className="media-carousel__counter">
                {activeIndex + 1} / {count}
              </span>
            )}

            <button
              className={`media-carousel__action-btn media-carousel__action-btn--danger${
                confirmingDelete ? " media-carousel__action-btn--confirming" : ""
              }`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleDeleteClick}
              title={
                confirmingDelete
                  ? `Click again to delete "${activeBm?.title}"`
                  : "Delete active bookmark"
              }
            >
              <AppIcon name="trash" size={14} />
              {confirmingDelete && "Confirm?"}
            </button>
          </div>
        </>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="media-carousel__add-form">
          <input
            className="media-carousel__input"
            type="text"
            placeholder="Title"
            value={addTitle}
            onChange={(e) => onSetAddTitle(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveBookmark();
              if (e.key === "Escape") onToggleAddForm();
            }}
            autoFocus
          />
          <input
            className="media-carousel__input"
            type="url"
            placeholder="https://..."
            value={addUrl}
            onChange={(e) => onSetAddUrl(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveBookmark();
              if (e.key === "Escape") onToggleAddForm();
            }}
          />
          <InlineEmojiGrid value={addIcon} onChange={onSetAddIcon} />
          <div className="media-carousel__form-actions">
            <button
              className="media-carousel__form-btn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onToggleAddForm}
            >
              Cancel
            </button>
            <button
              className="media-carousel__form-btn media-carousel__form-btn--save"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => {
                e.stopPropagation();
                onSaveBookmark();
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────

export function OverlayMediaControls() {
  const [session, setSession] = useState<MediaSessionSnapshot | null>(null);
  const [bookmarks, setBookmarks] = useState<MediaBookmark[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addIcon, setAddIcon] = useState("");
  const mountedRef = useRef(true);
  const isOverlayVisible = useOverlayVisible();

  // Refs for form values so the save handler always reads current state
  const addTitleRef = useRef(addTitle);
  addTitleRef.current = addTitle;
  const addUrlRef = useRef(addUrl);
  addUrlRef.current = addUrl;
  const addIconRef = useRef(addIcon);
  addIconRef.current = addIcon;
  const bookmarksLenRef = useRef(bookmarks.length);
  bookmarksLenRef.current = bookmarks.length;

  const fetchSession = useCallback(() => {
    mediaControlsApi
      .getSession()
      .then((data) => {
        if (mountedRef.current) setSession(data);
      })
      .catch(() => {});
  }, []);

  const fetchBookmarks = useCallback(() => {
    mediaBookmarksApi
      .getAll()
      .then((data) => {
        if (mountedRef.current) setBookmarks(data);
      })
      .catch(() => {});
  }, []);

  // Rapid poll after transport actions — the media player needs a moment to update state
  const rapidPollAfterAction = useCallback(() => {
    fetchSession();
    setTimeout(fetchSession, RAPID_POLL_FIRST_MS);
    setTimeout(fetchSession, RAPID_POLL_SECOND_MS);
  }, [fetchSession]);

  useEffect(() => {
    if (!isOverlayVisible) return; // Pause polling when overlay is hidden
    mountedRef.current = true;
    fetchSession();
    fetchBookmarks();
    const interval = setInterval(fetchSession, MEDIA_POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchSession, fetchBookmarks, isOverlayVisible]);

  // Clamp activeIndex when bookmarks change
  useEffect(() => {
    if (bookmarks.length > 0 && activeIndex >= bookmarks.length) {
      setActiveIndex(Math.max(0, bookmarks.length - 1));
    }
  }, [bookmarks.length, activeIndex]);

  const handleTogglePlayPause = useCallback(() => {
    mediaControlsApi
      .togglePlayPause()
      .then(rapidPollAfterAction)
      .catch(() => {});
  }, [rapidPollAfterAction]);

  const handleSkipNext = useCallback(() => {
    mediaControlsApi
      .skipNext()
      .then(rapidPollAfterAction)
      .catch(() => {});
  }, [rapidPollAfterAction]);

  const handleSkipPrevious = useCallback(() => {
    mediaControlsApi
      .skipPrevious()
      .then(rapidPollAfterAction)
      .catch(() => {});
  }, [rapidPollAfterAction]);

  const handleOpenBookmark = useCallback((url: string) => {
    mediaBookmarksApi.open(url).catch(() => {});
  }, []);

  // Uses refs instead of closure captures to guarantee we always read the
  // latest form values, avoiding stale-closure issues with useCallback.
  const handleAddBookmark = useCallback(() => {
    const trimmedTitle = addTitleRef.current.trim();
    const trimmedUrl = addUrlRef.current.trim();
    if (!trimmedTitle || !trimmedUrl) return;

    mediaBookmarksApi
      .add({
        title: trimmedTitle,
        url: trimmedUrl,
        icon: addIconRef.current.trim() || null,
      })
      .then(() => {
        setAddTitle("");
        setAddUrl("");
        setAddIcon("");
        setShowAddForm(false);
        fetchBookmarks();
        setActiveIndex(bookmarksLenRef.current);
      })
      .catch(() => {});
  }, [fetchBookmarks]);

  const handleDeleteBookmark = useCallback(
    (id: number) => {
      mediaBookmarksApi
        .delete(id)
        .then(() => {
          fetchBookmarks();
          setActiveIndex((prev) => {
            const newLen = bookmarksLenRef.current - 1;
            return prev >= newLen && prev > 0 ? prev - 1 : prev;
          });
        })
        .catch(() => {});
    },
    [fetchBookmarks],
  );

  const toggleAddForm = useCallback(() => {
    setShowAddForm((v) => !v);
  }, []);

  // ── Render ──────────────────────────────────────────────────

  const hasSession = session?.hasSession === true;
  const isPlaying = session?.status === "playing";
  const source = session ? formatSource(session.sourceAppId) : "";

  return (
    <div className="overlay-media">
      {/* ── Hero Area: Media Section (prominent, centered) ── */}
      <div className="overlay-media__hero">
        {hasSession ? (
          <>
            {session?.thumbnailB64 && (
              <img
                className="overlay-media__cover-art"
                src={`data:image/png;base64,${session.thumbnailB64}`}
                alt="Cover art"
              />
            )}
            <div className="overlay-media__track">
              <span className="overlay-media__title">
                {session?.title || "Unknown Track"}
              </span>
              <span className="overlay-media__subtitle">
                {session?.artist}
                {session?.artist && source && (
                  <span className="overlay-media__subtitle-sep">&middot;</span>
                )}
                {source}
              </span>
              {session?.album && (
                <span className="overlay-media__album">{session.album}</span>
              )}
            </div>

            {/* Transport Controls */}
            <div className="overlay-media__controls">
              <button
                className="overlay-media__btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleSkipPrevious}
                title="Previous"
              >
                <AppIcon name="chevron-left" size={22} />
              </button>
              <button
                className="overlay-media__btn overlay-media__btn--play"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleTogglePlayPause}
                title={isPlaying ? "Pause" : "Play"}
              >
                <AppIcon name={isPlaying ? "pause" : "play"} size={26} />
              </button>
              <button
                className="overlay-media__btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleSkipNext}
                title="Next"
              >
                <AppIcon name="chevron-right" size={22} />
              </button>
            </div>
          </>
        ) : (
          <div className="overlay-media__empty">
            <span className="overlay-media__empty-icon">
              <AppIcon name="music" size={32} />
            </span>
            <span className="overlay-media__empty-text">No media playing</span>
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="overlay-media__divider" />

      {/* ── Secondary: Bookmark Carousel ── */}
      <BookmarkCarousel
        bookmarks={bookmarks}
        activeIndex={activeIndex}
        onSetActiveIndex={setActiveIndex}
        onOpenBookmark={handleOpenBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        showAddForm={showAddForm}
        onToggleAddForm={toggleAddForm}
        addTitle={addTitle}
        addUrl={addUrl}
        addIcon={addIcon}
        onSetAddTitle={setAddTitle}
        onSetAddUrl={setAddUrl}
        onSetAddIcon={setAddIcon}
        onSaveBookmark={handleAddBookmark}
      />

      {bookmarks.length > 0 && !showAddForm && (
        <span className="media-carousel__tip">
          Click active icon to open &middot; YouTube playlists auto-play
        </span>
      )}
    </div>
  );
}

// ── Hook for dynamic visibility polling ──────────────────────
const VISIBILITY_POLL_MS = 3000;

export function useMediaSession(enabled: boolean): MediaSessionSnapshot | null {
  const [snapshot, setSnapshot] = useState<MediaSessionSnapshot | null>(null);
  const mountedRef = useRef(true);
  const isOverlayVisible = useOverlayVisible();

  useEffect(() => {
    if (!enabled || !isOverlayVisible) {
      if (!enabled) setSnapshot(null);
      return;
    }
    mountedRef.current = true;

    const fetch = () => {
      mediaControlsApi
        .getSession()
        .then((data) => {
          if (mountedRef.current) setSnapshot(data);
        })
        .catch(() => {});
    };
    fetch();
    const interval = setInterval(fetch, VISIBILITY_POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [enabled, isOverlayVisible]);

  return snapshot;
}
