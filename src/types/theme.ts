import type { IconName } from "../utils/icons";

// ── Icon Set ─────────────────────────────────────────────────

export type IconSetId =
  | "default"
  | "minimal"
  | "heroic"
  | "playful"
  | "classic"
  | "fantasy";

export const ICON_SET_OPTIONS: readonly {
  readonly id: IconSetId;
  readonly name: string;
  readonly description: string;
  readonly preview: readonly IconName[];
}[] = [
  {
    id: "default",
    name: "Modern",
    description: "Clean, balanced lines",
    preview: ["library", "star-filled", "settings", "play", "search"],
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Thin, understated lines",
    preview: ["library", "star-filled", "settings", "play", "search"],
  },
  {
    id: "heroic",
    name: "Heroic",
    description: "Strong, outlined shapes",
    preview: ["library", "star-filled", "settings", "play", "search"],
  },
  {
    id: "playful",
    name: "Playful",
    description: "Rounded, friendly forms",
    preview: ["library", "star-filled", "settings", "play", "search"],
  },
  {
    id: "classic",
    name: "Classic",
    description: "Timeless, familiar icons",
    preview: ["library", "star-filled", "settings", "play", "search"],
  },
  {
    id: "fantasy",
    name: "Fantasy",
    description: "Fantasy game-inspired",
    preview: ["library", "star-filled", "settings", "play", "search"],
  },
] as const;

// ── Font Family ──────────────────────────────────────────────

export type FontFamilyId =
  | "system"
  | "inter"
  | "space-grotesk"
  | "exo2"
  | "jetbrains-mono";

export const FONT_OPTIONS: readonly {
  readonly id: FontFamilyId;
  readonly name: string;
  readonly family: string;
}[] = [
  {
    id: "system",
    name: "System Default",
    family: '"Segoe UI", system-ui, -apple-system, sans-serif',
  },
  {
    id: "inter",
    name: "Inter",
    family: '"Inter", sans-serif',
  },
  {
    id: "space-grotesk",
    name: "Space Grotesk",
    family: '"Space Grotesk", sans-serif',
  },
  {
    id: "exo2",
    name: "Exo 2",
    family: '"Exo 2", sans-serif',
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    family: '"JetBrains Mono", monospace',
  },
] as const;

// ── UI Scale ────────────────────────────────────────────────

export type UIScaleId = "minimal" | "comfortable" | "expanded" | "large";

export const UI_SCALE_OPTIONS: readonly {
  readonly id: UIScaleId;
  readonly name: string;
  readonly description: string;
}[] = [
  { id: "minimal", name: "Minimal", description: "Tight spacing, smaller text" },
  { id: "comfortable", name: "Comfortable", description: "Balanced default layout" },
  { id: "expanded", name: "Expanded", description: "More breathing room" },
  { id: "large", name: "Large", description: "Maximum readability" },
] as const;
