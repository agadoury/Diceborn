/**
 * Pact of Heroes — The Pyromancer.
 *
 * Burn archetype, complexity 3. Glass-cannon builder: every offensive ability
 * applies +1 Cinder (+1 if 3+ ember show) and every Cinder she lands inches
 * the opponent toward critical-mass detonation (5 stacks → 8 undefendable
 * dmg, or 12 with Crater Wind active). Defensive economy is built on the
 * opponent's choice — defuse Cinder (paying her CP per stack stripped) or
 * race the detonation.
 *
 * Engine touchpoints:
 *  - Cinder detonation now resolves inline in `status.ts → applyStatus`;
 *    Crater Wind's `target: "pyromancer:cinder"` persistent-buff bumps the
 *    detonation amount via the new `tokenOverrides` mechanism.
 *  - Resource triggers `selfStatusDetonated` (+2 CP on detonation) and
 *    `opponentRemovedSelfStatus` (+1 CP per Cinder stack stripped) dispatch
 *    in the strip path of `cards.ts → resolveEffect`.
 *  - `defense-handicap-1` registers with `consumesOnDefensiveRoll: true`
 *    so it ticks down once the opponent's next defense fires.
 *  - Crater Heart's Pyro Lance bonus uses the new
 *    `damage-conditional-bonus` Mastery field which stamps an entire
 *    `ConditionalBonus` structure onto the damage leaf.
 */

import type { HeroDefinition } from "../../game/types";
import { registerStatus } from "../../game/status";

// ── Signature token: Cinder ─────────────────────────────────────────────────
registerStatus({
  id: "pyromancer:cinder",
  name: "Cinder",
  type: "debuff",
  stackLimit: 5,
  tickPhase: "neverTicks",     // accumulates passively; detonation does the work
  detonation: {
    threshold: 5,
    triggerTiming: "on-application-overflow",
    effect: { kind: "damage", amount: 8, type: "undefendable" },
    resetsStacksTo: 0,
  },
  visualTreatment: { icon: "cinder", color: "#F97316", pulse: true, particle: "embers" },
});

// ── Single-use defensive penalty: defense-handicap-1 ────────────────────────
registerStatus({
  id: "pyromancer:defense-handicap-1",
  name: "Smouldering Stone",
  type: "debuff",
  stackLimit: 1,
  tickPhase: "neverTicks",
  consumesOnDefensiveRoll: true,
  passiveModifier: {
    scope: "holder",
    trigger: "on-defensive-roll",
    field: "defensive-dice-count",
    valuePerStack: -1,
    cap: { min: -2 },          // never reduces dice count below 1 anyway (engine clamps)
  },
  visualTreatment: { icon: "ash", color: "#7C2D12", pulse: false },
});

// Convenience: Cinder application with the ASHFALL sparks-bonus baked in.
// "Apply 1 Cinder + 1 more if 3+ ember on roll." Used by every offensive
// ability the Pyromancer fires (the spec calls this her signature passive).
const ASHFALL_CINDER = (extraStacks: number) => ({
  kind: "apply-status" as const,
  status: "pyromancer:cinder",
  stacks: 1 + extraStacks,
  target: "opponent" as const,
  conditional_bonus: {
    condition: { kind: "combo-symbol-count" as const, symbol: "pyromancer:ember", count: 3 },
    bonusPerUnit: 1,
    source: "fixed-one" as const,
  },
});

