/** Info about a Steam library folder for the install dialog. */
export interface SteamLibraryFolderInfo {
  path: string;
  driveLetter: string;
  totalBytes: number;
  freeBytes: number;
  gameCount: number;
}

/** Progress info for an active Steam install/update. */
export interface InstallProgress {
  sourceId: string;
  gameId: string | null;
  name: string;
  stateFlags: number;
  bytesDownloaded: number;
  bytesToDownload: number;
  bytesStaged: number;
  bytesToStage: number;
  progress: number;
  status: string;
}
