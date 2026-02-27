import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantChat } from "./AssistantChat";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const mockSendMessage = vi.fn();
const mockEndConversation = vi.fn();
const mockGetConversationHistory = vi.fn();
const mockCheckConversationStale = vi.fn();
const mockAbandonConversation = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    endConversation: (...args: unknown[]) => mockEndConversation(...args),
    getConversationHistory: (...args: unknown[]) => mockGetConversationHistory(...args),
    checkConversationStale: (...args: unknown[]) => mockCheckConversationStale(...args),
    abandonConversation: (...args: unknown[]) => mockAbandonConversation(...args),
  },
}));

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
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
    // Return a non-empty history by default so auto-greeting doesn't fire
    mockGetConversationHistory.mockResolvedValue([existingMessage]);
    mockCheckConversationStale.mockResolvedValue(false);
    mockAbandonConversation.mockResolvedValue(undefined);
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

  it("shows end conversation button when conversationId is provided", () => {
    render(<AssistantChat avatarId="a1" conversationId="c1" />);
    expect(screen.getByTitle("End conversation")).toBeInTheDocument();
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
      );
    });
    // Component should not crash — input should be present
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
  });
});
