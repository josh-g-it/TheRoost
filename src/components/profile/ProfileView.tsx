import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlayerSummary, PlaytimeBucketConfig } from "../../types";
import { DEFAULT_PROFILE_CHART_OPTIONS, EMPTY_PROFILE_CHART_FILTERS } from "../../types";
import type { ProfileChartFilters, ProfileChartId } from "../../types/ui";
import type {
  DistributionBucket,
  ScatterPoint,
  LeaderboardEntry,
  LeaderboardMode,
  ProfileDrillDownContext,
} from "../../types/profile";
import { Header } from "../layout/Header";
import { StatCard } from "../common/StatCard";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileDrillDown } from "./ProfileDrillDown";
import { ChartCard } from "./ChartCard";
import { ChartToolbarSelect } from "./ChartToolbar";
import { ChartFilterMenu } from "../activity/cards/ChartFilterMenu";
import { GenreDNARadar } from "./charts/GenreDNARadar";
import { PlaytimeDistribution } from "./charts/PlaytimeDistribution";
import { MetacriticScatter } from "./charts/MetacriticScatter";
import { DevPublisherLeaderboard } from "./charts/DevPublisherLeaderboard";
import { useLibraryStore } from "../../store/librarySlice";
import { useMetadataStore } from "../../store/metadataSlice";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { useSettingsStore } from "../../store/settingsSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useAchievementsStore } from "../../store/achievementsSlice";
import { useDrillDown } from "../../hooks/useDrillDown";
import { steamApi } from "../../services/tauri";
import {
  computeGenreDNA,
  computePlaytimeDistribution,
  computeMetacriticScatter,
  computeDevPubLeaderboard,
  computeQuickStats,
  applyProfileChartFilters,
  getGamesForGenre,
  getGamesForDevPub,
} from "../../utils/profileStats";
import { formatPlaytime, formatBytes } from "../../utils/formatters";
import { logger } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import "./ProfileView.css";

const GENRE_COUNT_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({
  value: n,
  label: `Top ${n}`,
}));

const BUCKET_PRESET_OPTIONS: { value: PlaytimeBucketConfig; label: string }[] = [
  { value: "simple", label: "Simple (4)" },
  { value: "default", label: "Default (6)" },
  { value: "detailed", label: "Detailed (8)" },
];

const LEADERBOARD_N_OPTIONS = [5, 10, 15, 20].map((n) => ({
  value: n,
  label: `Top ${n}`,
}));

