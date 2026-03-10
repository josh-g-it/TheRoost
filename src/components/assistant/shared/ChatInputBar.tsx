import { memo, useCallback, useEffect, useRef } from "react";
import { useSpeechRecognition } from "../../../hooks/useSpeechRecognition";
import { AppIcon } from "../../common/AppIcon";
import "./ChatInputBar.css";

/** Isolated input bar — zero React reconciliation during typing.
 *  Shift+Enter inserts a newline; Enter sends. Auto-grows via imperative DOM resize. */
export const ChatInputBar = memo(function ChatInputBar({
  onSend,
  isStreaming,
  cloudAiEnabled,
}: {
  onSend: (text: string) => void;
  isStreaming: boolean;
  cloudAiEnabled: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    transcript,
    isListening,
    isSupported,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition();

  // Auto-resize textarea on input (pure DOM manipulation, no React state)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const adjustHeight = () => {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    };
    el.addEventListener("input", adjustHeight);
    return () => el.removeEventListener("input", adjustHeight);
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

  return (
    <div
      className={`assistant-chat__input-bar ${!cloudAiEnabled ? "assistant-chat__input-bar--disabled" : ""}`}
    >
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
    </div>
  );
});
