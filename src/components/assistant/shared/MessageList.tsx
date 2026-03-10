import type { RefObject, ReactNode } from "react";
import { AppIcon } from "../../common/AppIcon";
import "./MessageList.css";

interface MessageListProps {
  isCompacting: boolean;
  isStreaming: boolean;
  cloudAiEnabled: boolean;
  messagesEmpty: boolean;
  messagesEndRef: RefObject<HTMLDivElement>;
  children?: ReactNode;
}

/**
 * Scrollable message container — handles compacting splash, disabled/empty states,
 * and scroll anchor. All message content and action cards are passed as children.
 */
export function MessageList({
  isCompacting,
  isStreaming,
  cloudAiEnabled,
  messagesEmpty,
  messagesEndRef,
  children,
}: MessageListProps) {
  return (
    <div
      className="assistant-chat__messages"
      role="log"
      aria-label="Conversation messages"
      aria-live="polite"
    >
      {isCompacting ? (
        <div className="assistant-chat__compacting">
          <div className="assistant-chat__compacting-icon">
            <AppIcon name="assistant" size={48} />
          </div>
          <div className="assistant-chat__compacting-text">Storing memories...</div>
          <div className="assistant-chat__compacting-spinner" />
        </div>
      ) : (
        <>
          {!cloudAiEnabled && (
            <div className="assistant-chat__disabled-banner">
              <AppIcon name="assistant" size={32} />
              <p>
                Cloud AI is disabled. Enable it in{" "}
                <strong>Settings &rarr; Assistant</strong> to chat with your assistant.
              </p>
            </div>
          )}
          {cloudAiEnabled && messagesEmpty && !isStreaming && (
            <div className="assistant-chat__empty">
              <AppIcon name="assistant" size={48} />
              <p>Start a conversation with your assistant.</p>
            </div>
          )}
          {children}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}
