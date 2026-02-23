export interface MediaBookmark {
  id: number;
  title: string;
  url: string;
  icon: string | null;
  sortOrder: number;
  addedAt: number;
}

export interface CreateMediaBookmarkRequest {
  title: string;
  url: string;
  icon: string | null;
}

export interface UpdateMediaBookmarkRequest {
  id: number;
  title: string;
  url: string;
  icon: string | null;
}

export interface ReorderMediaBookmarksRequest {
  bookmarkIds: number[];
}
