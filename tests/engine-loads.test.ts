/**
 * engine-loads.test.ts — minimal smoke tests confirming the engine
 * modules import and the combo grammar primitives evaluate correctly.
 *
 * Hero-bound tests (dice / damage / engine / status) were removed when
 * the previous specific heroes were stripped from the codebase. New
 * test fixtures land alongside fresh hero content.
 */
import { describe, it, expect } from "vitest";
import { bendSymbol, comboMatchesFaces, computeComboExtras } from "../src/game/dice";
import { applyStatus, getStatusDef, registerStatus, stacksOf, stripStatus } from "../src/game/status";
import { validateDeckComposition } from "../src/game/cards";
import type { Card, DieFace, HeroSnapshot, LadderRowState } from "../src/game/types";

const FACES: DieFace[] = [
  { faceValue: 1, symbol: "test:a", label: "A" },
  { faceValue: 2, symbol: "test:a", label: "A" },
  { faceValue: 3, symbol: "test:b", label: "B" },
  { faceValue: 4, symbol: "test:b", label: "B" },
  { faceValue: 5, symbol: "test:c", label: "C" },
  { faceValue: 6, symbol: "test:d", label: "D" },
];

function f(...indices: number[]): DieFace[] {
  return indices.map(i => FACES[i - 1]);
}

describe("combo grammar primitives", () => {
  it("symbol-count counts dice with the symbol", () => {
    expect(comboMatchesFaces({ kind: "symbol-count", symbol: "test:a", count: 2 }, f(1, 2, 3, 4, 5))).toBe(true);
    expect(comboMatchesFaces({ kind: "symbol-count", symbol: "test:a", count: 3 }, f(1, 2, 3, 4, 5))).toBe(false);
  });

  it("n-of-a-kind matches identical face values", () => {
    expect(comboMatchesFaces({ kind: "n-of-a-kind", count: 3 }, f(1, 1, 1, 4, 5))).toBe(true);
    expect(comboMatchesFaces({ kind: "n-of-a-kind", count: 4 }, f(1, 1, 1, 4, 5))).toBe(false);
  });

  it("straight detects consecutive face values", () => {
    expect(comboMatchesFaces({ kind: "straight", length: 4 }, f(1, 2, 3, 4, 6))).toBe(true);
    expect(comboMatchesFaces({ kind: "straight", length: 5 }, f(1, 2, 3, 4, 5))).toBe(true);
    expect(comboMatchesFaces({ kind: "straight", length: 5 }, f(1, 2, 3, 4, 6))).toBe(false);
  });

  it("compound and requires every clause", () => {
    const combo = {
      kind: "compound" as const, op: "and" as const, clauses: [
        { kind: "symbol-count" as const, symbol: "test:a", count: 2 },
        { kind: "n-of-a-kind" as const, count: 2 as const },
      ],
    };
    expect(comboMatchesFaces(combo, f(1, 1, 3, 4, 5))).toBe(true);     // 2 a-symbol AND 2-of-a-kind on face value 1
    expect(comboMatchesFaces(combo, f(1, 2, 3, 4, 5))).toBe(false);    // 2 a-symbol but no 2-of-a-kind
  });

  it("computeComboExtras returns dice beyond minimum", () => {
    expect(computeComboExtras({ kind: "symbol-count", symbol: "test:a", count: 1 }, f(1, 2, 3, 4, 5))).toBe(1); // 2 a-symbol - 1 = 1
    expect(computeComboExtras({ kind: "n-of-a-kind", count: 2 }, f(1, 1, 1, 4, 5))).toBe(1);                   // 3-of - 2 = 1
  });
});

describe("status registry — universal tokens", () => {
  it("registers burn / stun / protect / shield / regen", () => {
    expect(getStatusDef("burn")).toBeDefined();
    expect(getStatusDef("stun")).toBeDefined();
    expect(getStatusDef("protect")).toBeDefined();
    expect(getStatusDef("shield")).toBeDefined();
    expect(getStatusDef("regen")).toBeDefined();
  });

  it("apply/strip burn updates stack count", () => {
    const snap: HeroSnapshot = mockSnapshot();
    applyStatus(snap, "p1", "burn", 3);
    expect(stacksOf(snap, "burn")).toBe(3);
    applyStatus(snap, "p1", "burn", 5);
    expect(stacksOf(snap, "burn")).toBe(5); // capped at limit 5
  });
});

