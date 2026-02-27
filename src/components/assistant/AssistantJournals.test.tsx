import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantJournals } from "./AssistantJournals";
import { makeAiDailyLog } from "../../test/factories";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const mockGetJournal = vi.fn();
const mockDeleteJournalEntry = vi.fn();

vi.mock("../../services/tauri", () => ({
  assistantApi: {
    getJournal: (...args: unknown[]) => mockGetJournal(...args),
    deleteJournalEntry: (...args: unknown[]) => mockDeleteJournalEntry(...args),
  },
}));

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
}));

describe("AssistantJournals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteJournalEntry.mockResolvedValue(undefined);
  });

  it("renders journal entries with date and summary", async () => {
    mockGetJournal.mockResolvedValue([
      makeAiDailyLog("j1", "a1", "c1", {
        logDate: "2026-02-25",
        summary: "Talked about RPGs",
      }),
      makeAiDailyLog("j2", "a1", "c2", {
        logDate: "2026-02-26",
        summary: "Discussed strategy games",
      }),
    ]);

    render(<AssistantJournals avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText("Talked about RPGs")).toBeInTheDocument();
      expect(screen.getByText("Discussed strategy games")).toBeInTheDocument();
    });
  });

  it("shows empty state when no entries", async () => {
    mockGetJournal.mockResolvedValue([]);

    render(<AssistantJournals avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText(/No journal entries yet/)).toBeInTheDocument();
    });
  });

  it("delete button triggers confirmation", async () => {
    mockGetJournal.mockResolvedValue([
      makeAiDailyLog("j1", "a1", "c1", { summary: "Deletable entry" }),
    ]);

    const user = userEvent.setup();
    render(<AssistantJournals avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText("Deletable entry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Delete"));
    expect(screen.getByText("Delete this journal entry?")).toBeInTheDocument();
  });

  it("confirm delete calls API and removes entry", async () => {
    mockGetJournal.mockResolvedValue([
      makeAiDailyLog("j1", "a1", "c1", { summary: "Entry to delete" }),
    ]);

    const user = userEvent.setup();
    render(<AssistantJournals avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText("Entry to delete")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Delete"));
    await user.click(screen.getByText("Yes, delete"));

    await waitFor(() => {
      expect(mockDeleteJournalEntry).toHaveBeenCalledWith("j1");
    });
  });

  it("shows loading state", () => {
    mockGetJournal.mockReturnValue(new Promise(() => {}));

    render(<AssistantJournals avatarId="a1" />);

    expect(screen.getByText("Loading journal...")).toBeInTheDocument();
  });

  it("cancel delete hides confirmation", async () => {
    mockGetJournal.mockResolvedValue([
      makeAiDailyLog("j1", "a1", "c1", { summary: "Keep this entry" }),
    ]);

    const user = userEvent.setup();
    render(<AssistantJournals avatarId="a1" />);

    await waitFor(() => {
      expect(screen.getByText("Keep this entry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Delete"));
    expect(screen.getByText("Delete this journal entry?")).toBeInTheDocument();

    await user.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Delete this journal entry?")).not.toBeInTheDocument();
  });
});
