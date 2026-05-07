/**
 * UI store — view-only state. Not part of game truth.
 *  - currentViewer:  which player the screen is rendering for (hot-seat flips)
 *  - liftedCardId:   the card currently in the "ready" lift state
 *  - curtainOpen:    pass-and-play handoff modal
 */
import { create } from "zustand";
import type { CardId, PlayerId } from "@/game/types";

interface UIState {
  currentViewer: PlayerId;
  liftedCardId: CardId | null;
  curtainOpen: boolean;
  setViewer: (p: PlayerId) => void;
  liftCard: (id: CardId | null) => void;
  setCurtain: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentViewer: "p1",
  liftedCardId: null,
  curtainOpen: false,
  setViewer: (p) => set({ currentViewer: p }),
  liftCard: (id) => set({ liftedCardId: id }),
  setCurtain: (open) => set({ curtainOpen: open }),
}));
