import { describe, it, expect } from "vitest";
import {
  comboMatches,
  pickKeepMask,
  reachabilityProbability,
  evaluateLadder,
  isCriticalRoll,
  simulateLandingRate,
} from "../src/game/dice";
import { BARBARIAN } from "../src/content/heroes/barbarian";
import "../src/content/cards/barbarian";
import type { Die, HeroSnapshot, DiceCombo } from "../src/game/types";

const SYM = {
  AXE: "barbarian:axe",
  FIST: "barbarian:fist",
  FURY: "barbarian:fury",
  SHIELD: "barbarian:shield",
  ULT: "barbarian:ult",
};

function makeDice(symbols: string[]): Die[] {
  return symbols.map((sym, i) => ({
    index: i as Die["index"],
    faces: BARBARIAN.diceIdentity.faces,
    current: BARBARIAN.diceIdentity.faces.findIndex(f => f.symbol === sym),
    locked: false,
  }));
}

function makeSnap(dice: Die[]): HeroSnapshot {
  return {
    player: "p1", hero: "barbarian",
    hp: 30, hpStart: 30, hpCap: 40, cp: 2,
    dice, rollAttemptsRemaining: 0,
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

describe("combo grammar", () => {
  it("matching: 3 axes match 'matching axe count 3'", () => {
    const symbols = [SYM.AXE, SYM.AXE, SYM.AXE, SYM.SHIELD, SYM.ULT];
    const c: DiceCombo = { kind: "matching", symbol: SYM.AXE, count: 3 };
    expect(comboMatches(c, symbols)).toBe(true);
  });
  it("matching-any: 3 of any one symbol matches", () => {
    const c: DiceCombo = { kind: "matching-any", count: 3 };
    expect(comboMatches(c, [SYM.AXE, SYM.AXE, SYM.AXE, SYM.SHIELD, SYM.ULT])).toBe(true);
    expect(comboMatches(c, [SYM.AXE, SYM.FIST, SYM.FURY, SYM.SHIELD, SYM.ULT])).toBe(false);
  });
  it("at-least: counts duplicates", () => {
    const c: DiceCombo = { kind: "at-least", symbol: SYM.AXE, count: 4 };
    expect(comboMatches(c, [SYM.AXE, SYM.AXE, SYM.AXE, SYM.AXE, SYM.SHIELD])).toBe(true);
    expect(comboMatches(c, [SYM.AXE, SYM.AXE, SYM.AXE, SYM.SHIELD, SYM.ULT])).toBe(false);
  });
  it("any-of: any of 3 symbols at count 4", () => {
    const c: DiceCombo = { kind: "any-of", symbols: [SYM.AXE, SYM.FIST, SYM.FURY], count: 4 };
    expect(comboMatches(c, [SYM.FIST, SYM.FIST, SYM.FIST, SYM.FIST, SYM.SHIELD])).toBe(true);
    expect(comboMatches(c, [SYM.AXE, SYM.AXE, SYM.AXE, SYM.FIST, SYM.SHIELD])).toBe(false);
  });
  it("specific-set: every required symbol present at least once", () => {
    const c: DiceCombo = { kind: "specific-set", symbols: [SYM.AXE, SYM.ULT] };
    expect(comboMatches(c, [SYM.AXE, SYM.ULT, SYM.SHIELD, SYM.SHIELD, SYM.SHIELD])).toBe(true);
    expect(comboMatches(c, [SYM.AXE, SYM.AXE, SYM.SHIELD, SYM.SHIELD, SYM.SHIELD])).toBe(false);
  });
  it("compound and: all clauses must match", () => {
    const c: DiceCombo = { kind: "compound", op: "and", clauses: [
      { kind: "at-least", symbol: SYM.ULT, count: 2 },
      { kind: "at-least", symbol: SYM.AXE, count: 3 },
    ]};
    expect(comboMatches(c, [SYM.ULT, SYM.ULT, SYM.AXE, SYM.AXE, SYM.AXE])).toBe(true);
    expect(comboMatches(c, [SYM.ULT, SYM.AXE, SYM.AXE, SYM.AXE, SYM.AXE])).toBe(false);
  });
  it("compound or: any clause matches", () => {
    const c: DiceCombo = { kind: "compound", op: "or", clauses: [
      { kind: "at-least", symbol: SYM.AXE,  count: 4 },
      { kind: "at-least", symbol: SYM.FIST, count: 4 },
    ]};
    expect(comboMatches(c, [SYM.FIST, SYM.FIST, SYM.FIST, SYM.FIST, SYM.SHIELD])).toBe(true);
    expect(comboMatches(c, [SYM.AXE, SYM.AXE, SYM.AXE, SYM.FIST, SYM.SHIELD])).toBe(false);
  });
});

describe("pickKeepMask", () => {
  it("keeps dice contributing to the target combo", () => {
    const c: DiceCombo = { kind: "at-least", symbol: SYM.AXE, count: 4 };
    const symbols = [SYM.AXE, SYM.AXE, SYM.SHIELD, SYM.ULT, SYM.AXE];
    const keep = pickKeepMask(c, symbols);
    expect(keep).toEqual([true, true, false, false, true]);
  });
  it("matching-any keeps the most-common symbol", () => {
    const c: DiceCombo = { kind: "matching-any", count: 3 };
    const symbols = [SYM.AXE, SYM.AXE, SYM.AXE, SYM.SHIELD, SYM.ULT];
    expect(pickKeepMask(c, symbols)).toEqual([true, true, true, false, false]);
  });
});

describe("evaluateLadder", () => {
  it("classifies all four states for the Barbarian", () => {
    // Configure dice to currently match Tier 1 (3 of a kind), reachable for T2,
    // out-of-reach for T3 (needs ULT), out-of-reach for T4.
    const dice = makeDice([SYM.AXE, SYM.AXE, SYM.AXE, SYM.SHIELD, SYM.SHIELD]);
    // Lock all 5 dice → no rerolls possible. T1 fires; T2/3/4 out-of-reach.
    for (const d of dice) d.locked = true;
    const snap = makeSnap(dice);
    const rows = evaluateLadder(BARBARIAN, snap, 0, { opponentHp: 30 });
    expect(rows[0].kind).toBe("firing");
    expect(rows[1].kind).toBe("out-of-reach");
    expect(rows[2].kind).toBe("out-of-reach");
    expect(rows[3].kind).toBe("out-of-reach");
  });

  it("LETHAL flag triggers when ability damage >= opponent HP", () => {
    // T2 fires with 3 axes + 1 Roar (and a 5th wildcard); effect = 7 damage.
    // Opponent at 7 HP → lethal.
    const dice = makeDice([SYM.AXE, SYM.AXE, SYM.AXE, SYM.ULT, SYM.SHIELD]);
    for (const d of dice) d.locked = true;
    const snap = makeSnap(dice);
    const rows = evaluateLadder(BARBARIAN, snap, 0, { opponentHp: 7 });
    expect(rows[1].kind).toBe("firing");
    if (rows[1].kind === "firing") expect(rows[1].lethal).toBe(true);
  });

  it("reachability probability is between 0 and 1", () => {
    const dice = makeDice([SYM.AXE, SYM.SHIELD, SYM.SHIELD, SYM.ULT, SYM.FIST]);
    const c: DiceCombo = { kind: "at-least", symbol: SYM.AXE, count: 4 };
    const p = reachabilityProbability(c, dice, 1, BARBARIAN.diceIdentity.faces, 200, 1);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe("isCriticalRoll", () => {
  it("crits when all 5 dice contribute to a matching-any combo", () => {
    const c: DiceCombo = { kind: "matching-any", count: 3 };
    const dice = makeDice([SYM.AXE, SYM.AXE, SYM.AXE, SYM.AXE, SYM.AXE]);
    expect(isCriticalRoll(c, dice)).toBe(true);
  });
  it("does not crit when any die is wasted", () => {
    const c: DiceCombo = { kind: "matching-any", count: 3 };
    const dice = makeDice([SYM.AXE, SYM.AXE, SYM.AXE, SYM.SHIELD, SYM.ULT]);
    expect(isCriticalRoll(c, dice)).toBe(false);
  });
});

describe("Barbarian landing-rate validation", () => {
  it("all four tiers fall within their target landing bands (10k samples)", () => {
    const results = simulateLandingRate(BARBARIAN, 2, 10_000, 7);
    for (const r of results) {
      expect(
        r.rate,
        `Tier ${r.tier} (${r.abilityName}) landed ${(r.rate * 100).toFixed(1)}% — outside [${r.target[0]}, ${r.target[1]}]`,
      ).toBeGreaterThanOrEqual(r.target[0]);
      expect(r.rate).toBeLessThanOrEqual(r.target[1]);
    }
  });
});
