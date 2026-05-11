/**
 * Pact of Heroes — game store. Thin Zustand wrapper around the pure engine.
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
import type { Action, CardId, GameEvent, GameState, HeroId, LoadoutSelection, PlayerId } from "@/game/types";
import { applyAction, makeEmptyState } from "@/game/engine";
import { enqueueEvents, useChoreoStore } from "./choreoStore";
import { loadDeck } from "./deckStorage";
import { loadLoadout } from "./loadoutStorage";

export type MatchMode = "hot-seat" | "vs-ai";

interface GameStoreState {
  state: GameState | null;
  mode: MatchMode;
  /** Which player the human(s) control. For Vs AI: aiPlayer is the opposite. */
  aiPlayer: PlayerId | null;
  /** Latest events (for tests / debug). */
  lastEvents: GameEvent[];
  /** Full event log accumulated since match start — used by match-summary. */
  matchLog: GameEvent[];

  // Actions
  startMatch: (opts: {
    p1: HeroId; p2: HeroId; mode: MatchMode;
    seed?: number; coin?: PlayerId;
    /** Optional explicit decks. When omitted, each player's saved deck (if
     *  any) is loaded from localStorage; the engine in turn falls back to the
     *  hero's recommendedDeck when no saved deck exists. */
    p1Deck?: ReadonlyArray<CardId>; p2Deck?: ReadonlyArray<CardId>;
    /** Optional explicit loadouts. When omitted, each player's saved loadout
     *  (if any) is loaded from localStorage; the engine falls back to the
     *  hero's `recommendedLoadout` when no saved selection exists or it
     *  fails validation. */
    p1Loadout?: LoadoutSelection; p2Loadout?: LoadoutSelection;
  }) => void;
  dispatch: (action: Action) => void;
  reset: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  state: null,
  mode: "hot-seat",
  aiPlayer: null,
  lastEvents: [],
  matchLog: [],

  startMatch: ({ p1, p2, mode, seed, coin, p1Deck, p2Deck, p1Loadout, p2Loadout }) => {
    const empty = makeEmptyState();
    const matchSeed = seed ?? (Date.now() & 0xffff);
    const winner = coin ?? (Math.random() < 0.5 ? "p1" : "p2");
    const resolvedP1Deck = p1Deck ?? loadDeck(p1) ?? undefined;
    const resolvedP2Deck = p2Deck ?? loadDeck(p2) ?? undefined;
    const resolvedP1Loadout = p1Loadout ?? loadLoadout(p1) ?? undefined;
    const resolvedP2Loadout = p2Loadout ?? loadLoadout(p2) ?? undefined;
    const r = applyAction(empty, {
      kind: "start-match", seed: matchSeed, p1, p2, coinFlipWinner: winner,
      p1Deck: resolvedP1Deck, p2Deck: resolvedP2Deck,
      p1Loadout: resolvedP1Loadout, p2Loadout: resolvedP2Loadout,
    });
    enqueueEvents(r.events);
    set({
      state: r.state,
      mode,
      aiPlayer: mode === "vs-ai" ? "p2" : null,
      lastEvents: r.events,
      matchLog: r.events.slice(),
    });
  },

  dispatch: (action) => {
    const cur = get().state;
    if (!cur) return;
    const r = applyAction(cur, action);
    enqueueEvents(r.events);
    set(s => ({
      state: r.state,
      lastEvents: r.events,
      matchLog: [...s.matchLog, ...r.events],
    }));
  },

  reset: () => {
    useChoreoStore.getState().reset();
    set({ state: null, mode: "hot-seat", aiPlayer: null, lastEvents: [], matchLog: [] });
  },
}));

/** True iff no choreographer beats are pending — UI can accept user input. */
export function useInputUnlocked(): boolean {
  const queueLen = useChoreoStore(s => s.queue.length);
  const playing  = useChoreoStore(s => !!s.playing);
  const cinematic = useChoreoStore(s => !!s.cinematic);
  return queueLen === 0 && !playing && !cinematic;
}
