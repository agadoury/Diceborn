import { describe, it, expect } from "vitest";
import { buildMatchSummary } from "../src/game/match-summary";
import type { GameEvent } from "../src/game/types";

describe("match-summary descriptor", () => {
  it("CLUTCH: winner finishes below 10% HP", () => {
    const events: GameEvent[] = [
      { t: "turn-started", player: "p1", turn: 1 },
      { t: "damage-dealt", from: "p2", to: "p1", amount: 28, type: "normal", mitigated: 0 },
      { t: "hp-changed", player: "p1", delta: -28, total: 2 },
      { t: "damage-dealt", from: "p1", to: "p2", amount: 35, type: "normal", mitigated: 0 },
      { t: "hp-changed", player: "p2", delta: -30, total: 0 },
      { t: "match-won", winner: "p1" },
    ];
    const r = buildMatchSummary(events, { winner: "p1", turns: 5, startingHp: 30 });
    expect(r.descriptor).toBe("CLUTCH");
  });

  it("COMEBACK: winner dropped below 25% but recovered", () => {
    const events: GameEvent[] = [
      { t: "turn-started", player: "p1", turn: 1 },
      { t: "damage-dealt", from: "p2", to: "p1", amount: 23, type: "normal", mitigated: 0 },
      { t: "hp-changed", player: "p1", delta: -23, total: 7 },
      { t: "heal-applied", player: "p1", amount: 5 },
      { t: "hp-changed", player: "p1", delta: 5, total: 12 },
      { t: "damage-dealt", from: "p1", to: "p2", amount: 35, type: "normal", mitigated: 0 },
      { t: "hp-changed", player: "p2", delta: -30, total: 0 },
      { t: "match-won", winner: "p1" },
    ];
    const r = buildMatchSummary(events, { winner: "p1", turns: 6, startingHp: 30 });
    expect(r.descriptor).toBe("COMEBACK");
  });

  it("STOMP: winner stays above 70% HP throughout", () => {
    const events: GameEvent[] = [
      { t: "turn-started", player: "p1", turn: 1 },
      { t: "damage-dealt", from: "p2", to: "p1", amount: 4, type: "normal", mitigated: 0 },
      { t: "hp-changed", player: "p1", delta: -4, total: 26 },
      { t: "damage-dealt", from: "p1", to: "p2", amount: 35, type: "normal", mitigated: 0 },
      { t: "hp-changed", player: "p2", delta: -30, total: 0 },
      { t: "match-won", winner: "p1" },
    ];
    const r = buildMatchSummary(events, { winner: "p1", turns: 4, startingHp: 30 });
    expect(r.descriptor).toBe("STOMP");
  });

  it("GRINDER: 12+ turns and no other descriptor applies", () => {
    const events: GameEvent[] = [
      { t: "turn-started", player: "p1", turn: 1 },
      { t: "damage-dealt", from: "p2", to: "p1", amount: 12, type: "normal", mitigated: 0 },
      { t: "hp-changed", player: "p1", delta: -12, total: 18 },
      { t: "damage-dealt", from: "p1", to: "p2", amount: 35, type: "normal", mitigated: 0 },
      { t: "hp-changed", player: "p2", delta: -30, total: 0 },
      { t: "match-won", winner: "p1" },
    ];
    const r = buildMatchSummary(events, { winner: "p1", turns: 14, startingHp: 30 });
    expect(r.descriptor).toBe("GRINDER");
  });

  it("CRITICAL VICTORY: ended on a critical Ultimate", () => {
    const events: GameEvent[] = [
      { t: "turn-started", player: "p1", turn: 1 },
      { t: "ultimate-fired", player: "p1", abilityName: "BLOOD HARVEST", isCritical: true },
      { t: "damage-dealt", from: "p1", to: "p2", amount: 24, type: "ultimate", mitigated: 0 },
      { t: "hp-changed", player: "p2", delta: -24, total: 0 },
      { t: "match-won", winner: "p1" },
    ];
    const r = buildMatchSummary(events, { winner: "p1", turns: 7, startingHp: 30 });
    expect(r.descriptor).toBe("CRITICAL VICTORY");
  });

  it("computes total damage and biggest hit", () => {
    const events: GameEvent[] = [
      { t: "damage-dealt", from: "p1", to: "p2", amount: 7,  type: "normal", mitigated: 0 },
      { t: "damage-dealt", from: "p1", to: "p2", amount: 11, type: "normal", mitigated: 0 },
      { t: "damage-dealt", from: "p2", to: "p1", amount: 4,  type: "normal", mitigated: 0 },
      { t: "match-won", winner: "p1" },
    ];
    const r = buildMatchSummary(events, { winner: "p1", turns: 3, startingHp: 30 });
    expect(r.totalDamage.p1).toBe(18);
    expect(r.totalDamage.p2).toBe(4);
    expect(r.biggestHit.p1).toBe(11);
  });
});
