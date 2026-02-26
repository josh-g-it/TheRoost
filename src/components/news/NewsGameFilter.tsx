import { useState, useRef, useEffect, useCallback } from "react";
import { AppIcon } from "../common/AppIcon";

interface GameOption {
  id: string;
  name: string;
}

interface NewsGameFilterProps {
  games: GameOption[];
  selected: Set<string>;
  onChange: (ids: Set<string>) => void;
}

export function NewsGameFilter({ games, selected, onChange }: NewsGameFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(selected);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onChange(next);
    },
    [selected, onChange],
  );

  const clear = useCallback(() => {
    onChange(new Set());
  }, [onChange]);

  const label =
    selected.size === 0
      ? "All Games"
      : selected.size === 1
        ? (games.find((g) => selected.has(g.id))?.name ?? "1 game")
        : `${selected.size} games`;

  return (
    <div className="news-game-filter" ref={ref}>
      <button
        className={`news-game-filter__trigger${selected.size > 0 ? " news-game-filter__trigger--active" : ""}`}
        onClick={() => setOpen(!open)}
        title="Filter by game"
      >
        <AppIcon name="filter" size={14} />
        {label}
        <AppIcon name="chevron-down" size={12} />
      </button>

      {open && (
        <div className="news-game-filter__popover">
          <div className="news-game-filter__header">
            <span>Filter by game</span>
            {selected.size > 0 && (
              <button className="news-game-filter__clear" onClick={clear}>
                Clear
              </button>
            )}
          </div>
          {games.map((game) => (
            <label key={game.id} className="news-game-filter__item">
              <input
                type="checkbox"
                checked={selected.has(game.id)}
                onChange={() => toggle(game.id)}
              />
              {game.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
