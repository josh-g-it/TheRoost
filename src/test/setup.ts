import "@testing-library/jest-dom/vitest";

// ── Command-specific invoke mock registry ──────────────────────────────
// Supports per-command responses while remaining backward compatible:
// - Unregistered commands return `undefined` (same as before)
// - Tests can register specific responses via `mockInvokeCommand()`
// - Tests can register errors via `mockInvokeError()`
// - Registry is cleared in `clearInvokeMocks()` or manually per test

const invokeRegistry = new Map<string, { response?: unknown; error?: string }>();

/**
 * Register a mock response for a specific Tauri invoke command.
 * When `invoke(command, ...)` is called, the registered response will be returned.
 */
export function mockInvokeCommand(command: string, response: unknown): void {
  invokeRegistry.set(command, { response });
}

/**
 * Register a mock error for a specific Tauri invoke command.
 * When `invoke(command, ...)` is called, the returned promise will reject with the error.
 */
export function mockInvokeError(command: string, error: string): void {
  invokeRegistry.set(command, { error });
}

/**
 * Clear all registered command-specific mock responses and errors.
 * Call this in `beforeEach` if you use per-command mocks.
 */
export function clearInvokeMocks(): void {
  invokeRegistry.clear();
}

// Mock Tauri event API — needed because store modules (favoritesSlice, hiddenGamesSlice)
// call listen() at module scope for cross-window sync. Per-file mocks override this.
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
  emitTo: vi.fn(() => Promise.resolve()),
}));

// Mock Tauri API for tests — prevents errors when components call invoke()
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command: string) => {
    const entry = invokeRegistry.get(command);
    if (entry) {
      if (entry.error !== undefined) {
        return Promise.reject(new Error(entry.error));
      }
      return Promise.resolve(entry.response);
    }
    // Unregistered commands resolve to null (must return a Promise so
    // callers can safely .then()/.catch() without TypeError).
    return Promise.resolve(null);
  }),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
