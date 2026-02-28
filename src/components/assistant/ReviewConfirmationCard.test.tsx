import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewConfirmationCard } from "./ReviewConfirmationCard";

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
}));

describe("ReviewConfirmationCard", () => {
  const defaultProps = {
    gameName: "Elden Ring",
    stars: 4,
    reviewText: "Great game with challenging combat.",
    onConfirm: vi.fn(),
    onDeny: vi.fn(),
  };

  it("renders game name", () => {
    render(<ReviewConfirmationCard {...defaultProps} />);
    expect(screen.getByText("Review: Elden Ring")).toBeInTheDocument();
  });

  it("renders star rating", () => {
    render(<ReviewConfirmationCard {...defaultProps} />);
    // StarRating with value 8 (4*2) should show aria label
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("renders review text in textarea", () => {
    render(<ReviewConfirmationCard {...defaultProps} />);
    const textarea = screen.getByPlaceholderText("Write your review...");
    expect(textarea).toHaveValue("Great game with challenging combat.");
  });

  it("review text is editable", async () => {
    const user = userEvent.setup();
    render(<ReviewConfirmationCard {...defaultProps} />);

    const textarea = screen.getByPlaceholderText("Write your review...");
    await user.clear(textarea);
    await user.type(textarea, "Updated review");
    expect(textarea).toHaveValue("Updated review");
  });

  it("sends edited values on Save Review", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ReviewConfirmationCard {...defaultProps} onConfirm={onConfirm} />);

    const textarea = screen.getByPlaceholderText("Write your review...");
    await user.clear(textarea);
    await user.type(textarea, "Modified review");
    await user.click(screen.getByText("Save Review"));

    // Stars remain unchanged (4), text is the modified one
    expect(onConfirm).toHaveBeenCalledWith(4, "Modified review");
  });

  it("calls onDeny when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onDeny = vi.fn();
    render(<ReviewConfirmationCard {...defaultProps} onDeny={onDeny} />);

    await user.click(screen.getByText("Cancel"));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("renders Save Review and Cancel buttons", () => {
    render(<ReviewConfirmationCard {...defaultProps} />);
    expect(screen.getByText("Save Review")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("has action-confirmation-card class for shared styling", () => {
    render(<ReviewConfirmationCard {...defaultProps} />);
    const card = document.querySelector(".action-confirmation-card");
    expect(card).toBeInTheDocument();
  });
});
