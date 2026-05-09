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

  cards: [
    // ── Dice manipulation ─────────────────────────────────────────────────
    {
      id: "berserker/iron-focus",
      hero: "berserker",
      kind: "roll-phase",
      name: "Iron Focus",
      cost: 1,
      text: "Set 1 of your dice to a face value of your choice. Once per turn.",
      trigger: { kind: "manual" },
      effect: { kind: "set-die-face", count: 1, filter: "any", target: { kind: "face" } },
      oncePerTurn: true,
      flavor: "He chooses where the storm strikes.",
    },
    {
      id: "berserker/berserker-rage",
      hero: "berserker",
      kind: "roll-phase",
      name: "Berserker Rage",
      cost: 2,
      text: "Reroll all your dice once, ignoring lock states. Cannot be used on the final attempt.",
      trigger: { kind: "manual" },
      effect: { kind: "reroll-dice", filter: "all", ignoresLock: true, on_attempt: "not-final" },
      flavor: "The frost forgets nothing — except patience.",
    },
    {
      id: "berserker/pelt-of-the-wolf",
      hero: "berserker",
      kind: "main-phase",
      name: "Pelt of the Wolf",
      cost: 1,
      text: "Until end of turn, your fur faces count as axe faces for combo purposes.",
      trigger: { kind: "manual" },
      effect: {
        kind: "face-symbol-bend",
        from_symbol: "berserker:fur",
        to_symbol: "berserker:axe",
        duration: "this-turn",
      },
      flavor: "His mother stitched the pelt with prayers. The prayers still listen.",
    },

    // ── Tiered masteries ──────────────────────────────────────────────────
    {
      id: "berserker/cleave-mastery",
      hero: "berserker",
      kind: "mastery",
      masteryTier: 1,
      upgradesAbilities: ["Cleave"],
      occupiesSlot: true,
      name: "Cleave Mastery",
      cost: 2,
      text: "Permanent. Cleave damage becomes 5/7/9. Cleave with 4+ axes becomes undefendable.",
      trigger: { kind: "manual" },
      effect: {
        kind: "ability-upgrade",
        scope: { kind: "ability-ids", ids: ["Cleave"] },
        permanent: true,
        modifications: [
          { field: "scaling-damage-base", operation: "set", value: 5 },
          {
            field: "damage-type",
            operation: "set",
            value: "undefendable",
            conditional: { kind: "combo-symbol-count", symbol: "berserker:axe", count: 4 },
          },
        ],
      },
      flavor: "Every breath sharpens the blade.",
    },
    {
      id: "berserker/northern-storm",
      hero: "berserker",
      kind: "mastery",
      masteryTier: 2,
      upgradesAbilities: ["Glacier Strike", "Winter Storm"],
      occupiesSlot: true,
      name: "Northern Storm",
      cost: 3,
      text: "Permanent. Glacier Strike: 7 unblockable, self-heal 2 HP. Winter Storm: 11 dmg.",
      trigger: { kind: "manual" },
      effect: {
        kind: "ability-upgrade",
        scope: { kind: "ability-ids", ids: ["Glacier Strike", "Winter Storm"] },
        permanent: true,
        modifications: [
          {
            field: "base-damage",
            operation: "set",
            value: 7,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:axe", count: 2 },
          },
          {
            field: "heal-amount",
            operation: "set",
            value: 2,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:axe", count: 2 },
          },
          {
            field: "base-damage",
            operation: "set",
            value: 11,
            conditional: { kind: "combo-straight", length: 4 },
          },
        ],
      },
      flavor: "The storm answers his name.",
    },
    {
      id: "berserker/bloodbound",
      hero: "berserker",
      kind: "mastery",
      masteryTier: 3,
      upgradesAbilities: ["Blood Harvest", "Frostfang"],
      occupiesSlot: true,
      name: "Bloodbound",
      cost: 3,
      text: "Permanent. Blood Harvest: threshold becomes 10, heals 3 HP per Frenzy stack. Frostfang: damage becomes 9, +3 Frost-bite.",
      trigger: { kind: "manual" },
      effect: {
        kind: "ability-upgrade",
        scope: { kind: "ability-ids", ids: ["Blood Harvest", "Frostfang"] },
        permanent: true,
        modifications: [
          {
            field: "bonus-dice-threshold",
            operation: "set",
            value: 10,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:howl", count: 2 },
          },
          {
            field: "heal-conditional-bonus",
            operation: "set",
            value: 3,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:howl", count: 2 },
          },
          {
            field: "base-damage",
            operation: "set",
            value: 9,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:howl", count: 4 },
          },
          {
            field: "applied-status-stacks",
            operation: "set",
            value: 3,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:howl", count: 4 },
          },
        ],
      },
      flavor: "What was given returns. Stronger.",
    },
    {
      id: "berserker/wolfborn",
      hero: "berserker",
      kind: "mastery",
      masteryTier: "defensive",
      upgradesAbilities: "all-defenses",
      occupiesSlot: true,
      name: "Wolfborn",
      cost: 3,
      text: "Permanent. Wolfhide: -5 dmg. Bloodoath: heal scales 4/5/6 with fur count. Glacial Counter: -7 dmg, +2 Frost-bite.",
      trigger: { kind: "manual" },
      effect: {
        kind: "ability-upgrade",
        scope: { kind: "all-defenses" },
        permanent: true,
        modifications: [
          {
            field: "reduce-damage-amount",
            operation: "set",
            value: 5,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:fur", count: 1 },
          },
          {
            field: "heal-amount",
            operation: "set",
            value: 5,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:fur", count: 3 },
          },
          {
            field: "heal-amount",
            operation: "set",
            value: 6,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:fur", count: 4 },
          },
          {
            field: "reduce-damage-amount",
            operation: "set",
            value: 7,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:howl", count: 1 },
          },
          {
            field: "applied-status-stacks",
            operation: "set",
            value: 2,
            conditional: { kind: "combo-symbol-count", symbol: "berserker:howl", count: 1 },
          },
        ],
      },
      flavor: "The pelt remembers every wound it spared.",
    },

    // ── Signature plays ───────────────────────────────────────────────────
    {
      id: "berserker/war-cry",
      hero: "berserker",
      kind: "main-phase",
      name: "War Cry",
      cost: 3,
      text: "Add 3 Frenzy stacks immediately, regardless of HP threshold.",
      trigger: { kind: "manual" },
      effect: {
        kind: "passive-counter-modifier",
        passiveKey: "frenzy",
        operation: "add",
        value: 3,
        respectsCap: true,
      },
      flavor: "He wakes the storm in himself.",
    },
    {
      id: "berserker/hunters-mark",
      hero: "berserker",
      kind: "main-phase",
      name: "Hunter's Mark",
      cost: 1,
      text: "Apply 2 Frost-bite to opponent directly, no roll required.",
      trigger: { kind: "manual" },
      effect: {
        kind: "apply-status",
        status: "berserker:frostbite",
        stacks: 2,
        target: "opponent",
      },
      flavor: "He marks the ones the wolves will follow.",
    },
    {
      id: "berserker/ancestral-spirits",
      hero: "berserker",
      kind: "main-phase",
      name: "Ancestral Spirits",
      cost: 2,
      text: "Until end of match, all your offensive abilities deal +1 damage. Discarded if you take damage from a Tier 4 Ultimate.",
      trigger: { kind: "manual" },
      // Persistent buff that targets every offensive tier (1, 2, 3). T4 is
      // intentionally excluded — and the discardOn breaks the buff when a
      // T4 lands on the Berserker.
      effect: {
        kind: "compound",
        effects: [
          {
            kind: "persistent-buff",
            id: "ancestral-spirits-t1",
            scope: { kind: "all-tier", tier: 1 },
            modifier: { field: "base-damage", operation: "add", value: 1 },
            discardOn: { kind: "damage-taken-from-tier", tier: 4 },
          },
          {
            kind: "persistent-buff",
            id: "ancestral-spirits-t2",
            scope: { kind: "all-tier", tier: 2 },
            modifier: { field: "base-damage", operation: "add", value: 1 },
            discardOn: { kind: "damage-taken-from-tier", tier: 4 },
          },
          {
            kind: "persistent-buff",
            id: "ancestral-spirits-t3",
            scope: { kind: "all-tier", tier: 3 },
            modifier: { field: "base-damage", operation: "add", value: 1 },
            discardOn: { kind: "damage-taken-from-tier", tier: 4 },
          },
        ],
      },
      flavor: "His ancestors stand with him until the storm breaks.",
    },
    {
      id: "berserker/last-stand",
      hero: "berserker",
      kind: "roll-phase",
      name: "Last Stand",
      cost: 4,
      text: "Playable only when at ≤10 HP. Choose a face value; until end of turn, all 5 of your dice count as that face. Once per match.",
      trigger: { kind: "manual" },
      effect: {
        kind: "compound",
        effects: [
          // Visual: set + lock all dice to the picked face for the dice tray.
          { kind: "set-die-face", count: 5, filter: "any", target: { kind: "face" }, lockAfter: true },
          // Combo evaluation: override survives any reroll until end of turn.
          { kind: "force-face-value", duration: "this-turn" },
        ],
      },
      playCondition: { kind: "match-state-threshold", metric: "self-hp", op: "<=", value: 10 },
      oncePerMatch: true,
      flavor: "When the wolf dies, it dies looking forward.",
    },
    {
      id: "berserker/counterstrike",
      hero: "berserker",
      kind: "instant",
      name: "Counterstrike",
      cost: 2,
      text: "Once per match. When an opponent's offensive ability deals you 1+ damage, gain +2 Frenzy AND apply +1 Frost-bite to the attacker.",
      trigger: { kind: "self-takes-damage", from: "offensive-ability" },
      effect: {
        kind: "compound",
        effects: [
          { kind: "passive-counter-modifier", passiveKey: "frenzy", operation: "add", value: 2, respectsCap: true },
          { kind: "apply-status", status: "berserker:frostbite", stacks: 1, target: "opponent" },
        ],
      },
      oncePerMatch: true,
      flavor: "Hit me. The wolf has been waiting.",
    },
  ],
};
