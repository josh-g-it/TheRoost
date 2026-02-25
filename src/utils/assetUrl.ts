import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Convert a cover art URL from the backend into a usable `<img>` src.
 * - If prefixed with `"local:"`, convert the filesystem path to a Tauri asset URL.
 * - Otherwise, return the URL as-is (it's a remote CDN/SteamGridDB URL).
 */
export function resolveArtUrl(backendUrl: string): string {
  if (backendUrl.startsWith("local:")) {
    const filePath = backendUrl.slice(6);
    return convertFileSrc(filePath);
  }
  return backendUrl;
}
