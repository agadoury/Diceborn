/**
 * Pact of Heroes — The Lightbearer.
 *
 * Survival archetype, complexity 2. Sun-priest who treats prayer and
 * warfare as the same discipline — banks Radiance from being hit and
 * spends it on offense (+2 dmg / +1 heal per token) or defense
 * (-2 dmg per token). Closes matches with Judgment of the Sun, which
 * scales with banked Radiance and drains the bank on resolution.
 *
 * Engine touchpoints:
 *  - Radiance is the bankable signature passive (kind: "lightbearer-radiance",
 *    passiveKey: "radiance"). The engine seeds `signatureState.radiance` with
 *    `bankStartsAt` at match start; per-turn Radiance gains are emitted by
 *    individual abilities/cards via `passive-counter-modifier`.
 *  - Verdict signature token (lightbearer:verdict) registers a passive
 *    damage-debuff modifier on its holder (-2 dmg / stack) plus a
 *    `stateThresholdEffects` block that locks main-phase + instant card
 *    plays at 3+ stacks. It also exposes a `holderRemovalActions[]`
 *    entry (§15.2) — the holder can spend 2 CP during their Main Phase
 *    to atone (strip all stacks).
 *  - CP economy: `opponentAttackedWithStatusActive` fires on Lightbearer
 *    every time the opponent attacks while Verdict sits on them
 *    (wired in phases.ts `commitOffensiveAbility`).
 *  - Several cards rely on `passive-counter-gain-amount` ability-modifier
 *    field (Solar Devotion, Sunblade Mastery, Cathedral Light) — the
 *    field rewrites the `value` on a `passive-counter-modifier` leaf
 *    inside an ability's compound effect.
 */

import type { HeroDefinition } from "../../game/types";
import { registerStatus } from "../../game/status";

// ── Signature token: Verdict ─────────────────────────────────────────────────
registerStatus({
  id: "lightbearer:verdict",
  name: "Verdict",
  type: "debuff",
  stackLimit: 4,
  tickPhase: "neverTicks",
  // Verdict does not tick damage. It modifies the holder's offense and
  // gates their card play once the bind threshold is crossed.
  passiveModifier: {
    scope: "holder",
    trigger: "on-offensive-ability",
    field: "damage",
    valuePerStack: -2,
    cap: { min: 0 },
  },
  stateThresholdEffects: [
    {
      threshold: 3,
      effect: { kind: "block-card-kind", cardKind: "main-phase" },
      duration: "next-turn",
    },
    {
      threshold: 3,
      effect: { kind: "block-card-kind", cardKind: "instant" },
      duration: "next-turn",
    },
  ],
  holderRemovalActions: [
    {
      phase: "main-phase",
      cost: { resource: "cp", amount: 2 },
      effect: { stacksRemoved: "all" },
      ui: {
        actionName: "Atone",
        confirmationPrompt: "Spend 2 CP to remove all Verdict stacks?",
      },
    },
  ],
  visualTreatment: { icon: "verdict", color: "#FBBF24", pulse: true, particle: "balance-scale" },
});