describe("Correction 6 primitives", () => {
  it("symbol bends one symbol to another", () => {
    expect(bendSymbol("test:fur", [{ fromSymbol: "test:fur", toSymbol: "test:axe" }])).toBe("test:axe");
    expect(bendSymbol("test:other", [{ fromSymbol: "test:fur", toSymbol: "test:axe" }])).toBe("test:other");
  });

  it("stripStatus records lastStripped count", () => {
    const snap: HeroSnapshot = mockSnapshot();
    applyStatus(snap, "p2", "burn", 4);
    expect(stacksOf(snap, "burn")).toBe(4);
    stripStatus(snap, "burn");
    expect(stacksOf(snap, "burn")).toBe(0);
    expect(snap.lastStripped["burn"]).toBe(4);
  });

  it("detonation triggers on apply-overflow", () => {
    registerStatus({
      id: "test:cinder",
      name: "Test Cinder",
      type: "debuff",
      stackLimit: 5,
      tickPhase: "neverTicks",
      detonation: {
        threshold: 5,
        triggerTiming: "on-application-overflow",
        effect: { kind: "damage", amount: 8, type: "pure" },
        resetsStacksTo: 0,
      },
      visualTreatment: { icon: "burn", color: "var(--c-dmg)", pulse: true },
    });
    const snap: HeroSnapshot = mockSnapshot();
    const events = applyStatus(snap, "p2", "test:cinder", 5);
    expect(events.find(e => e.t === "status-detonated")).toBeDefined();
    expect(stacksOf(snap, "test:cinder")).toBe(0);
  });

  it("validateDeckComposition enforces 4/3/3/2 by cardCategory (no T4 upgrades, no duplicate slots)", () => {
    const card = (id: string, kind: Card["kind"], cardCategory: Card["cardCategory"], extras: Partial<Card> = {}): Card => ({
      id, hero: "h", kind, cardCategory, name: id, cost: 1, text: "", trigger: { kind: "manual" },
      effect: { kind: "gain-cp", amount: 1 }, ...extras,
    });
    const good: Card[] = [
      ...Array.from({ length: 4 }, (_, i) => card(`h/g${i}`, "main-phase", "generic")),
      ...Array.from({ length: 3 }, (_, i) => card(`h/d${i}`, "roll-phase", "dice-manip")),
      card("h/u1", "mastery", "ladder-upgrade", { masteryTier: 1 }),
      card("h/u2", "mastery", "ladder-upgrade", { masteryTier: 2 }),
      card("h/u3", "mastery", "ladder-upgrade", { masteryTier: 3 }),
      ...Array.from({ length: 2 }, (_, i) => card(`h/s${i}`, "main-phase", "signature")),
    ];
    expect(validateDeckComposition(good)).toEqual([]);

    const tooFew = good.slice(0, 11);
    const issues = validateDeckComposition(tooFew);
    expect(issues.some(i => i.includes("12"))).toBe(true);
  });
});

function mockSnapshot(): HeroSnapshot {
  return {
    player: "p1", hero: "",
    hp: 30, hpStart: 30, hpCap: 40, cp: 2,
    dice: [], rollAttemptsRemaining: 3,
    hand: [], deck: [], discard: [], statuses: [],
    upgrades: { 1: 0, 2: 0, 3: 0, 4: 0 },
    signatureState: {},
    activeOffense: [],
    activeDefense: [],
    ladderState: [] as LadderRowState[],
    isLowHp: false, nextAbilityBonusDamage: 0,
    abilityModifiers: [], tokenOverrides: [], symbolBends: [],
    pipelineBuffs: [], triggerBuffs: [], comboOverrides: [],
    lastStripped: {}, masterySlots: {},
    consumedOncePerMatchCards: [],
    consumedOncePerTurnCards: [],
  };
}
