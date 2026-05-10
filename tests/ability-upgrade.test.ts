/**
 * ability-upgrade.test.ts — coverage for the ladder-upgrade pipeline. Each
 * operation is asserted on the resolveAbilityFor helper directly:
 *  1. Field-tweak (modifications) — applied later by phases.ts at resolution
 *     time, so resolveAbilityFor leaves the effect intact.
 *  2. Effect-append (additionalEffects) — appended as siblings under a compound.
 *  3. Repeat — the resolved effect is wrapped N times.
 *  4. Replace — combo + effect + name swapped wholesale.
 */
import { describe, it, expect } from "vitest";
import { resolveAbilityFor } from "../src/game/cards";
import type { AbilityDef, HeroSnapshot, LadderRowState } from "../src/game/types";

const baseT1: AbilityDef = {
  tier: 1,
  name: "Cleave",
  combo: { kind: "symbol-count", symbol: "test:axe", count: 3 },
  damageType: "normal",
  targetLandingRate: [0.5, 0.9],
  shortText: "4 dmg + Frost-bite",
  longText: "3+ axes; deals 4 damage + 1 Frost-bite.",
  effect: {
    kind: "compound",
    effects: [
      { kind: "damage", amount: 4, type: "normal" },
      { kind: "apply-status", status: "burn", stacks: 1, target: "opponent" },
    ],
  },
};

function snapshot(): HeroSnapshot {
  return {
    player: "p1", hero: "test-hero",
    hp: 30, hpStart: 30, hpCap: 40, cp: 2,
    dice: [], rollAttemptsRemaining: 3,
    hand: [], deck: [], discard: [], statuses: [],
    upgrades: { 1: 0, 2: 0, 3: 0, 4: 0 },
    signatureState: {},
    ladderState: [] as LadderRowState[],
    isLowHp: false, nextAbilityBonusDamage: 0,
    abilityModifiers: [], tokenOverrides: [], symbolBends: [], lastStripped: {},
    masterySlots: {},
    consumedOncePerMatchCards: [],
    consumedOncePerTurnCards: [],
  };
}

describe("resolveAbilityFor — no modifiers", () => {
  it("returns the base ability unchanged with isReplaced=false", () => {
    const snap = snapshot();
    const r = resolveAbilityFor(snap, baseT1, "offensive");
    expect(r.name).toBe("Cleave");
    expect(r.combo).toEqual(baseT1.combo);
    expect(r.effect).toEqual(baseT1.effect);
    expect(r.isReplaced).toBe(false);
  });
});

describe("resolveAbilityFor — transform mode", () => {
  it("field-tweak modifications are NOT folded into the resolved view (handled by phases.ts at resolution time)", () => {
    const snap = snapshot();
    snap.abilityModifiers.push({
      id: "m1", source: "card",
      scope: { kind: "ability-ids", ids: ["Cleave"] },
      modifications: [{ field: "base-damage", operation: "set", value: 99 }],
      permanent: true,
    });
    const r = resolveAbilityFor(snap, baseT1, "offensive");
    // The damage leaf still reads 4 here — phases.ts walks the modifiers at
    // resolution time. The resolver only handles structural changes.
    expect(r.effect).toEqual(baseT1.effect);
    expect(r.name).toBe("Cleave");
  });

  it("appends additionalEffects as compound siblings (heal-on-hit)", () => {
    const snap = snapshot();
    snap.abilityModifiers.push({
      id: "regen", source: "card",
      scope: { kind: "all-tier", tier: 1 },
      modifications: [],
      additionalEffects: [{ kind: "heal", amount: 1, target: "self" }],
      permanent: true,
    });
    const r = resolveAbilityFor(snap, baseT1, "offensive");
    expect(r.effect.kind).toBe("compound");
    if (r.effect.kind !== "compound") return;
    // Resolved tree: [originalCleaveCompound, heal]
    expect(r.effect.effects).toHaveLength(2);
    expect(r.effect.effects[0]).toEqual(baseT1.effect);
    expect(r.effect.effects[1]).toEqual({ kind: "heal", amount: 1, target: "self" });
  });

  it("appends additionalEffects for status-on-hit (Stun Edge)", () => {
    const snap = snapshot();
    snap.abilityModifiers.push({
      id: "stun-edge", source: "card",
      scope: { kind: "ability-ids", ids: ["Cleave"] },
      modifications: [],
      additionalEffects: [{ kind: "apply-status", status: "stun", stacks: 1, target: "opponent" }],
      permanent: true,
    });
    const r = resolveAbilityFor(snap, baseT1, "offensive");
    expect(r.effect.kind).toBe("compound");
    if (r.effect.kind !== "compound") return;
    expect(r.effect.effects[1]).toEqual({ kind: "apply-status", status: "stun", stacks: 1, target: "opponent" });
  });

  it("repeat wraps the resolved effect N times", () => {
    const snap = snapshot();
    snap.abilityModifiers.push({
      id: "twice", source: "card",
      scope: { kind: "ability-ids", ids: ["Cleave"] },
      modifications: [],
      repeat: 2,
      permanent: true,
    });
    const r = resolveAbilityFor(snap, baseT1, "offensive");
    expect(r.effect.kind).toBe("compound");
    if (r.effect.kind !== "compound") return;
    // Resolved tree: [originalCleaveCompound, originalCleaveCompound]
    expect(r.effect.effects).toHaveLength(2);
    expect(r.effect.effects[0]).toEqual(baseT1.effect);
    expect(r.effect.effects[1]).toEqual(baseT1.effect);
  });

  it("composes append + repeat (heal-on-hit, hits twice)", () => {
    const snap = snapshot();
    snap.abilityModifiers.push({
      id: "combo", source: "card",
      scope: { kind: "ability-ids", ids: ["Cleave"] },
      modifications: [],
      additionalEffects: [{ kind: "heal", amount: 1, target: "self" }],
      repeat: 2,
      permanent: true,
    });
    const r = resolveAbilityFor(snap, baseT1, "offensive");
    // Each of the two repeats should contain the original effect AND the heal.
    expect(r.effect.kind).toBe("compound");
    if (r.effect.kind !== "compound") return;
    expect(r.effect.effects).toHaveLength(2);
    for (const e of r.effect.effects) {
      expect(e.kind).toBe("compound");
      if (e.kind !== "compound") continue;
      expect(e.effects).toHaveLength(2);
      expect(e.effects[0]).toEqual(baseT1.effect);
      expect(e.effects[1]).toEqual({ kind: "heal", amount: 1, target: "self" });
    }
  });
});

