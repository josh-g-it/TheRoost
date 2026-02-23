export interface AudioSession {
  pid: number;
  displayName: string;
  exeName: string;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  peakLevel: number; // 0.0 to 1.0 — current audio output level
}

export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
  customName: string | null; // user-defined alias
}

export interface AudioSessionPref {
  exeName: string;
  hidden: boolean;
}

export interface AudioSnapshot {
  masterVolume: number; // 0.0 to 1.0
  masterMuted: boolean;
  sessions: AudioSession[];
  outputDevices: AudioDevice[];
  inputDevices: AudioDevice[];
  sessionPrefs: AudioSessionPref[];
}
