import { useState, useEffect } from "react";
import { useTagsStore } from "../../store/tagsSlice";
import { UserTag } from "../common/UserTag";
import { AppIcon } from "../common/AppIcon";
import { Button } from "../common/Button";
import "./TagManager.css";

const TAG_COLOR_COUNT = 15;

export function TagManager() {
  const tags = useTagsStore((s) => s.tags);
  const loadTags = useTagsStore((s) => s.loadTags);
  const createTag = useTagsStore((s) => s.createTag);
  const updateTag = useTagsStore((s) => s.updateTag);
  const deleteTag = useTagsStore((s) => s.deleteTag);
  const reorderTags = useTagsStore((s) => s.reorderTags);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(0);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await createTag({ name: trimmed, colorIndex: newColor });
    setNewName("");
    setNewColor(0);
  };

  const handleStartEdit = (tag: { id: number; name: string; colorIndex: number }) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.colorIndex);
  };

  const handleSaveEdit = async () => {
    if (editingId === null) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    await updateTag({ id: editingId, name: trimmed, colorIndex: editColor });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tags.length) return;
    const newOrder = [...tags];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(newIndex, 0, moved);
    await reorderTags(newOrder.map((t) => t.id));
  };

  return (
    <div className="tag-manager">
      {tags.length > 0 && (
        <div className="tag-manager__list">
          {tags.map((tag, index) => (
            <div key={tag.id} className="tag-manager__item">
              {editingId === tag.id ? (
                <div className="tag-manager__edit-row">
                  <div className="tag-manager__color-picker">
                    {Array.from({ length: TAG_COLOR_COUNT }, (_, i) => (
                      <button
                        key={i}
                        className={`tag-manager__color-swatch ${editColor === i ? "tag-manager__color-swatch--selected" : ""}`}
                        style={{ backgroundColor: `var(--tag-color-${i})` }}
                        onClick={() => setEditColor(i)}
                        aria-label={`Color ${i + 1}`}
                      />
                    ))}
                  </div>
                  <div className="tag-manager__edit-controls">
                    <input
                      className="tag-manager__input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                      autoFocus
                    />
                    <Button variant="primary" size="sm" onClick={handleSaveEdit}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="tag-manager__display-row">
                  <div className="tag-manager__reorder">
                    <button
                      className="tag-manager__move-btn"
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      <AppIcon name="chevron-up" size={12} />
                    </button>
                    <button
                      className="tag-manager__move-btn"
                      onClick={() => handleMove(index, 1)}
                      disabled={index === tags.length - 1}
                      aria-label="Move down"
                    >
                      <AppIcon name="chevron-down" size={12} />
                    </button>
                  </div>
                  <UserTag label={tag.name} colorIndex={tag.colorIndex} size="md" />
                  <div className="tag-manager__actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStartEdit(tag)}
                    >
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => deleteTag(tag.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tags.length === 0 && (
        <p className="tag-manager__empty">
          No tags yet. Create one below to start organizing your library.
        </p>
      )}

      <div className="tag-manager__create">
        <h4 className="tag-manager__create-title">Create Tag</h4>
        <div className="tag-manager__color-picker">
          {Array.from({ length: TAG_COLOR_COUNT }, (_, i) => (
            <button
              key={i}
              className={`tag-manager__color-swatch ${newColor === i ? "tag-manager__color-swatch--selected" : ""}`}
              style={{ backgroundColor: `var(--tag-color-${i})` }}
              onClick={() => setNewColor(i)}
              aria-label={`Color ${i + 1}`}
            />
          ))}
        </div>
        <div className="tag-manager__create-row">
          <input
            className="tag-manager__input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            placeholder="Tag name"
            maxLength={30}
          />
          <UserTag label={newName || "Preview"} colorIndex={newColor} size="md" />
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            disabled={!newName.trim()}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
