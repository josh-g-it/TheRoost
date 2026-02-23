import { useState, useEffect, useCallback } from "react";
import type { MediaBookmark } from "../../types";
import { mediaBookmarksApi } from "../../services/tauri";
import { AppIcon } from "../common/AppIcon";
import { EmojiPicker } from "../common/EmojiPicker";
import "./BookmarkManager.css";

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function BookmarkIcon({ bookmark }: { bookmark: MediaBookmark }) {
  const [imgError, setImgError] = useState(false);

  if (bookmark.icon) {
    return <span className="bm-mgr__icon-emoji">{bookmark.icon}</span>;
  }

  const domain = extractDomain(bookmark.url);
  if (!domain || imgError) {
    const letter = bookmark.title.charAt(0).toUpperCase() || "?";
    return <span className="bm-mgr__icon-letter">{letter}</span>;
  }

  return (
    <img
      className="bm-mgr__icon-favicon"
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      width={16}
      height={16}
      onError={() => setImgError(true)}
    />
  );
}

export function BookmarkManager() {
  const [bookmarks, setBookmarks] = useState<MediaBookmark[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editIcon, setEditIcon] = useState("");

  const fetchBookmarks = useCallback(() => {
    mediaBookmarksApi
      .getAll()
      .then(setBookmarks)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const handleAdd = async () => {
    const trimmedTitle = newTitle.trim();
    const trimmedUrl = newUrl.trim();
    if (!trimmedTitle || !trimmedUrl) return;

    await mediaBookmarksApi.add({
      title: trimmedTitle,
      url: trimmedUrl,
      icon: newIcon.trim() || null,
    });
    setNewTitle("");
    setNewUrl("");
    setNewIcon("");
    fetchBookmarks();
  };

  const handleStartEdit = (bm: MediaBookmark) => {
    setEditingId(bm.id);
    setEditTitle(bm.title);
    setEditUrl(bm.url);
    setEditIcon(bm.icon ?? "");
  };

  const handleSaveEdit = async () => {
    if (editingId === null) return;
    const trimmedTitle = editTitle.trim();
    const trimmedUrl = editUrl.trim();
    if (!trimmedTitle || !trimmedUrl) return;

    await mediaBookmarksApi.update({
      id: editingId,
      title: trimmedTitle,
      url: trimmedUrl,
      icon: editIcon.trim() || null,
    });
    setEditingId(null);
    fetchBookmarks();
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleDelete = async (id: number) => {
    await mediaBookmarksApi.delete(id);
    fetchBookmarks();
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const ids = bookmarks.map((b) => b.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    await mediaBookmarksApi.reorder({ bookmarkIds: ids });
    fetchBookmarks();
  };

  const handleMoveDown = async (index: number) => {
    if (index >= bookmarks.length - 1) return;
    const ids = bookmarks.map((b) => b.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    await mediaBookmarksApi.reorder({ bookmarkIds: ids });
    fetchBookmarks();
  };

  return (
    <div className="bm-mgr">
      {/* ── Bookmark List ──────────────────────────────────── */}
      {bookmarks.length === 0 && (
        <p className="bm-mgr__empty">No bookmarks yet. Add one below.</p>
      )}

      {bookmarks.map((bm, idx) => (
        <div key={bm.id} className="bm-mgr__row">
          {editingId === bm.id ? (
            <div className="bm-mgr__edit-form">
              <input
                className="bm-mgr__input"
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Title"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") handleCancelEdit();
                }}
                autoFocus
              />
              <input
                className="bm-mgr__input"
                type="url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") handleCancelEdit();
                }}
              />
              <EmojiPicker value={editIcon} onChange={setEditIcon} />
              <div className="bm-mgr__edit-actions">
                <button
                  className="bm-mgr__btn bm-mgr__btn--save"
                  onClick={handleSaveEdit}
                >
                  Save
                </button>
                <button className="bm-mgr__btn" onClick={handleCancelEdit}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <BookmarkIcon bookmark={bm} />
              <div className="bm-mgr__info">
                <span className="bm-mgr__title">{bm.title}</span>
                <span className="bm-mgr__url">{bm.url}</span>
              </div>
              <div className="bm-mgr__actions">
                <button
                  className="bm-mgr__icon-btn"
                  onClick={() => handleMoveUp(idx)}
                  disabled={idx === 0}
                  title="Move up"
                >
                  <AppIcon name="chevron-up" size={14} />
                </button>
                <button
                  className="bm-mgr__icon-btn"
                  onClick={() => handleMoveDown(idx)}
                  disabled={idx === bookmarks.length - 1}
                  title="Move down"
                >
                  <AppIcon name="chevron-down" size={14} />
                </button>
                <button
                  className="bm-mgr__icon-btn"
                  onClick={() => handleStartEdit(bm)}
                  title="Edit"
                >
                  <AppIcon name="edit" size={14} />
                </button>
                <button
                  className="bm-mgr__icon-btn bm-mgr__icon-btn--danger"
                  onClick={() => handleDelete(bm.id)}
                  title="Delete"
                >
                  <AppIcon name="trash" size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {/* ── Add Form ───────────────────────────────────────── */}
      <div className="bm-mgr__add-form">
        <input
          className="bm-mgr__input"
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Title"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <input
          className="bm-mgr__input"
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://..."
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <EmojiPicker value={newIcon} onChange={setNewIcon} />
        <button
          className="bm-mgr__btn bm-mgr__btn--save"
          onClick={handleAdd}
          disabled={!newTitle.trim() || !newUrl.trim()}
        >
          Add Bookmark
        </button>
      </div>
    </div>
  );
}
