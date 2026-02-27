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

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    endConversation: (...args: unknown[]) => mockEndConversation(...args),
    getConversationHistory: (...args: unknown[]) => mockGetConversationHistory(...args),
  },
}));

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
}));

describe("AssistantChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockResolvedValue(undefined);
    mockEndConversation.mockResolvedValue(undefined);
    mockGetConversationHistory.mockResolvedValue([]);
  });

  it("renders empty state with prompt text", () => {
    render(<AssistantChat avatarId="a1" conversationId="c1" />);
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
});
