/**
 * Pyromancer — complexity 3, archetype "burn". Builds Smolder DoT on the
 * opponent until they melt or eat the ignition burst on removal.
 *
 * Pillars:
 *   1. Dice — flame + spark + staff + ult; weighted toward setup symbols.
 *   2. Resource — +1 CP whenever a Smolder stack ticks on opponent.
 *   3. Win — burn archetype, end matches around turn 8-10 via DoT.
 *   4. Signature — IGNITE: every offensive ability lands +1 stack of Smolder.
 *                  Smolder ticks 1 dmg per stack at upkeep; on removal,
 *                  fires a +2 ignition burst.
 */
import type { HeroDefinition } from "../../game/types";
import { PYROMANCER_CARDS } from "../cards/pyromancer";

const SYM = {
  FLAME:  "pyromancer:flame",
  SPARK:  "pyromancer:spark",
  STAFF:  "pyromancer:staff",
  SHIELD: "pyromancer:shield",
  ULT:    "pyromancer:ult",
} as const;

const FACES = [
  { faceValue: 1, symbol: SYM.FLAME,  label: "Flame"   },
  { faceValue: 2, symbol: SYM.FLAME,  label: "Flame"   },
  { faceValue: 3, symbol: SYM.SPARK,  label: "Spark"   },
  { faceValue: 4, symbol: SYM.STAFF,  label: "Staff"   },
  { faceValue: 5, symbol: SYM.SHIELD, label: "Ward"    },
  { faceValue: 6, symbol: SYM.ULT,    label: "Inferno" },
] as const;

export const PYROMANCER: HeroDefinition = {
  id: "pyromancer",
  name: "PYROMANCER",
  complexity: 3,
  accentColor: "#F97316",
  signatureQuote: "I just want to watch the world burn!",
  archetype: "burn",

  diceIdentity: {
    faces: FACES,
    fluffDescription:
      "Two Flames + Spark + Staff drive offensive setup. Spark is a 'neutral' face that does nothing alone but combines with Flames to escalate Smolder stacks.",
  },

  resourceIdentity: {
    cpGainTriggers: [{ on: "statusTicked", status: "smolder", on_target: "opponent", gain: 1 }],
    fluffDescription:
      "Earns CP every time a Smolder stack ticks on the opponent. The longer they live with Smolder, the more CP the Pyromancer banks.",
  },

  signatureMechanic: {
    name: "IGNITE",
    description:
      "Every offensive ability landed applies +1 Smolder to opponent (cap 7). Smolder ticks 1 dmg per stack at upkeep. On removal, ignites for +2 final damage.",
    implementation: { kind: "ignite", status: "smolder", stacksPerHit: 1 },
  },

  // On-hit Smolder application is handled by the ignite passive; the engine
  // reads `signatureMechanic.implementation.status` and applies stacks.
  onHitApplyStatus: { status: "smolder", stacks: 1 },

  abilityLadder: [
    {
      tier: 1, name: "FIREBOLT",
      combo: { kind: "matching-any", count: 3 },
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 3, type: "normal" },
      ]},
      shortText: "3 dmg + Smolder 1",
      longText: "Roll three of a kind.",
      damageType: "normal",
      targetLandingRate: [0.80, 0.92],
    },
    {
      tier: 2, name: "FIRE LANCE",
      combo: { kind: "compound", op: "and", clauses: [
        { kind: "matching-any", count: 3 },
        { kind: "at-least", symbol: SYM.ULT, count: 1 },
      ]},
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 6, type: "normal" },
        { kind: "apply-status", status: "smolder", stacks: 1, target: "opponent" },
      ]},
      shortText: "6 dmg + Smolder 2",
      longText: "Roll three of a kind including at least one Inferno.",
      damageType: "normal",
      targetLandingRate: [0.55, 0.70],
    },
    {
      tier: 3, name: "FIREBALL",
      combo: { kind: "compound", op: "and", clauses: [
        { kind: "at-least", symbol: SYM.FLAME, count: 2 },
        { kind: "at-least", symbol: SYM.SPARK, count: 2 },
      ]},
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 9, type: "normal" },
        { kind: "apply-status", status: "smolder", stacks: 2, target: "opponent" },
      ]},
      shortText: "9 dmg + Smolder 3",
      longText: "Roll two Flames AND two Sparks.",
      damageType: "normal",
      targetLandingRate: [0.30, 0.45],
    },
    {
      tier: 4, name: "INFERNO",
      combo: { kind: "compound", op: "and", clauses: [
        { kind: "at-least", symbol: SYM.ULT,   count: 2 },
        { kind: "at-least", symbol: SYM.SPARK, count: 2 },
      ]},
      effect: { kind: "compound", effects: [
        { kind: "damage", amount: 14, type: "ultimate" },
        { kind: "apply-status", status: "smolder", stacks: 4, target: "opponent" },
      ]},
      shortText: "14 dmg + Smolder 5",
      longText: "Roll two Infernos AND two Sparks.",
      damageType: "ultimate",
      targetLandingRate: [0.18, 0.32],
    },
  ],

  cards: PYROMANCER_CARDS,
};
