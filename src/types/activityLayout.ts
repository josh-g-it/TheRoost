import type { IconName } from "../utils/icons";

// ── Card Types ─────────────────────────────────────────────────

export type ActivityCardType =
  | "quick-stats"
  | "heatmap"
  | "daily-playtime"
  | "most-played"
  | "session-length"
  | "playtime-by-day"
  | "recent-sessions"
  | "memories";

export type CardWidth = "full" | "half";

export interface ActivityCardConfig {
  id: string;
  type: ActivityCardType;
  width: CardWidth;
  options?: Record<string, unknown>;
}

// ── Card Metadata ──────────────────────────────────────────────

/** Which widths each card type supports */
export const CARD_WIDTH_OPTIONS: Record<ActivityCardType, CardWidth[]> = {
  "quick-stats": ["half", "full"],
  heatmap: ["half", "full"],
  "daily-playtime": ["half", "full"],
  "most-played": ["half", "full"],
  "session-length": ["half", "full"],
  "playtime-by-day": ["half", "full"],
  "recent-sessions": ["half", "full"],
  memories: ["half", "full"],
};

/** Display info for each card type */
export const CARD_TYPE_META: Record<ActivityCardType, { label: string; icon: IconName }> =
  {
    "quick-stats": { label: "Quick Stats", icon: "stats" },
    heatmap: { label: "Play Activity", icon: "activity" },
    "daily-playtime": { label: "Daily Playtime", icon: "play" },
    "most-played": { label: "Most Played", icon: "star-filled" },
    "session-length": { label: "Session Length", icon: "filter" },
    "playtime-by-day": { label: "Playtime by Day", icon: "genre" },
    "recent-sessions": { label: "Recent Sessions", icon: "list-view" },
    memories: { label: "Memories", icon: "eye" },
  };

/** All card types in order for the "Add Card" dropdown */
export const ALL_CARD_TYPES: ActivityCardType[] = [
  "quick-stats",
  "heatmap",
  "daily-playtime",
  "most-played",
  "session-length",
  "playtime-by-day",
  "recent-sessions",
  "memories",
];

// ── Defaults ───────────────────────────────────────────────────

export const DEFAULT_ACTIVITY_LAYOUT: ActivityCardConfig[] = [
  { id: "default-stats", type: "quick-stats", width: "full" },
  { id: "default-heatmap", type: "heatmap", width: "full" },
  { id: "default-daily", type: "daily-playtime", width: "half", options: { range: 30 } },
  {
    id: "default-most-played",
    type: "most-played",
    width: "half",
    options: { period: "week" },
  },
  { id: "default-session-length", type: "session-length", width: "half" },
  { id: "default-day-of-week", type: "playtime-by-day", width: "half" },
  { id: "default-recent", type: "recent-sessions", width: "full" },
];

/** Default options per card type (used for reset) */
export const DEFAULT_CARD_OPTIONS: Partial<
  Record<ActivityCardType, Record<string, unknown>>
> = {
  "daily-playtime": { range: 30 },
  "most-played": { period: "week" },
};
