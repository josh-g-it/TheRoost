export interface StoreMetadata {
  gameId: string;
  name: string;
  shortDescription: string | null;
  headerImageUrl: string | null;
  developers: string[];
  publishers: string[];
  genres: GenreInfo[];
  categories: CategoryInfo[];
  screenshots: ScreenshotInfo[];
  releaseDate: string | null;
  metacriticScore: number | null;
  metacriticUrl: string | null;
  steamTags: SteamTagInfo[];
}

export interface GenreInfo {
  id: string;
  description: string;
}

export interface CategoryInfo {
  id: number;
  description: string;
}

export interface ScreenshotInfo {
  id: number;
  thumbnailUrl: string;
  fullUrl: string;
}

export interface SteamTagInfo {
  name: string;
  votes: number;
}
