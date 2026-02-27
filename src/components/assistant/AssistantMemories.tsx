import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiMemory } from "../../types";
import { assistantApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { AppIcon } from "../common/AppIcon";
import "./AssistantMemories.css";

const CATEGORIES = ["all", "preference", "opinion", "fact", "general", "system"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

interface AssistantMemoriesProps {
  avatarId: string;
}

export function AssistantMemories({ avatarId }: AssistantMemoriesProps) {
  const [memories, setMemories] = useState<AiMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await assistantApi.getMemories(avatarId);
      setMemories(data);
    } catch (err) {
      setError(getErrorMessage(err));
      logger.error("AssistantMemories", "api", "Failed to load memories", {
        error: getErrorMessage(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, [avatarId]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleDelete = useCallback(async (memoryId: string) => {
    try {
      await assistantApi.deleteMemory(memoryId);
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));
      setConfirmingDelete(null);
      logger.info("AssistantMemories", "api", "Memory deleted", { memoryId });
    } catch (err) {
      logger.error("AssistantMemories", "api", "Failed to delete memory", {
        error: getErrorMessage(err),
      });
    }
  }, []);

  const filtered = useMemo(() => {
    let result = memories;
    if (categoryFilter !== "all") {
      result = result.filter((m) => m.category === categoryFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((m) => m.content.toLowerCase().includes(q));
    }
    return result;
  }, [memories, categoryFilter, searchQuery]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="assistant-memories">
      <div className="assistant-memories__toolbar">
        <input
          className="assistant-memories__search"
          type="text"
          placeholder="Search memories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="assistant-memories__chips">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`assistant-memories__chip ${categoryFilter === cat ? "assistant-memories__chip--active" : ""}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="assistant-memories__list">
        {isLoading && (
          <div className="assistant-memories__empty">
            <p>Loading memories...</p>
          </div>
        )}
        {error && (
          <div className="assistant-memories__empty">
            <p>{error}</p>
          </div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="assistant-memories__empty">
            <AppIcon name="sparkle" size={48} />
            <p>
              {memories.length === 0
                ? "No memories yet. Your assistant will remember important things from your conversations."
                : "No memories match your filters."}
            </p>
          </div>
        )}
        {filtered.map((memory) => (
          <div
            key={memory.id}
            className={`memory-card ${memory.isSystem ? "memory-card--system" : ""}`}
          >
            <p className="memory-card__content">{memory.content}</p>
            <div className="memory-card__meta">
              <span className="memory-card__category">{memory.category}</span>
              <span className="memory-card__importance">
                Importance: {memory.importance}
              </span>
              <span className="memory-card__date">{formatDate(memory.createdAt)}</span>
              {!memory.isSystem && confirmingDelete !== memory.id && (
                <button
                  className="memory-card__delete"
                  onClick={() => setConfirmingDelete(memory.id)}
                >
                  <AppIcon name="trash" size={12} /> Delete
                </button>
              )}
            </div>
            {confirmingDelete === memory.id && (
              <div className="memory-card__confirm">
                <span className="memory-card__confirm-text">Delete this memory?</span>
                <button
                  className="memory-card__confirm-yes"
                  onClick={() => handleDelete(memory.id)}
                >
                  Yes, delete
                </button>
                <button
                  className="memory-card__confirm-no"
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
