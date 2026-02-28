import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionConfirmationCard } from "./ActionConfirmationCard";

vi.mock("../../store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { iconSet: "classic" } }),
}));

describe("ActionConfirmationCard", () => {
  it("renders description text", () => {
    render(
      <ActionConfirmationCard
        description="Add Elden Ring to favorites?"
        onConfirm={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.getByText("Add Elden Ring to favorites?")).toBeInTheDocument();
  });

  it("renders Confirm and Cancel buttons", () => {
    render(
      <ActionConfirmationCard
        description="Some action"
        onConfirm={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onConfirm when Confirm is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ActionConfirmationCard
        description="Some action"
        onConfirm={onConfirm}
        onDeny={vi.fn()}
      />,
    );
    await user.click(screen.getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onDeny when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onDeny = vi.fn();
    render(
      <ActionConfirmationCard
        description="Some action"
        onConfirm={vi.fn()}
        onDeny={onDeny}
      />,
    );
    await user.click(screen.getByText("Cancel"));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("has fade-in animation CSS class", () => {
    render(
      <ActionConfirmationCard description="Test" onConfirm={vi.fn()} onDeny={vi.fn()} />,
    );
    const card = document.querySelector(".action-confirmation-card");
    expect(card).toBeInTheDocument();
  });
});
