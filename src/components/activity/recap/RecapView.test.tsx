import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecapView } from "./RecapView";
import { makeRecap } from "../../../test/factories";

// Mock recharts — components render simple divs so we can assert structure
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => <div />,
  Legend: () => <div />,
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div />,
}));

// Mock useChartColors since getComputedStyle returns empty strings in jsdom
vi.mock("../../../components/profile/charts/useChartColors", () => ({
  useChartColors: () => ({
    accent: "#6366f1",
    accentSecondary: "#8b5cf6",
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    textPrimary: "#ffffff",
    textSecondary: "#a1a1aa",
    textTertiary: "#71717a",
    bgSecondary: "#27272a",
    bgTertiary: "#3f3f46",
    border: "#3f3f46",
  }),
}));

describe("RecapView", () => {
  it("renders the empty state when totalSessions is 0", () => {
    const recap = makeRecap({ totalSessions: 0 });
    render(<RecapView recap={recap} />);

    expect(screen.getByText(/no gaming activity this period/i)).toBeInTheDocument();
    expect(screen.getByText("February 2026")).toBeInTheDocument();
  });

  it("renders yearly empty state with correct label", () => {
    const recap = makeRecap({
      periodType: "yearly",
      periodKey: "2025",
      totalSessions: 0,
    });
    render(<RecapView recap={recap} />);

    expect(screen.getByText("2025 Year in Review")).toBeInTheDocument();
    expect(screen.getByText(/no gaming activity/i)).toBeInTheDocument();
  });

  it("renders the hero section with top game and period label", () => {
    const recap = makeRecap();
    const { container } = render(<RecapView recap={recap} />);

    expect(screen.getByText("February 2026")).toBeInTheDocument();
    // Top game name appears in the hero spotlight
    const spotlightName = container.querySelector(".recap-hero__spotlight-name");
    expect(spotlightName).toHaveTextContent("Elden Ring");
    expect(screen.getByText("Game of the Month")).toBeInTheDocument();
    // "total playtime" appears in both hero and stats grid, so target the hero label specifically
    const heroLabel = container.querySelector(".recap-hero__total-label");
    expect(heroLabel).toHaveTextContent("total playtime");
  });

  it("shows 'Game of the Year' for yearly recaps", () => {
    const recap = makeRecap({
      periodType: "yearly",
      periodKey: "2025",
    });
    render(<RecapView recap={recap} />);

    expect(screen.getByText("2025 Year in Review")).toBeInTheDocument();
    expect(screen.getByText("Game of the Year")).toBeInTheDocument();
  });

  it("renders the stats grid", () => {
    const recap = makeRecap();
    render(<RecapView recap={recap} />);

    expect(screen.getByText("Total Playtime")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Unique Games")).toBeInTheDocument();
    expect(screen.getByText("Avg Session")).toBeInTheDocument();
    expect(screen.getByText("Longest Session")).toBeInTheDocument();
    expect(screen.getByText("Play Streak")).toBeInTheDocument();
    expect(screen.getByText("Busiest Day")).toBeInTheDocument();
  });

  it("renders top games chart when more than 1 top game", () => {
    const recap = makeRecap({
      topGames: [
        { gameId: "g1", name: "Elden Ring", minutes: 600, sessions: 15 },
        { gameId: "g2", name: "Hades", minutes: 300, sessions: 8 },
      ],
    });
    render(<RecapView recap={recap} />);

    expect(screen.getByText("Top Games")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("hides top games section when only 1 top game", () => {
    const recap = makeRecap({
      topGames: [{ gameId: "g1", name: "Elden Ring", minutes: 600, sessions: 15 }],
    });
    render(<RecapView recap={recap} />);

    expect(screen.queryByText("Top Games")).not.toBeInTheDocument();
  });

  it("renders genre breakdown when genres exist", () => {
    const recap = makeRecap({
      genreBreakdown: [
        { genre: "Action", minutes: 600, percentage: 60 },
        { genre: "RPG", minutes: 400, percentage: 40 },
      ],
    });
    render(<RecapView recap={recap} />);

    expect(screen.getByText("Genre Breakdown")).toBeInTheDocument();
    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
  });

  it("hides genre breakdown when no genres", () => {
    const recap = makeRecap({ genreBreakdown: [] });
    render(<RecapView recap={recap} />);

    expect(screen.queryByText("Genre Breakdown")).not.toBeInTheDocument();
  });

  it("hides monthly timeline for monthly recaps", () => {
    const recap = makeRecap({
      periodType: "monthly",
      monthlyPlaytime: [100, 200, 150, 80, 60, 40, 30, 50, 90, 120, 140, 160],
    });
    render(<RecapView recap={recap} />);

    expect(screen.queryByText("Month by Month")).not.toBeInTheDocument();
  });

  it("shows monthly timeline for yearly recaps with monthlyPlaytime data", () => {
    const recap = makeRecap({
      periodType: "yearly",
      periodKey: "2025",
      monthlyPlaytime: [100, 200, 150, 80, 60, 40, 30, 50, 90, 120, 140, 160],
    });
    render(<RecapView recap={recap} />);

    expect(screen.getByText("Month by Month")).toBeInTheDocument();
    expect(screen.getByTestId("area-chart")).toBeInTheDocument();
  });

  it("hides monthly timeline for yearly recaps without monthlyPlaytime", () => {
    const recap = makeRecap({
      periodType: "yearly",
      periodKey: "2025",
      monthlyPlaytime: undefined,
    });
    render(<RecapView recap={recap} />);

    expect(screen.queryByText("Month by Month")).not.toBeInTheDocument();
  });

  it("renders discoveries section when there are new discoveries", () => {
    const recap = makeRecap({
      newDiscoveries: [
        { gameId: "g3", name: "Celeste" },
        { gameId: "g4", name: "Hollow Knight" },
      ],
    });
    render(<RecapView recap={recap} />);

    expect(screen.getByText(/New Discoveries/)).toBeInTheDocument();
    expect(screen.getByText("Celeste")).toBeInTheDocument();
    expect(screen.getByText("Hollow Knight")).toBeInTheDocument();
    expect(screen.getByText(/Games you played for the first time/)).toBeInTheDocument();
  });

  it("hides discoveries section when no discoveries", () => {
    const recap = makeRecap({ newDiscoveries: [] });
    render(<RecapView recap={recap} />);

    expect(screen.queryByText(/New Discoveries/)).not.toBeInTheDocument();
  });

  it("renders achievements section when achievementsUnlocked > 0", () => {
    const recap = makeRecap({
      achievementsUnlocked: 12,
      notableAchievements: [
        {
          gameName: "Elden Ring",
          achievementName: "Lord of Frenzied Flame",
          rarity: 3.2,
        },
      ],
    });
    render(<RecapView recap={recap} />);

    expect(screen.getByText(/Achievements Unlocked/)).toBeInTheDocument();
    expect(screen.getByText("Lord of Frenzied Flame")).toBeInTheDocument();
    expect(screen.getByText("3.2% of players")).toBeInTheDocument();
    expect(screen.getByText(/Rarest unlocks/)).toBeInTheDocument();
  });

  it("hides achievements section when achievementsUnlocked is 0", () => {
    const recap = makeRecap({
      achievementsUnlocked: 0,
      notableAchievements: [],
    });
    render(<RecapView recap={recap} />);

    expect(screen.queryByText(/Achievements Unlocked/)).not.toBeInTheDocument();
  });

  it("renders fun comparisons when present", () => {
    const recap = makeRecap({
      funComparisons: [
        { activity: "watching the Lord of the Rings trilogy", count: 1.8, emoji: "🎬" },
        { activity: "running a marathon", count: 0.5, emoji: "🏃" },
      ],
    });
    render(<RecapView recap={recap} />);

    expect(screen.getByText("Put Into Perspective")).toBeInTheDocument();
    expect(screen.getByText(/Your playtime is equivalent to/)).toBeInTheDocument();
    expect(
      screen.getByText(/watching the Lord of the Rings trilogy/),
    ).toBeInTheDocument();
    expect(screen.getByText(/running a marathon/)).toBeInTheDocument();
  });

  it("hides fun comparisons when empty", () => {
    const recap = makeRecap({ funComparisons: [] });
    render(<RecapView recap={recap} />);

    expect(screen.queryByText("Put Into Perspective")).not.toBeInTheDocument();
  });

  it("renders all sections together for a fully populated recap", () => {
    const recap = makeRecap({
      periodType: "yearly",
      periodKey: "2025",
      monthlyPlaytime: [100, 200, 150, 80, 60, 40, 30, 50, 90, 120, 140, 160],
    });
    const { container } = render(<RecapView recap={recap} />);

    // Hero section
    expect(screen.getByText("2025 Year in Review")).toBeInTheDocument();
    const spotlightName = container.querySelector(".recap-hero__spotlight-name");
    expect(spotlightName).toHaveTextContent("Elden Ring");

    // Stats grid
    expect(screen.getByText("Total Playtime")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();

    // Top games
    expect(screen.getByText("Top Games")).toBeInTheDocument();

    // Genre breakdown
    expect(screen.getByText("Genre Breakdown")).toBeInTheDocument();

    // Monthly timeline (yearly only)
    expect(screen.getByText("Month by Month")).toBeInTheDocument();

    // Discoveries
    expect(screen.getByText(/New Discoveries/)).toBeInTheDocument();

    // Achievements
    expect(screen.getByText(/Achievements Unlocked/)).toBeInTheDocument();

    // Fun comparisons
    expect(screen.getByText("Put Into Perspective")).toBeInTheDocument();
  });

  it("displays formatted trend text when prevPeriodMinutes is set", () => {
    // 1200 total, 1000 prev => +20%
    const recap = makeRecap({ totalMinutes: 1200, prevPeriodMinutes: 1000 });
    render(<RecapView recap={recap} />);

    expect(screen.getByText("+20% vs last period")).toBeInTheDocument();
  });

  it("shows the longest session game name in the stats grid", () => {
    const recap = makeRecap({ longestSessionGameName: "Hades" });
    render(<RecapView recap={recap} />);

    expect(screen.getByText("Hades")).toBeInTheDocument();
  });

  it("shows busiest day info in the stats grid", () => {
    const recap = makeRecap({
      busiestDay: { day: "Sunday", minutes: 360 },
    });
    render(<RecapView recap={recap} />);

    expect(screen.getByText("Sunday")).toBeInTheDocument();
    expect(screen.getByText("6h")).toBeInTheDocument();
  });
});
