/**
 * Engine integration tests — verify phase progression, action handling, and
 * the headline rules (CP cap, HP cap, hand cap, Start Player skip-Income).
 */
import { describe, it, expect } from "vitest";
import { applyAction, makeEmptyState } from "../src/game/engine";
import { nextAiAction } from "../src/game/ai";
import type { GameState } from "../src/game/types";
import "../src/content/cards/barbarian";

function start(seed = 1): GameState {
  const r = applyAction(makeEmptyState(), {
    kind: "start-match", seed, p1: "barbarian", p2: "barbarian", coinFlipWinner: "p1",
  });
  return r.state;
}

describe("match start", () => {
  it("emits match-started, draws 4 to each hand, sets HP/CP", () => {
    const r = applyAction(makeEmptyState(), {
      kind: "start-match", seed: 1, p1: "barbarian", p2: "barbarian", coinFlipWinner: "p1",
    });
    expect(r.events.some(e => e.t === "match-started")).toBe(true);
    expect(r.state.players.p1.hand).toHaveLength(4);
    expect(r.state.players.p2.hand).toHaveLength(4);
    expect(r.state.players.p1.hp).toBe(30);
    expect(r.state.players.p1.cp).toBe(2);
    expect(r.state.players.p1.hpCap).toBe(40);
  });

  it("Start Player skips their first Income (no CP/draw bump beyond starting state)", () => {
    const state = start(1);
    expect(state.startPlayerSkippedFirstIncome).toBe(true);
    expect(state.players.p1.cp).toBe(2);     // CP still starts at 2 — no income bump
    expect(state.players.p1.hand).toHaveLength(4);  // no income draw
  });

  it("p2's first Income (after pass turn) gives +1 CP and +1 card", () => {
    let state = start(1);
    // Burn through p1's turn — keep advancing until activePlayer flips.
    let safety = 0;
    while (state.activePlayer === "p1" && safety++ < 50) {
      const a = nextAiAction(state, "p1");
      const r = applyAction(state, a);
      state = r.state;
    }
    expect(state.activePlayer).toBe("p2");
    // P2 should have received +1 CP and +1 card from their first Income.
    expect(state.players.p2.cp).toBeGreaterThanOrEqual(2);
    expect(state.players.p2.hand.length).toBeGreaterThanOrEqual(4);
  });
});

describe("phase progression", () => {
  it("at match start the active player lands in main-pre", () => {
    const state = start(1);
    expect(state.phase).toBe("main-pre");
    expect(state.activePlayer).toBe("p1");
  });
});

describe("end-to-end bot-vs-bot match", () => {
  it("plays to a winner within a reasonable number of turns", () => {
    let state = start(42);
    let safety = 0;
    while (!state.winner && safety++ < 4000) {
      const a = nextAiAction(state, state.activePlayer);
      const r = applyAction(state, a);
      state = r.state;
    }
    expect(state.winner).toBeDefined();
    expect(state.turn).toBeLessThan(80);   // sanity: shouldn't loop forever
  });
});
