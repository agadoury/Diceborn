/**
 * Diceborn — Choreographer store.
 *
 * Owns the event queue + the transient visual side-effects (screen shake,
 * hit-stop, damage numbers, ability cinematic). Components subscribe to
 * the slices they need.
 *
 * The Choreographer driver component (effects/Choreographer.tsx) is the
 * only thing that calls `enqueue` from outside test benches — usually
 * triggered when the Zustand game store applies an action and emits events.
 */
import { create } from "zustand";
import type { GameEvent, HeroId, PlayerId } from "@/game/types";

export interface DamageNumber {
  id: number;
  amount: number;
  /** "dmg" red / "heal" green / "pure" purple / "crit" gold / "white" undefendable. */
  variant: "dmg" | "heal" | "pure" | "crit" | "white";
  /** Approx position 0..1 of the screen, both axes. Test bench uses center.  */
  x: number; y: number;
  /** Big-number flag for ≥10 / ≥20 sizes. */
  size: "sm" | "md" | "lg";
  spawnedAt: number;
}

export interface AbilityCinematicState {
  hero: HeroId;
  abilityName: string;
  isUlt: boolean;
  isCritical: boolean;
  /** Skip flag — set true to fast-forward. */
  skipping: boolean;
  startedAt: number;
  durationMs: number;
}

export interface AttackEffectState {
  hero: HeroId;
  abilityId: string;            // e.g. "cleave", "firebolt", "smite"
  abilityName: string;          // display label
  tier: 1 | 2 | 3;
  accent: string;
  isCritical: boolean;
  startedAt: number;
  durationMs: number;
}

export interface ShakeState {
  magnitude: number;     // px
  duration: number;      // ms
  startedAt: number;
}

export interface ChoreoState {
  queue: GameEvent[];
  playing: GameEvent | null;
  // Side-effects observed by view components
  shake: ShakeState | null;
  hitStopUntil: number;          // monotonic ms timestamp
  damageNumbers: DamageNumber[];
  cinematic: AbilityCinematicState | null;
  attackEffect: AttackEffectState | null;
  bannerText: string | null;     // turn-started, match-won, etc.
  // Counters
  totalEventsHandled: number;

  // Actions
  enqueue: (events: GameEvent[]) => void;
  startNext: (ev: GameEvent) => void;
  finishCurrent: () => void;
  setShake: (s: ShakeState | null) => void;
  triggerHitStop: (ms: number) => void;
  spawnDamageNumber: (n: Omit<DamageNumber, "id" | "spawnedAt">) => void;
  cullDamageNumbers: (idsToKeep: number[]) => void;
  startCinematic: (c: Omit<AbilityCinematicState, "startedAt" | "skipping">) => void;
  skipCinematic: () => void;
  endCinematic: () => void;
  startAttackEffect: (e: Omit<AttackEffectState, "startedAt">) => void;
  endAttackEffect: () => void;
  setBanner: (text: string | null) => void;
  reset: () => void;
}

let _dnId = 1;

export const useChoreoStore = create<ChoreoState>((set) => ({
  queue: [],
  playing: null,
  shake: null,
  hitStopUntil: 0,
  damageNumbers: [],
  cinematic: null,
  attackEffect: null,
  bannerText: null,
  totalEventsHandled: 0,

  enqueue: (events) => set(s => ({ queue: [...s.queue, ...events] })),

  startNext: (ev) => set(s => ({
    playing: ev,
    queue: s.queue.slice(1),
  })),

  finishCurrent: () => set(s => ({
    playing: null,
    totalEventsHandled: s.totalEventsHandled + 1,
  })),

  setShake: (shake) => set({ shake }),

  triggerHitStop: (ms) => set({ hitStopUntil: performance.now() + ms }),

  spawnDamageNumber: (n) => {
    const id = _dnId++;
    set(s => ({
      damageNumbers: [...s.damageNumbers, { ...n, id, spawnedAt: performance.now() }],
    }));
    // Auto-cull after 1.4s.
    window.setTimeout(() => {
      set(s => ({ damageNumbers: s.damageNumbers.filter(d => d.id !== id) }));
    }, 1400);
  },

  cullDamageNumbers: (idsToKeep) => set(s => ({
    damageNumbers: s.damageNumbers.filter(d => idsToKeep.includes(d.id)),
  })),

  startCinematic: (c) => set({
    cinematic: { ...c, startedAt: performance.now(), skipping: false },
  }),

  skipCinematic: () => set(s => ({
    cinematic: s.cinematic ? { ...s.cinematic, skipping: true } : null,
  })),

  endCinematic: () => set({ cinematic: null }),

  startAttackEffect: (e) => set({
    attackEffect: { ...e, startedAt: performance.now() },
  }),

  endAttackEffect: () => set({ attackEffect: null }),

  setBanner: (bannerText) => set({ bannerText }),

  reset: () => set({
    queue: [], playing: null, shake: null, hitStopUntil: 0,
    damageNumbers: [], cinematic: null, attackEffect: null, bannerText: null,
  }),
}));

/** Convenience: enqueue events from outside React. */
export function enqueueEvents(events: GameEvent[]): void {
  useChoreoStore.getState().enqueue(events);
}

/** Read which player owns the side of the screen the next damage number
 *  should appear on — caller passes this when dispatching test events. */
export function targetSlot(_player: PlayerId, _opponent: PlayerId): { x: number; y: number } {
  // Step-4 placeholder: middle of screen. Step 5 wires real player-panel rects.
  return { x: 0.5, y: 0.45 };
}
