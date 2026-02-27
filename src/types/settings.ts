import type { ThemeId } from "../hooks/useTheme";
import type {
  CardDisplayOptions,
  CommandCenterShortcut,
  ProfileChartOptions,
  RailMode,
  SlotActionId,
} from "./ui";
import type { ShelfConfig } from "./shelf";
import type { ActivityCardConfig } from "./activityLayout";
import type { IconSetId, FontFamilyId, UIScaleId } from "./theme";
import type { MediaControlsMode } from "./mediaSession";

export type OverlayPanelId =
  | "command-center"
  | "game-notes"
  | "system-monitor"
  | "media-controls"
  | "audio-mixer"
  | "assistant";

export interface OverlayPanelPosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
  pinned: boolean;
  visible: boolean;
}

export interface AppSettings {
  steamApiKey: string | null;
  steamId: string | null;
  isFirstRun: boolean;
  theme: ThemeId;
  iconSet: IconSetId;
  fontFamily: FontFamilyId;
  uiScale: UIScaleId;
  cardDisplay: CardDisplayOptions;
  profileChartOptions: ProfileChartOptions;
  commandCenterSlots: SlotActionId[];
  commandCenterShortcut: CommandCenterShortcut;
  railMode: RailMode;
  shelves?: ShelfConfig[];
  activityLayout?: ActivityCardConfig[];
  minimizeToTray: boolean;
  devSettingsEnabled: boolean;
  hasSeenWelcome?: boolean;
  overlayPanelPositions?: Partial<Record<OverlayPanelId, OverlayPanelPosition>>;
  mediaControlsMode?: MediaControlsMode;
  cloudAiEnabled?: boolean;
  cloudAiProvider?: string;
  cloudAiDailyLimit?: number;
  cloudAiPrivacyAcknowledged?: boolean;
  cloudAiContextScope?: string;
  cloudAiExcludedGames?: string[];
  cloudAiIncludedGames?: string[];
  aiPostSessionReviewEnabled?: boolean;
}
