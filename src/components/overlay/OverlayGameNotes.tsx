import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

  const saveNote = useCallback((text: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
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
