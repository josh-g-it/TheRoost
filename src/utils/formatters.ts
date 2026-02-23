import { GAME_SOURCE_LABELS, type GameSource } from "../types/game";

/** Map a GameSource ID to its human-readable display name. */
export function getSourceDisplayName(source: GameSource): string {
  return GAME_SOURCE_LABELS[source] ?? source;
}

export function formatPlaytime(minutes: number): string {
  if (minutes === 0) return "Never played";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 100) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${hours.toLocaleString()}h`;
}

export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

export function formatLastPlayed(timestamp: number | null): string {
  if (!timestamp || timestamp === 0) return "Never";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  const weeks = Math.floor(diffDays / 7);
  if (diffDays < 30) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.floor(diffDays / 30);
  if (diffDays < 365) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(diffDays / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - timestamp;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return formatDate(timestamp);
}
