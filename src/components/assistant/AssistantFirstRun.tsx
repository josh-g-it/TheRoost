import { useCallback, useEffect, useState } from "react";
import type { AiPersonality } from "../../types";
import { assistantApi } from "../../services/tauri";
import { getErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { AppIcon } from "../common/AppIcon";
import "./AssistantFirstRun.css";

interface AssistantFirstRunProps {
  onComplete: (avatarId: string, conversationId: string) => void;
}

type SetupPhase = "checking" | "avatar-creation" | "creating" | "error";

export function AssistantFirstRun({ onComplete }: AssistantFirstRunProps) {
  const [phase, setPhase] = useState<SetupPhase>("checking");
  const [personalities, setPersonalities] = useState<AiPersonality[]>([]);
  const [avatarName, setAvatarName] = useState("Assistant");
  const [personalityId, setPersonalityId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initialize() {
      try {
        const keyExists = await assistantApi.checkEncryptionKeyExists();
        if (!keyExists) {
          await assistantApi.generateEncryptionKey();
          logger.info("AssistantFirstRun", "api", "Encryption key generated");
        }

        const personalityList = await assistantApi.listPersonalities();
        setPersonalities(personalityList);
        if (personalityList.length > 0) {
          setPersonalityId(personalityList[0].id);
        }
        setPhase("avatar-creation");
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

  const handleSubmit = useCallback(async () => {
    if (!avatarName.trim() || !personalityId) return;
    setPhase("creating");
    setError(null);
    try {
      const avatar = await assistantApi.createAvatar(avatarName.trim(), personalityId);
      await assistantApi.switchAvatar(avatar.id);
      const conversationId = await assistantApi.startConversation(avatar.id);
      logger.info("AssistantFirstRun", "api", "First-run setup complete", {
        avatarId: avatar.id,
      });
      onComplete(avatar.id, conversationId);
    } catch (err) {
      setError(getErrorMessage(err));
      setPhase("avatar-creation");
      logger.error("AssistantFirstRun", "api", "Avatar creation failed", {
        error: getErrorMessage(err),
      });
    }
  }, [avatarName, personalityId, onComplete]);

  if (phase === "checking") {
    return (
      <div className="assistant-first-run">
        <AppIcon name="assistant" size={64} />
        <h2 className="assistant-first-run__title">Setting up your Assistant</h2>
        <p className="assistant-first-run__status">Preparing encryption...</p>
      </div>
    );
  }

  if (phase === "error" && !personalities.length) {
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
      <div className="assistant-first-run__icon">
        <AppIcon name="assistant" size={64} />
      </div>
      <h2 className="assistant-first-run__title">Create Your Assistant</h2>
      <p className="assistant-first-run__subtitle">
        Choose a name and personality for your AI assistant. You can create additional
        avatars and personalities later.
      </p>

      <div className="assistant-first-run__form">
        <label className="assistant-first-run__label">Assistant Name</label>
        <input
          className="assistant-first-run__input"
          type="text"
          placeholder="Assistant"
          value={avatarName}
          onChange={(e) => setAvatarName(e.target.value)}
        />

        <label className="assistant-first-run__label">Personality</label>
        <select
          className="assistant-first-run__select"
          value={personalityId}
          onChange={(e) => setPersonalityId(e.target.value)}
        >
          {personalities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {error && <p className="assistant-first-run__error">{error}</p>}

        <button
          className="assistant-first-run__submit"
          disabled={!avatarName.trim() || !personalityId || phase === "creating"}
          onClick={handleSubmit}
        >
          {phase === "creating" ? "Creating..." : "Get Started"}
        </button>
      </div>
    </div>
  );
}