export function ProfileView() {
  const library = useLibraryStore((s) => s.library);
  const cache = useMetadataStore((s) => s.cache);
  const fetchBatch = useMetadataStore((s) => s.fetchBatch);
  const favorites = useFavoritesStore((s) => s.favorites);
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const gameTagMap = useTagsStore((s) => s.gameTagMap);
  const profileStats = useAchievementsStore((s) => s.profileStats);
  const loadProfileStats = useAchievementsStore((s) => s.loadProfileStats);
  const drillDown = useDrillDown<ProfileDrillDownContext>();

  const chartOptions = settings?.profileChartOptions ?? DEFAULT_PROFILE_CHART_OPTIONS;

  // Local state for chart options (avoids saving on every change; saves on unmount or change)
  const [genreCount, setGenreCount] = useState(chartOptions.genreRadarCount);
  const [bucketPreset, setBucketPreset] = useState<PlaytimeBucketConfig>(
    chartOptions.playtimeBuckets,
  );
  const [leaderboardN, setLeaderboardN] = useState(chartOptions.leaderboardTopN);

  // Per-chart filter state
  const [chartFilters, setChartFilters] = useState<
    Partial<Record<ProfileChartId, ProfileChartFilters>>
  >(chartOptions.chartFilters ?? {});

  const updateChartFilter = useCallback(
    (chartId: ProfileChartId, patch: Partial<ProfileChartFilters>) => {
      setChartFilters((prev) => ({
        ...prev,
        [chartId]: { ...(prev[chartId] ?? EMPTY_PROFILE_CHART_FILTERS), ...patch },
      }));
    },
    [],
  );

  // Persist chart options when they change
  useEffect(() => {
    if (!settings) return;
    const current = settings.profileChartOptions ?? DEFAULT_PROFILE_CHART_OPTIONS;
    const filtersJson = JSON.stringify(chartFilters);
    const currentFiltersJson = JSON.stringify(current.chartFilters ?? {});
    if (
      genreCount !== current.genreRadarCount ||
      bucketPreset !== current.playtimeBuckets ||
      leaderboardN !== current.leaderboardTopN ||
      filtersJson !== currentFiltersJson
    ) {
      saveSettings({
        ...settings,
        profileChartOptions: {
          genreRadarCount: genreCount,
          playtimeBuckets: bucketPreset,
          leaderboardTopN: leaderboardN,
          chartFilters,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreCount, bucketPreset, leaderboardN, chartFilters]);

  const [playerSummary, setPlayerSummary] = useState<PlayerSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const games = useMemo(() => library?.games ?? [], [library?.games]);
  const allGameIds = useMemo(() => new Set(games.map((g) => g.gameId)), [games]);

  // Filtered game sets per chart
  const genreFilteredGames = useMemo(
    () =>
      applyProfileChartFilters(
        games,
        chartFilters.genreRadar ?? EMPTY_PROFILE_CHART_FILTERS,
        gameTagMap,
        cache,
      ),
    [games, chartFilters.genreRadar, gameTagMap, cache],
  );
  const distributionFilteredGames = useMemo(
    () =>
      applyProfileChartFilters(
        games,
        chartFilters.playtimeDistribution ?? EMPTY_PROFILE_CHART_FILTERS,
        gameTagMap,
        cache,
      ),
    [games, chartFilters.playtimeDistribution, gameTagMap, cache],
  );
  const scatterFilteredGames = useMemo(
    () =>
      applyProfileChartFilters(
        games,
        chartFilters.metacriticScatter ?? EMPTY_PROFILE_CHART_FILTERS,
        gameTagMap,
        cache,
      ),
    [games, chartFilters.metacriticScatter, gameTagMap, cache],
  );
  const leaderboardFilteredGames = useMemo(
    () =>
      applyProfileChartFilters(
        games,
        chartFilters.devPubLeaderboard ?? EMPTY_PROFILE_CHART_FILTERS,
        gameTagMap,
        cache,
      ),
    [games, chartFilters.devPubLeaderboard, gameTagMap, cache],
  );

  // Fetch player summary on mount
  useEffect(() => {
    if (!settings?.steamId) {
      logger.info(
        "ProfileView",
        "profile",
        "Skipping player summary fetch — missing Steam ID",
      );
      return;
    }

    setIsLoading(true);
    logger.info("ProfileView", "profile", "Fetching player summary", {
      steamId: settings.steamId,
    });

    steamApi
      .fetchPlayerSummary(settings.steamId)
      .then((summary) => {
        setPlayerSummary(summary);
        logger.info("ProfileView", "profile", "Player summary loaded", {
          personaName: summary.personaName,
        });
      })
      .catch((e) => {
        logger.error(
          "ProfileView",
          "profile",
          `Failed to fetch player summary: ${getErrorMessage(e)}`,
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [settings?.steamId]);

  // Load cached achievement stats for profile
  useEffect(() => {
    loadProfileStats();
  }, [loadProfileStats]);

  // Compute achievement totals from cached stats
  const achievementTotals = useMemo(() => {
    if (!profileStats || profileStats.size === 0) return null;
    let totalUnlocked = 0;
    let totalAll = 0;
    let gamesWithAchievements = 0;
    for (const { total, unlocked } of profileStats.values()) {
      if (total > 0) {
        totalUnlocked += unlocked;
        totalAll += total;
        gamesWithAchievements++;
      }
    }
    const avgCompletion =
      gamesWithAchievements > 0 ? Math.round((totalUnlocked / totalAll) * 100) : 0;
    return { totalUnlocked, totalAll, gamesWithAchievements, avgCompletion };
  }, [profileStats]);

  // Ensure metadata cache is populated for chart computations
  useEffect(() => {
    if (games.length === 0) return;
    const gameIds = games.map((g) => g.gameId);
    logger.info("ProfileView", "profile", "Fetching metadata batch for profile charts", {
      count: gameIds.length,
    });
    fetchBatch(gameIds);
  }, [games, fetchBatch]);

  const genreData = useMemo(
    () => computeGenreDNA(genreFilteredGames, cache, genreCount),
    [genreFilteredGames, cache, genreCount],
  );

  const distributionData = useMemo(
    () => computePlaytimeDistribution(distributionFilteredGames, bucketPreset),
    [distributionFilteredGames, bucketPreset],
  );

  const scatterData = useMemo(
    () => computeMetacriticScatter(scatterFilteredGames, cache),
    [scatterFilteredGames, cache],
  );

  const devData = useMemo(
    () =>
      computeDevPubLeaderboard(
        leaderboardFilteredGames,
        cache,
        "developer",
        leaderboardN,
      ),
    [leaderboardFilteredGames, cache, leaderboardN],
  );

  const pubData = useMemo(
    () =>
      computeDevPubLeaderboard(
        leaderboardFilteredGames,
        cache,
        "publisher",
        leaderboardN,
      ),
    [leaderboardFilteredGames, cache, leaderboardN],
  );

  const quickStats = useMemo(
    () => computeQuickStats(games, cache, favorites),
    [games, cache, favorites],
  );

  // ── Drill-down click handlers ──────────────────────────────────

  const handleGenreClick = useCallback(
    (genre: string) => {
      const drillGames = getGamesForGenre(genreFilteredGames, genre, cache);
      drillDown.open({
        title: genre,
        subtitle: `${drillGames.length} game${drillGames.length !== 1 ? "s" : ""} in this genre`,
        games: drillGames,
      });
    },
    [genreFilteredGames, cache, drillDown],
  );

  const handleBucketClick = useCallback(
    (bucket: DistributionBucket) => {
      drillDown.open({
        title: bucket.label,
        subtitle: `${bucket.count} game${bucket.count !== 1 ? "s" : ""}`,
        games: bucket.games.map((g) => ({
          gameId: g.gameId,
          name: g.name,
          source:
            distributionFilteredGames.find((fg) => fg.gameId === g.gameId)?.source ?? "",
          playtimeMinutes: Math.round(g.playtime * 60),
        })),
      });
    },
    [distributionFilteredGames, drillDown],
  );

  const handleScatterClick = useCallback(
    (point: ScatterPoint) => {
      const game = scatterFilteredGames.find((g) => g.gameId === point.gameId);
      drillDown.open({
        title: point.name,
        subtitle: `Metacritic: ${point.metacritic} — ${point.playtimeHours}h played`,
        games: game
          ? [
              {
                gameId: game.gameId,
                name: game.name,
                source: game.source,
                playtimeMinutes: game.playtimeForever,
              },
            ]
          : [],
      });
    },
    [scatterFilteredGames, drillDown],
  );

  const handleLeaderboardClick = useCallback(
    (entry: LeaderboardEntry, mode: LeaderboardMode) => {
      const drillGames = getGamesForDevPub(
        leaderboardFilteredGames,
        entry.name,
        mode,
        cache,
      );
      drillDown.open({
        title: entry.name,
        subtitle: `${mode === "developer" ? "Developer" : "Publisher"} — ${entry.totalHours}h across ${entry.gameCount} game${entry.gameCount !== 1 ? "s" : ""}`,
        games: drillGames,
      });
    },
    [leaderboardFilteredGames, cache, drillDown],
  );

  // ── Filter menu prop helpers ───────────────────────────────────

  const filterProps = useCallback(
    (chartId: ProfileChartId) => {
      const f = chartFilters[chartId] ?? EMPTY_PROFILE_CHART_FILTERS;
      return {
        filterByTagIds: f.filterByTagIds,
        filterBySource: f.filterBySource,
        filterByGenreIds: f.filterByGenreIds,
        filterBySteamTagNames: f.filterBySteamTagNames,
        filterByCategoryIds: f.filterByCategoryIds,
        playedGameIds: allGameIds,
        onChange: (opts: Partial<ProfileChartFilters>) =>
          updateChartFilter(chartId, opts),
      };
    },
    [chartFilters, allGameIds, updateChartFilter],
  );

  return (
    <div className="profile-view">
      <Header title="Profile" subtitle="Your gaming identity" />

      <ProfileHeader
        playerSummary={playerSummary}
        quickStats={quickStats}
        isLoading={isLoading}
      />

      <div className="profile-view__quick-stats">
        <StatCard
          label="Most Played"
          value={quickStats.mostPlayedGame?.name ?? "\u2014"}
        />
        <StatCard
          label="Avg Playtime"
          value={formatPlaytime(quickStats.averagePlaytime * 60)}
        />
        <StatCard
          label="Median Playtime"
          value={formatPlaytime(quickStats.medianPlaytime * 60)}
        />
        <StatCard label="Disk Usage" value={formatBytes(quickStats.totalDiskUsage)} />
        {achievementTotals && (
          <>
            <StatCard
              label="Achievements"
              value={`${achievementTotals.totalUnlocked} / ${achievementTotals.totalAll}`}
            />
            <StatCard
              label="Avg Completion"
              value={`${achievementTotals.avgCompletion}%`}
            />
          </>
        )}
      </div>

      <div className="profile-view__charts">
        <ChartCard
          title="Genre DNA"
          subtitle="Your top genres by playtime"
          isEmpty={genreData.length === 0}
          emptyMessage="No genre data available — metadata may still be loading"
          actions={
            <>
              <ChartFilterMenu {...filterProps("genreRadar")} />
              <ChartToolbarSelect
                label="Show"
                value={genreCount}
                options={GENRE_COUNT_OPTIONS}
                onChange={(v) => setGenreCount(Number(v))}
              />
            </>
          }
        >
          <GenreDNARadar data={genreData} onGenreClick={handleGenreClick} />
        </ChartCard>

        <ChartCard
          title="Playtime Distribution"
          subtitle="How your games break down by hours played"
          isEmpty={distributionData.every((b) => b.count === 0)}
          emptyMessage="No games in your library"
          actions={
            <>
              <ChartFilterMenu {...filterProps("playtimeDistribution")} />
              <ChartToolbarSelect
                label="Buckets"
                value={bucketPreset}
                options={BUCKET_PRESET_OPTIONS}
                onChange={(v) => setBucketPreset(v as PlaytimeBucketConfig)}
              />
            </>
          }
        >
          <PlaytimeDistribution
            data={distributionData}
            onBucketClick={handleBucketClick}
          />
        </ChartCard>

        <ChartCard
          title="Metacritic vs Playtime"
          subtitle="Review scores compared to your actual playtime"
          isEmpty={scatterData.length === 0}
          emptyMessage="No Metacritic data available"
          actions={<ChartFilterMenu {...filterProps("metacriticScatter")} />}
        >
          <MetacriticScatter data={scatterData} onDotClick={handleScatterClick} />
        </ChartCard>

        <ChartCard
          title="Developer & Publisher Leaderboard"
          subtitle="Who makes the games you play the most"
          isEmpty={devData.length === 0 && pubData.length === 0}
          emptyMessage="No developer/publisher data available"
          actions={
            <>
              <ChartFilterMenu {...filterProps("devPubLeaderboard")} />
              <ChartToolbarSelect
                label="Show"
                value={leaderboardN}
                options={LEADERBOARD_N_OPTIONS}
                onChange={(v) => setLeaderboardN(Number(v))}
              />
            </>
          }
        >
          <DevPublisherLeaderboard
            developerData={devData}
            publisherData={pubData}
            onBarClick={handleLeaderboardClick}
          />
        </ChartCard>
      </div>

      {drillDown.isOpen && drillDown.context && (
        <ProfileDrillDown context={drillDown.context} onClose={drillDown.close} />
      )}
    </div>
  );
}
