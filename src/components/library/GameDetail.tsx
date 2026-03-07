import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GameImage } from "./GameImage";
import { Button } from "../common/Button";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { AppIcon } from "../common/AppIcon";
import { GenreTag } from "../common/GenreTag";
import { UserTag } from "../common/UserTag";
import { TagPicker } from "./TagPicker";
import { SessionHeatmap } from "../sessions/SessionHeatmap";
import { SessionTimeline } from "../sessions/SessionTimeline";
import { AchievementSection } from "./AchievementSection";
import {
  formatPlaytime,
  formatBytes,
  formatLastPlayed,
  getSourceDisplayName,
} from "../../utils/formatters";
import { useGameLaunch } from "../../hooks/useGameLaunch";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { useLibraryStore } from "../../store/librarySlice";
import { customGameApi, gameApi, notesApi, sessionApi } from "../../services/tauri";
import { logger } from "../../utils/logger";
import { useMetadataStore } from "../../store/metadataSlice";
import { useSessionStore } from "../../store/sessionSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { useHiddenGamesStore } from "../../store/hiddenGamesSlice";
import { useUIStore } from "../../store/uiSlice";
import { useRatingsStore } from "../../store/ratingsSlice";
import { useShelvesStore } from "../../store/shelvesSlice";
import { useInstallStore } from "../../store/installSlice";
import { InstallProgressOverlay } from "./InstallProgressOverlay";
import { steamInstallApi } from "../../services/tauri";
import { StarRating } from "../common/StarRating";
import {
  UNINSTALL_RESCAN_FIRST_MS,
  UNINSTALL_RESCAN_SECOND_MS,
} from "../../constants/timings";
import type { Game } from "../../types";
import type { ScreenshotInfo } from "../../types/metadata";
import "./GameDetail.css";

interface GameDetailProps {
  game: Game;
  onClose: () => void;
  onPersistShelves: () => void;
}

function MetacriticBadge({ score, url }: { score: number; url?: string | null }) {
  let colorClass = "game-detail__metacritic--red";
  if (score >= 75) colorClass = "game-detail__metacritic--green";
  else if (score >= 50) colorClass = "game-detail__metacritic--yellow";

  const badge = <span className={`game-detail__metacritic ${colorClass}`}>{score}</span>;

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="game-detail__metacritic-link"
      >
        {badge}
      </a>
    );
  }
  return badge;
}

function ScreenshotGallery({ screenshots }: { screenshots: ScreenshotInfo[] }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  if (screenshots.length === 0) return null;

  const openLightbox = (idx: number) => {
    setLightboxIdx(idx);
    setLightboxUrl(screenshots[idx].fullUrl);
  };

  const closeLightbox = () => setLightboxUrl(null);

  const navigateLightbox = (delta: number) => {
    const next = lightboxIdx + delta;
    if (next >= 0 && next < screenshots.length) {
      setLightboxIdx(next);
      setLightboxUrl(screenshots[next].fullUrl);
    }
  };

  return (
    <>
      <div className="game-detail__screenshots">
        {screenshots.map((s, i) => (
          <button
            key={s.id}
            className="game-detail__screenshot-link"
            onClick={() => openLightbox(i)}
            type="button"
          >
            <img
              src={s.thumbnailUrl}
              alt="Screenshot"
              className="game-detail__screenshot-img"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {lightboxUrl && (
        <div
          className="screenshot-lightbox"
          onClick={closeLightbox}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeLightbox();
            if (e.key === "ArrowLeft") navigateLightbox(-1);
            if (e.key === "ArrowRight") navigateLightbox(1);
          }}
          role="dialog"
          aria-label="Screenshot viewer"
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          {lightboxIdx > 0 && (
            <button
              className="screenshot-lightbox__nav screenshot-lightbox__nav--prev"
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox(-1);
              }}
              aria-label="Previous screenshot"
              type="button"
            >
              &#8249;
            </button>
          )}
          <img
            src={lightboxUrl}
            alt="Screenshot full size"
            className="screenshot-lightbox__img"
            onClick={(e) => e.stopPropagation()}
          />
          {lightboxIdx < screenshots.length - 1 && (
            <button
              className="screenshot-lightbox__nav screenshot-lightbox__nav--next"
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox(1);
              }}
              aria-label="Next screenshot"
              type="button"
            >
              &#8250;
            </button>
          )}
          <button
            className="screenshot-lightbox__close"
            onClick={closeLightbox}
            aria-label="Close"
            type="button"
          >
            &times;
          </button>
          <span className="screenshot-lightbox__counter">
            {lightboxIdx + 1} / {screenshots.length}
          </span>
        </div>
      )}
    </>
  );
}

