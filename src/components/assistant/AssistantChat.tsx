/**
 * AssistantChat — thin wrapper re-exporting ChatCore from shared/.
 * Maintains backward compatibility for existing consumers (AssistantView, tests).
 * The actual implementation lives in shared/ChatCore.tsx.
 */
export { ChatCore as AssistantChat } from "./shared";
export type { ChatCoreProps as AssistantChatProps, PendingReview } from "./shared";
