import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { SpriteRenderer } from "./SpriteRenderer";
import type { Expression } from "../../types/assistant";

// Minimal 1×1 PNG as base64 data URL for testing
const TEST_SPRITE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("SpriteRenderer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders monogram fallback when spriteDataUrl is null", () => {
    render(
      <SpriteRenderer
        spriteDataUrl={null}
        expression="neutral"
        size={64}
        fallbackText="Sage"
      />,
    );
    const el = document.querySelector(".sprite-renderer--monogram");
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe("S");
  });

  it("renders default fallback text when fallbackText is not provided", () => {
    render(<SpriteRenderer spriteDataUrl={null} expression="neutral" size={64} />);
    const el = document.querySelector(".sprite-renderer--monogram");
    expect(el!.textContent).toBe("?");
  });

  it("renders sprite with correct background-position for neutral (index 0)", () => {
    render(
      <SpriteRenderer spriteDataUrl={TEST_SPRITE_URL} expression="neutral" size={64} />,
    );
    const el = document.querySelector(".sprite-renderer") as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.backgroundPosition).toBe("0px 0px");
    expect(el.style.backgroundSize).toBe("256px 128px"); // 4*64 x 2*64
    expect(el.dataset.expression).toBe("neutral");
  });

  it("renders correct background-position for speaking (index 1)", () => {
    render(
      <SpriteRenderer spriteDataUrl={TEST_SPRITE_URL} expression="speaking" size={64} />,
    );
    const el = document.querySelector(".sprite-renderer") as HTMLElement;
    expect(el.style.backgroundPosition).toBe("-64px 0px");
  });

  it("renders correct background-position for happy (index 4, row 1 col 0)", () => {
    render(
      <SpriteRenderer spriteDataUrl={TEST_SPRITE_URL} expression="happy" size={64} />,
    );
    const el = document.querySelector(".sprite-renderer") as HTMLElement;
    expect(el.style.backgroundPosition).toBe("0px -64px");
  });

  it("renders correct background-position for bored (index 7, row 1 col 3)", () => {
    render(
      <SpriteRenderer spriteDataUrl={TEST_SPRITE_URL} expression="bored" size={64} />,
    );
    const el = document.querySelector(".sprite-renderer") as HTMLElement;
    expect(el.style.backgroundPosition).toBe("-192px -64px");
  });

  it("applies circular class when circular prop is true", () => {
    render(
      <SpriteRenderer
        spriteDataUrl={TEST_SPRITE_URL}
        expression="neutral"
        size={64}
        circular
      />,
    );
    const el = document.querySelector(".sprite-renderer--circular");
    expect(el).toBeTruthy();
  });

  it("applies circular class to monogram fallback", () => {
    render(
      <SpriteRenderer spriteDataUrl={null} expression="neutral" size={64} circular />,
    );
    const el = document.querySelector(
      ".sprite-renderer--monogram.sprite-renderer--circular",
    );
    expect(el).toBeTruthy();
  });

  it("applies bump animation on expression change", () => {
    const { rerender } = render(
      <SpriteRenderer spriteDataUrl={TEST_SPRITE_URL} expression="neutral" size={64} />,
    );

    // Change expression
    rerender(
      <SpriteRenderer spriteDataUrl={TEST_SPRITE_URL} expression="happy" size={64} />,
    );

    const el = document.querySelector(".sprite-renderer--bump");
    expect(el).toBeTruthy();

    // After 200ms, bump class should be removed
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const stillBumping = document.querySelector(".sprite-renderer--bump");
    expect(stillBumping).toBeNull();
  });

  it("does not animate on initial render", () => {
    render(
      <SpriteRenderer spriteDataUrl={TEST_SPRITE_URL} expression="happy" size={64} />,
    );
    const el = document.querySelector(".sprite-renderer--bump");
    expect(el).toBeNull();
  });

  it("does not animate for monogram fallback", () => {
    const { rerender } = render(
      <SpriteRenderer
        spriteDataUrl={null}
        expression="neutral"
        size={64}
        fallbackText="A"
      />,
    );
    rerender(
      <SpriteRenderer
        spriteDataUrl={null}
        expression="happy"
        size={64}
        fallbackText="A"
      />,
    );
    const el = document.querySelector(".sprite-renderer--bump");
    expect(el).toBeNull();
  });

  it("renders at correct size", () => {
    render(
      <SpriteRenderer spriteDataUrl={TEST_SPRITE_URL} expression="neutral" size={128} />,
    );
    const el = document.querySelector(".sprite-renderer") as HTMLElement;
    expect(el.style.width).toBe("128px");
    expect(el.style.height).toBe("128px");
    expect(el.style.backgroundSize).toBe("512px 256px");
  });

  it("applies custom className", () => {
    render(
      <SpriteRenderer
        spriteDataUrl={TEST_SPRITE_URL}
        expression="neutral"
        size={64}
        className="my-custom-class"
      />,
    );
    const el = document.querySelector(".my-custom-class");
    expect(el).toBeTruthy();
  });

  it("applies crop offsets to background position", () => {
    const offsets = [
      { x: 5, y: -3 }, // neutral
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    render(
      <SpriteRenderer
        spriteDataUrl={TEST_SPRITE_URL}
        expression="neutral"
        size={64}
        cropOffsets={offsets}
      />,
    );
    const el = document.querySelector(".sprite-renderer") as HTMLElement;
    // neutral is col=0, row=0 → base pos 0,0 + offset 5,-3
    expect(el.style.backgroundPosition).toBe("5px -3px");
  });

  it("renders all 8 expressions with correct positions", () => {
    const expressions: Expression[] = [
      "neutral",
      "speaking",
      "listening",
      "sleepy",
      "happy",
      "sad",
      "interested",
      "bored",
    ];
    const expectedPositions = [
      "0px 0px", // neutral: col=0, row=0
      "-64px 0px", // speaking: col=1, row=0
      "-128px 0px", // listening: col=2, row=0
      "-192px 0px", // sleepy: col=3, row=0
      "0px -64px", // happy: col=0, row=1
      "-64px -64px", // sad: col=1, row=1
      "-128px -64px", // interested: col=2, row=1
      "-192px -64px", // bored: col=3, row=1
    ];

    expressions.forEach((expr, i) => {
      const { unmount } = render(
        <SpriteRenderer spriteDataUrl={TEST_SPRITE_URL} expression={expr} size={64} />,
      );
      const el = document.querySelector(".sprite-renderer") as HTMLElement;
      expect(el.style.backgroundPosition).toBe(expectedPositions[i]);
      unmount();
    });
  });

  it("adds button role and tabIndex when onClick is provided", () => {
    const handleClick = vi.fn();
    render(
      <SpriteRenderer
        spriteDataUrl={TEST_SPRITE_URL}
        expression="neutral"
        size={64}
        onClick={handleClick}
      />,
    );
    const el = document.querySelector('.sprite-renderer[role="button"]') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.tabIndex).toBe(0);
  });

  it("does not add button role when onClick is not provided", () => {
    render(
      <SpriteRenderer spriteDataUrl={TEST_SPRITE_URL} expression="neutral" size={64} />,
    );
    const el = document.querySelector('.sprite-renderer[role="button"]');
    expect(el).toBeNull();
  });
});