describe("resolveAbilityFor — replace mode", () => {
  it("replacement swaps combo + effect + name", () => {
    const snap = snapshot();
    snap.abilityModifiers.push({
      id: "restoration", source: "card",
      scope: { kind: "ability-ids", ids: ["Cleave"] },
      modifications: [],
      // Presence of `replacement` is the discriminator at runtime — `mode`
      // lives on the effect schema for card-authoring clarity.
      replacement: {
        name: "Restoration",
        combo: { kind: "symbol-count", symbol: "test:fur", count: 3 },
        effect: { kind: "heal", amount: 5, target: "self" },
        shortText: "Heal 5",
        longText: "3+ furs; heal 5 self.",
        damageType: "normal",
      },
      permanent: true,
    });
    const r = resolveAbilityFor(snap, baseT1, "offensive");
    expect(r.isReplaced).toBe(true);
    expect(r.name).toBe("Restoration");
    expect(r.combo).toEqual({ kind: "symbol-count", symbol: "test:fur", count: 3 });
    expect(r.effect).toEqual({ kind: "heal", amount: 5, target: "self" });
    expect(r.tier).toBe(1); // tier stays the same — replacements ride on the parent slot
  });

  it("replacement still picks up additionalEffects + repeat", () => {
    const snap = snapshot();
    snap.abilityModifiers.push({
      id: "restoration", source: "card",
      scope: { kind: "ability-ids", ids: ["Cleave"] },
      modifications: [],
      replacement: {
        name: "Restoration",
        combo: { kind: "symbol-count", symbol: "test:fur", count: 3 },
        effect: { kind: "heal", amount: 5, target: "self" },
        shortText: "Heal 5",
        longText: "3+ furs; heal 5 self.",
        damageType: "normal",
      },
      additionalEffects: [{ kind: "gain-cp", amount: 1 }],
      repeat: 2,
      permanent: true,
    });
    const r = resolveAbilityFor(snap, baseT1, "offensive");
    expect(r.isReplaced).toBe(true);
    expect(r.effect.kind).toBe("compound");
    if (r.effect.kind !== "compound") return;
    // Repeat wraps a compound[replacement+heal, replacement+heal]
    expect(r.effect.effects).toHaveLength(2);
  });
});

describe("resolveAbilityFor — scope filtering", () => {
  it("all-defenses scope only matches in defensive context", () => {
    const snap = snapshot();
    snap.abilityModifiers.push({
      id: "def-only", source: "card",
      scope: { kind: "all-defenses" },
      modifications: [],
      additionalEffects: [{ kind: "heal", amount: 1, target: "self" }],
      permanent: true,
    });
    const offensive = resolveAbilityFor(snap, baseT1, "offensive");
    expect(offensive.effect).toEqual(baseT1.effect);   // unchanged
    const defensive = resolveAbilityFor(snap, baseT1, "defensive");
    expect(defensive.effect.kind).toBe("compound");    // appended
  });

  it("ability-ids matches case-insensitively", () => {
    const snap = snapshot();
    snap.abilityModifiers.push({
      id: "case", source: "card",
      scope: { kind: "ability-ids", ids: ["cleave"] }, // lowercase
      modifications: [],
      additionalEffects: [{ kind: "heal", amount: 1, target: "self" }],
      permanent: true,
    });
    const r = resolveAbilityFor(snap, baseT1, "offensive");
    expect(r.effect.kind).toBe("compound");
  });
});
