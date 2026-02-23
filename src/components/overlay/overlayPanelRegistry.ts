import type { IconName } from "../../utils/icons";
import type { OverlayPanelId } from "../../types/settings";

export interface OverlayPanelDef {
  id: OverlayPanelId;
  label: string;
  icon: IconName;
  defaultPosition: () => { x: number; y: number };
  defaultWidth: number;
  resizable: boolean;
}

const EDGE_PAD = 48;
const TOP_BAR = 60; // 44px window-manager bar + 16px gap

export const OVERLAY_PANELS: OverlayPanelDef[] = [
  {
    id: "command-center",
    label: "Command Center",
    icon: "search",
    defaultPosition: () => ({
      x: Math.round((window.innerWidth - 560) / 2),
      y: Math.round((window.innerHeight - 400) / 2 - window.innerHeight * 0.06),
    }),
    defaultWidth: 560,
    resizable: false,
  },
  {
    id: "game-notes",
    label: "Game Notes",
    icon: "notes",
    defaultPosition: () => ({
      x: Math.round(window.innerWidth - 440 - EDGE_PAD),
      y: Math.round(window.innerHeight - 420 - EDGE_PAD),
    }),
    defaultWidth: 440,
    resizable: true,
  },
  {
    id: "system-monitor",
    label: "System Monitor",
    icon: "stats",
    defaultPosition: () => ({
      x: EDGE_PAD,
      y: TOP_BAR,
    }),
    defaultWidth: 500,
    resizable: true,
  },
  {
    id: "media-controls",
    label: "Media Controls",
    icon: "music",
    defaultPosition: () => ({
      x: Math.round(window.innerWidth - 400 - EDGE_PAD),
      y: TOP_BAR,
    }),
    defaultWidth: 400,
    resizable: true,
  },
  {
    id: "audio-mixer",
    label: "Audio Mixer",
    icon: "volume",
    defaultPosition: () => ({
      x: EDGE_PAD,
      y: Math.round(window.innerHeight - 500 - EDGE_PAD),
    }),
    defaultWidth: 400,
    resizable: true,
  },
];
