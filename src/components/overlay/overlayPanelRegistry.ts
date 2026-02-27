import type { IconName } from "../../utils/icons";
import type { OverlayPanelId } from "../../types/settings";

export interface OverlayPanelDef {
  id: OverlayPanelId;
  label: string;
  icon: IconName;
  defaultPosition: () => { x: number; y: number };
  defaultWidth: number;
  defaultHeight: number;
  resizable: boolean;
}

// Reference design: 2560×1440 (1440p). Positions/sizes scale proportionally.
const REF_W = 2560;
const REF_H = 1440;
const BORDER = 65; // default-position inset from screen edges

/** Scale a reference-resolution value to the current viewport. */
const sx = (v: number) => Math.round((v / REF_W) * window.innerWidth);
const sy = (v: number) => Math.round((v / REF_H) * window.innerHeight);

export const OVERLAY_PANELS: OverlayPanelDef[] = [
  {
    id: "command-center",
    label: "Command Center",
    icon: "search",
    defaultPosition: () => ({
      x: Math.round((window.innerWidth - sx(600)) / 2),
      y: Math.round((window.innerHeight - sy(500)) / 2 - sy(110)),
    }),
    defaultWidth: sx(600),
    defaultHeight: sy(500),
    resizable: false,
  },
  {
    id: "game-notes",
    label: "Game Notes",
    icon: "notes",
    defaultPosition: () => ({
      x: sx(REF_W - BORDER - 600),
      y: sy(REF_H - BORDER - 680),
    }),
    defaultWidth: sx(600),
    defaultHeight: sy(680),
    resizable: true,
  },
  {
    id: "system-monitor",
    label: "System Monitor",
    icon: "stats",
    defaultPosition: () => ({
      x: sx(BORDER),
      y: sy(BORDER),
    }),
    defaultWidth: sx(650),
    defaultHeight: sy(400),
    resizable: true,
  },
  {
    id: "media-controls",
    label: "Media Controls",
    icon: "music",
    defaultPosition: () => ({
      x: sx(REF_W - BORDER - 500),
      y: sy(BORDER),
    }),
    defaultWidth: sx(500),
    defaultHeight: sy(550),
    resizable: true,
  },
  {
    id: "audio-mixer",
    label: "Audio Mixer",
    icon: "volume",
    defaultPosition: () => ({
      x: sx(BORDER),
      y: sy(REF_H - BORDER - 500),
    }),
    defaultWidth: sx(500),
    defaultHeight: sy(500),
    resizable: true,
  },
  {
    id: "assistant",
    label: "Assistant",
    icon: "assistant",
    defaultPosition: () => ({
      x: Math.round((window.innerWidth - sx(650)) / 2),
      y: sy(880), // centered below command center (CC bottom ~860 + 20px gap)
    }),
    defaultWidth: sx(650),
    defaultHeight: sy(500),
    resizable: true,
  },
];
