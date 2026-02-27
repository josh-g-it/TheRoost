export const AVATAR_COLORS = [
  "#4f8fba",
  "#6b8e5e",
  "#b5784e",
  "#8e6b9e",
  "#c75c5c",
  "#5c8f8f",
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
