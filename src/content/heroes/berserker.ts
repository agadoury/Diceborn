/**
 * Diceborn — The Berserker.
 *
 * Rush archetype, complexity 1. Frost-touched northern warrior — twin axes,
 * dire-wolf pelt, frost-blue aura. Identity is the Frenzy passive: every wound
 * the opponent lands grants +1 dmg/stack on every offensive ability (max 6).
 * Cleave bread-and-butter at ~98% land, with rare burst spikes via Wolf's Howl.
 *
 * Engine touchpoints:
 *  - Frenzy passive (signatureMechanic.implementation.kind === "frenzy") is
 *    dispatched by phases.ts at Upkeep and tagged by applyAttackEffects when
 *    the Berserker takes offensive damage (capped to +1/turn).
 *  - Frost-bite signature token is registered on module import.
 *  - Several mastery cards rely on `bonus-dice-threshold`,
 *    `heal-conditional-bonus`, and `applied-status-stacks` ability-modifier
 *    fields wired in phases.ts.
 */

import type { HeroDefinition } from "../../game/types";
import { registerStatus } from "../../game/status";

// ── Signature token: Frost-bite ─────────────────────────────────────────────
registerStatus({
  id: "berserker:frostbite",
  name: "Frost-bite",
  type: "debuff",
  stackLimit: 4,
  tickPhase: "ownUpkeep",
  // 1 dmg per tick (regardless of stack count); decrement 1 stack each tick.
  // The Frost-bite "thaws over time" — the offensive penalty (-1 dmg/stack)
  // shrinks alongside the dwindling damage tail.
  onTick: (_holder, _inst) => ({
    events: [],
    pendingDamage: 1,
    decrementBy: 1,
  }),
  passiveModifier: {
    scope: "holder",
    trigger: "on-offensive-ability",
    field: "damage",
    valuePerStack: -1,
    cap: { min: 0 },
  },
  visualTreatment: { icon: "frostbite", color: "#9CC8E0", pulse: true, particle: "ice-shards" },
});

