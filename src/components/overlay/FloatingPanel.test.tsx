import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingPanel } from "./FloatingPanel";
import { useSettingsStore } from "../../store/settingsSlice";

// FloatingPanel uses AppIcon which reads settingsStore
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

describe("FloatingPanel", () => {
  const defaultProps = {
    panelId: "game-notes" as const,
    title: "Test Panel",
    defaultPosition: { x: 100, y: 100 },
    onPositionChange: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders title and children", () => {
    render(
      <FloatingPanel {...defaultProps}>
        <div data-testid="child">Hello</div>
      </FloatingPanel>,
    );

    expect(screen.getByText("Test Panel")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders pin button", () => {
    render(
      <FloatingPanel {...defaultProps}>
        <div>Content</div>
      </FloatingPanel>,
    );

    expect(screen.getByTitle("Lock panel")).toBeInTheDocument();
  });

  it("renders close button when onClose provided", () => {
    render(
      <FloatingPanel {...defaultProps}>
        <div>Content</div>
      </FloatingPanel>,
    );

    expect(screen.getByTitle("Close")).toBeInTheDocument();
  });

  it("does not render close button when onClose is undefined", () => {
    render(
      <FloatingPanel
        panelId={defaultProps.panelId}
        title={defaultProps.title}
        defaultPosition={defaultProps.defaultPosition}
        onPositionChange={defaultProps.onPositionChange}
      >
        <div>Content</div>
      </FloatingPanel>,
    );

    expect(screen.queryByTitle("Close")).not.toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <FloatingPanel {...defaultProps} onClose={onClose}>
        <div>Content</div>
      </FloatingPanel>,
    );

    fireEvent.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("toggles pin state on click", () => {
    const onPositionChange = vi.fn();
    render(
      <FloatingPanel {...defaultProps} onPositionChange={onPositionChange}>
        <div>Content</div>
      </FloatingPanel>,
    );

    // Initially "Lock panel" (unpinned)
    const pinBtn = screen.getByTitle("Lock panel");
    fireEvent.click(pinBtn);

    // onPositionChange should be called with pinned: true
    expect(onPositionChange).toHaveBeenCalledWith(
      expect.objectContaining({ pinned: true }),
    );
  });

  it("applies pinned class when pinned", () => {
    render(
      <FloatingPanel {...defaultProps} pinned={true}>
        <div>Content</div>
      </FloatingPanel>,
    );

    // After initial render with pinned=true, should show "Unlock panel"
    expect(screen.getByTitle("Unlock panel")).toBeInTheDocument();
  });

  it("renders resize handle when resizable and not pinned", () => {
    const { container } = render(
      <FloatingPanel {...defaultProps} resizable={true}>
        <div>Content</div>
      </FloatingPanel>,
    );

    expect(container.querySelector(".floating-panel__resize-handle")).toBeInTheDocument();
  });

  it("does not render resize handle when pinned", () => {
    const { container } = render(
      <FloatingPanel {...defaultProps} resizable={true} pinned={true}>
        <div>Content</div>
      </FloatingPanel>,
    );

    expect(
      container.querySelector(".floating-panel__resize-handle"),
    ).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <FloatingPanel {...defaultProps} className="custom-class">
        <div>Content</div>
      </FloatingPanel>,
    );

    expect(container.firstElementChild).toHaveClass("custom-class");
  });
});
