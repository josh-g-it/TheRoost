export interface GameNote {
  gameId: string;
  content: string;
  updatedAt: number;
}

export interface GameNoteWithName extends GameNote {
  gameName: string | null;
}

export const GENERAL_NOTES_ID = "__general__";
