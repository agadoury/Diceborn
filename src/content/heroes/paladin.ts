/**
 * Paladin — complexity 2, archetype "survival".
 *
 * Pillars:
 *   1. Dice — hammer + cross + shield + ult; weighted toward the dual-purpose
 *             SHIELD face that contributes to both offense (via combos) and
 *             defense (via the engine's shield-counting in defensive rolls).
 *   2. Resource — +1 CP whenever a Judgment stack triggers/expires on the
 *                 opponent. Defense → CP.
 *   3. Win — survival, end matches around turn 12+ via grind.
 *   4. Signature — DIVINE FAVOR: starts with 2 Protect tokens; gains +1
 *                  Protect AND applies +1 Judgment whenever a defense reduces
 *                  damage by ≥1. (Wired in phases.ts when defense resolves.)
 */
import type { HeroDefinition } from "../../game/types";
import { PALADIN_CARDS } from "../cards/paladin";

const SYM = {
  HAMMER: "paladin:hammer",
  CROSS:  "paladin:cross",
  SHIELD: "paladin:shield",
  FIST:   "paladin:fist",
  ULT:    "paladin:ult",
} as const;

const FACES = [
  { faceValue: 1, symbol: SYM.HAMMER, label: "Hammer" },
  { faceValue: 2, symbol: SYM.HAMMER, label: "Hammer" },
  { faceValue: 3, symbol: SYM.CROSS,  label: "Cross"  },
  { faceValue: 4, symbol: SYM.SHIELD, label: "Shield" },
  { faceValue: 5, symbol: SYM.FIST,   label: "Fist"   },
  { faceValue: 6, symbol: SYM.ULT,    label: "Light"  },
] as const;

export const PALADIN: HeroDefinition = {
  id: "paladin",
  name: "PALADIN",
  complexity: 2,
  accentColor: "#FBBF24",
  signatureQuote: "By the light, you shall fall.",
  archetype: "survival",

  diceIdentity: {
    faces: FACES,
    fluffDescription:
      "Two Hammers + Cross + Fist drive offense; Shield is dual-purpose (helps defense while still counting toward CROSS+SHIELD combos). Even a 'miss' attack gives the Paladin defensive value next turn.",
  },

  resourceIdentity: {
    cpGainTriggers: [{ on: "successfulDefense", gain: 1 }],
    fluffDescription:
      "Earns CP from successful defense. Every blocked hit fuels his next ability.",
  },

  signatureMechanic: {
    name: "DIVINE FAVOR",
    description:
      "Starts the match with 2 Protect tokens. Every successful defense (reduction ≥1) gains +1 Protect (cap 5) AND applies +1 Judgment to the attacker.",
    implementation: {
      kind: "divine-favor",
      startingProtect: 2,
      protectPerDefense: 1,
      protectCap: 5,
      judgmentPerDefense: 1,
    },
  },

  // No on-hit Smolder/Bleeding equivalent — Paladin's signature is reactive, not proactive.

  abilityLadder: [
    {
      tier: 1, name: "SMITE",
      combo: { kind: "matching-any", count: 3 },
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 3, type: "normal" },
      ]},
      shortText: "3 dmg",
      longText: "Roll three of a kind.",
      damageType: "normal",
      targetLandingRate: [0.80, 0.92],
    },
    {
      tier: 2, name: "RIGHTEOUS BLOW",
      combo: { kind: "compound", op: "and", clauses: [
        { kind: "matching-any", count: 3 },
        { kind: "at-least", symbol: SYM.CROSS, count: 1 },
      ]},
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 6, type: "normal" },
        { kind: "apply-status", status: "judgment", stacks: 1, target: "opponent" },
      ]},
      shortText: "6 dmg + Judgment 1",
      longText: "Roll three of a kind including at least one Cross.",
      damageType: "normal",
      targetLandingRate: [0.55, 0.70],
    },
    {
      tier: 3, name: "DIVINE DECREE",
      combo: { kind: "matching-any", count: 4 },
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 9, type: "undefendable" },
        { kind: "heal", amount: 3, target: "self" },
      ]},
      shortText: "9 undef dmg + heal 3",
      longText: "Roll four of a kind.",
      damageType: "undefendable",
      targetLandingRate: [0.40, 0.55],
    },
    {
      tier: 4, name: "RADIANCE",
      combo: { kind: "compound", op: "and", clauses: [
        { kind: "at-least", symbol: SYM.ULT, count: 2 },
        { kind: "at-least", symbol: SYM.CROSS, count: 2 },
      ]},
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 13, type: "ultimate" },
        { kind: "heal", amount: 6, target: "self" },
        { kind: "apply-status", status: "judgment", stacks: 2, target: "opponent" },
      ]},
      shortText: "13 dmg + heal 6 + Judg 2",
      longText: "Roll two Lights AND two Crosses.",
      damageType: "ultimate",
      targetLandingRate: [0.18, 0.32],
    },
  ],

  cards: PALADIN_CARDS,
};
