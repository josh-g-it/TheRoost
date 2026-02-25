export interface GameRating {
  gameId: string;
  /** 1-10 integer (maps to 0.5 to 5.0 stars) */
  rating: number;
  review: string | null;
  updatedAt: number;
}
