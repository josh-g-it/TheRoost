export interface GameNewsItem {
  newsId: string;
  gameId: string;
  title: string;
  url: string;
  author: string;
  contents: string;
  date: number;
  feedLabel: string;
}

export interface FeedNewsItem {
  newsId: string;
  gameId: string;
  gameName: string;
  sourceId: string;
  title: string;
  url: string;
  author: string;
  contents: string;
  date: number;
  feedLabel: string;
  isExternal: boolean;
  isRead: boolean;
}
