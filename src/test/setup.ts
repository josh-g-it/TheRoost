import "@testing-library/jest-dom/vitest";

// Mock Tauri API for tests — prevents errors when components call invoke()
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
