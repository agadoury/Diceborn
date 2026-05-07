/**
 * Diceborn — game store. Thin Zustand wrapper around the pure engine.
 *
 * Every dispatch:
 *   1. Calls applyAction(state, action) → { state, events }.
 *   2. Updates store state with the new GameState.
 *   3. Pipes events into the choreographer queue.
 *
 * The store does NOT block on choreographer drain — UI components do that
 * via `canAcceptInput()` (read live from the choreoStore). When the AI is
 * active, a small driver effect waits for drain before dispatching the
 * next AI action.
 */
import { create } from "zustand";
import type { Action, GameEvent, GameState, HeroId, PlayerId } from "@/game/types";
import { applyAction, makeEmptyState } from "@/game/engine";
import { enqueueEvents, useChoreoStore } from "./choreoStore";

export type MatchMode = "hot-seat" | "vs-ai";

interface GameStoreState {
  state: GameState | null;
  mode: MatchMode;
  /** Which player the human(s) control. For Vs AI: aiPlayer is the opposite. */
  aiPlayer: PlayerId | null;
  /** Latest events (for tests / debug). */
  lastEvents: GameEvent[];

  // Actions
  startMatch: (opts: { p1: HeroId; p2: HeroId; mode: MatchMode; seed?: number; coin?: PlayerId }) => void;
  dispatch: (action: Action) => void;
  reset: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  state: null,
  mode: "hot-seat",
  aiPlayer: null,
  lastEvents: [],

  startMatch: ({ p1, p2, mode, seed, coin }) => {
    const empty = makeEmptyState();
    const matchSeed = seed ?? (Date.now() & 0xffff);
    const winner = coin ?? (Math.random() < 0.5 ? "p1" : "p2");
    const r = applyAction(empty, {
      kind: "start-match", seed: matchSeed, p1, p2, coinFlipWinner: winner,
    });
    enqueueEvents(r.events);
    set({
      state: r.state,
      mode,
      aiPlayer: mode === "vs-ai" ? "p2" : null,
      lastEvents: r.events,
    });
  },

  dispatch: (action) => {
    const cur = get().state;
    if (!cur) return;
    const r = applyAction(cur, action);
    enqueueEvents(r.events);
    set({ state: r.state, lastEvents: r.events });
  },

  reset: () => {
    useChoreoStore.getState().reset();
    set({ state: null, mode: "hot-seat", aiPlayer: null, lastEvents: [] });
  },
}));

/** True iff no choreographer beats are pending — UI can accept user input. */
export function useInputUnlocked(): boolean {
  const queueLen = useChoreoStore(s => s.queue.length);
  const playing  = useChoreoStore(s => !!s.playing);
  const cinematic = useChoreoStore(s => !!s.cinematic);
  return queueLen === 0 && !playing && !cinematic;
}
