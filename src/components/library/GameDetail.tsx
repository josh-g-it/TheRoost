import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GameImage } from "./GameImage";
import { Button } from "../common/Button";
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
import { useLibraryStore } from "../../store/librarySlice";
import { customGameApi, gameApi, notesApi } from "../../services/tauri";
import { logger } from "../../utils/logger";
import { useMetadataStore } from "../../store/metadataSlice";
import { useSessionStore } from "../../store/sessionSlice";
import { useTagsStore } from "../../store/tagsSlice";
import { useFavoritesStore } from "../../store/favoritesSlice";
import { useHiddenGamesStore } from "../../store/hiddenGamesSlice";
import { useUIStore } from "../../store/uiSlice";
import type { Game } from "../../types";
import type { ScreenshotInfo } from "../../types/metadata";
import "./GameDetail.css";

interface GameDetailProps {
  game: Game;
  onClose: () => void;
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
  if (screenshots.length === 0) return null;

  return (
    <div className="game-detail__screenshots">
      {screenshots.map((s) => (
        <a
          key={s.id}
          href={s.fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="game-detail__screenshot-link"
        >
          <img
            src={s.thumbnailUrl}
            alt="Screenshot"
            className="game-detail__screenshot-img"
            loading="lazy"
          />
        </a>
      ))}
    </div>
  );
}

export function GameDetail({ game, onClose }: GameDetailProps) {
  const navigate = useNavigate();
  const { launch, launching } = useGameLaunch();
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

  const openArtPicker = useUIStore((s) => s.openArtPicker);
  const artPickerGameId = useUIStore((s) => s.artPickerGameId);
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

  // Close on Escape (skip if art picker is open — it handles its own Escape)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !artPickerGameId) {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, artPickerGameId]);

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
          {isNonSteam && (
            <button
              className="game-detail__change-hero"
              onClick={() => openArtPicker(game.gameId, "hero")}
              aria-label="Change hero art"
            >
              <AppIcon name="edit" size={14} />
            </button>
          )}
        </div>

        <div className="game-detail__body">
          {/* Left Sidebar */}
          <div className="game-detail__sidebar">
            <div className="game-detail__sidebar-actions">
              <Button
                size="lg"
                onClick={() => launch(game.gameId)}
                loading={launching === game.gameId}
              >
                {game.isInstalled
                  ? "Play"
                  : game.source === "steam"
                    ? "Install / View in Steam"
                    : "Launch"}
              </Button>
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
              {isNonSteam && (
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => openArtPicker(game.gameId, "logo")}
                >
                  <AppIcon name="edit" size={16} />
                  Set Icon Art
                </Button>
              )}
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
                      if (
                        !window.confirm(
                          `Remove "${game.name}" from your library? This will delete all associated data (sessions, tags, art).`,
                        )
                      )
                        return;
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
              <h4 className="game-detail__section-title">Quick Stats</h4>
              <div className="game-detail__stat-list">
                <div className="game-detail__stat">
                  <span className="game-detail__stat-label">Playtime</span>
                  <span className="game-detail__stat-value">
                    {formatPlaytime(game.playtimeForever)}
                  </span>
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
    </div>
  );
}
