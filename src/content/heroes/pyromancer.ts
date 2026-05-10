/**
 * Diceborn — The Pyromancer.
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

  abilityLadder: [
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
      name: "Volcanic Rain",
      damageType: "ultimate",
      targetLandingRate: [0.08, 0.25],
      ultimateBand: "standard",
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "pyromancer:ruin", count: 2 },
          { kind: "symbol-count", symbol: "pyromancer:ash",  count: 2 },
        ],
      },
      shortText: "12 ult + 3 Cinder",
      longText: "2 ruin + 2 ash; 12 ultimate damage + 3 Cinder.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 12, type: "ultimate" },
          ASHFALL_CINDER(2),
        ],
      },
      criticalCondition: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "n-of-a-kind",  count: 2 },
          { kind: "symbol-count", symbol: "pyromancer:ruin", count: 2 },
        ],
      },
      criticalEffect: { cosmeticOnly: true },
      criticalCinematic: "Brighter gold-fire particle treatment, sharper screen-flash, no damage change.",
    },
    {
      tier: 4,
      name: "God's Crater",
      damageType: "ultimate",
      targetLandingRate: [0.08, 0.25],
      ultimateBand: "standard",
      combo: { kind: "symbol-count", symbol: "pyromancer:ruin", count: 4 },
      shortText: "Stun + 11 ult + force detonation",
      longText:
        "4 ruin; Stun, 11 ultimate damage, then push Cinder to 5 — detonation fires for 8 (12 with Crater Wind).",
      effect: {
        kind: "compound",
        effects: [
          { kind: "apply-status", status: "stun", stacks: 1, target: "opponent" },
          { kind: "damage", amount: 11, type: "ultimate" },
          { kind: "apply-status", status: "pyromancer:cinder", stacks: 5, target: "opponent" },
        ],
      },
      criticalCondition: { kind: "symbol-count", symbol: "pyromancer:ruin", count: 5 },
      criticalEffect: {
        damageOverride: 22,
        effectAdditions: [
          { kind: "damage", amount: 4, type: "pure" },
        ],
      },
      criticalCinematic:
        "Extended gold-fire treatment, +1500ms slow-motion on the pillar descent, voice bark layered with volcanic chorus, screen flashes pure white.",
    },
  ],

  defensiveLadder: [
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

  cards: [
    // ── Dice manipulation (3) ────────────────────────────────────────────
    {
      id: "pyromancer/ember-channel",
      hero: "pyromancer",
      kind: "roll-phase",
      cardCategory: "dice-manip",
      name: "Ember Channel",
      cost: 1,
      text: "Convert 1 of your dice from an ash face to an ember face.",
      trigger: { kind: "manual" },
      effect: {
        kind: "set-die-face",
        count: 1,
        filter: { kind: "specific-symbol", symbol: "pyromancer:ash" },
        target: { kind: "symbol", symbol: "pyromancer:ember" },
      },
      flavor: "Patience is just heat held still.",
    },
    {
      id: "pyromancer/pyromantic-surge",
      hero: "pyromancer",
      kind: "roll-phase",
      cardCategory: "dice-manip",
      name: "Pyromantic Surge",
      cost: 1,
      text: "Reroll all your dice not currently showing ruin or ash.",
      trigger: { kind: "manual" },
      effect: {
        kind: "reroll-dice",
        filter: { kind: "not-showing-symbols", symbols: ["pyromancer:ruin", "pyromancer:ash"] },
      },
      flavor: "She speaks to the embers; only some answer.",
    },
    {
      id: "pyromancer/forge",
      hero: "pyromancer",
      kind: "roll-phase",
      cardCategory: "dice-manip",
      name: "Forge",
      cost: 2,
      text: "Set 1 of your dice to a ruin face.",
      trigger: { kind: "manual" },
      effect: {
        kind: "set-die-face",
        count: 1,
        filter: "any",
        target: { kind: "symbol", symbol: "pyromancer:ruin" },
      },
      flavor: "What the mountain gives, she takes.",
    },

    // ── Tiered masteries (4) ─────────────────────────────────────────────
    {
      id: "pyromancer/ember-strike-mastery",
      hero: "pyromancer",
      kind: "mastery",
      cardCategory: "ladder-upgrade",
      masteryTier: 1,
      upgradesAbilities: ["Ember Strike"],
      occupiesSlot: true,
      name: "Ember Strike Mastery",
      cost: 2,
      text: "Permanent. Ember Strike damage becomes 4/6/8. Cinder applied increases to 2.",
      trigger: { kind: "manual" },
      effect: {
        kind: "ability-upgrade",
        scope: { kind: "ability-ids", ids: ["Ember Strike"] },
        permanent: true,
        modifications: [
          { field: "scaling-damage-base",   operation: "set", value: 4 },
          { field: "applied-status-stacks", operation: "set", value: 2 },
        ],
      },
      flavor: "The first lesson she ever learned: ash, then fire.",
    },
    {
      id: "pyromancer/volcanic-awakening",
      hero: "pyromancer",
      kind: "mastery",
      cardCategory: "ladder-upgrade",
      masteryTier: 2,
      upgradesAbilities: ["Firestorm", "Obsidian Burst", "Ember Wall"],
      occupiesSlot: true,
      name: "Volcanic Awakening",
      cost: 4,
      text: "Permanent. Buffs all 3 T2 abilities — Firestorm 6 dmg + 3 Cinder, Obsidian Burst 9 dmg, Ember Wall 6 dmg + Shield 2 (4+ ember).",
      trigger: { kind: "manual" },
      effect: {
        kind: "ability-upgrade",
        scope: { kind: "ability-ids", ids: ["Firestorm", "Obsidian Burst", "Ember Wall"] },
        permanent: true,
        modifications: [
          // Firestorm + Obsidian Burst share a 1+ magma signature; both pick
          // up the +6 / +3-Cinder buff. (Per the spec author, this overlap
          // is acceptable — both T2 abilities scaling together is intended.)
          { field: "base-damage", operation: "set", value: 6,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:magma", count: 1 } },
          { field: "applied-status-stacks", operation: "set", value: 3,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:magma", count: 1 } },
          { field: "base-damage", operation: "set", value: 9,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:magma", count: 1 } },
          // Ember Wall: damage 4 → 6 (3+ ember), Shield 1 → 2 (4+ ember).
          { field: "base-damage", operation: "set", value: 6,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:ember", count: 3 } },
          { field: "applied-status-stacks-self", operation: "set", value: 2,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:ember", count: 4 } },
        ],
      },
      flavor: "When the mountain wakes, it doesn't choose its words.",
    },
    {
      id: "pyromancer/crater-heart",
      hero: "pyromancer",
      kind: "mastery",
      cardCategory: "ladder-upgrade",
      masteryTier: 3,
      upgradesAbilities: ["Magma Heart", "Pyro Lance"],
      occupiesSlot: true,
      name: "Crater Heart",
      cost: 3,
      text: "Permanent. Magma Heart 10 dmg + 3 Cinder. Pyro Lance 11 dmg + 2/Cinder when opponent has 3+ Cinder.",
      trigger: { kind: "manual" },
      effect: {
        kind: "ability-upgrade",
        scope: { kind: "ability-ids", ids: ["Magma Heart", "Pyro Lance"] },
        permanent: true,
        modifications: [
          // Magma Heart — gated by its 4-ash signature.
          { field: "base-damage", operation: "set", value: 10,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:ash", count: 4 } },
          { field: "applied-status-stacks", operation: "set", value: 3,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:ash", count: 4 } },
          // Pyro Lance — gated by its 1+ ruin signature.
          { field: "base-damage", operation: "set", value: 11,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:ruin", count: 1 } },
          // The headline upgrade: stamp a fresh `conditional_bonus` onto
          // Pyro Lance's damage leaf. Adds +2 dmg per opponent Cinder when
          // opponent has 3+ Cinder. Uses the new structural Mastery field.
          {
            field: "damage-conditional-bonus",
            operation: "set",
            value: {
              condition: { kind: "opponent-has-status-min", status: "pyromancer:cinder", count: 3 },
              bonusPerUnit: 2,
              source: "opponent-status-stacks",
              sourceStatus: "pyromancer:cinder",
            },
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:ruin", count: 1 },
          },
        ],
      },
      flavor: "What burns deepest is what burns last.",
    },
    {
      id: "pyromancer/phoenix-form",
      hero: "pyromancer",
      kind: "mastery",
      cardCategory: "ladder-upgrade",
      masteryTier: 1,
      upgradesAbilities: ["Ember Strike"],
      occupiesSlot: true,
      name: "Phoenix Form",
      cost: 3,
      text: "Permanent. Replace Ember Strike with Phoenix Flame: 4+ ember; 3 dmg + heal 3 self.",
      trigger: { kind: "manual" },
      effect: {
        kind: "ability-upgrade",
        scope: { kind: "ability-ids", ids: ["Ember Strike"] },
        permanent: true,
        mode: "replace",
        replacement: {
          name: "Phoenix Flame",
          combo: { kind: "symbol-count", symbol: "pyromancer:ember", count: 4 },
          effect: {
            kind: "compound",
            effects: [
              { kind: "damage", amount: 3, type: "normal" },
              { kind: "heal", amount: 3, target: "self" },
            ],
          },
          shortText: "3 dmg + heal 3",
          longText: "4+ ember on 5 dice; deal 3 damage and heal 3 HP. Survival-leaning T1 alternate to Ember Strike.",
          damageType: "normal",
          targetLandingRate: [0.4, 0.65],
        },
      },
      flavor: "Where the ember dies, the phoenix wakes.",
    },
    {
      id: "pyromancer/mountains-patience",
      hero: "pyromancer",
      kind: "mastery",
      cardCategory: "ladder-upgrade",
      masteryTier: "defensive",
      upgradesAbilities: "all-defenses",
      occupiesSlot: true,
      name: "Mountain's Patience",
      cost: 3,
      text: "Permanent. Magma Shield: -4 dmg + 2 Cinder. Disperse: 2 Cinder on negation. Ash Mirror: -7 dmg + strip 2.",
      trigger: { kind: "manual" },
      effect: {
        kind: "ability-upgrade",
        scope: { kind: "all-defenses" },
        permanent: true,
        modifications: [
          // Magma Shield — gated by 1+ ember.
          { field: "reduce-damage-amount", operation: "set", value: 4,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:ember", count: 1 } },
          { field: "reduce-damage-apply-to-attacker-stacks", operation: "set", value: 2,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:ember", count: 1 } },
          // Disperse — gated by 1 magma + 1 ember (its full signature).
          // The on-success suffix is informational; the engine reads it as
          // an `applied-status-stacks` synonym for defensive contexts.
          { field: "applied-status-stacks-on-success", operation: "set", value: 2,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:magma", count: 1 } },
          // Ash Mirror — gated by 1+ ruin.
          { field: "reduce-damage-amount",  operation: "set", value: 7,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:ruin", count: 1 } },
          { field: "removed-status-stacks", operation: "set", value: 2,
            conditional: { kind: "combo-symbol-count", symbol: "pyromancer:ruin", count: 1 } },
        ],
      },
      flavor: "Some mountains wait centuries to answer.",
    },

    // ── Signature plays (5) ──────────────────────────────────────────────
    {
      id: "pyromancer/char",
      hero: "pyromancer",
      kind: "main-phase",
      cardCategory: "signature",
      name: "Char",
      cost: 2,
      text: "Apply 3 Cinder to opponent directly.",
      trigger: { kind: "manual" },
      effect: { kind: "apply-status", status: "pyromancer:cinder", stacks: 3, target: "opponent" },
      flavor: "She marks them once. The mountain remembers from there.",
    },
    {
      id: "pyromancer/crater-wind",
      hero: "pyromancer",
      kind: "main-phase",
      cardCategory: "signature",
      name: "Crater Wind",
      cost: 3,
      text: "Until end of match, Cinder detonations deal 12 instead of 8.",
      trigger: { kind: "manual" },
      effect: {
        kind: "persistent-buff",
        id: "crater-wind",
        target: "pyromancer:cinder",
        modifier: { field: "detonation-amount", operation: "set", value: 12 },
        discardOn: { kind: "match-ends" },
      },
      flavor: "When the wind comes, the mountain answers louder.",
    },
    {
      id: "pyromancer/phoenix-veil",
      hero: "pyromancer",
      kind: "instant",
      cardCategory: "signature",
      name: "Phoenix Veil",
      cost: 4,
      text: "Once per match. Negate the next attack and reflect it as Cinder per damage prevented. Not vs Ultimate.",
      trigger: { kind: "self-attacked", tier: "any" },
      effect: {
        kind: "compound",
        effects: [
          // Full negation — also stamps __damagePrevented for the sibling
          // apply-status to read.
          { kind: "reduce-damage", amount: 0, negate_attack: true },
          {
            kind: "apply-status",
            status: "pyromancer:cinder",
            stacks: 0,
            target: "opponent",
            conditional_bonus: {
              condition: { kind: "always" },
              bonusPerUnit: 1,
              source: "damage-prevented-amount",
            },
          },
        ],
      },
      // Card text says "cannot be used against Ultimate damage."
      playCondition: { kind: "incoming-attack-damage-type", op: "is-not", value: "ultimate" },
      oncePerMatch: true,
      flavor: "She does not flinch. She answers.",
    },
    {
      id: "pyromancer/final-heat",
      hero: "pyromancer",
      kind: "instant",
      cardCategory: "signature",
      name: "Final Heat",
      cost: 3,
      text: "When opponent removes Cinder, deal 2 pure damage per stack stripped.",
      trigger: { kind: "opponent-removes-status", status: "pyromancer:cinder" },
      effect: {
        kind: "damage",
        amount: 0,
        type: "pure",
        conditional_bonus: {
          condition: { kind: "self-stripped-status", status: "pyromancer:cinder" },
          bonusPerUnit: 2,
          source: "stripped-stack-count",
          sourceStatus: "pyromancer:cinder",
        },
      },
      flavor: "What she gives is hers to keep — even when stolen.",
    },
    {
      id: "pyromancer/phoenix-stir",
      hero: "pyromancer",
      kind: "main-phase",
      cardCategory: "signature",
      name: "Phoenix Stir",
      cost: 3,
      text: "Heal 5. If opponent has 3+ Cinder, heal 8 instead.",
      trigger: { kind: "manual" },
      effect: {
        kind: "heal",
        amount: 5,
        target: "self",
        conditional_bonus: {
          condition: { kind: "opponent-has-status-min", status: "pyromancer:cinder", count: 3 },
          bonusPerUnit: 3,
          source: "fixed-one",
        },
      },
      oncePerMatch: true,
      flavor: "The mountain shares its heat.",
    },
  ],
};
