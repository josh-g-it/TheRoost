import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { AssistantView } from "./AssistantView";
import { makeAiAvatar, makeAiPersonality } from "../../test/factories";

type ListenCallback = (event: { payload: unknown }) => void;
const listenCallbacks: Record<string, ListenCallback> = {};
const mockUnlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((eventName: string, callback: ListenCallback) => {
    listenCallbacks[eventName] = callback;
    return Promise.resolve(mockUnlisten);
  }),
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
const mockEndConversation = vi.fn();
const mockCheckOrphanedConversations = vi.fn();
const mockGetCompactionPendingConversations = vi.fn();
const mockRetryCompaction = vi.fn();
const mockGetCompactionRawData = vi.fn();
const mockApplyExternalCompaction = vi.fn();

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
    endConversation: (...args: unknown[]) => mockEndConversation(...args),
    startConversationTimer: vi.fn().mockResolvedValue(undefined),
    stopConversationTimer: vi.fn().mockResolvedValue(undefined),
    resetConversationTimer: vi.fn().mockResolvedValue(undefined),
    getConversationTimerState: vi.fn().mockResolvedValue(null),
    checkOrphanedConversations: (...args: unknown[]) =>
      mockCheckOrphanedConversations(...args),
    getCompactionPendingConversations: (...args: unknown[]) =>
      mockGetCompactionPendingConversations(...args),
    retryCompaction: (...args: unknown[]) => mockRetryCompaction(...args),
    getCompactionRawData: (...args: unknown[]) => mockGetCompactionRawData(...args),
    applyExternalCompaction: (...args: unknown[]) => mockApplyExternalCompaction(...args),
  },
}));

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../hooks/useActionPipeline", () => ({
  useActionPipeline: () => ({
    state: { actions: [], currentIndex: 0, status: "idle", results: [] },
    setActions: vi.fn(),
    confirmTier2: vi.fn(),
    denyTier2: vi.fn(),
    cancelAll: vi.fn(),
    consumeResults: vi.fn().mockReturnValue([]),
    reset: vi.fn(),
  }),
  serializeActionFeedback: () => "",
}));

