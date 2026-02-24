import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { RouteErrorFallback } from "./RouteErrorFallback";
import { useSettingsStore } from "../../store/settingsSlice";

// RouteErrorFallback uses AppIcon which reads settingsStore
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

function CrashingComponent(): React.ReactNode {
  throw new Error("Test render error");
}

function createTestRouter(initialPath: string) {
  return createMemoryRouter(
    [
      {
        path: "/library",
        element: <div>Library</div>,
      },
      {
        path: "/activity",
        element: <CrashingComponent />,
        errorElement: <RouteErrorFallback />,
      },
    ],
    { initialEntries: [initialPath] },
  );
}

describe("RouteErrorFallback", () => {
  it("renders the error fallback with page name when a route crashes", () => {
    const router = createTestRouter("/activity");
    render(<RouterProvider router={router} />);

    expect(screen.getByText("Activity encountered an error")).toBeInTheDocument();
  });

  it("shows the error message in details", () => {
    const router = createTestRouter("/activity");
    render(<RouterProvider router={router} />);

    expect(screen.getByText("Test render error")).toBeInTheDocument();
  });

  it("renders Try Again and Go to Library buttons", () => {
    const router = createTestRouter("/activity");
    render(<RouterProvider router={router} />);

    expect(screen.getByText("Try Again")).toBeInTheDocument();
    expect(screen.getByText("Go to Library")).toBeInTheDocument();
  });

  it("navigates to /library when Go to Library is clicked", async () => {
    const router = createTestRouter("/activity");
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByText("Go to Library"));

    await waitFor(() => {
      expect(screen.getByText("Library")).toBeInTheDocument();
    });
  });
});
