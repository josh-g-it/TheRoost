/** Structured error returned from Tauri backend commands. */
export interface AppError {
  code: string;
  message: string;
}

/** Extract a human-readable message from a Tauri invoke error. */
export function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as AppError).message);
  }
  return String(error);
}
