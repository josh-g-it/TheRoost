import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantChat } from "./AssistantChat";
import type { ActionPipelineState } from "../../hooks/useActionPipeline";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const mockSendMessage = vi.fn();
const mockEndConversation = vi.fn();
const mockGetConversationHistory = vi.fn();
const mockCheckConversationStale = vi.fn();
const mockAbandonConversation = vi.fn();

const mockSaveGameRating = vi.fn();
const mockSaveGameNote = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    endConversation: (...args: unknown[]) => mockEndConversation(...args),
    getConversationHistory: (...args: unknown[]) => mockGetConversationHistory(...args),
    checkConversationStale: (...args: unknown[]) => mockCheckConversationStale(...args),
    abandonConversation: (...args: unknown[]) => mockAbandonConversation(...args),
  },
  ratingsApi: {
    saveGameRating: (...args: unknown[]) => mockSaveGameRating(...args),
  },
  notesApi: {
    saveGameNote: (...args: unknown[]) => mockSaveGameNote(...args),
  },
}));

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ settings: { iconSet: "classic" } }),
    {
      getState: () => ({
        settings: { theme: "dark" },
        saveSettings: vi.fn(),
      }),
    },
  ),
}));

vi.mock("../../store/favoritesSlice", () => ({
  useFavoritesStore: {
    getState: () => ({ toggleFavorite: vi.fn().mockResolvedValue(undefined) }),
  },
}));

vi.mock("../../store/hiddenGamesSlice", () => ({
  useHiddenGamesStore: {
    getState: () => ({ toggleHidden: vi.fn().mockResolvedValue(undefined) }),
  },
}));