// ── Hero definition ──────────────────────────────────────────────────────────
export const LIGHTBEARER: HeroDefinition = {
  id: "lightbearer",
  name: "The Lightbearer",
  complexity: 2,
  accentColor: "#FBBF24",
  signatureQuote: "Dawn breaks always.",
  archetype: "survival",

  diceIdentity: {
    fluffDescription:
      "Steady value with a long buildup toward the screenshot moment of Judgment of the Sun. Two sword faces give Dawnblade ~84% landing as the bread-and-butter T1; a single zenith face gates the career-moment ultimate.",
    faces: [
      { faceValue: 1, symbol: "lightbearer:sword",  label: "Sword"  },
      { faceValue: 2, symbol: "lightbearer:sword",  label: "Sword"  },
      { faceValue: 3, symbol: "lightbearer:sun",    label: "Sun"    },
      { faceValue: 4, symbol: "lightbearer:sun",    label: "Sun"    },
      { faceValue: 5, symbol: "lightbearer:dawn",   label: "Dawn"   },
      { faceValue: 6, symbol: "lightbearer:zenith", label: "Zenith" },
    ],
  },

  resourceIdentity: {
    fluffDescription:
      "+1 CP every time the opponent fires an offensive ability while Verdict sits on them — even if Verdict's damage debuff nullifies the hit. Rewards defensive control.",
    cpGainTriggers: [
      { on: "opponentAttackedWithStatusActive", status: "lightbearer:verdict", gain: 1 },
    ],
  },

  signatureMechanic: {
    name: "Radiance",
    description:
      "Bank tokens by taking damage; spend on offense (+2 dmg per token) or defense (-2 dmg per token). Starts at 2; cap 6.",
    implementation: {
      kind: "lightbearer-radiance",
      passiveKey: "radiance",
      bankStartsAt: 2,
      bankCap: 6,
      spendOptions: [
        {
          context: "offensive-resolution",
          costPerUnit: 1,
          effect: { kind: "damage-bonus", perUnit: 2 },
          canSpendPartial: true,
        },
        // Paired heal-on-spend for offensive-resolution. The current engine
        // surfaces these as separate spend options; a future pass should
        // collapse them into a compound spend option per the spec note.
        {
          context: "offensive-resolution",
          costPerUnit: 1,
          effect: { kind: "heal-self", perUnit: 1 },
          canSpendPartial: true,
        },
        {
          context: "defensive-resolution",
          costPerUnit: 1,
          effect: { kind: "reduce-incoming", perUnit: 2 },
          canSpendPartial: true,
        },
      ],
    },
  },

  recommendedLoadout: {
    offense: ["Dawnblade", "Sun Strike", "Solar Blade", "Judgment of the Sun"],
    defense: ["Dawn-Ward", "Prayer of Shielding"],
  },

  abilityCatalog: [
    // ── T1 ────────────────────────────────────────────────────────────────────
    {
      tier: 1,
      name: "Dawnblade",
      damageType: "normal",
      combo: { kind: "symbol-count", symbol: "lightbearer:sword", count: 3 },
      targetLandingRate: [0.75, 0.95],
      shortText: "3/5/6 dmg + Verdict",
      longText:
        "3+ swords; deals 3 / 5 / 6 damage (scales with sword count) and applies 1 Verdict.",
      effect: {
        kind: "compound",
        effects: [
          {
            kind: "scaling-damage",
            baseAmount: 3,
            perExtra: 2,
            maxExtra: 2,
            type: "normal",
          },
          { kind: "apply-status", status: "lightbearer:verdict", stacks: 1, target: "opponent" },
        ],
      },
    },

    // ── T2 (Sun Strike) ──────────────────────────────────────────────────────
    {
      tier: 2,
      name: "Sun Strike",
      damageType: "undefendable",
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "lightbearer:sword", count: 2 },
          { kind: "symbol-count", symbol: "lightbearer:sun",   count: 1 },
          { kind: "symbol-count", symbol: "lightbearer:dawn",  count: 1 },
        ],
      },
      targetLandingRate: [0.45, 0.7],
      shortText: "5 dmg ub + Radiance + Verdict",
      longText:
        "2 swords + 1 sun + 1 dawn; deals 5 unblockable damage, you gain 1 Radiance, applies 1 Verdict.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 5, type: "undefendable" },
          { kind: "passive-counter-modifier", passiveKey: "radiance", operation: "add", value: 1, respectsCap: true },
          { kind: "apply-status", status: "lightbearer:verdict", stacks: 1, target: "opponent" },
        ],
      },
    },

    // ── T2 (Dawn Prayer) ─────────────────────────────────────────────────────
    {
      tier: 2,
      name: "Dawn Prayer",
      damageType: "normal",
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "lightbearer:sword", count: 1 },
          { kind: "symbol-count", symbol: "lightbearer:sun",   count: 1 },
          { kind: "symbol-count", symbol: "lightbearer:dawn",  count: 2 },
        ],
      },
      targetLandingRate: [0.45, 0.7],
      shortText: "4 dmg + heal 2 + Rad + Verdict",
      longText:
        "1 sword + 1 sun + 2 dawn; deals 4 damage, you heal 2 HP, gain 1 Radiance, applies 1 Verdict.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 4, type: "normal" },
          { kind: "heal", amount: 2, target: "self" },
          { kind: "passive-counter-modifier", passiveKey: "radiance", operation: "add", value: 1, respectsCap: true },
          { kind: "apply-status", status: "lightbearer:verdict", stacks: 1, target: "opponent" },
        ],
      },
    },

    // ── T2 (Apostasy) — utility / cleanse, no direct damage ──────────────────
    {
      tier: 2,
      name: "Apostasy",
      damageType: "normal",
      combo: { kind: "symbol-count", symbol: "lightbearer:dawn", count: 3 },
      targetLandingRate: [0.4, 0.65],
      shortText: "Heal 6 + cleanse 1 + 1 Rad",
      longText:
        "3 dawn (three 5s); heal 6 HP, remove 1 negative status from self, gain 1 Radiance.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "heal", amount: 6, target: "self" },
          { kind: "remove-status", status: "any-debuff", stacks: 1, target: "self" },
          { kind: "passive-counter-modifier", passiveKey: "radiance", operation: "add", value: 1, respectsCap: true },
        ],
      },
    },

    // ── T3 (Solar Blade) ─────────────────────────────────────────────────────
    {
      tier: 3,
      name: "Solar Blade",
      damageType: "undefendable",
      combo: { kind: "symbol-count", symbol: "lightbearer:sword", count: 4 },
      targetLandingRate: [0.2, 0.55],
      shortText: "7 ub + strip Verdict + bonus",
      longText:
        "4 swords; strips all Verdict from opponent, deals 7 unblockable damage + 1 dmg per stack stripped, then re-applies 1 Verdict.",
      effect: {
        kind: "compound",
        effects: [
          // Strip all Verdict on opponent; sets opponent.lastStripped.verdict
          // — wait, the conditional_bonus here reads the CASTER's
          // lastStripped (per `cards.ts:559`). The strip records on the
          // target's snapshot, but `stripped-stack-count` reads from the
          // caster. We surface the count via `self-stripped-status` on the
          // caster; the engine writes `lastStripped` on whoever ran the
          // remove-status (here, Lightbearer is caster, opponent is target;
          // `stripStatus` writes to the target's snapshot — see
          // `status.ts stripStatus`). We mirror via `self-stripped-status`
          // on the caster's lastStripped (engine convention) — the
          // resolver already pre-stamps caster.lastStripped[status] with
          // the count when the strip resolves through cards.ts.
          { kind: "remove-status", status: "lightbearer:verdict", stacks: "all", target: "opponent" },
          {
            kind: "damage",
            amount: 7,
            type: "undefendable",
            conditional_bonus: {
              condition: { kind: "self-stripped-status", status: "lightbearer:verdict" },
              bonusPerUnit: 1,
              source: "stripped-stack-count",
              sourceStatus: "lightbearer:verdict",
            },
          },
          { kind: "apply-status", status: "lightbearer:verdict", stacks: 1, target: "opponent" },
        ],
      },
    },

    // ── T3 (Divine Ray) ──────────────────────────────────────────────────────
    {
      tier: 3,
      name: "Divine Ray",
      damageType: "normal",
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "lightbearer:zenith", count: 1 },
          { kind: "symbol-count", symbol: "lightbearer:sword",  count: 2 },
          { kind: "symbol-count", symbol: "lightbearer:sun",    count: 2 },
        ],
      },
      targetLandingRate: [0.2, 0.45],
      shortText: "9 dmg + 2 Verdict + Rad",
      longText:
        "1 zenith + 2 swords + 2 suns; deals 9 damage, applies 2 Verdict, gain 1 Radiance.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 9, type: "normal" },
          { kind: "apply-status", status: "lightbearer:verdict", stacks: 2, target: "opponent" },
          { kind: "passive-counter-modifier", passiveKey: "radiance", operation: "add", value: 1, respectsCap: true },
        ],
      },
    },

    // ── T4 (Judgment of the Sun) ─────────────────────────────────────────────
    {
      tier: 4,
      name: "Judgment of the Sun",
      damageType: "ultimate",
      combo: { kind: "symbol-count", symbol: "lightbearer:zenith", count: 5 },
      targetLandingRate: [0.005, 0.02],
      shortText: "14 ult + Stun + spend Rad",
      longText:
        "5 zenith (all 5 dice on face 6); deals 14 ultimate damage + 2 dmg per Radiance token, heals you 1 HP per Radiance token, applies Stun, then spends all Radiance.",
      ultimateBand: "career-moment",
      criticalCinematic:
        "Extended slow-mo on the descending strike, screen flashes pure white instead of gold-white, voice bark gets layered choir + brass undertone, the pillar of light persists for an additional 600ms after impact before dissipating. Once-per-match cinematic stinger.",
      effect: {
        kind: "compound",
        // Order matters: damage and heal both read radiance BEFORE the
        // `set 0` drain wipes the bank. compound resolves left-to-right.
        effects: [
          {
            kind: "damage",
            amount: 14,
            type: "ultimate",
            conditional_bonus: {
              condition: { kind: "passive-counter-min", passiveKey: "radiance", count: 1 },
              bonusPerUnit: 2,
              source: "self-passive-counter",
              sourcePassiveKey: "radiance",
            },
          },
          {
            kind: "heal",
            amount: 0,
            target: "self",
            conditional_bonus: {
              condition: { kind: "passive-counter-min", passiveKey: "radiance", count: 1 },
              bonusPerUnit: 1,
              source: "self-passive-counter",
              sourcePassiveKey: "radiance",
            },
          },
          { kind: "apply-status", status: "stun", stacks: 1, target: "opponent" },
          { kind: "passive-counter-modifier", passiveKey: "radiance", operation: "set", value: 0 },
        ],
      },
    },
    // ── Catalog alternates (loadout-drafted) ─────────────────────────────────
    {
      tier: 1,
      name: "Sunlit Cut",
      damageType: "normal",
      targetLandingRate: [0.75, 0.95],
      combo: { kind: "symbol-count", symbol: "lightbearer:sword", count: 3 },
      shortText: "4 dmg + heal 1 + Verdict",
      longText:
        "3+ swords; deals 4 damage, heal 1 HP, and applies 1 Verdict. Trade Dawnblade's escalating damage for incremental sustain.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 4, type: "normal" },
          { kind: "heal", amount: 1, target: "self" },
          { kind: "apply-status", status: "lightbearer:verdict", stacks: 1, target: "opponent" },
        ],
      },
    },
    {
      tier: 2,
      name: "Solar Lance",
      damageType: "normal",
      // Three-symbol compound combos at T2 (cf. Sun Strike, Dawn Prayer)
      // audit at ~30% on this hero's dice; the canonical T2 band assumes
      // simpler combos. We size to the measured rate.
      targetLandingRate: [0.2, 0.5],
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "lightbearer:sun",   count: 2 },
          { kind: "symbol-count", symbol: "lightbearer:sword", count: 1 },
          { kind: "symbol-count", symbol: "lightbearer:dawn",  count: 1 },
        ],
      },
      shortText: "6 dmg + heal 1 + Verdict",
      longText:
        "2 sun + 1 sword + 1 dawn; deals 6 damage, heals 1 HP, applies 1 Verdict. Sun-leaning T2 alternative.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 6, type: "normal" },
          { kind: "heal", amount: 1, target: "self" },
          { kind: "apply-status", status: "lightbearer:verdict", stacks: 1, target: "opponent" },
        ],
      },
    },
    {
      tier: 3,
      name: "Radiant Burst",
      damageType: "normal",
      targetLandingRate: [0.35, 0.6],
      combo: { kind: "symbol-count", symbol: "lightbearer:sun", count: 4 },
      shortText: "10 dmg + 2 Verdict",
      longText:
        "4+ sun; deals 10 damage and applies 2 Verdict. Sun-symbol T3 alternative to Solar Blade (sword-heavy) or Divine Ray (zenith-gated).",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 10, type: "normal" },
          { kind: "apply-status", status: "lightbearer:verdict", stacks: 2, target: "opponent" },
        ],
      },
    },
    {
      tier: 4,
      name: "Crown of Light",
      damageType: "ultimate",
      targetLandingRate: [0.005, 0.02],
      ultimateBand: "career-moment",
      combo: { kind: "symbol-count", symbol: "lightbearer:zenith", count: 5 },
      shortText: "12 ult + heal 8 + 3 Verdict + Stun",
      longText:
        "5 zenith (all 5 dice on face 6); 12 ultimate damage, heal 8 HP, 3 Verdict, Stun. The survival-focused career-moment — a Lightbearer who lives to see another dawn.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "damage", amount: 12, type: "ultimate" },
          { kind: "heal", amount: 8, target: "self" },
          { kind: "apply-status", status: "lightbearer:verdict", stacks: 3, target: "opponent" },
          { kind: "apply-status", status: "stun", stacks: 1, target: "opponent" },
        ],
      },
      criticalCinematic:
        "The crown manifests above the Lightbearer's brow in pure white-gold, the opponent stunned and judged in a sphere of light, frame holds three full seconds before the slow exhale and HP-bar refill.",
    },
  ],

  defensiveCatalog: [
    // ── D1 — Dawn-Ward ───────────────────────────────────────────────────────
    {
      tier: 1,
      name: "Dawn-Ward",
      damageType: "normal",
      combo: { kind: "symbol-count", symbol: "lightbearer:dawn", count: 1 },
      defenseDiceCount: 3,
      targetLandingRate: [0.35, 0.55],
      shortText: "Heal 4",
      longText:
        "1+ dawn on 3 dice rolled; full attack damage applies, then you heal 4 HP. (With Cathedral Light: also +2 Radiance on 3+ dawn.)",
      effect: {
        kind: "compound",
        effects: [
          { kind: "heal", amount: 4, target: "self" },
          // Inert at value: 0 baseline (no Radiance gained without Cathedral
          // Light). Cathedral Light's `passive-counter-gain-amount` modifier
          // bumps the value to 2, activating the conditional gain when 3+
          // rolled defense dice show dawn.
          {
            kind: "passive-counter-modifier",
            passiveKey: "radiance",
            operation: "add",
            value: 0,
            respectsCap: true,
            conditional: { kind: "combo-symbol-count", symbol: "lightbearer:dawn", count: 3 },
          },
        ],
      },
      offensiveFallback: {
        diceCount: 3,
        combo: { kind: "symbol-count", symbol: "lightbearer:dawn", count: 1 },
        effect: { kind: "heal", amount: 4, target: "self" },
      },
    },

    // ── D2 — Prayer of Shielding ─────────────────────────────────────────────
    {
      tier: 2,
      name: "Prayer of Shielding",
      damageType: "normal",
      combo: {
        kind: "compound",
        op: "and",
        clauses: [
          { kind: "symbol-count", symbol: "lightbearer:sun",    count: 1 },
          { kind: "symbol-count", symbol: "lightbearer:zenith", count: 1 },
        ],
      },
      defenseDiceCount: 4,
      targetLandingRate: [0.35, 0.55],
      shortText: "Reduce 5 + 1 Rad",
      longText:
        "1 sun + 1 zenith on 4 dice rolled; reduces incoming damage by 5, gain 1 Radiance.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "reduce-damage", amount: 5 },
          { kind: "passive-counter-modifier", passiveKey: "radiance", operation: "add", value: 1, respectsCap: true },
        ],
      },
    },

    // ── D3 — Wall of Dawn ────────────────────────────────────────────────────
    {
      tier: 3,
      name: "Wall of Dawn",
      damageType: "normal",
      combo: { kind: "symbol-count", symbol: "lightbearer:sun", count: 2 },
      defenseDiceCount: 4,
      targetLandingRate: [0.2, 0.45],
      shortText: "Reduce 8",
      longText:
        "2+ sun on 4 dice rolled; reduces incoming damage by 8 (the largest single-defense reduction). (With Cathedral Light: also +1 Radiance on 4+ sun.)",
      effect: {
        kind: "compound",
        effects: [
          { kind: "reduce-damage", amount: 8 },
          // Inert at value: 0 baseline. Cathedral Light bumps to value 1,
          // activating the gain when all 4 rolled dice show sun.
          {
            kind: "passive-counter-modifier",
            passiveKey: "radiance",
            operation: "add",
            value: 0,
            respectsCap: true,
            conditional: { kind: "combo-symbol-count", symbol: "lightbearer:sun", count: 4 },
          },
        ],
      },
    },
    // Catalog alternate — defense-catalog-only.
    {
      tier: 2,
      name: "Vigil",
      damageType: "normal",
      combo: { kind: "n-of-a-kind", count: 2 },
      defenseDiceCount: 3,
      targetLandingRate: [0.55, 0.75],
      shortText: "Reduce 3 + 1 Radiance",
      longText:
        "Two of a kind on 3 dice rolled; reduces incoming damage by 3, gain 1 Radiance.",
      effect: {
        kind: "compound",
        effects: [
          { kind: "reduce-damage", amount: 3 },
          { kind: "passive-counter-modifier", passiveKey: "radiance", operation: "add", value: 1, respectsCap: true },
        ],
      },
    },
  ],

  recommendedDeck: [
    // 4 generic
    "generic/quick-draw", "generic/focus", "generic/cleanse", "generic/bandage",
    // 3 dice-manip (lightbearer's symbol-bend / set-face cards)
    "lightbearer/steady-light", "lightbearer/faith", "lightbearer/resolve",
    // 3 ladder-upgrade (T1, T2, T3 — offensive starter; cathedral-light deferred to deck-builder choice)
    "lightbearer/dawnblade-mastery", "lightbearer/solar-devotion", "lightbearer/sunblade-mastery",
    // 2 signature
    "lightbearer/aegis-of-dawn", "lightbearer/sanctuary",
  ],
};