export function GameDetail({ game, onClose, onPersistShelves }: GameDetailProps) {
  const navigate = useNavigate();
  const { launch, launching } = useGameLaunch();
  const { confirm, dialogProps } = useConfirmDialog();
  const metadata = useMetadataStore((s) => s.getMetadata(game.gameId));
  const fetchMetadata = useMetadataStore((s) => s.fetchMetadata);
  const gameSessions = useSessionStore((s) => s.gameSessions);
  const loadGameSessions = useSessionStore((s) => s.loadGameSessions);
  const allTags = useTagsStore((s) => s.tags);
  const getGameTagIds = useTagsStore((s) => s.getGameTagIds);
  const setGameTags = useTagsStore((s) => s.setGameTags);
  const isFavorite = useFavoritesStore((s) => s.isFavorite);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const hiddenGames = useHiddenGamesStore((s) => s.hiddenGames);
  const toggleHidden = useHiddenGamesStore((s) => s.toggleHidden);
  const shelves = useShelvesStore((s) => s.shelves);
  const pinGameToShelf = useShelvesStore((s) => s.pinGameToShelf);
  const unpinGameFromShelf = useShelvesStore((s) => s.unpinGameFromShelf);
  const installProgress = useInstallStore((s) => s.activeInstalls.get(game.sourceId));

  const gameTagIds = getGameTagIds(game.gameId);
  const gameTags = allTags.filter((t) => gameTagIds.includes(t.id));
  const availableTags = allTags.filter((t) => !gameTagIds.includes(t.id));
  const favorited = isFavorite(game.gameId);
  const hidden = hiddenGames.has(game.gameId);
  const isNonSteam = game.source && game.source !== "steam";
  const hasLaunchToggle = game.source !== "steam" && game.source !== "manual";

  const [launchMode, setLaunchMode] = useState<string>("launcher");
  const [noteContent, setNoteContent] = useState("");
  const [noteLoading, setNoteLoading] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ratings = useRatingsStore((s) => s.ratings);
  const saveRating = useRatingsStore((s) => s.saveRating);
  const deleteRating = useRatingsStore((s) => s.deleteRating);
  const currentRating = ratings.get(game.gameId);

  const [showReview, setShowReview] = useState(false);
  const [reviewContent, setReviewContent] = useState("");
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uninstallTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      for (const t of uninstallTimersRef.current) clearTimeout(t);
    };
  }, []);

  const [isEditingPlaytime, setIsEditingPlaytime] = useState(false);
  const [playtimeHours, setPlaytimeHours] = useState("");
  const [playtimeMinutes, setPlaytimeMinutes] = useState("");

  const openArtMenu = useUIStore((s) => s.openArtMenu);
  const artVersion = useUIStore((s) => s.artVersion[game.gameId] ?? 0);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMetadata(game.gameId);
    loadGameSessions(game.gameId, 1000);
  }, [game.gameId, fetchMetadata, loadGameSessions]);

  useEffect(() => {
    if (!hasLaunchToggle) return;
    gameApi
      .getLaunchMode(game.gameId)
      .then(setLaunchMode)
      .catch(() => {});
  }, [game.gameId, hasLaunchToggle]);

  // Load game note
  useEffect(() => {
    setNoteLoading(true);
    notesApi
      .getGameNote(game.gameId)
      .then((note) => {
        const text = note?.content ?? "";
        setNoteContent(text);
        if (text.length > 0) setShowNotes(true);
      })
      .catch(() => {})
      .finally(() => setNoteLoading(false));
    return () => {
      if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    };
  }, [game.gameId]);

  // Sync review content when game changes
  useEffect(() => {
    const r = ratings.get(game.gameId);
    setReviewContent(r?.review ?? "");
    if (r?.review && r.review.length > 0) setShowReview(true);
    return () => {
      if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
    };
  }, [game.gameId, ratings]);

  const artMenuGameId = useUIStore((s) => s.artMenuGameId);

  // Close on Escape (skip if art menu is open — it handles its own Escape)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !artMenuGameId) {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, artMenuGameId]);

  // Auto-focus close button on mount
  useEffect(() => {
    const closeBtn = dialogRef.current?.querySelector<HTMLElement>(".game-detail__close");
    closeBtn?.focus();
  }, []);

  return (
    <div
      className="game-detail-overlay"
      onClick={onClose}
      role="dialog"
      aria-label={`${game.name} details`}
    >
      <div ref={dialogRef} className="game-detail" onClick={(e) => e.stopPropagation()}>
        <button
          className="game-detail__close"
          onClick={onClose}
          aria-label="Close game details"
        >
          <AppIcon name="close" size={18} />
        </button>

        <div className="game-detail__hero">
          <GameImage
            key={`hero-${artVersion}`}
            gameId={game.gameId}
            sourceId={game.sourceId}
            source={game.source}
            name={game.name}
            type="hero"
            className="game-detail__hero-image"
          />
          <div className="game-detail__hero-overlay">
            <h2 className="game-detail__title">{game.name}</h2>
          </div>
          <button
            className="game-detail__change-hero"
            onClick={() => openArtMenu(game.gameId)}
            aria-label="Manage game art"
          >
            <AppIcon name="edit" size={14} />
          </button>
        </div>

        <div className="game-detail__body">
          {/* Left Sidebar */}
          <div className="game-detail__sidebar">
            <div className="game-detail__sidebar-actions">
              {game.isInstalled ? (
                <Button
                  size="lg"
                  onClick={() => launch(game.gameId)}
                  loading={launching === game.gameId}
                >
                  Play
                </Button>
              ) : game.source === "steam" ? (
                <Button
                  size="lg"
                  onClick={() => steamInstallApi.installGame(game.sourceId)}
                >
                  Install
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={() => launch(game.gameId)}
                  loading={launching === game.gameId}
                >
                  Launch
                </Button>
              )}
              {game.source === "steam" &&
                game.isInstalled &&
                installProgress?.status === "update_required" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => steamInstallApi.updateGame(game.sourceId)}
                  >
                    Update
                  </Button>
                )}
              {game.source === "steam" && game.isInstalled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    steamInstallApi.uninstallGame(game.sourceId);
                    uninstallTimersRef.current.push(
                      setTimeout(
                        () => useLibraryStore.getState().scanLocalOnly(),
                        UNINSTALL_RESCAN_FIRST_MS,
                      ),
                      setTimeout(
                        () => useLibraryStore.getState().scanLocalOnly(),
                        UNINSTALL_RESCAN_SECOND_MS,
                      ),
                    );
                  }}
                >
                  Uninstall
                </Button>
              )}
              {installProgress && <InstallProgressOverlay progress={installProgress} />}
              {hasLaunchToggle && (
                <div className="game-detail__launch-mode">
                  <label
                    className="game-detail__launch-mode-label"
                    htmlFor="launch-mode-select"
                  >
                    Launch via
                  </label>
                  <select
                    id="launch-mode-select"
                    className="game-detail__launch-mode-select"
                    value={launchMode}
                    onChange={async (e) => {
                      const mode = e.target.value;
                      setLaunchMode(mode);
                      await gameApi.setLaunchMode(game.gameId, mode);
                    }}
                  >
                    <option value="launcher">{getSourceDisplayName(game.source)}</option>
                    <option value="direct">Direct executable</option>
                  </select>
                </div>
              )}
              <Button
                variant={favorited ? "secondary" : "ghost"}
                size="lg"
                onClick={() => toggleFavorite(game.gameId)}
                aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={favorited}
              >
                <AppIcon name={favorited ? "star-filled" : "star-outline"} size={16} />
                {favorited ? "Favorited" : "Favorite"}
              </Button>
              <Button
                variant={hidden ? "secondary" : "ghost"}
                size="lg"
                onClick={() => toggleHidden(game.gameId)}
                aria-label={hidden ? "Unhide game" : "Hide game"}
              >
                <AppIcon name={hidden ? "eye-off" : "eye"} size={16} />
                {hidden ? "Hidden" : "Hide"}
              </Button>
              <Button variant="ghost" size="lg" onClick={() => openArtMenu(game.gameId)}>
                <AppIcon name="edit" size={16} />
                Manage Art
              </Button>
              {game.source === "manual" && (
                <>
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => useUIStore.getState().openEditCustomGame(game.gameId)}
                  >
                    <AppIcon name="settings" size={16} />
                    Edit Game
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Remove Game",
                        message: `Remove "${game.name}" from your library? This will delete all associated data (sessions, tags, art).`,
                        confirmLabel: "Remove",
                        cancelLabel: "Cancel",
                        destructive: true,
                      });
                      if (!ok) return;
                      try {
                        await customGameApi.remove(game.gameId);
                        useLibraryStore.getState().removeGame(game.gameId);
                        logger.info("GameDetail", "library", "Custom game removed", {
                          gameId: game.gameId,
                        });
                        onClose();
                      } catch (e) {
                        logger.error(
                          "GameDetail",
                          "library",
                          "Failed to remove custom game",
                          { error: String(e) },
                        );
                      }
                    }}
                    className="game-detail__remove-btn"
                  >
                    <AppIcon name="close" size={16} />
                    Remove Game
                  </Button>
                </>
              )}
            </div>

            <div className="game-detail__sidebar-section">
              <h4 className="game-detail__section-title">My Rating</h4>
              <div className="game-detail__rating-row">
                <StarRating
                  value={currentRating?.rating ?? 0}
                  onChange={(val) =>
                    saveRating(game.gameId, val, currentRating?.review ?? null)
                  }
                  size={20}
                />
                {currentRating && (
                  <span className="game-detail__rating-label">
                    {(currentRating.rating / 2).toFixed(1)}
                  </span>
                )}
              </div>
              {currentRating && (
                <button
                  className="game-detail__rating-clear"
                  onClick={() => deleteRating(game.gameId)}
                >
                  Clear rating
                </button>
              )}
            </div>

            <div className="game-detail__sidebar-section">
              <h4 className="game-detail__section-title">Quick Stats</h4>
              <div className="game-detail__stat-list">
                <div className="game-detail__stat">
                  <div className="game-detail__stat-header">
                    <span className="game-detail__stat-label">Playtime</span>
                    {isNonSteam && !isEditingPlaytime && (
                      <button
                        className="game-detail__playtime-edit-btn"
                        onClick={() => {
                          const h = Math.floor(game.playtimeForever / 60);
                          const m = game.playtimeForever % 60;
                          setPlaytimeHours(h.toString());
                          setPlaytimeMinutes(m.toString());
                          setIsEditingPlaytime(true);
                        }}
                        title="Edit playtime"
                      >
                        <AppIcon name="settings" size={12} />
                      </button>
                    )}
                  </div>
                  {isEditingPlaytime ? (
                    <div className="game-detail__playtime-editor">
                      <div className="game-detail__playtime-inputs">
                        <input
                          type="number"
                          min="0"
                          className="game-detail__playtime-input"
                          value={playtimeHours}
                          onChange={(e) => setPlaytimeHours(e.target.value)}
                          placeholder="0"
                        />
                        <span className="game-detail__playtime-unit">h</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          className="game-detail__playtime-input"
                          value={playtimeMinutes}
                          onChange={(e) => setPlaytimeMinutes(e.target.value)}
                          placeholder="0"
                        />
                        <span className="game-detail__playtime-unit">m</span>
                      </div>
                      <div className="game-detail__playtime-actions">
                        <button
                          className="game-detail__playtime-action"
                          onClick={async () => {
                            const h = parseInt(playtimeHours) || 0;
                            const m = parseInt(playtimeMinutes) || 0;
                            const totalMinutes = h * 60 + m;
                            await sessionApi.setManualPlaytime(game.gameId, totalMinutes);
                            const lib = useLibraryStore.getState().library;
                            if (lib) {
                              const games = lib.games.map((g) =>
                                g.gameId === game.gameId
                                  ? { ...g, playtimeForever: totalMinutes }
                                  : g,
                              );
                              useLibraryStore.setState({
                                library: { ...lib, games },
                              });
                            }
                            setIsEditingPlaytime(false);
                          }}
                        >
                          Set Total
                        </button>
                        <button
                          className="game-detail__playtime-action"
                          onClick={async () => {
                            const h = parseInt(playtimeHours) || 0;
                            const m = parseInt(playtimeMinutes) || 0;
                            const addMinutes = h * 60 + m;
                            if (addMinutes === 0) return;
                            await sessionApi.addManualPlaytime(game.gameId, addMinutes);
                            const newTotal = game.playtimeForever + addMinutes;
                            const lib = useLibraryStore.getState().library;
                            if (lib) {
                              const games = lib.games.map((g) =>
                                g.gameId === game.gameId
                                  ? { ...g, playtimeForever: newTotal }
                                  : g,
                              );
                              useLibraryStore.setState({
                                library: { ...lib, games },
                              });
                            }
                            setIsEditingPlaytime(false);
                          }}
                        >
                          Add
                        </button>
                        <button
                          className="game-detail__playtime-action game-detail__playtime-action--cancel"
                          onClick={() => setIsEditingPlaytime(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="game-detail__stat-value">
                      {formatPlaytime(game.playtimeForever)}
                    </span>
                  )}
                </div>
                {game.playtime2weeks != null && (
                  <div className="game-detail__stat">
                    <span className="game-detail__stat-label">Last 2 Weeks</span>
                    <span className="game-detail__stat-value">
                      {formatPlaytime(game.playtime2weeks)}
                    </span>
                  </div>
                )}
                <div className="game-detail__stat">
                  <span className="game-detail__stat-label">Last Played</span>
                  <span className="game-detail__stat-value">
                    {formatLastPlayed(game.lastPlayed)}
                  </span>
                </div>
                {game.sizeOnDisk != null && game.sizeOnDisk > 0 && (
                  <div className="game-detail__stat">
                    <span className="game-detail__stat-label">Size</span>
                    <span className="game-detail__stat-value">
                      {formatBytes(game.sizeOnDisk)}
                    </span>
                  </div>
                )}
                <div className="game-detail__stat">
                  <span className="game-detail__stat-label">Status</span>
                  <span
                    className={`game-detail__stat-value ${
                      game.isInstalled
                        ? "game-detail__stat-value--success"
                        : "game-detail__stat-value--muted"
                    }`}
                  >
                    {game.isInstalled ? "Installed" : "Not Installed"}
                  </span>
                </div>
              </div>
            </div>

            {metadata?.metacriticScore != null && (
              <div className="game-detail__sidebar-section">
                <h4 className="game-detail__section-title">Metacritic</h4>
                <MetacriticBadge
                  score={metadata.metacriticScore}
                  url={metadata.metacriticUrl}
                />
              </div>
            )}

            {metadata && (metadata.developers.length > 0 || metadata.releaseDate) && (
              <div className="game-detail__sidebar-section">
                <h4 className="game-detail__section-title">Details</h4>
                <div className="game-detail__stat-list">
                  {metadata.developers.length > 0 && (
                    <div className="game-detail__stat">
                      <span className="game-detail__stat-label">Developer</span>
                      <span className="game-detail__stat-value">
                        {metadata.developers.join(", ")}
                      </span>
                    </div>
                  )}
                  {metadata.publishers.length > 0 && (
                    <div className="game-detail__stat">
                      <span className="game-detail__stat-label">Publisher</span>
                      <span className="game-detail__stat-value">
                        {metadata.publishers.join(", ")}
                      </span>
                    </div>
                  )}
                  {metadata.releaseDate && (
                    <div className="game-detail__stat">
                      <span className="game-detail__stat-label">Released</span>
                      <span className="game-detail__stat-value">
                        {metadata.releaseDate}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {metadata && metadata.genres.length > 0 && (
              <div className="game-detail__sidebar-section">
                <h4 className="game-detail__section-title">Genres</h4>
                <div className="game-detail__tags">
                  {metadata.genres.map((g) => (
                    <GenreTag key={g.id} label={g.description} size="md" />
                  ))}
                </div>
              </div>
            )}

            {metadata && metadata.steamTags.length > 0 && (
              <div className="game-detail__sidebar-section">
                <h4 className="game-detail__section-title">Community Tags</h4>
                <div className="game-detail__tags">
                  {metadata.steamTags.slice(0, 15).map((t) => (
                    <GenreTag key={t.name} label={t.name} size="sm" />
                  ))}
                </div>
              </div>
            )}

            {metadata && metadata.categories.length > 0 && (
              <div className="game-detail__sidebar-section">
                <h4 className="game-detail__section-title">Features</h4>
                <div className="game-detail__tags">
                  {metadata.categories.map((c) => (
                    <GenreTag key={c.id} label={c.description} size="sm" />
                  ))}
                </div>
              </div>
            )}

            <div className="game-detail__sidebar-section">
              <h4 className="game-detail__section-title">Custom Tags</h4>
              {allTags.length === 0 ? (
                <p className="game-detail__tags-empty">
                  Organize your library with custom tags.{" "}
                  <button
                    className="game-detail__tags-link"
                    onClick={() => {
                      onClose();
                      navigate("/settings");
                    }}
                  >
                    Create tags in Settings
                  </button>
                </p>
              ) : (
                <>
                  <div className="game-detail__tags">
                    {gameTags.map((t) => (
                      <UserTag
                        key={t.id}
                        label={t.name}
                        colorIndex={t.colorIndex}
                        size="md"
                        onRemove={() =>
                          setGameTags(
                            game.gameId,
                            gameTagIds.filter((id) => id !== t.id),
                          )
                        }
                      />
                    ))}
                  </div>
                  <TagPicker
                    availableTags={availableTags}
                    onAddTag={(tagId) => setGameTags(game.gameId, [...gameTagIds, tagId])}
                  />
                </>
              )}
            </div>

            {shelves.length > 0 && (
              <div className="game-detail__sidebar-section">
                <h4 className="game-detail__section-title">Shelves</h4>
                <div className="game-detail__shelf-pins">
                  {shelves.map((shelf) => {
                    const isPinned = shelf.pinnedGameIds.includes(game.gameId);
                    return (
                      <button
                        key={shelf.id}
                        className={`game-detail__shelf-chip ${isPinned ? "game-detail__shelf-chip--active" : ""}`}
                        onClick={() => {
                          if (isPinned) unpinGameFromShelf(shelf.id, game.gameId);
                          else pinGameToShelf(shelf.id, game.gameId);
                          onPersistShelves();
                        }}
                        aria-pressed={isPinned}
                      >
                        <AppIcon name={isPinned ? "pin" : "plus"} size={12} />
                        {shelf.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="game-detail__sidebar-section">
              <button
                className="game-detail__section-toggle"
                onClick={() => setShowReview(!showReview)}
              >
                <h4 className="game-detail__section-title">
                  <AppIcon name="edit" size={14} />
                  Review
                  {reviewContent.length > 0 && (
                    <span className="game-detail__note-indicator" />
                  )}
                </h4>
                <AppIcon name={showReview ? "chevron-up" : "chevron-down"} size={14} />
              </button>
              {showReview && (
                <textarea
                  className="game-detail__note-textarea"
                  value={reviewContent}
                  onChange={(e) => {
                    const text = e.target.value;
                    setReviewContent(text);
                    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
                    reviewTimerRef.current = setTimeout(() => {
                      const rating = currentRating?.rating ?? 0;
                      if (rating > 0) {
                        saveRating(game.gameId, rating, text || null);
                      }
                    }, 500);
                  }}
                  placeholder="Write your review of this game..."
                  rows={4}
                  spellCheck={false}
                />
              )}
            </div>

            <div className="game-detail__sidebar-section">
              <button
                className="game-detail__section-toggle"
                onClick={() => setShowNotes(!showNotes)}
              >
                <h4 className="game-detail__section-title">
                  <AppIcon name="notes" size={14} />
                  Notes
                  {noteContent.length > 0 && (
                    <span className="game-detail__note-indicator" />
                  )}
                </h4>
                <AppIcon name={showNotes ? "chevron-up" : "chevron-down"} size={14} />
              </button>
              {showNotes && (
                <textarea
                  className="game-detail__note-textarea"
                  value={noteContent}
                  onChange={(e) => {
                    const text = e.target.value;
                    setNoteContent(text);
                    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
                    noteTimerRef.current = setTimeout(() => {
                      notesApi.saveGameNote(game.gameId, text).catch(() => {});
                    }, 500);
                  }}
                  placeholder="Add notes about this game..."
                  rows={4}
                  disabled={noteLoading}
                  spellCheck={false}
                />
              )}
            </div>

            <div className="game-detail__sidebar-section game-detail__sidebar-section--muted">
              <span className="game-detail__stat-label">
                {getSourceDisplayName(game.source)} &middot; {game.sourceId}
              </span>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="game-detail__main">
            {(metadata?.shortDescription || game.description) && (
              <section className="game-detail__main-section">
                <h3 className="game-detail__main-title">About</h3>
                <p className="game-detail__description">
                  {metadata?.shortDescription || game.description}
                </p>
              </section>
            )}

            {metadata && metadata.screenshots.length > 0 && (
              <section className="game-detail__main-section">
                <h3 className="game-detail__main-title">Screenshots</h3>
                <ScreenshotGallery screenshots={metadata.screenshots} />
              </section>
            )}

            <section className="game-detail__main-section">
              <h3 className="game-detail__main-title">Play Activity</h3>
              <SessionHeatmap sessions={gameSessions} />
              <div className="game-detail__timeline-wrapper">
                <SessionTimeline sessions={gameSessions} initialLimit={5} />
              </div>
            </section>

            <AchievementSection gameId={game.gameId} source={game.source} />
          </div>
        </div>
      </div>

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
