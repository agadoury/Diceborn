/**
 * deck-validation.test.ts — coverage for the new category-based composition
 * validator. Asserts the 4 generic / 3 dice-manip / 3 ladder-upgrade /
 * 2 signature rule, the duplicate-slot rejection on ladder upgrades, and
 * the no-T4-upgrade guardrail.
 */
import { describe, it, expect } from "vitest";
import { validateDeckComposition } from "../src/game/cards";
import type { Card } from "../src/game/types";

function card(
  id: string,
  kind: Card["kind"],
  cardCategory: Card["cardCategory"],
  extras: Partial<Card> = {},
): Card {
  return {
    id, hero: "h", kind, cardCategory, name: id, cost: 1, text: "",
    trigger: { kind: "manual" },
    effect: { kind: "gain-cp", amount: 1 },
    ...extras,
  };
}

function build(
  generics: number,
  diceManip: number,
  ladderUpgrades: Array<1 | 2 | 3 | "defensive">,
  signatures: number,
): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < generics; i++) out.push(card(`h/g${i}`, "main-phase", "generic"));
  for (let i = 0; i < diceManip; i++) out.push(card(`h/d${i}`, "roll-phase", "dice-manip"));
  for (let i = 0; i < ladderUpgrades.length; i++) {
    out.push(card(`h/u${i}`, "mastery", "ladder-upgrade", { masteryTier: ladderUpgrades[i] }));
  }
  for (let i = 0; i < signatures; i++) out.push(card(`h/s${i}`, "main-phase", "signature"));
  return out;
}

describe("validateDeckComposition", () => {
  it("accepts a conformant 4/3/3/2 deck with three distinct upgrade slots", () => {
    const deck = build(4, 3, [1, 2, 3], 2);
    expect(validateDeckComposition(deck)).toEqual([]);
  });

  it("accepts upgrades targeting any 3 of {T1, T2, T3, defensive}", () => {
    expect(validateDeckComposition(build(4, 3, [1, 2, "defensive"], 2))).toEqual([]);
    expect(validateDeckComposition(build(4, 3, [1, 3, "defensive"], 2))).toEqual([]);
    expect(validateDeckComposition(build(4, 3, [2, 3, "defensive"], 2))).toEqual([]);
  });

  it("rejects total card count != 12", () => {
    const tooFew = build(4, 3, [1, 2, 3], 1); // 11
    const issues = validateDeckComposition(tooFew);
    expect(issues.some(i => i.includes("12"))).toBe(true);

    const tooMany: Card[] = [...build(4, 3, [1, 2, 3], 2), card("h/extra", "main-phase", "generic")]; // 13
    expect(validateDeckComposition(tooMany).some(i => i.includes("12"))).toBe(true);
  });

  it("rejects wrong category counts", () => {
    const tooFewGeneric = build(3, 3, [1, 2, 3], 3); // 12 cards but 3 generic + 3 signature
    const issues = validateDeckComposition(tooFewGeneric);
    expect(issues.some(i => i.includes("generic"))).toBe(true);
    expect(issues.some(i => i.includes("signature"))).toBe(true);
  });

  it("rejects two ladder-upgrades targeting the same slot", () => {
    const dupT1 = build(4, 3, [1, 1, 2], 2);
    const issues = validateDeckComposition(dupT1);
    expect(issues.some(i => i.includes("slot \"1\""))).toBe(true);
  });

  it("rejects a ladder-upgrade missing its masteryTier slot", () => {
    const deck: Card[] = [
      ...build(4, 3, [], 2),
      card("h/u1", "mastery", "ladder-upgrade", { masteryTier: 1 }),
      card("h/u2", "mastery", "ladder-upgrade", { masteryTier: 2 }),
      card("h/u-bad", "mastery", "ladder-upgrade"), // no masteryTier
    ];
    const issues = validateDeckComposition(deck);
    expect(issues.some(i => i.includes("missing masteryTier"))).toBe(true);
  });

  it("rejects a ladder-upgrade targeting T4", () => {
    const deck: Card[] = [
      ...build(4, 3, [1, 2], 2),
      card("h/u-t4", "mastery", "ladder-upgrade", { masteryTier: 4 as unknown as 1 }),
    ];
    const issues = validateDeckComposition(deck);
    expect(issues.some(i => i.includes("T4"))).toBe(true);
  });
});
