import "@testing-library/jest-dom/vitest";

// Mock Tauri API for tests — prevents errors when components call invoke()
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
