export interface DriveInfo {
  driveLetter: string;
  totalBytes: number;
  freeBytes: number;
  gameBytes: number;
  gameCount: number;
}

export interface GameStorageEntry {
  gameId: string;
  name: string;
  source: string;
  sourceId: string;
  installPath: string;
  sizeBytes: number;
  driveLetter: string;
}

export interface StorageScanResult {
  drives: DriveInfo[];
  games: GameStorageEntry[];
  totalGameBytes: number;
  scannedCount: number;
  scanDurationMs: number;
}
