import { useState, useRef, useEffect, useMemo } from "react";
import "./EmojiPicker.css";

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Colors",
    emojis: [
      "🟥",
      "🟧",
      "🟨",
      "🟩",
      "🟦",
      "🟪",
      "🟫",
      "⬛",
      "⬜",
      "🔴",
      "🟠",
      "🟡",
      "🟢",
      "🔵",
      "🟣",
      "🟤",
      "⚫",
      "⚪",
    ],
  },
  {
    label: "Music",
    emojis: [
      "🎵",
      "🎶",
      "🎸",
      "🎹",
      "🥁",
      "🎺",
      "🎻",
      "🎤",
      "🎧",
      "🎼",
      "🎷",
      "📻",
      "📀",
      "💿",
      "🪗",
      "🪘",
      "🎚️",
      "🎛️",
    ],
  },
  {
    label: "Vibes",
    emojis: [
      "🔥",
      "❄️",
      "🌊",
      "⚡",
      "✨",
      "💫",
      "🌙",
      "☀️",
      "🌈",
      "🍂",
      "🌸",
      "☕",
      "🍷",
      "🌃",
      "🏖️",
      "🌌",
      "🎇",
      "💤",
    ],
  },
  {
    label: "Media",
    emojis: [
      "📺",
      "🎬",
      "🎥",
      "📹",
      "🎞️",
      "📡",
      "🔊",
      "🔉",
      "🔈",
      "🎙️",
      "📱",
      "💻",
      "🖥️",
      "📽️",
      "🎭",
      "📢",
    ],
  },
  {
    label: "Gaming",
    emojis: [
      "🎮",
      "🕹️",
      "👾",
      "🎯",
      "🏆",
      "🥇",
      "⚔️",
      "🛡️",
      "🗡️",
      "🧙",
      "🐉",
      "🚀",
      "🤖",
      "🎲",
      "♟️",
      "🃏",
    ],
  },
  {
    label: "Symbols",
    emojis: [
      "❤️",
      "💜",
      "💙",
      "💚",
      "💛",
      "🧡",
      "🖤",
      "🤍",
      "💎",
      "💡",
      "📌",
      "🔖",
      "📚",
      "🏠",
      "🎪",
      "⭐",
      "💥",
      "🔔",
      "🏁",
      "🎗️",
      "♾️",
      "⚜️",
      "🔱",
      "❇️",
    ],
  },
  {
    label: "Fun",
    emojis: [
      "😎",
      "🤘",
      "🎉",
      "🥳",
      "🤩",
      "😍",
      "🥰",
      "😊",
      "🤔",
      "👀",
      "💀",
      "👻",
      "🐔",
      "🦊",
      "🐺",
      "🦁",
      "🐱",
      "🐸",
      "🦄",
      "🐧",
      "🦉",
      "🎃",
      "👑",
      "🧸",
    ],
  },
];

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  /** Compact mode for inline/overlay use */
  compact?: boolean;
}

export function EmojiPicker({ value, onChange, compact = false }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open]);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return EMOJI_CATEGORIES;
    const q = search.toLowerCase();
    return EMOJI_CATEGORIES.map((cat) => ({
      ...cat,
      emojis: cat.emojis.filter(() => cat.label.toLowerCase().includes(q)),
    })).filter((cat) => cat.emojis.length > 0);
  }, [search]);

  const handleSelect = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
    setSearch("");
  };

  const handleClear = () => {
    onChange("");
    setOpen(false);
    setSearch("");
  };

  return (
    <div
      className={`emoji-picker ${compact ? "emoji-picker--compact" : ""}`}
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        className="emoji-picker__trigger"
        onClick={() => setOpen(!open)}
        type="button"
        title={value ? `Icon: ${value} (click to change)` : "Choose icon"}
      >
        {value ? (
          <span className="emoji-picker__preview">{value}</span>
        ) : (
          <span className="emoji-picker__placeholder">Icon</span>
        )}
      </button>

      {open && (
        <div className="emoji-picker__popover">
          <input
            className="emoji-picker__search"
            type="text"
            placeholder="Filter by category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />

          <div className="emoji-picker__scroll">
            {filteredCategories.map((cat) => (
              <div key={cat.label} className="emoji-picker__category">
                <span className="emoji-picker__category-label">{cat.label}</span>
                <div className="emoji-picker__grid">
                  {cat.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      className={`emoji-picker__item ${value === emoji ? "emoji-picker__item--selected" : ""}`}
                      onClick={() => handleSelect(emoji)}
                      type="button"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {filteredCategories.length === 0 && (
              <p className="emoji-picker__empty">No matches</p>
            )}
          </div>

          {value && (
            <button className="emoji-picker__clear" onClick={handleClear} type="button">
              Remove icon
            </button>
          )}
        </div>
      )}
    </div>
  );
}
