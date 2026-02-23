export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogCategory =
  | "api"
  | "ui"
  | "settings"
  | "library"
  | "launch"
  | "system"
  | "credential"
  | "scan"
  | "metadata"
  | "session"
  | "activity"
  | "tags"
  | "favorites"
  | "profile"
  | "hidden"
  | "filter"
  | "shelf"
  | "achievements"
  | "friends"
  | "news"
  | "notes";

export interface LogEvent {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  category: LogCategory;
  message: string;
  origin: "rust" | "frontend";
  metadata?: Record<string, unknown>;
}
