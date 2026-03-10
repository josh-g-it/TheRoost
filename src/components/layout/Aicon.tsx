import React, { useCallback, forwardRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useConversationContext } from "../assistant/ConversationProvider";
import { getAvatarColor } from "../../utils/avatarColors";
import { AppIcon } from "../common/AppIcon";
import "./Aicon.css";

interface AiconProps {
  onToggleBubble: () => void;
  bubbleExpanded: boolean;
}

export const Aicon = React.memo(
  forwardRef<HTMLButtonElement, AiconProps>(function Aicon(
    { onToggleBubble, bubbleExpanded },
    ref,
  ) {
    const { activeAvatar, hasUnread, clearUnread } = useConversationContext();
    const location = useLocation();
    const navigate = useNavigate();

    const onAssistantRoute = location.pathname.startsWith("/assistant");

    const handleClick = useCallback(() => {
      if (!activeAvatar) {
        navigate("/assistant");
        return;
      }
      clearUnread();
      onToggleBubble();
    }, [activeAvatar, navigate, clearUnread, onToggleBubble]);

    const classNames = ["aicon"];
    if (bubbleExpanded) classNames.push("aicon--expanded");
    if (onAssistantRoute) classNames.push("aicon--on-route");

    return (
      <button
        ref={ref}
        className={classNames.join(" ")}
        onClick={handleClick}
        aria-label={
          activeAvatar
            ? bubbleExpanded
              ? "Collapse assistant bubble"
              : "Expand assistant bubble"
            : "Open assistant setup"
        }
        type="button"
      >
        {activeAvatar ? (
          <span
            className="aicon__circle"
            style={{ background: getAvatarColor(activeAvatar.name) }}
          >
            {activeAvatar.name.charAt(0).toUpperCase()}
          </span>
        ) : (
          <span
            className="aicon__circle"
            style={{ background: "var(--color-bg-tertiary)" }}
          >
            <AppIcon name="assistant" size={20} />
          </span>
        )}
        {hasUnread && <span className="aicon__dot" aria-label="Unread messages" />}
        <span className="aicon__label">Assistant</span>
      </button>
    );
  }),
);
