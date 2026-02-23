export interface GameSession {
  id: number;
  gameId: string;
  startTime: number;
  endTime: number | null;
  durationMinutes: number | null;
}

export interface PlaytimeSnapshot {
  id: number;
  gameId: string;
  playtimeMinutes: number;
  snapshotAt: number;
}
