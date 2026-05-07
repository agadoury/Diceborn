import { describe, it, expect } from "vitest";
import { dealDamage, heal } from "../src/game/damage";
import { applyStatus, stacksOf } from "../src/game/status";
import type { HeroSnapshot } from "../src/game/types";

function makeSnap(p: "p1" | "p2", hp = 30): HeroSnapshot {
  return {
    player: p, hero: "barbarian",
    hp, hpStart: 30, hpCap: 40, cp: 2,
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

describe("damage pipeline", () => {
  it("normal damage subtracts HP after defensive reduction", () => {
    const t = makeSnap("p2");
    const r = dealDamage("p1", t, 10, "normal", 3);
    expect(t.hp).toBe(23);
    expect(r.mitigated).toBe(3);
  });

  it("Shield provides flat reduction per stack", () => {
    const t = makeSnap("p2");
    applyStatus(t, "p1", "shield", 2);
    const r = dealDamage("p1", t, 5, "normal", 0);
    expect(t.hp).toBe(27);             // 5 dmg - 2 shield = 3
    expect(r.mitigated).toBe(2);
  });

  it("Protect tokens consume to prevent 2 damage each", () => {
    const t = makeSnap("p2");
    applyStatus(t, "p1", "protect", 3);
    const r = dealDamage("p1", t, 5, "normal", 0);
    // Protect mitigates min(stacks*2, dmg) = min(6, 5) = 5 → 0 damage taken,
    // tokens spent = ceil(5/2) = 3 (all of them).
    expect(t.hp).toBe(30);
    expect(r.mitigated).toBe(5);
    expect(stacksOf(t, "protect")).toBe(0);
  });

  it("pure damage bypasses Shield AND Protect", () => {
    const t = makeSnap("p2");
    applyStatus(t, "p1", "shield", 3);
    applyStatus(t, "p1", "protect", 5);
    const r = dealDamage("p1", t, 7, "pure", 0);
    expect(t.hp).toBe(23);
    expect(r.mitigated).toBe(0);
    expect(stacksOf(t, "shield")).toBe(3);
    expect(stacksOf(t, "protect")).toBe(5);
  });

  it("undefendable damage skips defensive-roll reduction but uses Shield+Protect", () => {
    const t = makeSnap("p2");
    applyStatus(t, "p1", "shield", 1);
    const r = dealDamage("p1", t, 5, "undefendable", 99);  // huge def reduction ignored
    expect(t.hp).toBe(26);                                  // 5 - 1 shield = 4 dmg
    expect(r.mitigated).toBe(1);
  });

  it("damage that would go below 0 clamps to 0 and signals lethal", () => {
    const t = makeSnap("p2", 4);
    const r = dealDamage("p1", t, 99, "pure", 0);
    expect(t.hp).toBe(0);
    expect(r.lethal).toBe(true);
  });

  it("low-hp transition emits hero-state event", () => {
    const t = makeSnap("p2", 30);
    const r = dealDamage("p1", t, 25, "pure", 0);
    expect(r.events.some(e => e.t === "hero-state" && e.state === "low-hp-enter")).toBe(true);
    expect(t.isLowHp).toBe(true);
  });
});

describe("heal", () => {
  it("clamps to hpCap (start + 10)", () => {
    const t = makeSnap("p2", 35);
    heal(t, 99);
    expect(t.hp).toBe(40);
  });
  it("emits low-hp-exit when crossing the threshold up", () => {
    const t = makeSnap("p2", 5);
    t.isLowHp = true;
    const events = heal(t, 10);
    expect(events.some(e => e.t === "hero-state" && e.state === "low-hp-exit")).toBe(true);
  });
});
