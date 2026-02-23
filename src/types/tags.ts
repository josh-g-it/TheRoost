export interface Tag {
  id: number;
  name: string;
  colorIndex: number;
  sortOrder: number;
}

export interface CreateTagRequest {
  name: string;
  colorIndex: number;
}

export interface UpdateTagRequest {
  id: number;
  name: string;
  colorIndex: number;
}

export interface ReorderTagsRequest {
  tagIds: number[];
}

export interface GameTagAssignment {
  gameId: string;
  tagIds: number[];
}
