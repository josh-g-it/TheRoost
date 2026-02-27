import { useCallback, useEffect, useState } from "react";
import type { AiDailyLog } from "../../types";
import { assistantApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { AppIcon } from "../common/AppIcon";
import "./AssistantJournals.css";

interface AssistantJournalsProps {
  avatarId: string;
}

export function AssistantJournals({ avatarId }: AssistantJournalsProps) {
  const [entries, setEntries] = useState<AiDailyLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const loadJournal = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await assistantApi.getJournal(avatarId);
      const sorted = [...data].sort(
        (a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime(),
      );
      setEntries(sorted);
    } catch (err) {
      setError(getErrorMessage(err));
      logger.error("AssistantJournals", "api", "Failed to load journal", {
        error: getErrorMessage(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, [avatarId]);

  useEffect(() => {
    loadJournal();
  }, [loadJournal]);

  const handleDelete = useCallback(async (entryId: string) => {
    try {
      await assistantApi.deleteJournalEntry(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setConfirmingDelete(null);
      logger.info("AssistantJournals", "api", "Journal entry deleted", { entryId });
    } catch (err) {
      logger.error("AssistantJournals", "api", "Failed to delete journal entry", {
        error: getErrorMessage(err),
      });
    }
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="assistant-journals">
      <div className="assistant-journals__list">
        {isLoading && (
          <div className="assistant-journals__empty">
            <p>Loading journal...</p>
          </div>
        )}
        {error && (
          <div className="assistant-journals__empty">
            <p>{error}</p>
          </div>
        )}
        {!isLoading && !error && entries.length === 0 && (
          <div className="assistant-journals__empty">
            <AppIcon name="notes" size={48} />
            <p>
              No journal entries yet. Your assistant writes daily summaries of your
              conversations.
            </p>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="journal-entry">
            <div className="journal-entry__header">
              <span className="journal-entry__date">{formatDate(entry.logDate)}</span>
              {confirmingDelete !== entry.id && (
                <button
                  className="journal-entry__delete"
                  onClick={() => setConfirmingDelete(entry.id)}
                >
                  <AppIcon name="trash" size={12} /> Delete
                </button>
              )}
            </div>
            <p className="journal-entry__summary">{entry.summary}</p>
            {confirmingDelete === entry.id && (
              <div className="journal-entry__confirm">
                <span className="journal-entry__confirm-text">
                  Delete this journal entry?
                </span>
                <button
                  className="journal-entry__confirm-yes"
                  onClick={() => handleDelete(entry.id)}
                >
                  Yes, delete
                </button>
                <button
                  className="journal-entry__confirm-no"
                  onClick={() => setConfirmingDelete(null)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
