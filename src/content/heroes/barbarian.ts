/**
 * Diceborn — Barbarian (complexity 1, archetype "rush").
 *
 * Expresses all four uniqueness pillars as data:
 *   1. Dice identity:    weighted toward damage (4 of 6 faces are AXE×2/FIST/FURY).
 *   2. Resource identity: +1 CP whenever an offensive ability lands.
 *   3. Win condition:     rush — close out by turn 6-7 through raw damage.
 *   4. Signature:         RAGE passive (≤50% HP → +1/turn, cap 5, +1 dmg per stack)
 *                         + on-hit BLEEDING token application.
 */

import type { HeroDefinition } from "../../game/types";
import { BARBARIAN_CARDS } from "../cards/barbarian";

const SYM = {
  AXE:    "barbarian:axe",
  FIST:   "barbarian:fist",
  FURY:   "barbarian:fury",
  SHIELD: "barbarian:shield",
  ULT:    "barbarian:ult",
} as const;

const FACES = [
  { faceValue: 1, symbol: SYM.AXE,    label: "Axe"    },
  { faceValue: 2, symbol: SYM.AXE,    label: "Axe"    },
  { faceValue: 3, symbol: SYM.FIST,   label: "Fist"   },
  { faceValue: 4, symbol: SYM.FURY,   label: "Fury"   },
  { faceValue: 5, symbol: SYM.SHIELD, label: "Shield" },
  { faceValue: 6, symbol: SYM.ULT,    label: "Roar"   },
] as const;

export const BARBARIAN: HeroDefinition = {
  id: "barbarian",
  name: "BARBARIAN",
  complexity: 1,
  accentColor: "#DC2626",
  signatureQuote: "Bring me their bones.",
  archetype: "rush",

  diceIdentity: {
    faces: FACES,
    fluffDescription:
      "Four of six faces are damage symbols (Axe×2, Fist, Fury). Misses are rare; the question is which damage you rolled, not whether.",
  },

  resourceIdentity: {
    cpGainTriggers: [{ on: "abilityLanded", gain: 1 }],
    fluffDescription:
      "Earns CP from aggression. Every successful offensive ability lands +1 CP, feeding the next big swing.",
  },

  signatureMechanic: {
    name: "RAGE",
    description:
      "At ≤50% HP, gain 1 Rage at the start of each turn (cap 5). Each stack adds +1 damage to all abilities. He gets stronger as he loses.",
    implementation: {
      kind: "rage",
      threshold: 0.5,
      perTurnStack: 1,
      cap: 5,
      perStackBonus: 1,
    },
  },

  // On every successful offensive ability landed: +1 stack of Bleeding on opponent.
  onHitApplyStatus: { status: "bleeding", stacks: 1 },

  abilityLadder: [
    {
      tier: 1, name: "CLEAVE",
      combo: { kind: "matching-any", count: 3 },
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 3, type: "normal" },
        // (Bleeding is auto-applied by `onHitApplyStatus` post-resolution.)
      ]},
      shortText: "3 dmg + Bleed 1",
      longText: "Roll three dice showing the same symbol.",
      damageType: "normal",
      // With 3 attempts, "any 3 matching" lands ~87%. Tier 1 = "almost always".
      targetLandingRate: [0.80, 0.92],
    },
    {
      tier: 2, name: "AXE SWING",
      // Tier-1 triple PLUS a Roar — strategic "I locked the war-cry."
      combo: { kind: "compound", op: "and", clauses: [
        { kind: "matching-any", count: 3 },
        { kind: "at-least", symbol: SYM.ULT, count: 1 },
      ]},
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 7, type: "normal" },
      ]},
      shortText: "7 dmg + Bleed 1",
      longText: "Roll three of a kind and at least one Roar.",
      damageType: "normal",
      targetLandingRate: [0.55, 0.70],
    },
    {
      tier: 3, name: "BERSERKER FRENZY",
      combo: { kind: "matching-any", count: 4 },
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 11, type: "normal" },
        // Extra +1 stack of Bleeding (on top of the auto +1).
        { kind: "apply-status", status: "bleeding", stacks: 1, target: "opponent" },
      ]},
      shortText: "11 dmg + Bleed 2",
      longText: "Roll four of a kind.",
      damageType: "normal",
      targetLandingRate: [0.40, 0.55],
    },
    {
      tier: 4, name: "BLOOD HARVEST",
      // Four-of-a-kind PLUS a Roar.
      combo: { kind: "compound", op: "and", clauses: [
        { kind: "matching-any", count: 4 },
        { kind: "at-least", symbol: SYM.ULT, count: 1 },
      ]},
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 16, type: "ultimate" },
        // Extra +2 stacks of Bleeding (on top of auto +1).
        { kind: "apply-status", status: "bleeding", stacks: 2, target: "opponent" },
        { kind: "apply-status", status: "stun",     stacks: 1, target: "opponent" },
      ]},
      shortText: "16 dmg + Bleed 3 + Stun",
      longText: "Roll four of a kind and at least one Roar.",
      damageType: "ultimate",
      targetLandingRate: [0.15, 0.25],
    },
  ],

  cards: BARBARIAN_CARDS,
};
