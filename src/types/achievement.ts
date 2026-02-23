export interface GameAchievement {
  apiName: string;
  displayName: string;
  description: string | null;
  iconUrl: string | null;
  iconGrayUrl: string | null;
  hidden: boolean;
  achieved: boolean;
  unlockTime: number | null;
  globalPercent: number | null;
}

export interface GameAchievementSummary {
  gameId: string;
  total: number;
  unlocked: number;
  achievements: GameAchievement[];
}
