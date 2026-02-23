export type GameSource =
  | "steam"
  | "manual"
  | "epic"
  | "gog"
  | "ea_app"
  | "ubisoft"
  | "battlenet";

export const GAME_SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  manual: "Manual",
  epic: "Epic Games",
  gog: "GOG",
  ea_app: "EA App",
  ubisoft: "Ubisoft Connect",
  battlenet: "Battle.net",
};

export interface Game {
  gameId: string;
  source: GameSource;
  sourceId: string;
  name: string;
  installDir: string | null;
  installPath: string | null;
  sizeOnDisk: number | null;
  lastUpdated: number | null;
  playtimeForever: number;
  playtime2weeks: number | null;
  lastPlayed: number | null;
  isInstalled: boolean;
  imgIconUrl: string | null;
  description: string | null;
  launchArgs: string | null;
}

export type LaunchMode = "launcher" | "direct";

export interface GameLibrary {
  games: Game[];
  totalCount: number;
  warnings: string[];
}

export interface PlayerSummary {
  steamid: string;
  personaName: string;
  profileUrl: string;
  avatarFull: string;
  locCountryCode: string | null;
  timeCreated: number | null;
}
