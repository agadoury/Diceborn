/**
 * Pact of Heroes — Lightbearer cards.
 *
 * Hero-specific card pool. Loaded by the content registry via
 * `getDeckCards("lightbearer")`. Cards live here (not on `HeroDefinition`)
 * so the upcoming deck-builder feature can swap card lists per match
 * without touching hero data.
 *
 * Implementation notes (per the §15 engine extensions):
 *  - Sanctuary uses `persistent-buff.pipelineModifier` (§15.3) +
 *    `discardOn: next-turn-of-self` (§15.5).
 *  - Aegis of Dawn uses `reduce-damage.multiplier` (§15.1) injected from
 *    an Instant response window (Clarification B).
 *  - Vow of Service uses `ability-upgrade` + `passive-counter-gain-amount`
 *    rather than `triggerModifier`, since the Radiance grant on
 *    Prayer of Shielding lives inside the defense's effect compound, not
 *    on `cpGainTriggers[]`. The mechanical outcome is identical.
 *  - Sunburst uses `combo-override` (§15.6) +
 *    `discardOn: end-of-self-turn` (§15.5).
 *  - Cathedral Light fans out into three per-defense `ability-upgrade`s
 *    via a top-level compound; this is cleaner than scoping
 *    `all-defenses` and disambiguating with compound StateChecks the
 *    engine doesn't currently express ("zenith count: 0" anti-clause).
 *  - Solar Devotion / Sunblade Mastery / Cathedral Light all rely on the
 *    `passive-counter-gain-amount` ability-upgrade field — added to the
 *    AbilityUpgradeField whitelist alongside the Lightbearer ingestion.
 */

import type { Card } from "../../game/types";

