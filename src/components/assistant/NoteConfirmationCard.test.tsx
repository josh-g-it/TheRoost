import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteConfirmationCard } from "./NoteConfirmationCard";

describe("NoteConfirmationCard", () => {
  const defaultProps = {
    gameName: "Hollow Knight",
    noteText: "Remember to explore the Abyss area.",
    onConfirm: vi.fn(),
    onDeny: vi.fn(),
  };

  it("renders game name", () => {
    render(<NoteConfirmationCard {...defaultProps} />);
    expect(screen.getByText("Note: Hollow Knight")).toBeInTheDocument();
  });

  it("renders note text in textarea", () => {
    render(<NoteConfirmationCard {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("Write your note...");
    expect(textarea).toHaveValue("Remember to explore the Abyss area.");
  });

  it("note text is editable", async () => {
    const user = userEvent.setup();
    render(<NoteConfirmationCard {...defaultProps} />);

    const textarea = screen.getByPlaceholderText("Write your note...");
    await user.clear(textarea);
    await user.type(textarea, "New note content");
    expect(textarea).toHaveValue("New note content");
  });

  it("sends edited text on Save Note", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<NoteConfirmationCard {...defaultProps} onConfirm={onConfirm} />);

    const textarea = screen.getByPlaceholderText("Write your note...");
    await user.clear(textarea);
    await user.type(textarea, "Updated note");
    await user.click(screen.getByText("Save Note"));

    expect(onConfirm).toHaveBeenCalledWith("Updated note");
  });

  it("calls onDeny when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onDeny = vi.fn();
    render(<NoteConfirmationCard {...defaultProps} onDeny={onDeny} />);

    await user.click(screen.getByText("Cancel"));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("renders Save Note and Cancel buttons", () => {
    render(<NoteConfirmationCard {...defaultProps} />);
    expect(screen.getByText("Save Note")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("has action-confirmation-card class for shared styling", () => {
    render(<NoteConfirmationCard {...defaultProps} />);
    const card = document.querySelector(".action-confirmation-card");
    expect(card).toBeInTheDocument();
  });
});