// ── Hero definition ─────────────────────────────────────────────────────────
export const PYROMANCER: HeroDefinition = {
  id: "pyromancer",
  name: "The Pyromancer",
  complexity: 3,
  accentColor: "#F97316",
  signatureQuote: "The mountain remembers everything I burn.",
  archetype: "burn",

  diceIdentity: {
    fluffDescription:
      "Two ash (offense), two ember (control), one magma (escalation), one ruin (ultimate gate).",
    faces: [
      { faceValue: 1, symbol: "pyromancer:ash",   label: "Ash" },
      { faceValue: 2, symbol: "pyromancer:ash",   label: "Ash" },
      { faceValue: 3, symbol: "pyromancer:ember", label: "Ember" },
      { faceValue: 4, symbol: "pyromancer:ember", label: "Ember" },
      { faceValue: 5, symbol: "pyromancer:magma", label: "Magma" },
      { faceValue: 6, symbol: "pyromancer:ruin",  label: "Ruin" },
    ],
  },

  resourceIdentity: {
    fluffDescription:
      "Cinder economy — opponents pay either way. Detonation: +2 CP. Stripped: +1 CP per stack.",
    cpGainTriggers: [
      { on: "selfStatusDetonated", status: "pyromancer:cinder", gain: 2 },
      { on: "opponentRemovedSelfStatus", status: "pyromancer:cinder", gain: 1, perStack: true },
    ],
  },

  signatureMechanic: {
    name: "Ashfall",
    description:
      "Every offensive ability you land applies +1 Cinder. If your roll has 3+ ember faces, +1 additional Cinder.",
    implementation: {
      kind: "ashfall",
      // Flavor passive — the actual mechanic is folded into each offensive
      // ability's effect tree (apply-status pyromancer:cinder + the ember
      // conditional_bonus). No engine-side dispatcher required.
    },
  },

  recommendedLoadout: {
    offense: ["Ember Strike", "Firestorm", "Pyro Lance", "God's Crater"],
    defense: ["Magma Shield", "Disperse"],
  },

  abilityCatalog: [
    {
      tier: 1,
      name: "Ember Strike",
      damageType: "normal",
      targetLandingRate: [0.75, 0.95],
      combo: { kind: "symbol-count", symbol: "pyromancer:ash", count: 3 },
      shortText: "3/5/7 dmg + Cinder",
      longText: "3+ ash; 3/5/7 damage (scales with ash count) + 1 Cinder (+1 if 3+ ember).",
      effect: {
        kind: "compound",
        effects: [
          { kind: "scaling-damage", baseAmount: 3, perExtra: 2, maxExtra: 2, type: "normal" },
          ASHFALL_CINDER(0),
        ],
      },
    },
    {
      tier: 2,
      name: "Firestorm",
      damageType: "normal",
      targetLandingRate: [0.45, 0.7],
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "pyromancer:ash",   count: 2 },
          { kind: "symbol-count", symbol: "pyromancer:ember", count: 1 },
          { kind: "symbol-count", symbol: "pyromancer:magma", count: 1 },
        ],
      },
      shortText: "5 dmg + 2 Cinder",
      longText: "2 ash + 1 ember + 1 magma; 5 damage + 2 Cinder (+1 if 3+ ember).",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 5, type: "normal" },
          ASHFALL_CINDER(1),
        ],
      },
    },
    {
      tier: 2,
      name: "Obsidian Burst",
      damageType: "undefendable",
      targetLandingRate: [0.45, 0.7],
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "pyromancer:magma", count: 1 },
          { kind: "symbol-count", symbol: "pyromancer:ash",   count: 2 },
          { kind: "symbol-count", symbol: "pyromancer:ember", count: 1 },
        ],
      },
      shortText: "7 dmg ub + Cinder + def -1",
      longText: "1 magma + 2 ash + 1 ember; 7 unblockable + 1 Cinder + opponent's next defense rolls 1 fewer die.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 7, type: "undefendable" },
          ASHFALL_CINDER(0),
          { kind: "apply-status", status: "pyromancer:defense-handicap-1", stacks: 1, target: "opponent" },
        ],
      },
    },
    {
      tier: 2,
      name: "Ember Wall",
      damageType: "normal",
      targetLandingRate: [0.45, 0.7],
      combo: { kind: "symbol-count", symbol: "pyromancer:ember", count: 3 },
      shortText: "4 dmg + 2 Cinder + Shield",
      longText: "3+ ember; 4 damage + 2 Cinder + 1 Shield to self.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 4, type: "normal" },
          // Combo already requires 3+ ember, so the conditional fires.
          {
            kind: "apply-status",
            status: "pyromancer:cinder",
            stacks: 2,
            target: "opponent",
            conditional_bonus: {
              condition: { kind: "combo-symbol-count", symbol: "pyromancer:ember", count: 4 },
              bonusPerUnit: 1,
              source: "fixed-one",
            },
          },
          { kind: "apply-status", status: "shield", stacks: 1, target: "self" },
        ],
      },
    },
    {
      tier: 3,
      name: "Magma Heart",
      damageType: "normal",
      targetLandingRate: [0.2, 0.45],
      combo: { kind: "symbol-count", symbol: "pyromancer:ash", count: 4 },
      shortText: "8 dmg + 2 Cinder",
      longText: "4 ash; 8 damage + 2 Cinder.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 8, type: "normal" },
          ASHFALL_CINDER(1),
        ],
      },
    },
    {
      tier: 3,
      name: "Pyro Lance",
      damageType: "undefendable",
      targetLandingRate: [0.2, 0.45],
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "pyromancer:ruin",  count: 1 },
          { kind: "symbol-count", symbol: "pyromancer:magma", count: 2 },
        ],
      },
      shortText: "9 dmg ub + 2 Cinder",
      longText: "1 ruin + 2 magma; 9 unblockable + 2 Cinder. Crater Heart adds +2/Cinder when opp has 3+.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 9, type: "undefendable" },
          ASHFALL_CINDER(1),
        ],
      },
    },
    {
      tier: 4,
      name: "God's Crater",
      damageType: "ultimate",
      targetLandingRate: [0.005, 0.02],
      ultimateBand: "career-moment",
      combo: { kind: "symbol-count", symbol: "pyromancer:ruin", count: 5 },
      shortText: "Stun + 11 ult + force detonation",
      longText:
        "5 ruin (all 5 dice on face 6); Stun, 11 ultimate damage, then push Cinder to 5 — detonation fires for 8 (12 with Crater Wind).",
      effect: {
        kind: "compound",
        effects: [
          { kind: "apply-status", status: "stun", stacks: 1, target: "opponent" },
          { kind: "damage", amount: 11, type: "ultimate" },
          { kind: "apply-status", status: "pyromancer:cinder", stacks: 5, target: "opponent" },
        ],
      },
      criticalCinematic:
        "Extended gold-fire treatment, +1500ms slow-motion on the pillar descent, voice bark layered with volcanic chorus, screen flashes pure white.",
    },
    // ── Catalog alternates (loadout-drafted) ─────────────────────────────────
    {
      tier: 1,
      name: "Sparkfall",
      damageType: "normal",
      targetLandingRate: [0.75, 0.95],
      combo: { kind: "symbol-count", symbol: "pyromancer:ash", count: 3 },
      shortText: "3 dmg + 2 Cinder",
      longText:
        "3+ ash; 3 damage + 2 Cinder (+1 if 3+ ember). Trade Ember Strike's escalating damage for heavier Cinder pressure.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 3, type: "normal" },
          ASHFALL_CINDER(1),
        ],
      },
    },
    {
      tier: 2,
      name: "Slagspatter",
      damageType: "normal",
      // n-of-a-kind audit caveat: see Iron Tide. The simulator under-reports.
      targetLandingRate: [0.15, 0.4],
      combo: { kind: "n-of-a-kind", count: 3 },
      shortText: "6 dmg + 1 Cinder",
      longText:
        "Three of a kind (any face); 6 damage + 1 Cinder (+1 if 3+ ember). Hero-symbol-agnostic T2.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 6, type: "normal" },
          ASHFALL_CINDER(0),
        ],
      },
    },
    {
      tier: 3,
      name: "Cinder Storm",
      damageType: "normal",
      targetLandingRate: [0.35, 0.6],
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "pyromancer:ember", count: 3 },
          { kind: "symbol-count", symbol: "pyromancer:magma", count: 1 },
        ],
      },
      shortText: "7 dmg + 3 Cinder",
      longText:
        "3 ember + 1 magma; 7 damage + 3 Cinder (+1 if 4+ ember). Cinder-heavy T3 alternative to Magma Heart or Pyro Lance.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 7, type: "normal" },
          {
            kind: "apply-status",
            status: "pyromancer:cinder",
            stacks: 3,
            target: "opponent",
            conditional_bonus: {
              condition: { kind: "combo-symbol-count", symbol: "pyromancer:ember", count: 4 },
              bonusPerUnit: 1,
              source: "fixed-one",
            },
          },
        ],
      },
    },
    {
      tier: 4,
      name: "Pyric Sentence",
      damageType: "ultimate",
      targetLandingRate: [0.005, 0.02],
      ultimateBand: "career-moment",
      combo: { kind: "symbol-count", symbol: "pyromancer:ruin", count: 5 },
      shortText: "13 ult + +1/Cinder + strip Cinder",
      longText:
        "5 ruin (all 5 dice on face 6); 13 ultimate damage + 1 dmg per Cinder stack on opponent, then strip all Cinder. The mountain's verdict, in full.",
      effect: {
        kind: "compound",
        effects: [
          {
            kind: "damage",
            amount: 13,
            type: "ultimate",
            conditional_bonus: {
              condition: { kind: "opponent-has-status-min", status: "pyromancer:cinder", count: 1 },
              bonusPerUnit: 1,
              source: "opponent-status-stacks",
              sourceStatus: "pyromancer:cinder",
            },
          },
          { kind: "remove-status", status: "pyromancer:cinder", stacks: "all", target: "opponent" },
        ],
      },
      criticalCinematic:
        "Vertical pillar of red-gold light bisects the screen, opponent silhouetted in pure white at impact, all Cinder stacks visibly burning off in a fan of sparks before the camera settles.",
    },
  ],

  defensiveCatalog: [
    {
      tier: 1,
      name: "Magma Shield",
      damageType: "normal",
      targetLandingRate: [0.6, 0.8],
      combo: { kind: "symbol-count", symbol: "pyromancer:ember", count: 1 },
      defenseDiceCount: 3,
      shortText: "Reduce 3 + Cinder",
      longText: "1+ ember on 3 dice; reduce 3 + apply 1 Cinder to attacker.",
      effect: {
        kind: "reduce-damage",
        amount: 3,
        apply_to_attacker: { status: "pyromancer:cinder", stacks: 1 },
      },
    },
    {
      tier: 2,
      name: "Disperse",
      damageType: "normal",
      targetLandingRate: [0.35, 0.55],
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "pyromancer:magma", count: 1 },
          { kind: "symbol-count", symbol: "pyromancer:ember", count: 1 },
        ],
      },
      defenseDiceCount: 4,
      shortText: "Negate attack",
      longText: "1 magma + 1 ember on 4 dice; negate the attack entirely.",
      effect: {
        kind: "compound",
        effects: [
          // Full negation — engine clamps reduction to incoming damage.
          { kind: "reduce-damage", amount: 0, negate_attack: true },
          // Baseline 0-stack apply-status; Mountain's Patience Mastery
          // patches stacks to 2 via `applied-status-stacks-on-success`.
          { kind: "apply-status", status: "pyromancer:cinder", stacks: 0, target: "opponent" },
        ],
      },
    },
    {
      tier: 3,
      name: "Ash Mirror",
      damageType: "normal",
      targetLandingRate: [0.2, 0.4],
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "pyromancer:ruin", count: 1 },
          { kind: "symbol-count", symbol: "pyromancer:ash",  count: 1 },
        ],
      },
      defenseDiceCount: 3,
      shortText: "Reduce 5 + strip positive",
      longText:
        "1 ruin + 1 ash on 3 dice; reduce 5 + strip 1 positive status from attacker.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "reduce-damage", amount: 5 },
          { kind: "remove-status", status: "any-positive", stacks: 1, target: "opponent" },
        ],
      },
    },
    // Catalog alternate — defense-catalog-only.
    {
      tier: 2,
      name: "Smoke Veil",
      damageType: "normal",
      targetLandingRate: [0.5, 0.7],
      combo: { kind: "n-of-a-kind", count: 2 },
      defenseDiceCount: 3,
      shortText: "Reduce 4",
      longText:
        "Two of a kind on 3 dice rolled; reduces incoming damage by 4. Symbol-agnostic mid-tier brace.",
      effect: { kind: "reduce-damage", amount: 4 },
    },
  ],

  recommendedDeck: [
    // 4 generic
    "generic/quick-draw", "generic/focus", "generic/cleanse", "generic/bandage",
    // 3 dice-manip
    "pyromancer/ember-channel", "pyromancer/pyromantic-surge", "pyromancer/forge",
    // 3 ladder-upgrade (T1, T2, T3 — offensive starter; mountains-patience deferred to deck-builder choice)
    "pyromancer/ember-strike-mastery", "pyromancer/volcanic-awakening", "pyromancer/crater-heart",
    // 2 signature
    "pyromancer/char", "pyromancer/phoenix-veil",
  ],
};