export const LIGHTBEARER_CARDS: Card[] = [
  // ── Dice manipulation (3) ──────────────────────────────────────────────────
  {
    id: "lightbearer/steady-light",
    hero: "lightbearer",
    kind: "roll-phase",
    cardCategory: "dice-manip",
    name: "Steady Light",
    cost: 1,
    text: "Set 1 of your dice to a sun face. Once per turn.",
    trigger: { kind: "manual" },
    oncePerTurn: true,
    effect: {
      kind: "set-die-face",
      count: 1,
      filter: "any",
      target: { kind: "symbol", symbol: "lightbearer:sun" },
    },
    flavor: "Some prayers are answered with light.",
  },
  {
    id: "lightbearer/faith",
    hero: "lightbearer",
    kind: "roll-phase",
    cardCategory: "dice-manip",
    name: "Faith",
    cost: 2,
    text: "Reroll all your dice not currently showing sun or dawn.",
    trigger: { kind: "manual" },
    effect: {
      kind: "reroll-dice",
      filter: { kind: "not-showing-symbols", symbols: ["lightbearer:sun", "lightbearer:dawn"] },
    },
    flavor: "What was lost returns. What is held remains.",
  },
  {
    id: "lightbearer/resolve",
    hero: "lightbearer",
    kind: "main-phase",
    cardCategory: "dice-manip",
    name: "Resolve",
    cost: 1,
    text: "Until end of turn, your dawn faces count as sun faces for combo purposes.",
    trigger: { kind: "manual" },
    effect: {
      kind: "face-symbol-bend",
      from_symbol: "lightbearer:dawn",
      to_symbol: "lightbearer:sun",
      duration: "this-turn",
    },
    flavor: "He treats the rising sun and the noon sun as the same blessing.",
  },

  // ── Tiered Masteries (4 — T1 / T2 / T3 / Defensive) ───────────────────────
  {
    id: "lightbearer/dawnblade-mastery",
    hero: "lightbearer",
    kind: "mastery",
    cardCategory: "ladder-upgrade",
    masteryTier: 1,
    upgradesAbilities: ["Dawnblade"],
    name: "Dawnblade Mastery",
    cost: 2,
    text: "Permanent. Dawnblade damage becomes 4/6/8.",
    trigger: { kind: "manual" },
    effect: {
      kind: "ability-upgrade",
      scope: { kind: "ability-ids", ids: ["Dawnblade"] },
      modifications: [
        { field: "scaling-damage-base", operation: "set", value: 4 },
      ],
      permanent: true,
    },
    flavor: "The first lesson is the one they remember.",
  },
  {
    id: "lightbearer/solar-devotion",
    hero: "lightbearer",
    kind: "mastery",
    cardCategory: "ladder-upgrade",
    masteryTier: 2,
    upgradesAbilities: ["Sun Strike", "Dawn Prayer"],
    name: "Solar Devotion",
    cost: 3,
    text: "Permanent. Sun Strike: 7 ub, +2 Radiance. Dawn Prayer: 5 dmg + heal 3 + 2 Verdict.",
    trigger: { kind: "manual" },
    effect: {
      kind: "compound",
      effects: [
        // Sun Strike — bumped via its own ability-ids scope so the conditionals
        // don't have to disambiguate Dawn Prayer.
        {
          kind: "ability-upgrade",
          scope: { kind: "ability-ids", ids: ["Sun Strike"] },
          modifications: [
            { field: "base-damage", operation: "set", value: 7 },
            { field: "passive-counter-gain-amount", operation: "set", value: 2 },
          ],
          permanent: true,
        },
        // Dawn Prayer — separate scope.
        {
          kind: "ability-upgrade",
          scope: { kind: "ability-ids", ids: ["Dawn Prayer"] },
          modifications: [
            { field: "base-damage", operation: "set", value: 5 },
            { field: "heal-amount", operation: "set", value: 3 },
            { field: "applied-status-stacks", operation: "set", value: 2 },
          ],
          permanent: true,
        },
      ],
    },
    flavor: "He stops asking the sun to rise. He begins to ask it to stay.",
  },
  {
    id: "lightbearer/sunblade-mastery",
    hero: "lightbearer",
    kind: "mastery",
    cardCategory: "ladder-upgrade",
    masteryTier: 3,
    upgradesAbilities: ["Solar Blade", "Divine Ray"],
    name: "Sunblade Mastery",
    cost: 3,
    text: "Permanent. Solar Blade: 9 ub, +2 dmg per Verdict stripped. Divine Ray: 11 dmg, +3 Verdict.",
    trigger: { kind: "manual" },
    effect: {
      kind: "compound",
      effects: [
        {
          kind: "ability-upgrade",
          scope: { kind: "ability-ids", ids: ["Solar Blade"] },
          modifications: [
            { field: "base-damage", operation: "set", value: 9 },
            { field: "damage-conditional-bonus-bonus-per-unit", operation: "set", value: 2 },
          ],
          permanent: true,
        },
        {
          kind: "ability-upgrade",
          scope: { kind: "ability-ids", ids: ["Divine Ray"] },
          modifications: [
            { field: "base-damage", operation: "set", value: 11 },
            { field: "applied-status-stacks", operation: "set", value: 3 },
          ],
          permanent: true,
        },
      ],
    },
    flavor: "Light remembers everything it has touched.",
  },
  {
    id: "lightbearer/cathedral-light",
    hero: "lightbearer",
    kind: "mastery",
    cardCategory: "ladder-upgrade",
    masteryTier: "defensive",
    upgradesAbilities: ["Dawn-Ward", "Prayer of Shielding", "Wall of Dawn"],
    name: "Cathedral Light",
    cost: 3,
    text: "Permanent. Dawn-Ward: heal 6 (+2 Radiance with 3+ dawn). Prayer of Shielding: -7 dmg, +2 Radiance. Wall of Dawn: -10 dmg (+1 Radiance with 4+ sun).",
    trigger: { kind: "manual" },
    effect: {
      kind: "compound",
      effects: [
        // Dawn-Ward — heal 4→6 + activate inert Radiance gain (0→2).
        {
          kind: "ability-upgrade",
          scope: { kind: "ability-ids", ids: ["Dawn-Ward"] },
          modifications: [
            { field: "heal-amount", operation: "set", value: 6 },
            { field: "passive-counter-gain-amount", operation: "set", value: 2 },
          ],
          permanent: true,
        },
        // Prayer of Shielding — reduction 5→7, Radiance gain 1→2.
        {
          kind: "ability-upgrade",
          scope: { kind: "ability-ids", ids: ["Prayer of Shielding"] },
          modifications: [
            { field: "reduce-damage-amount", operation: "set", value: 7 },
            { field: "passive-counter-gain-amount", operation: "set", value: 2 },
          ],
          permanent: true,
        },
        // Wall of Dawn — reduction 8→10 + activate inert Radiance gain (0→1).
        {
          kind: "ability-upgrade",
          scope: { kind: "ability-ids", ids: ["Wall of Dawn"] },
          modifications: [
            { field: "reduce-damage-amount", operation: "set", value: 10 },
            { field: "passive-counter-gain-amount", operation: "set", value: 1 },
          ],
          permanent: true,
        },
      ],
    },
    flavor: "The Cathedral remembers every prayer spoken in its walls.",
  },

  // ── Signature plays (5) ────────────────────────────────────────────────────
  {
    id: "lightbearer/sanctuary",
    hero: "lightbearer",
    kind: "main-phase",
    cardCategory: "signature",
    name: "Sanctuary",
    cost: 3,
    text: "Until your next turn, all incoming damage reduced by 2.",
    trigger: { kind: "manual" },
    effect: {
      kind: "persistent-buff",
      id: "sanctuary",
      pipelineModifier: {
        target: "incoming-damage",
        operation: "add",
        value: -2,
        cap: { min: 0 },
      },
      discardOn: { kind: "next-turn-of-self" },
    },
    flavor: "He plants the prayer in stone. The stone holds.",
  },
  {
    id: "lightbearer/dawnsong",
    hero: "lightbearer",
    kind: "main-phase",
    cardCategory: "signature",
    name: "Dawnsong",
    cost: 2,
    text: "Convert 2 Radiance tokens into +4 CP.",
    trigger: { kind: "manual" },
    playCondition: { kind: "passive-counter-min", passiveKey: "radiance", count: 2 },
    effect: {
      kind: "compound",
      effects: [
        // Per Clarification A — `operation: "add"` accepts negative values
        // for spend-style conversions; result clamps to ≥ 0.
        { kind: "passive-counter-modifier", passiveKey: "radiance", operation: "add", value: -2, respectsCap: true },
        { kind: "gain-cp", amount: 4 },
      ],
    },
    flavor: "Some songs are paid for in silver. His are paid for in light.",
  },
  {
    id: "lightbearer/aegis-of-dawn",
    hero: "lightbearer",
    kind: "instant",
    cardCategory: "signature",
    name: "Aegis of Dawn",
    cost: 4,
    text: "Once per match. When opponent fires a Tier 4 Ultimate, halve its damage (round up).",
    trigger: { kind: "opponent-fires-ability", tier: 4 },
    oncePerMatch: true,
    effect: {
      // §15.1 — multiplier mode; placeholder `amount: 0` (mode is set by
      // `multiplier`). Per Clarification B, the resolver injects the
      // computed reduction onto pendingAttack.injectedReduction so the
      // queued in-flight ultimate damage is modified before HP application.
      kind: "reduce-damage",
      amount: 0,
      multiplier: 0.5,
      rounding: "ceil",
    },
    flavor: "He has watched suns set on civilizations. One ultimate is not enough.",
  },
  {
    id: "lightbearer/vow-of-service",
    hero: "lightbearer",
    kind: "main-phase",
    cardCategory: "signature",
    name: "Vow of Service",
    cost: 3,
    text: "Until end of match, when defending with a Tier 2+ defensive ability, gain +2 Radiance instead of +1.",
    trigger: { kind: "manual" },
    // Implementation note (per spec): expressed as an `ability-upgrade`
    // targeting `passive-counter-gain-amount` with scope `all-defenses`
    // gated by `defense-tier-min: 2`. The `triggerModifier` form was the
    // spec's first-class proposal, but Lightbearer's Radiance gains live
    // INSIDE the defense's effect compound (not on `cpGainTriggers[]`),
    // so the ability-upgrade form is the correct lever. Mechanical
    // outcome is identical.
    effect: {
      kind: "persistent-buff",
      id: "vow-of-service",
      scope: { kind: "all-defenses" },
      modifier: {
        field: "passive-counter-gain-amount",
        operation: "set",
        value: 2,
        conditional: { kind: "defense-tier-min", tier: 2 },
      },
      discardOn: { kind: "match-ends" },
    },
    flavor: "He vowed it once at thirty, before the Cathedral fell. He keeps it now.",
  },
  {
    id: "lightbearer/sunburst",
    hero: "lightbearer",
    kind: "roll-phase",
    cardCategory: "signature",
    name: "Sunburst",
    cost: 2,
    text: "Once per match. This turn only, your Dawnblade and Sun Strike each deal +2 damage and auto-fire on any sword.",
    trigger: { kind: "manual" },
    oncePerMatch: true,
    effect: {
      kind: "compound",
      effects: [
        // §15.6 combo-override: relax the combo to 1+ sword for both abilities.
        {
          kind: "combo-override",
          scope: { kind: "ability-ids", ids: ["Dawnblade", "Sun Strike"] },
          override: { kind: "symbol-count", symbol: "lightbearer:sword", count: 1 },
          duration: "this-turn",
        },
        // +2 base damage on both. discardOn end-of-self-turn drops at the
        // end of Lightbearer's current turn (§15.5).
        {
          kind: "persistent-buff",
          id: "sunburst-damage",
          scope: { kind: "ability-ids", ids: ["Dawnblade", "Sun Strike"] },
          modifier: { field: "base-damage", operation: "add", value: 2 },
          discardOn: { kind: "end-of-self-turn" },
        },
      ],
    },
    flavor: "Sometimes the dawn breaks twice in one day.",
  },
];
