import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AssistantView } from "./AssistantView";
import { makeAiAvatar, makeAiPersonality } from "../../test/factories";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const mockGetActiveAvatar = vi.fn();
const mockListPersonalities = vi.fn();
const mockStartConversation = vi.fn();
const mockGetConversationHistory = vi.fn();
const mockCheckEncryptionKeyExists = vi.fn();
const mockListAvatars = vi.fn();
const mockGenerateEncryptionKey = vi.fn();
const mockSendMessage = vi.fn();
const mockCheckConversationStale = vi.fn();
const mockAbandonConversation = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    getActiveAvatar: (...args: unknown[]) => mockGetActiveAvatar(...args),
    listPersonalities: (...args: unknown[]) => mockListPersonalities(...args),
    startConversation: (...args: unknown[]) => mockStartConversation(...args),
    getConversationHistory: (...args: unknown[]) => mockGetConversationHistory(...args),
    checkEncryptionKeyExists: (...args: unknown[]) =>
      mockCheckEncryptionKeyExists(...args),
    listAvatars: (...args: unknown[]) => mockListAvatars(...args),
    generateEncryptionKey: (...args: unknown[]) => mockGenerateEncryptionKey(...args),
    createAvatar: vi.fn(),
    switchAvatar: vi.fn(),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    checkConversationStale: (...args: unknown[]) => mockCheckConversationStale(...args),
    abandonConversation: (...args: unknown[]) => mockAbandonConversation(...args),
    startConversationTimer: vi.fn().mockResolvedValue(undefined),
    stopConversationTimer: vi.fn().mockResolvedValue(undefined),
    resetConversationTimer: vi.fn().mockResolvedValue(undefined),
    getConversationTimerState: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
}));

describe("AssistantView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationHistory.mockResolvedValue([]);
    mockListPersonalities.mockResolvedValue([
      makeAiPersonality("p1", { name: "Friendly" }),
    ]);
    mockStartConversation.mockResolvedValue("conv-1");
    mockCheckEncryptionKeyExists.mockResolvedValue(true);
    mockListAvatars.mockResolvedValue([]);
    mockGenerateEncryptionKey.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);
    mockCheckConversationStale.mockResolvedValue(false);
    mockAbandonConversation.mockResolvedValue(undefined);
  });

  it("shows first-run wizard when no active avatar", async () => {
    mockGetActiveAvatar.mockResolvedValue(null);

    render(<AssistantView />);

    await waitFor(() => {
      expect(screen.getByText("Create Your Assistant")).toBeInTheDocument();
    });
  });

  it("shows tabs when avatar exists", async () => {
    mockGetActiveAvatar.mockResolvedValue(
      makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
    );

    render(<AssistantView />);

    await waitFor(() => {
      expect(screen.getByText("Chat")).toBeInTheDocument();
      expect(screen.getByText("Memories")).toBeInTheDocument();
      expect(screen.getByText("Journals")).toBeInTheDocument();
      expect(screen.getByText("Avatar")).toBeInTheDocument();
    });
  });

  it("shows avatar name and personality", async () => {
    mockGetActiveAvatar.mockResolvedValue(
      makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
    );

    render(<AssistantView />);

    await waitFor(() => {
      expect(screen.getAllByText("Buddy").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Friendly")).toBeInTheDocument();
    });
  });

  it("shows colored avatar circle with initial letter", async () => {
    mockGetActiveAvatar.mockResolvedValue(
      makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
    );

    render(<AssistantView />);

    await waitFor(() => {
      expect(screen.getByText("B")).toBeInTheDocument();
    });
  });

  it("shows conversation status indicator", async () => {
    mockGetActiveAvatar.mockResolvedValue(
      makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
    );

    render(<AssistantView />);

    await waitFor(() => {
      expect(screen.getByText("In conversation")).toBeInTheDocument();
    });
  });

  it("renders header with title", async () => {
    mockGetActiveAvatar.mockResolvedValue(
      makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
    );

    render(<AssistantView />);

    await waitFor(() => {
      expect(screen.getByText("Assistant")).toBeInTheDocument();
    });
  });

  it("starts a fresh conversation after stale reset", async () => {
    mockGetActiveAvatar.mockResolvedValue(
      makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
    );
    // Only the first conversation is stale; the replacement is fresh
    mockCheckConversationStale
      .mockResolvedValueOnce(true) // conv-1 is stale
      .mockResolvedValue(false); // conv-2 is fresh
    // After stale reset, startConversation is called again for the fresh conversation
    mockStartConversation
      .mockResolvedValueOnce("conv-1") // initial mount
      .mockResolvedValueOnce("conv-2"); // stale reset

    render(<AssistantView />);

    await waitFor(() => {
      expect(mockStartConversation).toHaveBeenCalledTimes(2);
    });
  });
});
