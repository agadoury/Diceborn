/**
 * Diceborn — Pyromancer cards.
 *
 * Hero-specific card pool. Loaded by the content registry via
 * `getDeckCards(PYROMANCER.id)`. Cards live here (not on `HeroDefinition`)
 * so the upcoming deck-builder feature can swap card lists per match
 * without touching hero data.
 */

import type { Card } from "../../game/types";

export const PYROMANCER_CARDS: Card[] = [
    // ── Dice manipulation (3) ────────────────────────────────────────────
    {
      id: "pyromancer/ember-channel",
      hero: "pyromancer",
      kind: "roll-phase",
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
      id: "pyromancer/mountains-patience",
      hero: "pyromancer",
      kind: "mastery",
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
];
