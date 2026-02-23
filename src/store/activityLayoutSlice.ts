import { create } from "zustand";
import type {
  ActivityCardConfig,
  ActivityCardType,
  CardWidth,
} from "../types/activityLayout";
import {
  DEFAULT_ACTIVITY_LAYOUT,
  DEFAULT_CARD_OPTIONS,
  CARD_WIDTH_OPTIONS,
} from "../types/activityLayout";
import { logger } from "../utils/logger";

interface ActivityLayoutState {
  cards: ActivityCardConfig[];
  isEditMode: boolean;

  initLayout: (fromSettings: ActivityCardConfig[] | undefined) => void;
  addCard: (type: ActivityCardType) => void;
  removeCard: (id: string) => void;
  reorderCards: (fromIndex: number, toIndex: number) => void;
  setCardWidth: (id: string, width: CardWidth) => void;
  updateCardOptions: (id: string, options: Record<string, unknown>) => void;
  resetCardOptions: (id: string) => void;
  setEditMode: (editing: boolean) => void;
}

function generateCardId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useActivityLayoutStore = create<ActivityLayoutState>((set, get) => ({
  cards: [],
  isEditMode: false,

  initLayout: (fromSettings) => {
    const incoming =
      fromSettings && fromSettings.length > 0
        ? fromSettings
        : [...DEFAULT_ACTIVITY_LAYOUT];

    // Deep equality check to prevent infinite loop:
    // persist saves → settings change → useSettings calls initLayout → would create new ref → persist again
    const current = get().cards;
    if (
      current.length === incoming.length &&
      JSON.stringify(current) === JSON.stringify(incoming)
    ) {
      return;
    }

    logger.info("ActivityLayout", "activity", "Layout initialized", {
      count: incoming.length,
      fromDefaults: !fromSettings || fromSettings.length === 0,
    });
    set({ cards: incoming });
  },

  addCard: (type) => {
    const { cards } = get();
    // One per type — don't add if already present
    if (cards.some((c) => c.type === type)) return;

    const widths = CARD_WIDTH_OPTIONS[type];
    const defaultWidth: CardWidth = widths.includes("half") ? "half" : "full";
    const defaultOpts = DEFAULT_CARD_OPTIONS[type];

    const newCard: ActivityCardConfig = {
      id: generateCardId(),
      type,
      width: defaultWidth,
      ...(defaultOpts ? { options: { ...defaultOpts } } : {}),
    };

    set({ cards: [...cards, newCard] });
    logger.info("ActivityLayout", "activity", "Card added", { type, id: newCard.id });
  },

  removeCard: (id) => {
    const prev = get().cards;
    set({ cards: prev.filter((c) => c.id !== id) });
    logger.info("ActivityLayout", "activity", "Card removed", { id });
  },

  reorderCards: (fromIndex, toIndex) => {
    const cards = [...get().cards];
    if (fromIndex < 0 || fromIndex >= cards.length) return;
    if (toIndex < 0 || toIndex >= cards.length) return;
    const [moved] = cards.splice(fromIndex, 1);
    cards.splice(toIndex, 0, moved);
    set({ cards });
    logger.info("ActivityLayout", "activity", "Cards reordered", { fromIndex, toIndex });
  },

  setCardWidth: (id, width) => {
    set({
      cards: get().cards.map((c) => (c.id === id ? { ...c, width } : c)),
    });
  },

  updateCardOptions: (id, options) => {
    set({
      cards: get().cards.map((c) =>
        c.id === id ? { ...c, options: { ...(c.options ?? {}), ...options } } : c,
      ),
    });
  },

  resetCardOptions: (id) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;
    const defaults = DEFAULT_CARD_OPTIONS[card.type];
    set({
      cards: get().cards.map((c) =>
        c.id === id ? { ...c, options: defaults ? { ...defaults } : undefined } : c,
      ),
    });
    logger.info("ActivityLayout", "activity", "Card options reset", {
      id,
      type: card.type,
    });
  },

  setEditMode: (editing) => set({ isEditMode: editing }),
}));

/** Helper to get layout array for persistence */
export function getLayoutForPersistence(): ActivityCardConfig[] {
  return useActivityLayoutStore.getState().cards;
}
