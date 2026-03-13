import { useCallback, useEffect, useState } from "react";
import type { AiAvatar, SpriteInfo } from "../../types";
import { assistantApi, spriteApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { AvatarWizard } from "./AvatarWizard";
import { AppIcon } from "../common/AppIcon";
import "./AssistantFirstRun.css";

interface AssistantFirstRunProps {
  onComplete: (avatarId: string, conversationId: string) => void;
}

type SetupPhase = "checking" | "ready" | "error";

export function AssistantFirstRun({ onComplete }: AssistantFirstRunProps) {
  const [phase, setPhase] = useState<SetupPhase>("checking");
  const [sprites, setSprites] = useState<SpriteInfo[]>([]);
  const [spriteDataUrls, setSpriteDataUrls] = useState<Map<string, string | null>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initialize() {
      try {
        // Ensure encryption key exists
        const keyExists = await assistantApi.checkEncryptionKeyExists();
        if (!keyExists) {
          await assistantApi.generateEncryptionKey();
          logger.info("AssistantFirstRun", "api", "Encryption key generated");
        }

        // Load sprites (personalities are loaded internally by AvatarWizard)
        const spriteList = await spriteApi.listSprites();
        setSprites(spriteList);

        // Pre-load sprite data URLs for thumbnails
        const urlMap = new Map<string, string | null>();
        await Promise.all(
          spriteList.map(async (s) => {
            try {
              const dataUrl = await spriteApi.readSprite(s.filename);
              urlMap.set(s.filename, dataUrl);
            } catch {
              urlMap.set(s.filename, null);
            }
          }),
        );
        setSpriteDataUrls(urlMap);

        setPhase("ready");
      } catch (err) {
        setError(getErrorMessage(err));
        setPhase("error");
        logger.error("AssistantFirstRun", "api", "Setup failed", {
          error: getErrorMessage(err),
        });
      }
    }
    initialize();
  }, []);

  const handleWizardComplete = useCallback(
    (avatar: AiAvatar, conversationId: string) => {
      logger.info("AssistantFirstRun", "api", "First-run wizard complete", {
        avatarId: avatar.id,
      });
      onComplete(avatar.id, conversationId);
    },
    [onComplete],
  );

  if (phase === "checking") {
    return (
      <div className="assistant-first-run">
        <AppIcon name="assistant" size={64} />
        <h2 className="assistant-first-run__title">Setting up your Assistant</h2>
        <p className="assistant-first-run__status">Preparing encryption...</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="assistant-first-run">
        <AppIcon name="assistant" size={64} />
        <h2 className="assistant-first-run__title">Setup Failed</h2>
        <p className="assistant-first-run__error">{error}</p>
      </div>
    );
  }

  return (
    <div className="assistant-first-run">
      <AvatarWizard
        sprites={sprites}
        spriteDataUrls={spriteDataUrls}
        onComplete={handleWizardComplete}
        onCancel={() => {}}
        isFirstRun
      />
    </div>
  );
}
