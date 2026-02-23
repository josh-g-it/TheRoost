import { useState, useRef, useEffect } from "react";
import type { Tag } from "../../types";
import "./TagPicker.css";

interface TagPickerProps {
  availableTags: Tag[];
  onAddTag: (tagId: number) => void;
}

export function TagPicker({ availableTags, onAddTag }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (availableTags.length === 0) return null;

  return (
    <div className="tag-picker" ref={ref}>
      <button
        className="tag-picker__trigger"
        onClick={() => setOpen(!open)}
        aria-label="Add tag"
        aria-expanded={open}
      >
        + Add Tag
      </button>
      {open && (
        <div className="tag-picker__dropdown" role="listbox">
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              className="tag-picker__option"
              role="option"
              onClick={() => {
                onAddTag(tag.id);
                if (availableTags.length <= 1) setOpen(false);
              }}
            >
              <span
                className="tag-picker__color"
                style={{ backgroundColor: `var(--tag-color-${tag.colorIndex})` }}
              />
              <span className="tag-picker__name">{tag.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
