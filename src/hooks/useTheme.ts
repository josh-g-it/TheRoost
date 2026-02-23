import { useEffect, useRef } from "react";
import { useSettingsStore } from "../store/settingsSlice";
import { FONT_OPTIONS } from "../types/theme";
import { logger } from "../utils/logger";

export const THEMES = [
  {
    id: "dark-gaming",
    name: "Dark Gaming",
    description: "Sleek dark theme with blue accents",
  },
  {
    id: "fae",
    name: "Fae",
    description: "Warm wood tones, cottage-core nature",
  },
  {
    id: "midnight-purple",
    name: "Midnight Purple",
    description: "Amethyst twilight, violet and magenta",
  },
  {
    id: "cyber-neon",
    name: "Cyber Neon",
    description: "Cyberpunk black with neon glow",
  },
  {
    id: "arctic-frost",
    name: "Arctic Frost",
    description: "Soft blue-gray, silver frost",
  },
  {
    id: "ember-forge",
    name: "Ember Forge",
    description: "Volcanic charcoal with molten embers",
  },
  {
    id: "ocean-depths",
    name: "Ocean Depths",
    description: "Deep marine navy, aqua and coral",
  },
  {
    id: "sakura",
    name: "Sakura",
    description: "Soft blush-pink cherry blossom theme",
  },
  {
    id: "verdant",
    name: "Verdant",
    description: "Dark forest canopy with emerald glow",
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  description: string;
}

export function useTheme() {
  const settings = useSettingsStore((s) => s.settings);
  const theme = settings?.theme ?? "dark-gaming";
  const fontFamily = settings?.fontFamily ?? "system";
  const uiScale = settings?.uiScale ?? "comfortable";
  const prevTheme = useRef(theme);
  const prevFont = useRef(fontFamily);
  const prevScale = useRef(uiScale);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);

    const fontOption = FONT_OPTIONS.find((f) => f.id === fontFamily);
    if (fontOption) {
      document.documentElement.style.setProperty("--font-family", fontOption.family);
    }

    // UI Scale — "comfortable" uses :root defaults, others set the attribute
    if (uiScale === "comfortable") {
      document.documentElement.removeAttribute("data-ui-scale");
    } else {
      document.documentElement.setAttribute("data-ui-scale", uiScale);
    }

    logger.info("useTheme", "ui", "Theme applied", {
      theme,
      fontFamily,
      uiScale,
      previous: prevTheme.current !== theme ? prevTheme.current : undefined,
    });
    prevTheme.current = theme;
    prevFont.current = fontFamily;
    prevScale.current = uiScale;
  }, [theme, fontFamily, uiScale]);

  return { theme };
}
