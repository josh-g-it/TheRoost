import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantMemories } from "./AssistantMemories";
import { makeAiMemory } from "../../test/factories";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const mockGetMemories = vi.fn();
const mockDeleteMemory = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    getMemories: (...args: unknown[]) => mockGetMemories(...args),
    deleteMemory: (...args: unknown[]) => mockDeleteMemory(...args),
  },
}));

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
}));

describe("AssistantMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteMemory.mockResolvedValue(undefined);
  });

  it("renders memory cards", async () => {
    mockGetMemories.mockResolvedValue([
      makeAiMemory("m1", "a1", { content: "User likes RPGs" }),
      makeAiMemory("m2", "a1", { content: "User prefers dark themes" }),
    ]);

    render(<AssistantMemories avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText("User likes RPGs")).toBeInTheDocument();
      expect(screen.getByText("User prefers dark themes")).toBeInTheDocument();
    });
  });

  it("shows empty state when no memories", async () => {
    mockGetMemories.mockResolvedValue([]);

    render(<AssistantMemories avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText(/No memories yet/)).toBeInTheDocument();
    });
  });

  it("category filter works", async () => {
    mockGetMemories.mockResolvedValue([
      makeAiMemory("m1", "a1", { content: "RPG pref noted", category: "preference" }),
      makeAiMemory("m2", "a1", { content: "Some fact noted", category: "fact" }),
    ]);

    const user = userEvent.setup();
    render(<AssistantMemories avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText("RPG pref noted")).toBeInTheDocument();
      expect(screen.getByText("Some fact noted")).toBeInTheDocument();
    });

    // Click the "preference" chip in the chip bar
    const chips = screen.getAllByRole("button");
    const prefChip = chips.find(
      (btn) =>
        btn.classList.contains("assistant-memories__chip") &&
        btn.textContent === "preference",
    )!;
    await user.click(prefChip);

    expect(screen.getByText("RPG pref noted")).toBeInTheDocument();
    expect(screen.queryByText("Some fact noted")).not.toBeInTheDocument();
  });

  it("all filter hides system memories", async () => {
    mockGetMemories.mockResolvedValue([
      makeAiMemory("m1", "a1", { content: "User memory", category: "preference" }),
      makeAiMemory("m2", "a1", {
        content: "System memory",
        isSystem: true,
        category: "system",
      }),
    ]);

    render(<AssistantMemories avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText("User memory")).toBeInTheDocument();
    });
    expect(screen.queryByText("System memory")).not.toBeInTheDocument();
  });

  it("system memories visible when system chip selected", async () => {
    mockGetMemories.mockResolvedValue([
      makeAiMemory("m1", "a1", {
        content: "System memory",
        isSystem: true,
        category: "system",
      }),
    ]);

    const user = userEvent.setup();
    render(<AssistantMemories avatarId="a1" />);

    const chips = screen.getAllByRole("button");
    const systemChip = chips.find(
      (btn) =>
        btn.classList.contains("assistant-memories__chip") &&
        btn.textContent === "system",
    )!;
    await user.click(systemChip);

    await waitFor(() => {
      expect(screen.getByText("System memory")).toBeInTheDocument();
    });
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("non-system memories show delete button", async () => {
    mockGetMemories.mockResolvedValue([
      makeAiMemory("m1", "a1", { content: "User memory", isSystem: false }),
    ]);

    render(<AssistantMemories avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText("User memory")).toBeInTheDocument();
    });

    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("delete calls API after confirmation", async () => {
    mockGetMemories.mockResolvedValue([
      makeAiMemory("m1", "a1", { content: "Deletable memory", isSystem: false }),
    ]);

    const user = userEvent.setup();
    render(<AssistantMemories avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText("Deletable memory")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Delete"));
    expect(screen.getByText("Delete this memory?")).toBeInTheDocument();

    await user.click(screen.getByText("Yes, delete"));

    await waitFor(() => {
      expect(mockDeleteMemory).toHaveBeenCalledWith("m1");
    });
  });

  it("search filters memories by content", async () => {
    mockGetMemories.mockResolvedValue([
      makeAiMemory("m1", "a1", { content: "Likes action games" }),
      makeAiMemory("m2", "a1", { content: "Prefers dark mode" }),
    ]);

    const user = userEvent.setup();
    render(<AssistantMemories avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText("Likes action games")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Search memories..."), "dark");

    expect(screen.queryByText("Likes action games")).not.toBeInTheDocument();
    expect(screen.getByText("Prefers dark mode")).toBeInTheDocument();
  });
});
