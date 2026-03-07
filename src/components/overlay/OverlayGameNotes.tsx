import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Game, GameSession, GameNote } from "../../types";
import { GENERAL_NOTES_ID } from "../../types";
import "./OverlayGameNotes.css";

const AUTOSAVE_DEBOUNCE_MS = 500;

interface OverlayGameNotesProps {
  activeSessions: GameSession[];
  games: Game[];
}

export function OverlayGameNotes({ activeSessions, games }: OverlayGameNotesProps) {
  const activeGameId = activeSessions.length > 0 ? activeSessions[0].gameId : null;
  const activeGameName = activeGameId
    ? (games.find((g) => g.gameId === activeGameId)?.name ?? "Unknown Game")
    : null;

  const [activeTab, setActiveTab] = useState<"game" | "general">(
    activeGameId ? "game" : "general",
  );

  // If the active game changes, switch tab to game
  useEffect(() => {
    if (activeGameId) {
      setActiveTab("game");
    } else {
      setActiveTab("general");
    }
  }, [activeGameId]);

  const currentNoteId =
    activeTab === "game" && activeGameId ? activeGameId : GENERAL_NOTES_ID;

  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNoteIdRef = useRef(currentNoteId);
  currentNoteIdRef.current = currentNoteId;
  // Track the last save timestamp to deduplicate incoming note-changed events
  // that originated from this component's own saves.
  const lastLocalSaveTimestampRef = useRef<number>(0);

  // Load note when tab/game changes
  useEffect(() => {
    setIsLoading(true);
    invoke<GameNote | null>("get_game_note", { gameId: currentNoteId })
      .then((note) => {
        const text = note?.content ?? "";
        setContent(text);
        setLastSavedContent(text);
      })
      .catch(() => {
        setContent("");
        setLastSavedContent("");
      })
      .finally(() => setIsLoading(false));
  }, [currentNoteId]);

  // Listen for cross-window note changes (KI #16).
  // When the main app saves a note, Rust emits `note-changed` to all windows.
  // This listener updates the overlay's content if the changed note matches
  // the currently displayed note.
  useEffect(() => {
    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    listen<GameNote>("note-changed", (event) => {
      if (!isMounted) return;
      const changedNote = event.payload;
      if (changedNote.gameId !== currentNoteIdRef.current) return;

      // Dedup: skip if this event was triggered by our own save (within 2s window).
      // Our saves set lastLocalSaveTimestampRef; if the event's updatedAt is close
      // to our last save, it's our own echo.
      const eventTime = changedNote.updatedAt;
      if (Math.abs(eventTime - lastLocalSaveTimestampRef.current) <= 2) {
        return;
      }

      // Update content from the other window's save
      setContent(changedNote.content);
      setLastSavedContent(changedNote.content);
    }).then((fn) => {
      if (isMounted) {
        unlistenFn = fn;
      } else {
        fn();
      }
    });

    return () => {
      isMounted = false;
      unlistenFn?.();
    };
  }, [currentNoteId]);

  const saveNote = useCallback((text: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Record the timestamp of our own save for dedup
      lastLocalSaveTimestampRef.current = Math.floor(Date.now() / 1000);
      invoke("save_game_note", {
        gameId: currentNoteIdRef.current,
        content: text,
      })
        .then(() => setLastSavedContent(text))
        .catch(() => {});
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);
    saveNote(text);
  };

  const isDirty = content !== lastSavedContent;

  return (
    <div className="overlay-notes">
      <div className="overlay-notes__tabs">
        {activeGameId && (
          <button
            className={`overlay-notes__tab ${activeTab === "game" ? "overlay-notes__tab--active" : ""}`}
            onClick={() => setActiveTab("game")}
          >
            {activeGameName}
          </button>
        )}
        <button
          className={`overlay-notes__tab ${activeTab === "general" ? "overlay-notes__tab--active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          General
        </button>
      </div>
      <textarea
        className="overlay-notes__textarea"
        value={content}
        onChange={handleChange}
        placeholder={
          activeTab === "game" ? "Notes for this game..." : "General scratchpad..."
        }
        disabled={isLoading}
        spellCheck={false}
      />
      <div className="overlay-notes__footer">
        <span className="overlay-notes__char-count">
          {content.length.toLocaleString()} chars
        </span>
        <span
          className={`overlay-notes__save-status ${isDirty ? "overlay-notes__save-status--dirty" : ""}`}
        >
          {isDirty ? "Saving..." : "Saved"}
        </span>
      </div>
    </div>
  );
}
