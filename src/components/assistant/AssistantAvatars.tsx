import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AiAvatar,
  AiPersonality,
  CompanionRolePreset,
  SpriteInfo,
} from "../../types";
import { assistantApi, spriteApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { AvatarListPanel } from "./AvatarListPanel";
import { AvatarDetailPanel } from "./AvatarDetailPanel";
import { AvatarSpriteLibrary } from "./AvatarSpriteLibrary";
import { AvatarWizard } from "./AvatarWizard";
import { SpriteGenerationWizard } from "./SpriteGenerationWizard";
import "./AssistantAvatars.css";

interface AssistantAvatarsProps {
  activeAvatarId: string;
  isStreaming?: boolean;
  onAvatarSwitch: (avatarId: string) => void;
  onAvatarDeleted?: (deletedAvatarId: string) => void;
  onAvatarDataWiped?: (avatarId: string) => void;
  /** Notify ConversationProvider to re-fetch active avatar (e.g. after sprite change). */
  onSpriteChanged?: () => void;
}

export function AssistantAvatars({
  activeAvatarId,
  isStreaming = false,
  onAvatarSwitch,
  onAvatarDeleted,
  onAvatarDataWiped,
  onSpriteChanged,
}: AssistantAvatarsProps) {
  const [avatars, setAvatars] = useState<AiAvatar[]>([]);
  const [personalities, setPersonalities] = useState<AiPersonality[]>([]);
  const [companionRoles, setCompanionRoles] = useState<CompanionRolePreset[]>([]);
  const [sprites, setSprites] = useState<SpriteInfo[]>([]);
  const [spriteDataUrls, setSpriteDataUrls] = useState<Map<string, string | null>>(
    new Map(),
  );
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(activeAvatarId);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showGenerateWizard, setShowGenerateWizard] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const spriteLibRef = useRef<HTMLDivElement>(null);

  // ── Data loading ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [avatarList, personalityList, roleList, spriteList] = await Promise.all([
        assistantApi.listAvatars(),
        assistantApi.listPersonalities(),
        assistantApi.listCompanionRoles(),
        spriteApi.listSprites(),
      ]);
      setAvatars(avatarList);
      setPersonalities(personalityList);
      setCompanionRoles(roleList);
      setSprites(spriteList);

      // Pre-load sprite data URLs for avatars that have sprites
      const urlMap = new Map<string, string | null>();
      const uniquePaths = new Set(
        avatarList.map((a) => a.imagePath).filter(Boolean) as string[],
      );
      await Promise.all(
        [...uniquePaths].map(async (path) => {
          try {
            const dataUrl = await spriteApi.readSprite(path);
            urlMap.set(path, dataUrl);
          } catch {
            logger.warn("AssistantAvatars", "api", "Failed to load sprite", { path });
            urlMap.set(path, null);
          }
        }),
      );
      setSpriteDataUrls(urlMap);
    } catch (err) {
      logger.error("AssistantAvatars", "api", "Failed to load data", {
        error: getErrorMessage(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ensure selection stays valid
  useEffect(() => {
    if (!selectedAvatarId || !avatars.find((a) => a.id === selectedAvatarId)) {
      setSelectedAvatarId(activeAvatarId);
    }
  }, [avatars, selectedAvatarId, activeAvatarId]);

  // ── Callbacks ──────────────────────────────────────────────────
  const handleAvatarSwitch = useCallback(
    async (avatarId: string) => {
      try {
        await assistantApi.switchAvatar(avatarId);
        setAvatars((prev) => prev.map((a) => ({ ...a, isActive: a.id === avatarId })));
        onAvatarSwitch(avatarId);
        logger.info("AssistantAvatars", "api", "Avatar switched", { avatarId });
      } catch (err) {
        logger.error("AssistantAvatars", "api", "Failed to switch avatar", {
          error: getErrorMessage(err),
        });
      }
    },
    [onAvatarSwitch],
  );

  const handleAvatarCreated = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (avatar: AiAvatar, _conversationId: string) => {
      setAvatars((prev) => [...prev, avatar]);
      setSelectedAvatarId(avatar.id);
      setShowCreateForm(false);
      // Reload sprites in case one was generated during wizard
      spriteApi
        .listSprites()
        .then(setSprites)
        .catch(() => {});
      loadData();
    },
    [loadData],
  );

  const handleAvatarUpdated = useCallback((updated: AiAvatar) => {
    setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  const handleAvatarDeleted = useCallback(
    (avatarId: string) => {
      setAvatars((prev) => prev.filter((a) => a.id !== avatarId));
      onAvatarDeleted?.(avatarId);
      // Select another avatar if the deleted one was selected
      if (selectedAvatarId === avatarId) {
        setSelectedAvatarId(avatars.find((a) => a.id !== avatarId)?.id ?? null);
      }
    },
    [onAvatarDeleted, selectedAvatarId, avatars],
  );

  const handleAvatarDataWiped = useCallback(
    (avatarId: string) => {
      onAvatarDataWiped?.(avatarId);
    },
    [onAvatarDataWiped],
  );

  const handleSpriteAssigned = useCallback(
    (filename: string) => {
      // Update the avatar's imagePath locally
      setAvatars((prev) =>
        prev.map((a) => (a.id === selectedAvatarId ? { ...a, imagePath: filename } : a)),
      );
      // Load the sprite data URL if not already cached
      if (!spriteDataUrls.has(filename)) {
        spriteApi
          .readSprite(filename)
          .then((base64) => {
            setSpriteDataUrls((prev) => {
              const next = new Map(prev);
              next.set(filename, base64);
              return next;
            });
          })
          .catch(() => {
            // Ignore
          });
      }
      // Notify ConversationProvider so bubble/aicon update
      if (selectedAvatarId === activeAvatarId) onSpriteChanged?.();
    },
    [selectedAvatarId, spriteDataUrls, activeAvatarId, onSpriteChanged],
  );

  const handleSpriteUploaded = useCallback((sprite: SpriteInfo) => {
    setSprites((prev) => [...prev, sprite]);
  }, []);

  const handleSpriteDeleted = useCallback((filename: string) => {
    setSprites((prev) => prev.filter((s) => s.filename !== filename));
    // Clear imagePath on any avatars using this sprite
    setAvatars((prev) =>
      prev.map((a) => (a.imagePath === filename ? { ...a, imagePath: null } : a)),
    );
    setSpriteDataUrls((prev) => {
      const next = new Map(prev);
      next.delete(filename);
      return next;
    });
  }, []);

  const handleSpriteRenamed = useCallback(
    (oldFilename: string, newInfo: SpriteInfo) => {
      // Replace old SpriteInfo with new one
      setSprites((prev) => prev.map((s) => (s.filename === oldFilename ? newInfo : s)));
      // Move data URL from old key to new key
      setSpriteDataUrls((prev) => {
        const next = new Map(prev);
        const url = next.get(oldFilename);
        if (url) {
          next.set(newInfo.filename, url);
          next.delete(oldFilename);
        }
        return next;
      });
      // Update avatar imagePath references
      setAvatars((prev) =>
        prev.map((a) =>
          a.imagePath === oldFilename ? { ...a, imagePath: newInfo.filename } : a,
        ),
      );
      // Notify ConversationProvider if active avatar was affected
      if (avatars.some((a) => a.id === activeAvatarId && a.imagePath === oldFilename)) {
        onSpriteChanged?.();
      }
    },
    [avatars, activeAvatarId, onSpriteChanged],
  );

  const handleChangeSpriteClick = useCallback(() => {
    spriteLibRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleSpriteGenerated = useCallback(
    (sprite: SpriteInfo) => {
      setSprites((prev) => [...prev, sprite]);
      setShowGenerateWizard(false);
      // Auto-assign generated sprite to selected avatar
      if (selectedAvatarId) {
        spriteApi
          .setActiveSprite(selectedAvatarId, sprite.filename)
          .then(() => {
            setAvatars((prev) =>
              prev.map((a) =>
                a.id === selectedAvatarId ? { ...a, imagePath: sprite.filename } : a,
              ),
            );
            // Load the data URL
            spriteApi
              .readSprite(sprite.filename)
              .then((base64) => {
                setSpriteDataUrls((prev) => {
                  const next = new Map(prev);
                  next.set(sprite.filename, base64);
                  return next;
                });
              })
              .catch(() => {});
            // Notify ConversationProvider so bubble/aicon update
            if (selectedAvatarId === activeAvatarId) onSpriteChanged?.();
          })
          .catch(() => {});
      }
    },
    [selectedAvatarId, activeAvatarId, onSpriteChanged],
  );

  // ── Render ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="assistant-avatars">
        <div className="assistant-avatars__loading">Loading...</div>
      </div>
    );
  }

  const selectedAvatar = avatars.find((a) => a.id === selectedAvatarId) ?? null;
  const selectedSpriteUrl = selectedAvatar?.imagePath
    ? (spriteDataUrls.get(selectedAvatar.imagePath) ?? null)
    : null;

  return (
    <div className="assistant-avatars">
      <div className="assistant-avatars__master-detail">
        <div className="assistant-avatars__list-col">
          <AvatarListPanel
            avatars={avatars}
            personalities={personalities}
            selectedAvatarId={selectedAvatarId}
            activeAvatarId={activeAvatarId}
            spriteDataUrls={spriteDataUrls}
            onSelect={setSelectedAvatarId}
            onCreateClick={() => setShowCreateForm(true)}
          />
          {showCreateForm && (
            <AvatarWizard
              sprites={sprites}
              spriteDataUrls={spriteDataUrls}
              onComplete={handleAvatarCreated}
              onCancel={() => setShowCreateForm(false)}
            />
          )}
        </div>

        <div className="assistant-avatars__detail-col">
          {selectedAvatar ? (
            <AvatarDetailPanel
              avatar={selectedAvatar}
              isActive={selectedAvatar.id === activeAvatarId}
              isStreaming={isStreaming}
              personalities={personalities}
              companionRoles={companionRoles}
              spriteDataUrl={selectedSpriteUrl}
              avatarCount={avatars.length}
              onAvatarUpdated={handleAvatarUpdated}
              onAvatarDeleted={handleAvatarDeleted}
              onAvatarDataWiped={handleAvatarDataWiped}
              onAvatarSwitch={handleAvatarSwitch}
              onChangeSpriteClick={handleChangeSpriteClick}
            />
          ) : (
            <div className="assistant-avatars__empty-detail">
              <p>Select an avatar to view details</p>
            </div>
          )}
        </div>
      </div>

      {showGenerateWizard ? (
        <SpriteGenerationWizard
          onComplete={handleSpriteGenerated}
          onCancel={() => setShowGenerateWizard(false)}
        />
      ) : (
        <AvatarSpriteLibrary
          ref={spriteLibRef}
          sprites={sprites}
          currentSpriteFilename={selectedAvatar?.imagePath ?? null}
          avatarId={selectedAvatarId ?? ""}
          onSpriteAssigned={handleSpriteAssigned}
          onSpriteUploaded={handleSpriteUploaded}
          onSpriteDeleted={handleSpriteDeleted}
          onSpriteRenamed={handleSpriteRenamed}
          onGenerateClick={() => setShowGenerateWizard(true)}
        />
      )}
    </div>
  );
}
