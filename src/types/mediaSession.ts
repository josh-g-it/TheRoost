export type MediaPlaybackStatus = "playing" | "paused" | "stopped" | "closed" | "unknown";

export type MediaControlsMode = "dynamic" | "always" | "hidden";

export interface MediaSessionSnapshot {
  title: string;
  artist: string;
  album: string;
  sourceAppId: string;
  status: MediaPlaybackStatus;
  hasSession: boolean;
}
