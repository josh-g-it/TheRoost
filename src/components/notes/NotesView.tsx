import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "../layout/Header";
import { useNotesStore } from "../../store/notesSlice";
import { useLibraryStore } from "../../store/librarySlice";
import { GENERAL_NOTES_ID } from "../../types/note";
import type { GameNoteWithName } from "../../types";
import { AppIcon } from "../common/AppIcon";
import "./NotesView.css";

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NoteCard({
  note,
  onSave,
  onDelete,
  autoExpand,
  onExpanded,
}: {
  note: GameNoteWithName;
  onSave: (gameId: string, content: string) => void;
  onDelete: (gameId: string) => void;
  autoExpand?: boolean;
  onExpanded?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand for newly created notes
  useEffect(() => {
    if (autoExpand && !expanded) {
      setExpanded(true);
      onExpanded?.();
      // Focus textarea after render
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [autoExpand]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editContent, setEditContent] = useState(note.content);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync content when note changes from external source
  useEffect(() => {
    if (!expanded) {
      setEditContent(note.content);
    }
  }, [note.content, expanded]);

  const isGeneral = note.gameId === GENERAL_NOTES_ID;
  const displayName = isGeneral ? "General Notes" : (note.gameName ?? "Unknown Game");
  const preview = note.content.slice(0, 120) + (note.content.length > 120 ? "..." : "");

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setEditContent(text);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onSave(note.gameId, text);
    }, 500);
  };

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div
      className={`note-card ${expanded ? "note-card--expanded" : ""} ${isGeneral ? "note-card--general" : ""}`}
    >
      <button className="note-card__header" onClick={() => setExpanded(!expanded)}>
        <div className="note-card__header-left">
          <AppIcon name="notes" size={16} />
          <span className="note-card__name">{displayName}</span>
          {isGeneral && <span className="note-card__badge">Pinned</span>}
        </div>
        <div className="note-card__header-right">
          <span className="note-card__date">{formatTimestamp(note.updatedAt)}</span>
          <AppIcon name={expanded ? "chevron-up" : "chevron-down"} size={14} />
        </div>
      </button>
      {!expanded && <p className="note-card__preview">{preview}</p>}
      {expanded && (
        <div className="note-card__body">
          <textarea
            ref={textareaRef}
            className="note-card__textarea"
            value={editContent}
            onChange={handleChange}
            rows={8}
            spellCheck={false}
          />
          <div className="note-card__actions">
            <span className="note-card__char-count">
              {editContent.length.toLocaleString()} chars
            </span>
            {!isGeneral && !confirmingDelete && (
              <button
                className="note-card__delete"
                onClick={() => setConfirmingDelete(true)}
              >
                <AppIcon name="trash" size={14} /> Delete
              </button>
            )}
            {confirmingDelete && (
              <div className="note-card__confirm">
                <span className="note-card__confirm-text">Delete this note?</span>
                <button
                  className="note-card__confirm-yes"
                  onClick={() => {
                    onDelete(note.gameId);
                    setExpanded(false);
                    setConfirmingDelete(false);
                  }}
                >
                  Yes, delete
                </button>
                <button
                  className="note-card__confirm-no"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GameSearch({
  onSelect,
  onCancel,
  existingNoteIds,
}: {
  onSelect: (gameId: string, gameName: string) => void;
  onCancel: () => void;
  existingNoteIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const games = useLibraryStore((s) => s.library?.games ?? []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return games
      .filter((g) => g.name.toLowerCase().includes(q) && !existingNoteIds.has(g.gameId))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      .slice(0, 12);
  }, [query, games, existingNoteIds]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        const game = filtered[selectedIndex];
        onSelect(game.gameId, game.name);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [filtered, selectedIndex, onSelect, onCancel],
  );

  return (
    <div className="game-search">
      <div className="game-search__input-row">
        <AppIcon name="search" size={16} />
        <input
          ref={inputRef}
          className="game-search__input"
          type="text"
          placeholder="Search your games..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
        <button className="game-search__cancel" onClick={onCancel} title="Cancel">
          <AppIcon name="close" size={14} />
        </button>
      </div>
      {query.trim() && (
        <div className="game-search__results" ref={listRef}>
          {filtered.length === 0 && (
            <p className="game-search__no-results">No matching games found</p>
          )}
          {filtered.map((game, idx) => (
            <button
              key={game.gameId}
              className={`game-search__result ${idx === selectedIndex ? "game-search__result--selected" : ""}`}
              onClick={() => onSelect(game.gameId, game.name)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <span className="game-search__result-name">{game.name}</span>
              <span className="game-search__result-source">{game.source}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotesView() {
  const {
    notes,
    isLoading,
    loadNotes,
    saveNote,
    deleteNote,
    scrollTarget,
    setScrollTarget,
  } = useNotesStore();
  const [showSearch, setShowSearch] = useState(false);
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Consume scrollTarget from command palette "Open Game Notes" action
  useEffect(() => {
    if (scrollTarget) {
      setNewlyCreatedId(scrollTarget);
      setScrollTarget(null);
    }
  }, [scrollTarget, setScrollTarget]);

  const existingNoteIds = useMemo(() => new Set(notes.map((n) => n.gameId)), [notes]);

  const handleCreateNote = useCallback((gameId: string, gameName: string) => {
    setShowSearch(false);
    // Optimistically add the note to the store so it appears immediately.
    // The backend will persist it on the first keystroke (debounced save).
    useNotesStore.setState((s) => ({
      notes: [
        ...s.notes,
        {
          gameId,
          gameName,
          content: "",
          updatedAt: Math.floor(Date.now() / 1000),
        },
      ],
    }));
    setNewlyCreatedId(gameId);
  }, []);

  return (
    <div className="notes-view">
      <Header
        title="Notes"
        subtitle={`${notes.length} note${notes.length !== 1 ? "s" : ""}`}
      />
      <div className="notes-view__content">
        <div className="notes-view__toolbar">
          <button
            className="notes-view__create-btn"
            onClick={() => setShowSearch(!showSearch)}
          >
            <AppIcon name="plus" size={14} />
            Create New Note
          </button>
        </div>
        {showSearch && (
          <GameSearch
            onSelect={handleCreateNote}
            onCancel={() => setShowSearch(false)}
            existingNoteIds={existingNoteIds}
          />
        )}
        {isLoading && notes.length === 0 && (
          <p className="notes-view__empty">Loading...</p>
        )}
        {!isLoading && notes.length === 0 && (
          <div className="notes-view__empty">
            <AppIcon name="notes" size={48} />
            <p>No notes yet.</p>
            <p className="notes-view__empty-hint">
              Click "Create New Note" above to start writing, or jot something down from
              the overlay or a game's detail page.
            </p>
          </div>
        )}
        {notes.map((note) => (
          <NoteCard
            key={note.gameId}
            note={note}
            onSave={saveNote}
            onDelete={deleteNote}
            autoExpand={note.gameId === newlyCreatedId}
            onExpanded={() => {
              if (note.gameId === newlyCreatedId) setNewlyCreatedId(null);
            }}
          />
        ))}
        {!isLoading && notes.length > 0 && (
          <p className="notes-view__footer-hint">
            {notes.every((n) => n.gameId === GENERAL_NOTES_ID)
              ? 'No game notes yet — click "Create New Note" to add one, or jot something down from the overlay while playing.'
              : "That's all your notes! Create more from here or use the overlay while in-game."}
          </p>
        )}
      </div>
    </div>
  );
}
