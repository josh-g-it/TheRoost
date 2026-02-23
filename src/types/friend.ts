export interface FriendInfo {
  steamId: string;
  personaName: string;
  avatarUrl: string;
  profileUrl: string;
  personaState: number;
  currentGameName: string | null;
  currentGameId: string | null;
  friendSince: number;
}

export interface FriendGame {
  appid: number;
  name: string;
  playtimeForever: number;
}

export interface FriendLibrary {
  steamId: string;
  games: FriendGame[];
}
