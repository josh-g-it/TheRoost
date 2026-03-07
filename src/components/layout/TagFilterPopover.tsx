import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTagsStore } from "../../store/tagsSlice";
import { useUIStore } from "../../store/uiSlice";
import { logger } from "../../utils/logger";
import "./TagFilterPopover.css";

interface TagFilterPopoverProps {
  onClose: () => void;
}

export function TagFilterPopover({ onClose }: TagFilterPopoverProps) {
  const navigate = useNavigate();
  const tags = useTagsStore((s) => s.tags);
  const filterByTagIds = useUIStore((s) => s.filters.filterByTagIds);
  const setFilterByTagIds = useUIStore((s) => s.setFilterByTagIds);

  const partitionedTags = useMemo(() => {
    const selected = tags.filter((t) => filterByTagIds.includes(t.id));
    const unselected = tags.filter((t) => !filterByTagIds.includes(t.id));
    return { selected, unselected };
  }, [tags, filterByTagIds]);

  const handleToggle = (tagId: number) => {
    const current = new Set(filterByTagIds);
    if (current.has(tagId)) {
      current.delete(tagId);
    } else {
      current.add(tagId);
    }
    const newIds = Array.from(current);
    setFilterByTagIds(newIds);
    logger.info("TagFilterPopover", "tags", "Quick tag filter changed", {
      tagIds: newIds,
    });
  };

  const handleApply = () => {
    navigate("/library");
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
        {partitionedTags.selected.map((tag) => (
          <label key={tag.id} className="tag-filter-popover__item">
            <input type="checkbox" checked onChange={() => handleToggle(tag.id)} />
            <span
              className="tag-filter-popover__swatch"
              style={{ background: `var(--tag-color-${tag.colorIndex})` }}
            />
            <span className="tag-filter-popover__name">{tag.name}</span>
          </label>
        ))}
        {partitionedTags.selected.length > 0 && partitionedTags.unselected.length > 0 && (
          <div className="tag-filter-popover__selected-divider" />
        )}
        {partitionedTags.unselected.map((tag) => (
          <label key={tag.id} className="tag-filter-popover__item">
            <input
              type="checkbox"
              checked={false}
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
      <button className="tag-filter-popover__apply" onClick={handleApply}>
        Go to Library
      </button>
    </div>
  );
}