describe("AssistantView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key in listenCallbacks) {
      delete listenCallbacks[key];
    }
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
    mockEndConversation.mockResolvedValue(undefined);
    mockCheckOrphanedConversations.mockResolvedValue([]);
    mockGetCompactionPendingConversations.mockResolvedValue([]);
    mockRetryCompaction.mockResolvedValue(undefined);
    mockGetCompactionRawData.mockResolvedValue("raw data");
    mockApplyExternalCompaction.mockResolvedValue(undefined);
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

  it("auto-restarts conversation on manual end", async () => {
    mockGetActiveAvatar.mockResolvedValue(
      makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
    );
    mockStartConversation
      .mockResolvedValueOnce("conv-1") // initial
      .mockResolvedValueOnce("conv-2"); // auto-restart

    render(<AssistantView />);

    await waitFor(() => {
      expect(screen.getByText("In conversation")).toBeInTheDocument();
    });

    // Simulate the conversation-ended event with reason: manual
    await act(async () => {
      listenCallbacks["ai-conversation-ended"]?.({
        payload: { conversationId: "conv-1", reason: "manual" },
      });
    });

    await waitFor(() => {
      expect(mockStartConversation).toHaveBeenCalledTimes(2);
    });
  });

  it("shows Idle status when auto-restart after manual end fails", async () => {
    mockGetActiveAvatar.mockResolvedValue(
      makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
    );
    mockStartConversation
      .mockResolvedValueOnce("conv-1")
      .mockRejectedValueOnce(new Error("Network error"));

    render(<AssistantView />);

    await waitFor(() => {
      expect(screen.getByText("In conversation")).toBeInTheDocument();
    });

    await act(async () => {
      listenCallbacks["ai-conversation-ended"]?.({
        payload: { conversationId: "conv-1", reason: "manual" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Idle")).toBeInTheDocument();
    });
    expect(screen.queryByText("In conversation")).not.toBeInTheDocument();
  });

  it("does NOT auto-restart on timer auto-end", async () => {
    mockGetActiveAvatar.mockResolvedValue(
      makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
    );

    render(<AssistantView />);

    await waitFor(() => {
      expect(screen.getByText("In conversation")).toBeInTheDocument();
    });

    // Simulate the conversation-ended event with reason: timer
    await act(async () => {
      listenCallbacks["ai-conversation-ended"]?.({
        payload: { conversationId: "conv-1", reason: "timer" },
      });
    });

    // startConversation should have been called only once (initial load)
    expect(mockStartConversation).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByText("Idle")).toBeInTheDocument();
    });
    expect(screen.queryByText("In conversation")).not.toBeInTheDocument();
  });

  // ── Phase 10: Orphan Banner Tests ──────────────────────────────

  describe("orphan banner", () => {
    it("shows orphan banner when orphaned conversations exist", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockCheckOrphanedConversations.mockResolvedValue(["orphan-conv-1"]);

      render(<AssistantView />);

      await waitFor(() => {
        expect(
          screen.getByText("Welcome back! We were in the middle of a conversation."),
        ).toBeInTheDocument();
        expect(screen.getByText("Resume")).toBeInTheDocument();
        expect(screen.getByText("New")).toBeInTheDocument();
      });
    });

    it("Resume button dismisses banner and keeps conversationId", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockCheckOrphanedConversations.mockResolvedValue(["orphan-conv-1"]);

      render(<AssistantView />);

      await waitFor(() => {
        expect(screen.getByText("Resume")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Resume"));
      });

      // Banner should be gone
      expect(
        screen.queryByText("Welcome back! We were in the middle of a conversation."),
      ).not.toBeInTheDocument();
      // startConversation should NOT have been called (orphan short-circuits)
      expect(mockStartConversation).not.toHaveBeenCalled();
    });

    it("New button ends orphan and starts fresh conversation", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockCheckOrphanedConversations.mockResolvedValue(["orphan-conv-1"]);
      mockStartConversation.mockResolvedValue("new-conv-1");

      render(<AssistantView />);

      await waitFor(() => {
        expect(screen.getByText("New")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("New"));
      });

      await waitFor(() => {
        expect(mockEndConversation).toHaveBeenCalledWith("orphan-conv-1", "a1");
        expect(mockStartConversation).toHaveBeenCalledWith("a1");
      });

      // Banner should be gone
      expect(
        screen.queryByText("Welcome back! We were in the middle of a conversation."),
      ).not.toBeInTheDocument();
    });

    it("does not show compaction banner when orphan banner is visible", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockCheckOrphanedConversations.mockResolvedValue(["orphan-conv-1"]);
      // Even if compaction checks would return data, orphan returns early before reaching them
      mockGetCompactionPendingConversations.mockResolvedValue([["compact-conv-1", "a1"]]);

      render(<AssistantView />);

      await waitFor(() => {
        expect(
          screen.getByText("Welcome back! We were in the middle of a conversation."),
        ).toBeInTheDocument();
      });

      // Compaction banner text should NOT be present
      expect(
        screen.queryByText("A previous conversation needs to be processed."),
      ).not.toBeInTheDocument();
    });
  });

  // ── Phase 10: Compaction Banner Tests ─────────────────────────

  describe("compaction banner", () => {
    it("shows compaction banner when pending compactions exist", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockGetCompactionPendingConversations.mockResolvedValue([["compact-conv-1", "a1"]]);

      render(<AssistantView />);

      await waitFor(() => {
        expect(
          screen.getByText("A previous conversation needs to be processed."),
        ).toBeInTheDocument();
        expect(screen.getByText("Compact Now")).toBeInTheDocument();
        expect(screen.getByText("Copy Raw Data")).toBeInTheDocument();
        expect(screen.getByText("Paste Response")).toBeInTheDocument();
      });
    });

    it("Compact Now calls retryCompaction with correct IDs", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockGetCompactionPendingConversations.mockResolvedValue([
        ["compact-conv-1", "avatar-1"],
      ]);

      render(<AssistantView />);

      await waitFor(() => {
        expect(screen.getByText("Compact Now")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Compact Now"));
      });

      await waitFor(() => {
        expect(mockRetryCompaction).toHaveBeenCalledWith("compact-conv-1", "avatar-1");
      });
    });

    it("Compact Now dismisses banner on success", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockGetCompactionPendingConversations.mockResolvedValue([["compact-conv-1", "a1"]]);

      render(<AssistantView />);

      await waitFor(() => {
        expect(screen.getByText("Compact Now")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Compact Now"));
      });

      await waitFor(() => {
        expect(
          screen.queryByText("A previous conversation needs to be processed."),
        ).not.toBeInTheDocument();
      });
    });

    it("Compact Now shows error on failure", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockGetCompactionPendingConversations.mockResolvedValue([["compact-conv-1", "a1"]]);
      mockRetryCompaction.mockRejectedValue(new Error("API offline"));

      render(<AssistantView />);

      await waitFor(() => {
        expect(screen.getByText("Compact Now")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Compact Now"));
      });

      await waitFor(() => {
        expect(screen.getByText("API offline")).toBeInTheDocument();
      });
    });

    it("Copy Raw Data calls getCompactionRawData and clipboard", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockGetCompactionPendingConversations.mockResolvedValue([["compact-conv-1", "a1"]]);
      mockGetCompactionRawData.mockResolvedValue("system prompt + transcript");

      // Mock navigator.clipboard
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      });

      render(<AssistantView />);

      await waitFor(() => {
        expect(screen.getByText("Copy Raw Data")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Copy Raw Data"));
      });

      await waitFor(() => {
        expect(mockGetCompactionRawData).toHaveBeenCalledWith("compact-conv-1");
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          "system prompt + transcript",
        );
      });
    });

    it("Paste Response opens modal with textarea", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockGetCompactionPendingConversations.mockResolvedValue([["compact-conv-1", "a1"]]);

      render(<AssistantView />);

      await waitFor(() => {
        expect(screen.getByText("Paste Response")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Paste Response"));
      });

      expect(screen.getByText("Paste Compaction Response")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Paste JSON here...")).toBeInTheDocument();
    });

    it("Paste modal Apply calls applyExternalCompaction", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockGetCompactionPendingConversations.mockResolvedValue([
        ["compact-conv-1", "avatar-1"],
      ]);

      render(<AssistantView />);

      await waitFor(() => {
        expect(screen.getByText("Paste Response")).toBeInTheDocument();
      });

      // Open modal
      await act(async () => {
        fireEvent.click(screen.getByText("Paste Response"));
      });

      // Type JSON
      const textarea = screen.getByPlaceholderText("Paste JSON here...");
      await act(async () => {
        fireEvent.change(textarea, {
          target: { value: '{"summary":"test","memories":[],"supersededMemories":[]}' },
        });
      });

      // Click Apply
      await act(async () => {
        fireEvent.click(screen.getByText("Apply"));
      });

      await waitFor(() => {
        expect(mockApplyExternalCompaction).toHaveBeenCalledWith(
          "compact-conv-1",
          "avatar-1",
          '{"summary":"test","memories":[],"supersededMemories":[]}',
        );
      });
    });

    it("Paste modal shows validation error from backend inline", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockGetCompactionPendingConversations.mockResolvedValue([["compact-conv-1", "a1"]]);
      mockApplyExternalCompaction.mockRejectedValue(new Error("Summary cannot be empty"));

      render(<AssistantView />);

      // Wait for compaction banner to appear
      await waitFor(() => {
        expect(screen.getByText("Paste Response")).toBeInTheDocument();
      });

      // Open modal
      fireEvent.click(screen.getByText("Paste Response"));
      const textarea = await screen.findByPlaceholderText("Paste JSON here...");

      // Type JSON and click Apply
      fireEvent.change(textarea, {
        target: { value: '{"summary":"","memories":[],"supersededMemories":[]}' },
      });

      // Wait for Apply button to be enabled (React must re-render with pasteValue)
      await waitFor(() => {
        expect(screen.getByText("Apply")).not.toBeDisabled();
      });

      // Click Apply — the mock will reject, setting compactionError
      await act(async () => {
        fireEvent.click(screen.getByText("Apply"));
        await new Promise((r) => setTimeout(r, 0));
      });

      // Error appears in both banner and modal (shared compactionError state)
      await waitFor(() => {
        expect(screen.getAllByText("Summary cannot be empty").length).toBeGreaterThan(0);
      });
      // Verify it's specifically in the paste modal
      expect(
        document.querySelector(".assistant-view__paste-modal-error"),
      ).toHaveTextContent("Summary cannot be empty");
    });

    it("Paste modal Cancel closes without action", async () => {
      mockGetActiveAvatar.mockResolvedValue(
        makeAiAvatar("a1", { name: "Buddy", personalityId: "p1" }),
      );
      mockGetCompactionPendingConversations.mockResolvedValue([["compact-conv-1", "a1"]]);

      render(<AssistantView />);

      await waitFor(() => {
        expect(screen.getByText("Paste Response")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Paste Response"));
      });

      expect(screen.getByText("Paste Compaction Response")).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByText("Cancel"));
      });

      expect(screen.queryByText("Paste Compaction Response")).not.toBeInTheDocument();
      expect(mockApplyExternalCompaction).not.toHaveBeenCalled();
    });
  });
});
