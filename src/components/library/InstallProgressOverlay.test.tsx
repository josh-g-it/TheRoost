import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InstallProgressOverlay } from "./InstallProgressOverlay";
import { makeInstallProgress } from "../../test/factories";

describe("InstallProgressOverlay", () => {
  it("renders downloading label with percentage", () => {
    const progress = makeInstallProgress({
      sourceId: "100",
      progress: 0.42,
      status: "downloading",
    });
    render(<InstallProgressOverlay progress={progress} />);
    expect(screen.getByText("Downloading 42%")).toBeInTheDocument();
  });

  it("renders staging label", () => {
    const progress = makeInstallProgress({
      sourceId: "100",
      progress: 0.75,
      status: "staging",
    });
    render(<InstallProgressOverlay progress={progress} />);
    expect(screen.getByText("Installing 75%")).toBeInTheDocument();
  });

  it("renders update queued label", () => {
    const progress = makeInstallProgress({
      sourceId: "100",
      progress: 0,
      status: "update_required",
    });
    render(<InstallProgressOverlay progress={progress} />);
    expect(screen.getByText("Update queued")).toBeInTheDocument();
  });

  it("renders pending label for unknown status", () => {
    const progress = makeInstallProgress({
      sourceId: "100",
      progress: 0,
      status: "pending",
    });
    render(<InstallProgressOverlay progress={progress} />);
    expect(screen.getByText("Pending...")).toBeInTheDocument();
  });

  it("renders progress bar with correct width", () => {
    const progress = makeInstallProgress({ sourceId: "100", progress: 0.6 });
    const { container } = render(<InstallProgressOverlay progress={progress} />);
    const fill = container.querySelector(
      ".install-progress-overlay__fill",
    ) as HTMLElement;
    expect(fill.style.width).toBe("60%");
  });
});
