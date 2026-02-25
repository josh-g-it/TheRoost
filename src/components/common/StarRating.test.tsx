import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StarRating } from "./StarRating";
import { useSettingsStore } from "../../store/settingsSlice";

beforeEach(() => {
  useSettingsStore.setState({
    settings: {
      iconSet: "classic",
      theme: "dark",
      fontFamily: "system",
      uiScale: "normal",
    } as never,
  });
});

describe("StarRating", () => {
  it("renders 5 stars", () => {
    render(<StarRating value={0} />);
    const stars = screen.getAllByText(
      (_, el) => el?.classList.contains("star-rating__star") ?? false,
    );
    expect(stars).toHaveLength(5);
  });

  it("renders correct filled stars for value 6 (3 full stars)", () => {
    const { container } = render(<StarRating value={6} />);
    const fills = container.querySelectorAll(
      ".star-rating__fill:not(.star-rating__fill--half)",
    );
    const halfs = container.querySelectorAll(".star-rating__fill--half");
    expect(fills).toHaveLength(3);
    expect(halfs).toHaveLength(0);
  });

  it("renders a half star for value 7 (3.5 stars)", () => {
    const { container } = render(<StarRating value={7} />);
    const fills = container.querySelectorAll(
      ".star-rating__fill:not(.star-rating__fill--half)",
    );
    const halfs = container.querySelectorAll(".star-rating__fill--half");
    expect(fills).toHaveLength(3);
    expect(halfs).toHaveLength(1);
  });

  it("shows all empty stars for value 0", () => {
    const { container } = render(<StarRating value={0} />);
    const fills = container.querySelectorAll(".star-rating__fill");
    expect(fills).toHaveLength(0);
  });

  it("shows all filled stars for value 10", () => {
    const { container } = render(<StarRating value={10} />);
    const fills = container.querySelectorAll(
      ".star-rating__fill:not(.star-rating__fill--half)",
    );
    expect(fills).toHaveLength(5);
  });

  it("does not add interactive class in read-only mode", () => {
    const { container } = render(<StarRating value={5} />);
    expect(container.querySelector(".star-rating--interactive")).toBeNull();
  });

  it("adds interactive class when onChange is provided", () => {
    const { container } = render(<StarRating value={5} onChange={vi.fn()} />);
    expect(container.querySelector(".star-rating--interactive")).not.toBeNull();
  });

  it("calls onChange on click", () => {
    const onChange = vi.fn();
    const { container } = render(<StarRating value={0} onChange={onChange} size={20} />);
    const stars = container.querySelectorAll(".star-rating__star");
    // Click on the third star — simulate right-half click
    fireEvent.click(stars[2], { clientX: 100 });
    expect(onChange).toHaveBeenCalled();
  });
});