vi.mock("../../utils/commandPalette", () => ({
  resolveExecutor: () => null,
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockSetActions = vi.fn();
const mockCancelAll = vi.fn().mockReturnValue(undefined);
const mockConfirmTier2 = vi.fn();
const mockDenyTier2 = vi.fn();
const mockConsumeResults = vi.fn().mockReturnValue([]);
const mockReset = vi.fn();

let mockPipelineState: ActionPipelineState = {
  actions: [],
  currentIndex: 0,
  status: "idle",
  results: [],
};

vi.mock("../../hooks/useActionPipeline", () => ({
  useActionPipeline: () => ({
    state: mockPipelineState,
    setActions: mockSetActions,
    confirmTier2: (...args: unknown[]) => mockConfirmTier2(...args),
    denyTier2: (...args: unknown[]) => mockDenyTier2(...args),
    cancelAll: mockCancelAll,
    consumeResults: mockConsumeResults,
    reset: mockReset,
  }),
  serializeActionFeedback: (results: unknown[]) =>
    results.length > 0 ? "[System] Previous actions:\n- mock → success" : "",
}));

describe("AssistantChat", () => {
  const existingMessage = {
    id: "m0",
    conversationId: "c1",
    role: "assistant" as const,
    content: "Hello! How can I help you today?",
    createdAt: "2026-02-27T12:00:00Z",
    tokenEstimate: 8,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockResolvedValue(undefined);
    mockEndConversation.mockResolvedValue(undefined);
    mockSaveGameRating.mockResolvedValue(undefined);
    mockSaveGameNote.mockResolvedValue(undefined);
    // Return a non-empty history by default so auto-greeting doesn't fire
    mockGetConversationHistory.mockResolvedValue([existingMessage]);
    mockCheckConversationStale.mockResolvedValue(false);
    mockAbandonConversation.mockResolvedValue(undefined);
    // Reset pipeline state + feedback mocks
    mockPipelineState = { actions: [], currentIndex: 0, status: "idle", results: [] };
    mockConsumeResults.mockReturnValue([]);
  });

  it("renders empty state with prompt text when no conversation", () => {
    render(<AssistantChat avatarId="a1" conversationId={null} />);
    expect(
      screen.getByText("Start a conversation with your assistant."),
    ).toBeInTheDocument();
  });

  it("renders input and send button", () => {
    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
    expect(screen.getByTitle("Send message")).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    const sendBtn = screen.getByTitle("Send message");
    expect(sendBtn).toBeDisabled();
  });

  it("clears input after sending a message", async () => {
    const user = userEvent.setup();
    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "Hello there");
    expect(input).toHaveValue("Hello there");

    await user.click(screen.getByTitle("Send message"));

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });

  it("renders user messages with correct styling", async () => {
    const user = userEvent.setup();
    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "Test message");
    await user.click(screen.getByTitle("Send message"));

    await waitFor(() => {
      const msgEl = screen.getByText("Test message");
      expect(msgEl.closest(".assistant-chat__message--user")).toBeInTheDocument();
    });
  });

  it("shows End Conversation button when conversationId is provided", () => {
    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    expect(screen.getByText("End Conversation")).toBeInTheDocument();
  });

  it("End Conversation button is hidden when hideEndButton is true", () => {
    render(<AssistantChat avatarId="a1" conversationId="c1" hideEndButton />);
    expect(screen.queryByText("End Conversation")).not.toBeInTheDocument();
  });

  it("calls loadHistory on mount when conversationId exists", async () => {
    mockGetConversationHistory.mockResolvedValue([
      {
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "Existing message",
        createdAt: "2026-02-27T12:00:00Z",
        tokenEstimate: 5,
      },
    ]);

    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    await waitFor(() => {
      expect(screen.getByText("Existing message")).toBeInTheDocument();
    });
  });

  it("auto-sends greeting on new conversation with empty history", async () => {
    mockGetConversationHistory.mockResolvedValue([]);
    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        "c1",
        "a1",
        expect.stringContaining("A new conversation has started"),
        true,
        undefined,
      );
    });
  });

  it("auto-sends first-conversation greeting when isFirstConversation is true", async () => {
    mockGetConversationHistory.mockResolvedValue([]);
    render(<AssistantChat avatarId="a1" conversationId="c1" isFirstConversation />);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        "c1",
        "a1",
        expect.stringContaining("your very first conversation"),
        true,
        undefined,
      );
    });
  });

  it("does not auto-send greeting when history exists", async () => {
    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    await waitFor(() => {
      expect(screen.getByText("Hello! How can I help you today?")).toBeInTheDocument();
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("shows error with retry button on failure", async () => {
    mockSendMessage.mockRejectedValue({ message: "Server error" });
    const user = userEvent.setup();

    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "Hello");
    await user.click(screen.getByTitle("Send message"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("calls checkConversationStale on mount", async () => {
    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    await waitFor(() => {
      expect(mockCheckConversationStale).toHaveBeenCalledWith("c1");
    });
  });

  it("abandons stale conversation and calls onStaleReset", async () => {
    mockCheckConversationStale.mockResolvedValue(true);
    const onStaleReset = vi.fn();

    render(
      <AssistantChat avatarId="a1" conversationId="c1" onStaleReset={onStaleReset} />,
    );

    await waitFor(() => {
      expect(mockAbandonConversation).toHaveBeenCalledWith("c1");
    });
    await waitFor(() => {
      expect(onStaleReset).toHaveBeenCalled();
    });
    // Should not have loaded history or sent a greeting
    expect(mockGetConversationHistory).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("does not abandon non-stale conversation", async () => {
    mockCheckConversationStale.mockResolvedValue(false);

    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    await waitFor(() => {
      expect(mockGetConversationHistory).toHaveBeenCalledWith("c1");
    });
    expect(mockAbandonConversation).not.toHaveBeenCalled();
  });

  it("falls through to normal flow when stale check throws", async () => {
    mockCheckConversationStale.mockRejectedValue(new Error("DB error"));
    mockGetConversationHistory.mockResolvedValue([]);

    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    // Should fall through to normal flow: loadHistory is called
    await waitFor(() => {
      expect(mockGetConversationHistory).toHaveBeenCalledWith("c1");
    });
    // Greeting should still be sent
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        "c1",
        "a1",
        expect.stringContaining("A new conversation has started"),
        true,
        undefined,
      );
    });
    // Component should not crash — input should be present
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
  });

  it("does not render End Conversation button when conversationId is null", () => {
    render(<AssistantChat avatarId="a1" conversationId={null} />);
    expect(screen.queryByText("End Conversation")).not.toBeInTheDocument();
  });

  it("shows compacting splash when conversation is ending", async () => {
    // Make endConversation never resolve so isCompacting stays true
    mockEndConversation.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();

    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    // Wait for history to load
    await waitFor(() => {
      expect(screen.getByText("Hello! How can I help you today?")).toBeInTheDocument();
    });

    // Click End Conversation to enter compacting state
    await user.click(screen.getByText("End Conversation"));

    // Assert compacting splash
    await waitFor(() => {
      expect(screen.getByText("Storing memories...")).toBeInTheDocument();
    });
    expect(
      document.querySelector(".assistant-chat__compacting-spinner"),
    ).toBeInTheDocument();
    expect(screen.queryByText("End Conversation")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Type a message...")).not.toBeInTheDocument();
  });

  it("End Conversation button is disabled while streaming", async () => {
    // Make sendMessage never resolve so streaming stays active
    mockSendMessage.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();

    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    // Wait for history to load
    await waitFor(() => {
      expect(screen.getByText("Hello! How can I help you today?")).toBeInTheDocument();
    });

    // Type and send to enter streaming state
    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "test");
    await user.click(screen.getByTitle("Send message"));

    // End button should be disabled while streaming
    const endBtn = screen.getByText("End Conversation").closest("button")!;
    expect(endBtn).toBeDisabled();
  });

  // ── Post-session review tests ─────────────────────────────────

  it("injects greeting for fresh conversation when pendingReview is set", async () => {
    mockGetConversationHistory.mockResolvedValue([]);
    // Suppress the auto-greeting by keeping intro sent
    mockSendMessage.mockResolvedValue(undefined);

    render(
      <AssistantChat
        avatarId="a1"
        conversationId="c1"
        pendingReview={{ gameId: "g1", gameName: "Elden Ring", durationMinutes: 90 }}
        onPendingReviewConsumed={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Elden Ring/)).toBeInTheDocument();
      expect(screen.getByText(/1\.5 hours/)).toBeInTheDocument();
    });
  });

  it("does not inject greeting when pendingReview is null", async () => {
    render(<AssistantChat avatarId="a1" conversationId="c1" pendingReview={null} />);

    await waitFor(() => {
      expect(screen.getByText("Hello! How can I help you today?")).toBeInTheDocument();
    });
    // Should not contain any review-related text
    expect(screen.queryByText(/Want to leave a review/)).not.toBeInTheDocument();
  });

  it("shows review confirmation banner for active conversation", async () => {
    // History with a user message → active conversation
    mockGetConversationHistory.mockResolvedValue([
      existingMessage,
      {
        id: "m-user",
        conversationId: "c1",
        role: "user" as const,
        content: "Hello AI",
        createdAt: "2026-02-27T12:01:00Z",
        tokenEstimate: 2,
      },
    ]);

    render(
      <AssistantChat
        avatarId="a1"
        conversationId="c1"
        pendingReview={{ gameId: "g1", gameName: "Hades", durationMinutes: 45 }}
        onPendingReviewConsumed={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Hades/)).toBeInTheDocument();
      expect(screen.getByText("Yes, let's review")).toBeInTheDocument();
      expect(screen.getByText("Not now")).toBeInTheDocument();
    });
  });

  it("dismisses review confirmation when Not now is clicked", async () => {
    mockGetConversationHistory.mockResolvedValue([
      existingMessage,
      {
        id: "m-user",
        conversationId: "c1",
        role: "user" as const,
        content: "Hello AI",
        createdAt: "2026-02-27T12:01:00Z",
        tokenEstimate: 2,
      },
    ]);
    const user = userEvent.setup();

    render(
      <AssistantChat
        avatarId="a1"
        conversationId="c1"
        pendingReview={{ gameId: "g1", gameName: "Hades", durationMinutes: 45 }}
        onPendingReviewConsumed={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Not now")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Not now"));

    await waitFor(() => {
      expect(screen.queryByText("Yes, let's review")).not.toBeInTheDocument();
    });
  });

  it("calls onPendingReviewConsumed after injection", async () => {
    mockGetConversationHistory.mockResolvedValue([]);
    mockSendMessage.mockResolvedValue(undefined);
    const onConsumed = vi.fn();

    render(
      <AssistantChat
        avatarId="a1"
        conversationId="c1"
        pendingReview={{ gameId: "g1", gameName: "Elden Ring", durationMinutes: 90 }}
        onPendingReviewConsumed={onConsumed}
      />,
    );

    await waitFor(() => {
      expect(onConsumed).toHaveBeenCalled();
    });
  });

  // ── Phase 13c: Tier 2 confirmation card tests ─────────────────

  it("renders generic confirmation card when pipeline is paused on Tier 2", () => {
    mockPipelineState = {
      actions: [
        {
          actionId: "favorite:uuid-123",
          originalActionId: "favorite:Elden Ring",
          tier: 2,
          description: "Add Elden Ring to favorites?",
          resolvedName: "Elden Ring",
        },
      ],
      currentIndex: 0,
      status: "paused",
      results: [],
    };

    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    expect(screen.getByText("Add Elden Ring to favorites?")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("renders review confirmation card for review actions", () => {
    mockPipelineState = {
      actions: [
        {
          actionId: "review:uuid-123",
          originalActionId: "review:Elden Ring",
          tier: 2,
          description: "Review Elden Ring",
          resolvedName: "Elden Ring",
          payload: { stars: 4, text: "Great combat." },
        },
      ],
      currentIndex: 0,
      status: "paused",
      results: [],
    };

    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    expect(screen.getByText("Review: Elden Ring")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write your review...")).toHaveValue(
      "Great combat.",
    );
    expect(screen.getByText("Save Review")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("renders note confirmation card for note actions", () => {
    mockPipelineState = {
      actions: [
        {
          actionId: "note:uuid-456",
          originalActionId: "note:Hollow Knight",
          tier: 2,
          description: "Add note for Hollow Knight",
          resolvedName: "Hollow Knight",
          payload: { text: "Explore the Abyss." },
        },
      ],
      currentIndex: 0,
      status: "paused",
      results: [],
    };

    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    expect(screen.getByText("Note: Hollow Knight")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write your note...")).toHaveValue(
      "Explore the Abyss.",
    );
    expect(screen.getByText("Save Note")).toBeInTheDocument();
  });

  it("does not render cards when pipeline is idle", () => {
    mockPipelineState = { actions: [], currentIndex: 0, status: "idle", results: [] };

    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
    expect(screen.queryByText("Save Review")).not.toBeInTheDocument();
    expect(screen.queryByText("Save Note")).not.toBeInTheDocument();
  });

  it("calls denyTier2 when Cancel is clicked on generic card", async () => {
    const user = userEvent.setup();
    mockPipelineState = {
      actions: [
        {
          actionId: "favorite:uuid-1",
          originalActionId: "favorite:Elden Ring",
          tier: 2,
          description: "Add Elden Ring to favorites?",
        },
      ],
      currentIndex: 0,
      status: "paused",
      results: [],
    };

    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    await user.click(screen.getByText("Cancel"));
    expect(mockDenyTier2).toHaveBeenCalledTimes(1);
  });

  it("shows canceled message when pipeline is canceled", () => {
    mockPipelineState = {
      actions: [
        {
          actionId: "favorite:uuid-1",
          originalActionId: "favorite:Elden Ring",
          tier: 2,
          description: "Add Elden Ring to favorites?",
        },
      ],
      currentIndex: 0,
      status: "canceled",
      results: [],
    };

    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    expect(screen.getByText("Remaining actions canceled.")).toBeInTheDocument();
  });

  it("does not show canceled message when pipeline is idle", () => {
    mockPipelineState = { actions: [], currentIndex: 0, status: "idle", results: [] };

    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    expect(screen.queryByText("Remaining actions canceled.")).not.toBeInTheDocument();
  });

  it("cancels pipeline when user sends a new message while card is visible", async () => {
    const user = userEvent.setup();
    mockPipelineState = {
      actions: [
        {
          actionId: "favorite:uuid-1",
          originalActionId: "favorite:Elden Ring",
          tier: 2,
          description: "Fav Elden Ring?",
        },
      ],
      currentIndex: 0,
      status: "paused",
      results: [],
    };

    render(<AssistantChat avatarId="a1" conversationId="c1" />);

    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "New question");
    await user.click(screen.getByTitle("Send message"));

    await waitFor(() => {
      expect(mockCancelAll).toHaveBeenCalled();
    });
  });

  it("uses fallback description when action has no description", () => {
    mockPipelineState = {
      actions: [
        {
          actionId: "shelf-assign:uuid-1",
          originalActionId: "shelf-assign:Elden Ring",
          tier: 2,
        },
      ],
      currentIndex: 0,
      status: "paused",
      results: [],
    };

    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    expect(screen.getByText("Execute: shelf-assign:Elden Ring")).toBeInTheDocument();
  });
});
