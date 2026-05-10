/**
 * Pact of Heroes — seeded RNG.
 *
 * Mulberry32: tiny, fast, deterministic. Tests run with fixed seeds so dice
 * rolls and AI decisions reproduce exactly. The cursor advances every draw
 * and is stored on GameState (rngCursor) so we can rewind/replay if needed.
 */

import type { GameState } from "./types";

/** Returns next [0,1) for the given (seed, cursor) pair, plus the new cursor. */
export function next(seed: number, cursor: number): { value: number; cursor: number } {
  let t = (seed + cursor * 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, cursor: cursor + 1 };
}

/** Roll an integer in [0, n). */
export function nextInt(seed: number, cursor: number, n: number): { value: number; cursor: number } {
  const r = next(seed, cursor);
  return { value: Math.floor(r.value * n), cursor: r.cursor };
}

/** Bind to a GameState — mutates state.rngCursor and returns the value. */
export function rollOn(state: { rngSeed: number; rngCursor: number }, n: number): number {
  const r = nextInt(state.rngSeed, state.rngCursor, n);
  state.rngCursor = r.cursor;
  return r.value;
}

/** Fisher-Yates shuffle in place using state's RNG cursor. */
export function shuffleInPlace<T>(arr: T[], state: { rngSeed: number; rngCursor: number }): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rollOn(state, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Standalone shuffle for simulate.ts / Monte Carlo (uses its own cursor). */
export function shuffleSeeded<T>(arr: T[], seed: number, cursor = 0): T[] {
  const out = arr.slice();
  let cur = cursor;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextInt(seed, cur, i + 1);
    cur = r.cursor;
    [out[i], out[r.value]] = [out[r.value], out[i]];
  }
  return out;
}

/** Convenience: produce N rolls from a fresh seed without touching GameState. */
export function rollsFromSeed(seed: number, n: number, sides: number): number[] {
  const rolls: number[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const r = nextInt(seed, cursor, sides);
    cursor = r.cursor;
    rolls.push(r.value);
  }
  return rolls;
}

/** Coin flip helper used by start-match. */
export function coinFlip(seed: number): "p1" | "p2" {
  return next(seed, 0).value < 0.5 ? "p1" : "p2";
}

/** Read RNG cursor from a GameState without coupling helpers to the full type. */
export function cursor(state: GameState): number { return state.rngCursor; }
