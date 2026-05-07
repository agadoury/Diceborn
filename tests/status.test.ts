import { describe, it, expect } from "vitest";
import {
  applyStatus,
  removeStatus,
  stripStatus,
  stacksOf,
  tickStatusesAt,
} from "../src/game/status";
import type { GameState, HeroSnapshot } from "../src/game/types";

function makeSnap(p: "p1" | "p2"): HeroSnapshot {
  return {
    player: p, hero: "barbarian",
    hp: 30, hpStart: 30, hpCap: 40, cp: 2,
    dice: [], rollAttemptsRemaining: 0,
    hand: [], deck: [], discard: [], statuses: [],
    upgrades: { 1: 0, 2: 0, 3: 0, 4: 0 },
    signatureState: {},
    ladderState: [
      { kind: "out-of-reach", tier: 1 },
      { kind: "out-of-reach", tier: 2 },
      { kind: "out-of-reach", tier: 3 },
      { kind: "out-of-reach", tier: 4 },
    ],
    isLowHp: false, nextAbilityBonusDamage: 0,
  };
}

function makeState(): GameState {
  const p1 = makeSnap("p1"), p2 = makeSnap("p2");
  return {
    rngSeed: 1, rngCursor: 0, turn: 1, activePlayer: "p1",
    startPlayer: "p1", startPlayerSkippedFirstIncome: true,
    phase: "upkeep",
    players: { p1, p2 },
    log: [],
  };
}

describe("status engine — application & stack limits", () => {
  it("applies and stacks Burn up to its limit (5)", () => {
    const state = makeState();
    applyStatus(state.players.p2, "p1", "burn", 3);
    expect(stacksOf(state.players.p2, "burn")).toBe(3);
    applyStatus(state.players.p2, "p1", "burn", 5);
    expect(stacksOf(state.players.p2, "burn")).toBe(5);  // capped
  });

  it("Stun stack limit is 1", () => {
    const state = makeState();
    applyStatus(state.players.p2, "p1", "stun", 3);
    expect(stacksOf(state.players.p2, "stun")).toBe(1);
  });

  it("Bleeding stack limit is 5; tracks most recent applier", () => {
    const state = makeState();
    applyStatus(state.players.p2, "p1", "bleeding", 2);
    applyStatus(state.players.p2, "p2", "bleeding", 1);
    const inst = state.players.p2.statuses.find(s => s.id === "bleeding")!;
    expect(inst.stacks).toBe(3);
    expect(inst.appliedBy).toBe("p2");
  });

  it("strip removes all stacks", () => {
    const state = makeState();
    applyStatus(state.players.p1, "p2", "burn", 4);
    const r = stripStatus(state.players.p1, "burn");
    expect(stacksOf(state.players.p1, "burn")).toBe(0);
    expect(r.events.some(e => e.t === "status-removed")).toBe(true);
  });
});

describe("status engine — ticking", () => {
  it("Burn ticks at the holder's own upkeep, decrements by 1", () => {
    const state = makeState();
    applyStatus(state.players.p1, "p2", "burn", 3);
    state.activePlayer = "p1";
    const r = tickStatusesAt(state, state.players.p1, "ownUpkeep");
    expect(r.pendingDamage).toBe(3);
    expect(stacksOf(state.players.p1, "burn")).toBe(2);
  });

  it("Bleeding ticks at the *applier's* upkeep, not the holder's", () => {
    const state = makeState();
    // Applied by p1 onto p2.
    applyStatus(state.players.p2, "p1", "bleeding", 2);
    // Tick at p2's upkeep — Bleeding is applierUpkeep, applier = p1, so should NOT tick.
    state.activePlayer = "p2";
    const wrongTurn = tickStatusesAt(state, state.players.p2, "applierUpkeep");
    expect(wrongTurn.pendingDamage).toBe(0);
    expect(stacksOf(state.players.p2, "bleeding")).toBe(2);  // unchanged
    // Now tick at p1's upkeep — should tick.
    state.activePlayer = "p1";
    const rightTurn = tickStatusesAt(state, state.players.p2, "applierUpkeep");
    expect(rightTurn.pendingDamage).toBe(2);
    expect(stacksOf(state.players.p2, "bleeding")).toBe(1);
  });

  it("Regen ticks at own upkeep producing pendingHeal", () => {
    const state = makeState();
    applyStatus(state.players.p1, "p1", "regen", 2);
    state.activePlayer = "p1";
    const r = tickStatusesAt(state, state.players.p1, "ownUpkeep");
    expect(r.pendingHeal).toBe(2);
    expect(stacksOf(state.players.p1, "regen")).toBe(1);
  });

  it("Stun does not tick at upkeep (consumed by phase logic instead)", () => {
    const state = makeState();
    applyStatus(state.players.p1, "p2", "stun", 1);
    const r = tickStatusesAt(state, state.players.p1, "ownUpkeep");
    expect(r.pendingDamage).toBe(0);
    expect(stacksOf(state.players.p1, "stun")).toBe(1);
  });

  it("status drops to 0 → emits status-removed", () => {
    const state = makeState();
    applyStatus(state.players.p1, "p2", "burn", 1);
    const tick = tickStatusesAt(state, state.players.p1, "ownUpkeep");
    expect(tick.events.some(e => e.t === "status-removed" && e.status === "burn")).toBe(true);
    expect(stacksOf(state.players.p1, "burn")).toBe(0);
  });
});

describe("status engine — removeStatus", () => {
  it("partial removal leaves remaining stacks", () => {
    const state = makeState();
    applyStatus(state.players.p1, "p2", "burn", 4);
    removeStatus(state.players.p1, "burn", 2, "stripped");
    expect(stacksOf(state.players.p1, "burn")).toBe(2);
  });
});