// ── Hero definition ─────────────────────────────────────────────────────────
export const BERSERKER: HeroDefinition = {
  id: "berserker",
  name: "The Berserker",
  complexity: 1,
  accentColor: "#9CC8E0",
  signatureQuote: "The wound is the door.",
  archetype: "rush",

  diceIdentity: {
    fluffDescription:
      "Three axes (offense), two furs (vitality), one howl (rare ultimate gate).",
    faces: [
      { faceValue: 1, symbol: "berserker:axe",  label: "Axe" },
      { faceValue: 2, symbol: "berserker:axe",  label: "Axe" },
      { faceValue: 3, symbol: "berserker:axe",  label: "Axe" },
      { faceValue: 4, symbol: "berserker:fur",  label: "Fur" },
      { faceValue: 5, symbol: "berserker:fur",  label: "Fur" },
      { faceValue: 6, symbol: "berserker:howl", label: "Howl" },
    ],
  },

  resourceIdentity: {
    fluffDescription: "Aggression-rewarding — every successful hit grants +1 CP.",
    cpGainTriggers: [{ on: "abilityLanded", gain: 1 }],
  },

  signatureMechanic: {
    name: "Frenzy",
    description:
      "Take damage from an opponent's offensive ability → +1 Frenzy at the start of your next turn (max 6, capped at +1/turn). Each stack adds +1 damage to all your offensive abilities.",
    implementation: {
      kind: "frenzy",
      passiveKey: "frenzy",
      bankStartsAt: 0,
      bankCap: 6,
    },
  },

  abilityLadder: [
    {
      tier: 1,
      name: "Cleave",
      damageType: "normal",
      targetLandingRate: [0.75, 0.95],
      combo: { kind: "symbol-count", symbol: "berserker:axe", count: 3 },
      shortText: "4/6/8 dmg + Frost-bite",
      longText:
        "3+ axes; deals 4 / 6 / 8 damage (scales with axe count) and applies 1 Frost-bite.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "scaling-damage", baseAmount: 4, perExtra: 2, maxExtra: 2, type: "normal" },
          { kind: "apply-status", status: "berserker:frostbite", stacks: 1, target: "opponent" },
        ],
      },
    },
    {
      tier: 2,
      name: "Glacier Strike",
      damageType: "undefendable",
      targetLandingRate: [0.45, 0.7],
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "berserker:axe",  count: 2 },
          { kind: "symbol-count", symbol: "berserker:howl", count: 2 },
        ],
      },
      shortText: "5 dmg ub + heal 1 + Frost-bite",
      longText:
        "2 axes + 2 howl; 5 unblockable, applies 1 Frost-bite, heal 1.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 5, type: "undefendable" },
          { kind: "apply-status", status: "berserker:frostbite", stacks: 1, target: "opponent" },
          { kind: "heal", amount: 1, target: "self" },
        ],
      },
    },
    {
      tier: 2,
      name: "Winter Storm",
      damageType: "normal",
      targetLandingRate: [0.45, 0.7],
      combo: { kind: "straight", length: 4 },
      shortText: "9 dmg + 2 Frost-bite",
      longText: "Small straight (4 in a row); 9 damage + 2 Frost-bite.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 9, type: "normal" },
          { kind: "apply-status", status: "berserker:frostbite", stacks: 2, target: "opponent" },
        ],
      },
    },
    {
      tier: 3,
      name: "Blood Harvest",
      damageType: "normal",
      targetLandingRate: [0.2, 0.45],
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "berserker:axe",  count: 3 },
          { kind: "symbol-count", symbol: "berserker:howl", count: 2 },
        ],
      },
      shortText: "sum dmg + Frost-bite + heal/Frenzy",
      longText:
        "3 axes + 2 howl; rolls 3 bonus dice and deals their sum; sum ≥ 14 grants +2 extra Frost-bite; heal 2 HP per Frenzy stack.",
      effect: {
        kind: "compound",
        effects: [
          {
            kind: "bonus-dice-damage",
            bonusDice: 3,
            damageFormula: "sum-of-faces",
            type: "normal",
            thresholdBonus: {
              threshold: 14,
              bonus: { kind: "apply-status", status: "berserker:frostbite", stacks: 2, target: "opponent" },
            },
          },
          { kind: "apply-status", status: "berserker:frostbite", stacks: 1, target: "opponent" },
          {
            kind: "heal",
            amount: 0,
            target: "self",
            conditional_bonus: {
              condition: { kind: "passive-counter-min", passiveKey: "frenzy", count: 1 },
              bonusPerUnit: 2,
              source: "self-passive-counter",
              sourcePassiveKey: "frenzy",
            },
          },
        ],
      },
    },
    {
      tier: 3,
      name: "Frostfang",
      damageType: "undefendable",
      targetLandingRate: [0.2, 0.45],
      combo: { kind: "symbol-count", symbol: "berserker:howl", count: 4 },
      shortText: "Stun + 6 dmg ub + 2 Frost-bite",
      longText: "4 howl; Stun, 6 unblockable, 2 Frost-bite.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "apply-status", status: "stun", stacks: 1, target: "opponent" },
          { kind: "damage", amount: 6, type: "undefendable" },
          { kind: "apply-status", status: "berserker:frostbite", stacks: 2, target: "opponent" },
        ],
      },
    },
    {
      tier: 4,
      name: "Avalanche",
      damageType: "normal",
      targetLandingRate: [0.08, 0.25],
      ultimateBand: "standard",
      combo: { kind: "straight", length: 5 },
      shortText: "13 dmg + 3 Frost-bite, 3 self-dmg",
      longText:
        "Large straight (5 in a row); 13 damage + 3 Frost-bite, you take 3 self-damage.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 13, type: "normal", self_cost: 3 },
          { kind: "apply-status", status: "berserker:frostbite", stacks: 3, target: "opponent" },
        ],
      },
      criticalCinematic:
        "Avalanche of snow cascades down the opponent's panel; multiple impact thuds + a guttural primal shout.",
    },
    {
      tier: 4,
      name: "Wolf's Howl",
      damageType: "ultimate",
      targetLandingRate: [0.01, 0.05],
      ultimateBand: "career-moment",
      combo: { kind: "n-of-a-kind", count: 5 },
      shortText: "Stun + 14 ult + 4 Frost-bite + 2 Frenzy",
      longText:
        "5 of a kind; Stun, 14 ultimate damage, 4 Frost-bite, +2 Frenzy.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "apply-status", status: "stun", stacks: 1, target: "opponent" },
          { kind: "damage", amount: 14, type: "ultimate" },
          { kind: "apply-status", status: "berserker:frostbite", stacks: 4, target: "opponent" },
          { kind: "passive-counter-modifier", passiveKey: "frenzy", operation: "add", value: 2, respectsCap: true },
        ],
      },
      criticalCinematic:
        "Extended ultimate. Anticipation, howl, four spectral ice-wolves manifest, convergence strike, settle.",
    },
  ],

  defensiveLadder: [
    {
      tier: 1,
      name: "Wolfhide",
      damageType: "normal",
      targetLandingRate: [0.6, 0.8],
      combo: { kind: "symbol-count", symbol: "berserker:fur", count: 1 },
      defenseDiceCount: 3,
      shortText: "Reduce 4 dmg",
      longText: "1+ fur on 3 dice rolled; reduces incoming damage by 4.",
      effect: { kind: "reduce-damage", amount: 4 },
    },
    {
      tier: 2,
      name: "Bloodoath",
      damageType: "normal",
      targetLandingRate: [0.35, 0.55],
      combo: { kind: "symbol-count", symbol: "berserker:fur", count: 2 },
      defenseDiceCount: 4,
      shortText: "Heal 4",
      longText: "2+ fur on 4 dice rolled; full attack damage applies, then heal 4.",
      effect: { kind: "heal", amount: 4, target: "self" },
      offensiveFallback: {
        diceCount: 4,
        combo: { kind: "symbol-count", symbol: "berserker:fur", count: 2 },
        effect: {
          kind: "compound",
          effects: [
            { kind: "heal", amount: 4, target: "self" },
            { kind: "passive-counter-modifier", passiveKey: "frenzy", operation: "add", value: 1, respectsCap: true },
          ],
        },
      },
    },
    {
      tier: 3,
      name: "Glacial Counter",
      damageType: "normal",
      targetLandingRate: [0.2, 0.4],
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "berserker:howl", count: 1 },
          { kind: "symbol-count", symbol: "berserker:axe",  count: 1 },
        ],
      },
      defenseDiceCount: 3,
      shortText: "Reduce 5 + Frost-bite",
      longText:
        "1 howl + 1 axe on 3 dice rolled; reduces incoming damage by 5, applies 1 Frost-bite to attacker.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "reduce-damage", amount: 5 },
          { kind: "apply-status", status: "berserker:frostbite", stacks: 1, target: "opponent" },
        ],
      },
    },
  ],

  recommendedDeck: [
    // 4 generic
    "generic/quick-draw", "generic/focus", "generic/cleanse", "generic/bandage",
    // 3 dice-manip
    "berserker/iron-focus", "berserker/berserker-rage", "berserker/pelt-of-the-wolf",
    // 3 ladder-upgrade (T1, T2, T3 — offensive starter; wolfborn deferred to deck-builder choice)
    "berserker/cleave-mastery", "berserker/northern-storm", "berserker/bloodbound",
    // 2 signature
    "berserker/hunters-mark", "berserker/counterstrike",
  ],
};
