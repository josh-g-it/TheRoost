import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "../../../hooks/useSpeechRecognition";
import { AppIcon } from "../../common/AppIcon";
import "./ChatInputBar.css";

/** Isolated input bar — zero React reconciliation during typing.
 *  Shift+Enter inserts a newline; Enter sends. Auto-grows via imperative DOM resize. */
export const ChatInputBar = memo(function ChatInputBar({
  onSend,
  isStreaming,
  cloudAiEnabled,
  onInput,
  onEndConversation,
  showEndButton,
}: {
  onSend: (text: string) => void;
  isStreaming: boolean;
  cloudAiEnabled: boolean;
  /** Called on each keystroke — used for expression engine typing detection. */
  onInput?: () => void;
  /** Called when user confirms ending the conversation. */
  onEndConversation?: () => void;
  /** Whether to show the end conversation button. */
  showEndButton?: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    transcript,
    isListening,
    isSupported,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition();

  // Ref-sync onInput to avoid re-attaching DOM listener when callback identity changes
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

  // Auto-resize textarea on input (pure DOM manipulation, no React state)
  // Also fires onInput callback for expression engine typing detection.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handleInput = () => {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
      onInputRef.current?.();
    };
    el.addEventListener("input", handleInput);
    return () => el.removeEventListener("input", handleInput);
  }, []);

  // Inject speech recognition transcript directly into the DOM element
  useEffect(() => {
    if (!isListening && transcript && inputRef.current) {
      const prev = inputRef.current.value;
      inputRef.current.value = prev ? prev + " " + transcript : transcript;
    }
  }, [isListening, transcript]);

  const disabled = isStreaming || !cloudAiEnabled;

  const handleSend = useCallback(() => {
    const text = inputRef.current?.value.trim() ?? "";
    if (!text || disabled) return;
    onSend(text);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
    }
  }, [disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleMicToggle = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const handleEndClick = useCallback(() => {
    setShowEndConfirm(true);
  }, []);

  const handleEndConfirm = useCallback(() => {
    setShowEndConfirm(false);
    onEndConversation?.();
  }, [onEndConversation]);

  const handleEndCancel = useCallback(() => {
    setShowEndConfirm(false);
  }, []);

  return (
    <div
      className={`assistant-chat__input-bar ${!cloudAiEnabled ? "assistant-chat__input-bar--disabled" : ""}`}
    >
      {showEndButton && onEndConversation && (
        <button
          className="assistant-chat__end-conv-btn"
          onClick={handleEndClick}
          disabled={isStreaming}
          title="End conversation"
          aria-label="End conversation"
        >
          <AppIcon name="close" size={14} />
        </button>
      )}
      <textarea
        ref={inputRef}
        className="assistant-chat__input"
        rows={1}
        placeholder={cloudAiEnabled ? "Type a message..." : "Cloud AI is disabled"}
        defaultValue=""
        onKeyDown={handleKeyDown}
        disabled={disabled}
        maxLength={10000}
        aria-label="Chat message input"
      />
      {isSupported && cloudAiEnabled && (
        <button
          className={`assistant-chat__mic-btn ${isListening ? "assistant-chat__mic-btn--active" : ""}`}
          onClick={handleMicToggle}
          title={isListening ? "Stop listening" : "Voice input"}
          aria-label={isListening ? "Stop voice input" : "Start voice input"}
        >
          <AppIcon name={isListening ? "pause" : "music"} size={16} />
        </button>
      )}
      <button
        className="assistant-chat__send-btn"
        onClick={handleSend}
        disabled={disabled}
        title={cloudAiEnabled ? "Send message" : "Cloud AI is disabled"}
        aria-label="Send message"
      >
        <AppIcon name="chevron-right" size={16} />
      </button>

      {/* End conversation confirmation popup */}
      {showEndConfirm && (
        <div className="assistant-chat__end-confirm-backdrop" onClick={handleEndCancel}>
          <div
            className="assistant-chat__end-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="assistant-chat__end-confirm-text">End this conversation?</p>
            <p className="assistant-chat__end-confirm-sub">
              Your assistant will save any memories before saying goodbye.
            </p>
            <div className="assistant-chat__end-confirm-actions">
              <button
                className="assistant-chat__end-confirm-btn assistant-chat__end-confirm-btn--yes"
                onClick={handleEndConfirm}
              >
                End Conversation
              </button>
              <button
                className="assistant-chat__end-confirm-btn"
                onClick={handleEndCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
