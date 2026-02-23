import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Tag } from "../../types/tags";
import "../layout/TagFilterPopover.css";

interface OverlayTagFilterProps {
  onClose: () => void;
}

export function OverlayTagFilter({ onClose }: OverlayTagFilterProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    invoke<Tag[]>("get_all_tags")
      .then((t) => setTags(t ?? []))
      .catch(() => {});
  }, []);

  const handleToggle = (tagId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const handleApply = () => {
    invoke("overlay_apply_tag_filter", { tagIds: Array.from(selected) }).catch(() => {});
    onClose();
  };

  if (tags.length === 0) {
    return (
      <div className="tag-filter-popover">
        <div className="tag-filter-popover__empty">No tags created yet</div>
      </div>
    );
  }

  return (
    <div className="tag-filter-popover">
      <div className="tag-filter-popover__title">Filter by Tag</div>
      <div className="tag-filter-popover__list">
        {tags.map((tag) => (
          <label key={tag.id} className="tag-filter-popover__item">
            <input
              type="checkbox"
              checked={selected.has(tag.id)}
              onChange={() => handleToggle(tag.id)}
            />
            <span
              className="tag-filter-popover__swatch"
              style={{ background: `var(--tag-color-${tag.colorIndex})` }}
            />
            <span className="tag-filter-popover__name">{tag.name}</span>
          </label>
        ))}
      </div>
      {selected.size > 0 && (
        <button className="tag-filter-popover__apply" onClick={handleApply}>
          Apply & Go to Library
        </button>
      )}
    </div>
  );
}
