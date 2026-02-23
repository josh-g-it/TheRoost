export interface SystemSample {
  timestamp: number;
  cpuPercent: number;
  ramUsed: number;
  ramTotal: number;
  gpuPercent: number | null;
  gpuVramUsed: number | null;
  gpuVramTotal: number | null;
}

export interface ProcessMetrics {
  pid: number;
  gameId: string;
  name: string;
  exeName: string;
  cpuPercent: number;
  ramBytes: number;
  gpuPercent: number | null;
  gpuVramBytes: number | null;
}

export interface SystemMetricsSnapshot {
  current: SystemSample;
  history: SystemSample[];
  processes: ProcessMetrics[];
  cpuCount: number;
}

export const SELF_PROCESS_ID = "__self__";
