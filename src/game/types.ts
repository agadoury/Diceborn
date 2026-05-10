/**
 * Diceborn — engine type contract.
 *
 * Pure TypeScript. No React, no DOM. Runs in Node.
 * Every state mutation flows through `applyAction(state, action) => { state, events }`
 * (see engine.ts). Presentation never reaches in here; it reacts to `events`.
 */

// ── IDs & primitives ────────────────────────────────────────────────────────
export type HeroId      = string;             // open — heroes register their IDs in content/index.ts
export type PlayerId    = "p1" | "p2";
export type CardId      = string;     // e.g. "myhero/some-card"
export type SymbolId    = string;     // hero-scoped, e.g. "myhero:axe"
export type StatusId    = string;     // e.g. "burn", "bleeding"
export type AbilityTier = 1 | 2 | 3 | 4;

export type Phase =
  | "pre-match"
  | "upkeep" | "income"
  | "main-pre" | "offensive-roll" | "defensive-roll" | "main-post"
  | "discard" | "match-end";

// ── Dice ────────────────────────────────────────────────────────────────────
export interface DieFace {
  /** Numeric face value 1..6. Used for n-of-a-kind and straight evaluation. */
  faceValue: 1 | 2 | 3 | 4 | 5 | 6;
  symbol: SymbolId;
  label: string;
}

export interface Die {
  index: 0 | 1 | 2 | 3 | 4;
  faces: readonly DieFace[];                    // length 6, hero-defined
  current: number;                              // index into faces
  locked: boolean;
}

// ── Combo grammar ───────────────────────────────────────────────────────────
// Per spec Correction 1, the canonical kinds are symbol-count, n-of-a-kind,
// straight, and compound. Older kinds (matching, matching-any, at-least,
// any-of, specific-set) are retained for backward compatibility — symbol-count
// is functionally equivalent to at-least. Migration of existing hero data
// happens per-hero; new content uses the canonical kinds.
export type DiceCombo =
  | { kind: "symbol-count";   symbol: SymbolId; count: number }   // canonical: N+ dice with this symbol
  | { kind: "n-of-a-kind";    count: 2 | 3 | 4 | 5 }              // canonical: N dice sharing one face value
  | { kind: "straight";       length: 4 | 5 | number }            // canonical: small/large straight
  | { kind: "compound";       op: "and" | "or"; clauses: DiceCombo[] }
  // ── Legacy kinds (still supported) ────────────────────────────────────────
  | { kind: "matching";       symbol: SymbolId; count: number }
  | { kind: "matching-any";   count: number }
  | { kind: "specific-set";   symbols: SymbolId[] }
  | { kind: "at-least";       symbol: SymbolId; count: number }
  | { kind: "any-of";         symbols: SymbolId[]; count: number };

// ── Effects ─────────────────────────────────────────────────────────────────
export type DamageType =
  | "normal" | "undefendable" | "pure" | "collateral" | "ultimate";

/** State-check predicates used by conditional damage modifiers + critical
 *  ultimate evaluation. Each kind is a one-shot inspection of game state. */
export type StateCheck =
  | { kind: "always" }                                          // unconditional — pairs with sources like "damage-prevented-amount"
  | { kind: "opponent-has-status-min"; status: StatusId; count: number }
  | { kind: "self-has-status-min";     status: StatusId; count: number }
  | { kind: "self-stripped-status";    status: StatusId }      // set by remove-status; consumed by reader
  | { kind: "self-low-hp" }
  | { kind: "passive-counter-min";     passiveKey: string; count: number }
  | { kind: "combo-symbol-count";      symbol: SymbolId; count: number }   // counts on firingFaces
  | { kind: "combo-n-of-a-kind";       count: number }
  | { kind: "combo-straight";          length: number }                    // longest contiguous run on firingFaces ≥ length
  /** True when the firing defensive ability's tier is ≥ the stated tier.
   *  Used by `triggerModifier.condition` to gate "Tier 2+ defenses gain
   *  bonus Radiance" (Vow of Service) and similar selectors. Evaluates
   *  to false outside a defensive resolution context. */
  | { kind: "defense-tier-min";        tier: AbilityTier };

/** How to count a "source" of bonus when a conditional fires. */
export type ConditionalSource =
  | "opponent-status-stacks"        // count of the named status on opponent
  | "self-status-stacks"
  | "stripped-stack-count"          // stacks removed in the most-recent strip-event
  | "self-passive-counter"          // signatureState[passiveKey]
  | "opponent-passive-counter"      // opponent's signatureState[passiveKey]
  | "damage-prevented-amount"       // damage reduced in the just-resolved reduce-damage effect
  | "fixed-one";

/** Conditional bonus stamped onto effects that scale with game state.
 *  Applies to: damage / scaling-damage (added to amount), heal (added to
 *  amount), reduce-damage (added to amount), apply-status (added to stacks). */
export interface ConditionalBonus {
  condition: StateCheck;
  bonusPerUnit: number;
  source: ConditionalSource;
  /** Optional: override which passive / status the source counts. Defaults
   *  to the condition's status / passiveKey if applicable. */
  sourceStatus?: StatusId;
  sourcePassiveKey?: string;
}

/** Optional override of damage type on a per-resolution basis (e.g. Cleave
 *  Mastery makes Cleave undefendable when 4+ axes show). */
export interface ConditionalTypeOverride {
  condition: StateCheck;
  overrideTo: DamageType;
}

/** Modifications applied to abilities by the `ability-upgrade` effect. */
/** Canonical Mastery / persistent-buff field-name whitelist. Each value
 *  maps to a specific named path in the effect tree (or signature-token
 *  def for `target: <token-id>` persistent-buffs).
 *
 *  Damage / scaling-damage:
 *    "base-damage" / "scaling-damage-base" / "scaling-damage-per-extra"
 *    "scaling-damage-max-extra" / "damage-type" / "damage-self-cost"
 *    "damage-conditional-bonus-bonus-per-unit"
 *
 *  Heal:
 *    "heal-amount" / "self-heal-amount" / "heal-conditional-bonus"
 *
 *  Reduce-damage:
 *    "reduce-damage-amount" / "reduce-damage-negate-attack"
 *    "reduce-damage-apply-to-attacker-stacks"
 *    "reduce-damage-apply-to-attacker-status"
 *
 *  Apply-status / remove-status:
 *    "applied-status-stacks"             — for opponent-target apply-status
 *    "applied-status-stacks-self"        — for self-target apply-status
 *    "applied-status-stacks-on-success"  — defense-success-gated apply-status
 *    "applied-status-conditional-bonus"  — apply-status.conditional_bonus.bonusPerUnit
 *    "removed-status-stacks"             — remove-status.stacks
 *
 *  Bonus dice:
 *    "bonus-dice-count" / "bonus-dice-threshold"
 *
 *  Defense-only:
 *    "defenseDiceCount"
 *
 *  Signature-token (via `persistent-buff` with `target: <StatusId>`):
 *    "detonation-amount" / "detonation-threshold"
 *    "passive-modifier-value-per-stack" / "stack-limit"
 */
export type AbilityUpgradeField =
  | "base-damage" | "scaling-damage-base" | "scaling-damage-per-extra" | "scaling-damage-max-extra"
  | "damage-type" | "self-cost" | "damage-self-cost"
  | "damage-conditional-bonus" | "damage-conditional-bonus-bonus-per-unit"
  | "heal-amount" | "self-heal-amount" | "heal-conditional-bonus"
  | "applied-status-stacks" | "applied-status-stacks-self" | "applied-status-stacks-on-success"
  | "applied-status-conditional-bonus"
  | "removed-status-stacks"
  | "passive-counter-gain-amount"
  | "reduce-damage-amount" | "reduce-damage-negate-attack"
  | "reduce-damage-apply-to-attacker-stacks" | "reduce-damage-apply-to-attacker-status"
  | "bonus-dice-count" | "bonus-dice-threshold"
  | "defenseDiceCount"
  | "detonation-amount" | "detonation-threshold"
  | "passive-modifier-value-per-stack" | "stack-limit";

export interface AbilityUpgradeMod {
  field: AbilityUpgradeField;
  operation: "set" | "add" | "multiply";
  /** Numeric for most fields; a `DamageType` string for `damage-type`; the
   *  full `ConditionalBonus` object for `damage-conditional-bonus` /
   *  `applied-status-conditional-bonus` (so a Mastery can stamp an entire
   *  conditional_bonus structure onto an ability that doesn't ship with one). */
  value: number | string | ConditionalBonus;
  /** If present, the modification only applies when this state-check holds at
   *  the moment the ability resolves (e.g. "Cleave +2 dmg when 4+ axes"). */
  conditional?: StateCheck;
}

export type AbilityScope =
  | { kind: "ability-ids"; ids: string[] }   // names match ability.name (case-insensitive)
  | { kind: "all-tier";    tier: AbilityTier }
  | { kind: "all-defenses" };

export type AbilityEffect =
  /** Direct damage. Optional self_cost: unblockable HP loss to the caster on
   *  resolution (does not trigger on-hit / Frenzy / Radiance gains). Optional
   *  conditional_bonus: per-unit bonus damage when a state check holds.
   *  Optional conditional_type_override: damage-type promotion (e.g. normal →
   *  undefendable) when a state check holds. */
  | { kind: "damage"; amount: number; type: DamageType;
      self_cost?: number;
      conditional_bonus?: ConditionalBonus;
      conditional_type_override?: ConditionalTypeOverride }
  /** Damage that scales with how many extra dice contribute beyond the
   *  combo's minimum. E.g. for symbol-count(sword,3): 3 swords = base,
   *  4 swords = base + perExtra, 5 swords = base + 2*perExtra. Capped by
   *  maxExtra (typically 2 since 5 dice − 3 minimum = 2 extras). Same
   *  conditional fields as `damage`. */
  | { kind: "scaling-damage"; baseAmount: number; perExtra: number; maxExtra: number; type: DamageType;
      self_cost?: number;
      conditional_bonus?: ConditionalBonus;
      conditional_type_override?: ConditionalTypeOverride }
  /** Defensive: reduce incoming damage by this amount during the current
   *  defensive roll, OR (when `negate_attack: true`) reduce to 0 regardless
   *  of incoming, OR (when `multiplier` is set) reduce incoming by a
   *  fractional amount — `incoming - round(incoming × multiplier)`.
   *  `amount`, `multiplier`, and `negate_attack` are mutually exclusive;
   *  exactly one must be set (with `amount: 0` as the conventional inert
   *  marker when only `negate_attack` or `multiplier` matters).
   *  `rounding` is only meaningful when `multiplier` is set; defaults to
   *  `"ceil"` (round in the attacker's favour — more damage gets through).
   *  Optional `apply_to_attacker` reflects a status onto the attacker
   *  after the reduction lands. Optional `conditional_bonus` adds
   *  per-unit bonus to `amount` (ignored when `multiplier` /
   *  `negate_attack` resolves the reduction). */
  | { kind: "reduce-damage"; amount: number;
      multiplier?: number;
      rounding?: "ceil" | "floor";
      conditional_bonus?: ConditionalBonus;
      negate_attack?: true;
      apply_to_attacker?: {
        status: StatusId;
        stacks: number;
        conditional_bonus?: ConditionalBonus;
      } }
  /** Apply N stacks of a status. Optional conditional_bonus: per-unit bonus
   *  stacks when a state check holds (added to base `stacks`). */
  | { kind: "apply-status"; status: StatusId; stacks: number; target: "self" | "opponent";
      conditional_bonus?: ConditionalBonus }
  /** Remove stacks of a status from a target. `status` may be a specific
   *  StatusId or one of the wildcard categories (`any-debuff` / `any-buff` /
   *  `any-status`); the legacy `any-positive` is retained as an alias of
   *  `any-buff`. `stacks: "all"` strips every stack of the resolved status;
   *  a finite count strips that many. `selection` only matters when the
   *  wildcard could resolve to multiple statuses — defaults to
   *  `"player-choice"` (a UI prompt would surface; the engine falls back
   *  to deterministic first-found resolution if no UI input arrives). */
  | { kind: "remove-status";
      status: StatusId | "any-positive" | "any-debuff" | "any-buff" | "any-status";
      stacks: number | "all";
      target: "self" | "opponent";
      selection?: "player-choice" | "highest-stack" | "lowest-stack" | "longest-active" }
  /** Heal N HP on self/opponent. Optional conditional_bonus: per-unit bonus
   *  heal when a state check holds (added to base `amount`). */
  | { kind: "heal"; amount: number; target: "self" | "opponent";
      conditional_bonus?: ConditionalBonus }
  | { kind: "gain-cp"; amount: number }
  | { kind: "draw"; amount: number }
  | { kind: "compound"; effects: AbilityEffect[] }
  // ── New primitives (Correction 6 — absorbed common patterns) ─────────────
  /** Set N dice to a specific face. Filter selects which dice are eligible:
   *  "any" picks any unlocked dice; "specific-symbol" only dice currently
   *  showing the named symbol; "specific-face" only dice currently on the
   *  named face value. The chosen face may be specified by symbol or value. */
  | { kind: "set-die-face"; count: number;
      filter: "any" | { kind: "specific-symbol"; symbol: SymbolId } | { kind: "specific-face"; faceValue: 1|2|3|4|5|6 };
      /** When `target.kind === "face"` and `faceValue` is omitted, the player
       *  picks the face value at play time via the action's `targetFaceValue`
       *  field. This is how cards like Iron Focus / Last Stand surface a face
       *  picker. */
      target: { kind: "symbol"; symbol: SymbolId } | { kind: "face"; faceValue?: 1|2|3|4|5|6 };
      /** When true, dice set by this effect are also locked. Used by Last
       *  Stand so the chosen face survives any remaining roll attempts. */
      lockAfter?: boolean }
  /** Reroll a filtered subset of the caster's dice once. Optionally ignores
   *  per-die locks. `on_attempt: "not-final"` means "only useable while
   *  rollAttemptsRemaining > 0" — informational; canPlay enforces. */
  | { kind: "reroll-dice"; filter: "all" | "not-locked" | { kind: "not-showing-symbols"; symbols: SymbolId[] };
      ignoresLock?: boolean; on_attempt?: "any" | "not-final" }
  /** Temporarily count one symbol as another for combo-evaluation purposes.
   *  Persists for one of: this-roll, this-turn, until a status is applied/
   *  removed. The bend is one-directional (from_symbol ⇒ to_symbol). */
  | { kind: "face-symbol-bend"; from_symbol: SymbolId; to_symbol: SymbolId;
      duration: "this-roll" | "this-turn" | { kind: "until-status"; status: StatusId; on: "applied" | "removed" } }
  /** Persistent ability modifier — match-long unless discarded. Occupies a
   *  Hero Upgrade slot when `permanent: true`; otherwise lasts to end of turn.
   *
   *  Four composable operations:
   *   - "transform" mode (default):
   *      - `modifications`: field tweaks (today's Mastery model)
   *      - `additionalEffects`: append new sub-effects (heal/status/etc on hit)
   *      - `repeat`: run the resolved effect N times in sequence (hits twice)
   *   - "replace" mode: `replacement` swaps the ability wholesale (different
   *     combo, effect, name). Short-circuits the transform pipeline. */
  | { kind: "ability-upgrade"; scope: AbilityScope;
      mode?: "transform" | "replace";
      modifications?: AbilityUpgradeMod[];
      additionalEffects?: AbilityEffect[];
      repeat?: number;
      replacement?: ReplacementAbilityDef;
      permanent: boolean }
  /** Direct manipulation of a signature passive counter (e.g. War Cry adds
   *  +3 Frenzy without the "must take damage" trigger). `value` may be
   *  negative for spend-style conversions (e.g. Dawnsong burns 2 Radiance
   *  for +4 CP — see Clarification A in the engine update notes). When
   *  `conditional` is set the modifier only fires if the StateCheck holds
   *  at resolution time (used by combo-gated Mastery effects like
   *  Cathedral Light's "+1 Radiance on 4+ sun"). */
  | { kind: "passive-counter-modifier"; passiveKey: string; operation: "add" | "set"; value: number; respectsCap?: boolean;
      conditional?: StateCheck }
  /** Force the caster's dice to count as a specific face (and its associated
   *  symbol) for combo evaluation until end of turn. When `faceValue` is
   *  omitted, the player's `targetFaceValue` from the play-card action is
   *  used. Survives rerolls. */
  | { kind: "force-face-value"; faceValue?: 1|2|3|4|5|6; duration: "this-turn" }
  /** When an Instant card with trigger `opponent-attempts-remove-status`
   *  fires, this effect cancels the queued removal so the stacks stay
   *  intact. No-op outside that context. */
  | { kind: "prevent-pending-status-removal" }
  /** Match-long buff applied immediately. Exactly one of the three modifier
   *  shapes must be set:
   *
   *  - `modifier` (existing) — modifies ability output per `AbilityUpgradeMod`.
   *    Pair with `scope` (offensive / defensive ability matcher) or `target`
   *    (signature-token-id, patches the token's mechanical fields per-player —
   *    used by Crater Wind to bump Cinder's detonation amount mid-match).
   *  - `pipelineModifier` (NEW §15.3) — modifies the damage pipeline
   *    directly: incoming-damage / outgoing-damage / status-tick-damage by
   *    add or multiply. Sanctuary's "all incoming damage reduced by 2 until
   *    your next turn" expresses with `target: "incoming-damage"`,
   *    `operation: "add"`, `value: -2`, `cap: { min: 0 }`.
   *  - `triggerModifier` (NEW §15.4) — modifies how much a hero's
   *    `cpGainTriggers[]` entry grants when it fires. Vow of Service's
   *    "successful Tier 2+ defense gains +2 Radiance instead of +1"
   *    expresses with `triggerEvent: "successfulDefense"`, `operation: "set"`,
   *    `value: 2`, `targetField: "gain"`, `condition: { kind: "defense-tier-min", tier: 2 }`. */
  | { kind: "persistent-buff"; id: string;
      modifier?: AbilityUpgradeMod;
      pipelineModifier?: PipelineModifier;
      triggerModifier?: TriggerModifier;
      scope?: AbilityScope;
      target?: StatusId;
      discardOn?: DiscardTrigger }
  /** Combo relaxation (§15.6). While active, abilities matching `scope`
   *  evaluate against `override` instead of their declared combo. Distinct
   *  from `face-symbol-bend` (which rewrites symbols on dice); this rewrites
   *  the combo requirement itself. Sunburst expresses as
   *  `scope: { kind: "ability-ids", ids: ["Dawnblade", "Sun Strike"] }`,
   *  `override: { kind: "symbol-count", symbol: "lightbearer:sword", count: 1 }`,
   *  `duration: "this-turn"`. */
  | { kind: "combo-override"; scope: AbilityScope; override: DiceCombo;
      duration: "this-turn" | "this-roll" | { kind: "until-status"; status: StatusId; on: "applied" | "removed" } }
  /** Roll N additional dice (using the caster's hero faces) and deal damage
   *  derived from the rolled faces. */
  | { kind: "bonus-dice-damage"; bonusDice: number;
      damageFormula: "sum-of-faces" | "highest-face" | { kind: "count-symbol"; symbol: SymbolId };
      type: DamageType;
      thresholdBonus?: { threshold: number; bonus: AbilityEffect } }
  | { kind: "custom"; id: string };       // last-resort escape hatch — cards.ts registry

// ── Abilities ───────────────────────────────────────────────────────────────

/** Tier 4 Ultimates can declare a more-restrictive variant that fires on
 *  a special dice arrangement and produces an enhanced cinematic and/or
 *  mechanical bonus. `cosmetic-only` crits change only the visual treatment;
 *  mechanical crits modify damage or add effects. */
export interface CriticalEffect {
  cosmeticOnly?: boolean;
  /** Multiplier or absolute override of the base damage (mutually exclusive). */
  damageMultiplier?: number;
  damageOverride?: number;
  /** Extra effects that resolve in addition to the base. */
  effectAdditions?: AbilityEffect[];
  /** Override how a bankable passive is consumed (e.g. Radiance bonus +4
   *  dmg / +2 heal each instead of +2 / +1). Hero-specific; engine reads
   *  the values from signatureMechanic.implementation.spendOptions when
   *  resolving. */
  consumeModifierBonus?: number;
}

export interface AbilityDef {
  tier: AbilityTier;
  name: string;
  combo: DiceCombo;
  effect: AbilityEffect;
  shortText: string;
  longText: string;
  damageType: DamageType;
  targetLandingRate: [number, number];  // used by simulate.ts for tuning audit
  /** Defensive ladder only: how many dice the defender rolls when this defense
   *  is chosen. Single roll, no rerolls, no locking. Default 3 if unspecified.
   *  Offensive abilities ignore this field — they always roll 5 with rerolls. */
  defenseDiceCount?: 2 | 3 | 4 | 5;

  // ── Critical Ultimate (Tier 4 only) ───────────────────────────────────────
  /** Optional more-restrictive combo than the base `combo`. When this
   *  matches in addition to the base combo, the ability fires with the
   *  Critical effect and the choreographer is told to play the enhanced
   *  cinematic. Validation expects criticalCondition to imply combo. */
  criticalCondition?: DiceCombo;
  criticalEffect?: CriticalEffect;
  /** Free-form brief for the choreographer / cinematic system. */
  criticalCinematic?: string;
  /** Distinguish T4 "career-moment" abilities from standard T4 for the
   *  simulator's tuning bands (1–5% landing instead of 8–25%). */
  ultimateBand?: "standard" | "career-moment";

  // ── Defensive offensive_fallback ──────────────────────────────────────────
  /** Defensive-ladder only: when the caster's offensive turn ends with no
   *  ability landed, this defense can fire as a consolation (e.g. Bloodoath
   *  heals 4 + grants 1 Frenzy when offense whiffs). The fallback rolls
   *  `diceCount` dice and applies `effect` if the combo lands. */
  offensiveFallback?: {
    diceCount?: 2 | 3 | 4 | 5;
    /** If unspecified, reuses `combo` from the parent AbilityDef. */
    combo?: DiceCombo;
    effect: AbilityEffect;
  };
}

/** Ability shape used by ladder-upgrade cards in "replace" mode. A subset of
 *  `AbilityDef` — just enough to fully redefine an ability slot at runtime.
 *  No critical/T4 fields because replacements only target T1/T2/T3 + defensive.
 *  When the replacement targets a defensive slot, `offensiveFallback` may be
 *  declared so the swapped defense still surfaces in the fallback path. */
export interface ReplacementAbilityDef {
  name: string;
  combo: DiceCombo;
  effect: AbilityEffect;
  shortText: string;
  longText: string;
  damageType: DamageType;
  targetLandingRate?: [number, number];
  defenseDiceCount?: 2 | 3 | 4 | 5;
  offensiveFallback?: AbilityDef["offensiveFallback"];
}

// ── Cards ───────────────────────────────────────────────────────────────────
// Canonical kinds: main-phase, roll-phase, instant, mastery. The legacy
// labels ("upgrade", "status", "main-action", "roll-action") are kept for
// existing data but new heroes should use canonical names.
export type CardKind =
  | "upgrade" | "main-action" | "roll-action" | "status"   // legacy
  | "main-phase" | "roll-phase" | "instant"                // canonical
  | "mastery";                                              // persistent per-tier ability upgrade

/** Structured Instant trigger taxonomy (Section 5 of Correction 6). The
 *  choreographer's instant-prompt path inspects each playable Instant's
 *  trigger to decide whether the just-played event qualifies. */
export type CardTrigger =
  | { kind: "manual" }
  // ── Instant triggers ────────────────────────────────────────────────────
  | { kind: "self-takes-damage"; from?: "offensive-ability" | "status-tick" | "self-cost" | "any" }
  | { kind: "self-attacked"; tier?: AbilityTier | "any" }
  | { kind: "opponent-fires-ability"; tier?: AbilityTier | "any" }
  | { kind: "opponent-removes-status"; status: StatusId }
  | { kind: "opponent-applies-status"; status: StatusId }
  | { kind: "self-ability-resolved"; tier?: AbilityTier | "any" }
  | { kind: "match-state-threshold"; metric: "self-hp" | "opponent-hp"; op: "<=" | ">="; value: number }
  /** Pre-removal interception. Fires BEFORE the queued removal resolves so an
   *  Instant can `prevent-pending-status-removal` to keep the stacks intact
   *  while still punishing the attempt. Distinct from
   *  `opponent-removes-status` which fires AFTER removal completes. */
  | { kind: "opponent-attempts-remove-status"; status: StatusId }
  // ── Legacy triggers (still accepted) ────────────────────────────────────
  | { kind: "on-symbol-rolled"; symbol: SymbolId | "*:ult"; by: "self" | "opponent" }
  | { kind: "on-tier-fired";    tier: AbilityTier; by: "self" | "opponent" };

/** Collection-level categorization used by the deck builder + validator.
 *  Orthogonal to `kind`: `kind` drives engine dispatch (phase gating, slot
 *  occupation), while `cardCategory` drives deck-composition rules (4 generic /
 *  3 dice-manip / 3 ladder-upgrade / 2 signature = 12 total). */
export type CardCategory = "generic" | "dice-manip" | "ladder-upgrade" | "signature";

export interface Card {
  id: CardId;
  hero: HeroId | "generic";
  kind: CardKind;
  cardCategory: CardCategory;
  name: string;
  cost: number;
  text: string;
  trigger: CardTrigger;
  effect: AbilityEffect;
  /** Optional gating, evaluated against game state at play-time. */
  playable?: { minHpFraction?: number; maxHpFraction?: number };
  /** Richer play-time gate. Currently `match-state-threshold` covers HP
   *  thresholds and `incoming-attack-damage-type` gates Instants on the
   *  pendingAttack's damage type (Phoenix Veil — "not Ultimate"). */
  playCondition?:
    | { kind: "match-state-threshold"; metric: "self-hp" | "opponent-hp"; op: "<=" | ">="; value: number }
    | { kind: "incoming-attack-damage-type"; op: "is" | "is-not"; value: DamageType }
    /** Gate the play on the caster's bankable-passive counter — Dawnsong
     *  burns 2 Radiance for +4 CP and is unplayable below 2 Radiance. */
    | { kind: "passive-counter-min"; passiveKey: string; count: number };
  /** When true, the card may only be played a single time per match. The
   *  engine records the cardId in `consumedOncePerMatchCards` on play. */
  oncePerMatch?: boolean;
  /** When true, the card may only be played once per turn. The engine
   *  records the cardId in `consumedOncePerTurnCards` and clears the list
   *  at `passTurn`. */
  oncePerTurn?: boolean;
  // ── Mastery-only fields ──────────────────────────────────────────────────
  /** Required for `kind: "mastery"`. Which tier the mastery upgrades.
   *  T4 ultimates intentionally have no mastery — power lives at the curve
   *  peak. */
  masteryTier?: 1 | 2 | 3 | "defensive";
  /** Validator helper: which abilities this mastery's `ability-upgrade`
   *  effect is intended to modify. The runtime reads the `ability-upgrade`
   *  effect's `scope`; this field is for ingestion-time sanity checks. */
  upgradesAbilities?: string[] | "all-tier-1" | "all-tier-2" | "all-tier-3" | "all-defenses";
  /** When true, playing the card occupies a Hero Upgrade slot for the
   *  remainder of the match. Default true for `mastery` cards. */
  occupiesSlot?: boolean;
  // ── Presentation (optional) ──────────────────────────────────────────────
  flavor?: string;
  fx?: string;
}

// ── Hero definition (the four uniqueness pillars) ───────────────────────────

/** CP gain triggers + a richer enumeration of common patterns. The legacy
 *  shapes (`abilityLanded`, `statusTicked`, `successfulDefense`) remain;
 *  new triggers cover detonations, stacks-stripped, attacked-with-status. */
export type PassiveTrigger = {
  on:
    | "abilityLanded"
    | "successfulDefense"
    | "selfStatusDetonated"             // payload: { status }
    | "opponentRemovedSelfStatus"       // payload: { status }, multiplied by stripped-stack-count when perStack
    | "opponentAttackedWithStatusActive" // payload: { status }
    | "selfTokenTick"                   // payload: { status }
    | "statusTicked";                   // legacy: payload: { status, on_target }
  status?: StatusId;
  on_target?: "opponent" | "self";
  gain: number;
  /** When true, multiply `gain` by the relevant stack count (e.g.
   *  +1 CP per Cinder stack stripped). */
  perStack?: boolean;
  /** Cap (defaults to global CP_CAP). */
  capAt?: number;
};

/** Spend mode declaration on a bankable signature passive (e.g. Radiance).
 *  The player can spend N tokens at the listed `context` for the given
 *  effect. The engine dispatches the offer at the relevant moment and
 *  consumes tokens out of `signatureState[passiveKey]`. */
export interface PassiveSpendOption {
  context: "offensive-resolution" | "defensive-resolution" | "main-phase-on-demand";
  /** Cost is "N tokens" — typically 1, sometimes 2. */
  costPerUnit: number;
  /** Effect resolved per N tokens spent. Use AbilityEffect or a modifier. */
  effect: AbilityEffect | { kind: "damage-bonus"; perUnit: number } | { kind: "heal-self"; perUnit: number } | { kind: "reduce-incoming"; perUnit: number };
  canSpendPartial?: boolean;
}

/** Open shape — each hero declares its own kind + parameters. The engine
 *  reads the well-known optional fields below; everything else is hero-
 *  specific and dispatched by signatureState[]. */
export type PassiveBehavior = {
  kind: string;
  /** Key into `signatureState` where the bankable counter lives (e.g. "radiance"). */
  passiveKey?: string;
  /** Starting value of the bankable counter at match start. */
  bankStartsAt?: number;
  /** Cap on the bankable counter; defaults to no cap. */
  bankCap?: number;
  /** Spend modes available to the player. */
  spendOptions?: PassiveSpendOption[];
  [key: string]: unknown;
};

export interface HeroDefinition {
  id: HeroId;
  name: string;
  complexity: 1 | 2 | 3 | 4 | 5 | 6;
  accentColor: string;
  signatureQuote: string;
  archetype: "rush" | "control" | "burn" | "combo" | "survival";
  diceIdentity: { faces: readonly DieFace[]; fluffDescription: string }; // length 6
  resourceIdentity: { cpGainTriggers: PassiveTrigger[]; fluffDescription: string };
  signatureMechanic: { name: string; description: string; implementation: PassiveBehavior };
  /** Variable count — one or more abilities per tier. Engine picks the
   *  highest-tier matched ability to fire; if multiple match in the same
   *  tier, picks the highest-damage one. Older heroes ship with exactly
   *  4 entries (one per tier); newer heroes can declare 5-9 abilities
   *  spread across the four tiers. */
  abilityLadder: readonly AbilityDef[];
  /** Optional defensive ladder — auto-resolved during the Defensive Roll
   *  Phase. Same picker logic as the offensive ladder. */
  defensiveLadder?: readonly AbilityDef[];
  /** Pre-built starter deck, 12 conformant cards (4/3/3/2 by cardCategory).
   *  Used as the AI deck and as the default the deck builder offers when
   *  the player hasn't customised. Card ids must resolve via getCardCatalog. */
  recommendedDeck: ReadonlyArray<CardId>;
  /** Optional: applied to every successful offensive ability landed by this hero
   *  (e.g. Barbarian → Bleeding, Pyromancer → Smolder). */
  onHitApplyStatus?: { status: StatusId; stacks: number };
}

// ── Status tokens ───────────────────────────────────────────────────────────
export interface StatusInstance {
  id: StatusId;
  stacks: number;
  /** Player whose action originally applied the token (matters for Bleeding). */
  appliedBy: PlayerId;
}

// ── Transient runtime state (HeroSnapshot extensions) ──────────────────────

/** Discriminated union of every event that can drop a persistent buff
 *  (ability-modifier / pipeline / trigger / combo-override). Carried on
 *  the buff entry; evaluated by the engine when the matching event fires. */
export type DiscardTrigger =
  | { kind: "damage-taken-from-tier"; tier: AbilityTier }
  | { kind: "status-removed";         status: StatusId }
  | { kind: "match-ends" }
  /** Drops at the end of the buff-creator's CURRENT turn (the turn it was
   *  played on). Sunburst's "this turn only" buffs use this. (§15.5) */
  | { kind: "end-of-self-turn" }
  /** Drops at the end of the buff-creator's NEXT turn (after the opponent's
   *  reply turn). Sanctuary's "until your next turn" uses this. (§15.5) */
  | { kind: "next-turn-of-self" }
  /** Drops at the end of any turn. Rare; symmetric counterpart for
   *  scenarios where the buff should sunset regardless of who acts. (§15.5) */
  | { kind: "end-of-any-turn" };

/** Card-applied damage-pipeline modifier (§15.3). Aggregated by phases.ts
 *  alongside signature-token `passiveModifier` blocks. */
export interface PipelineModifier {
  target: "incoming-damage" | "outgoing-damage" | "status-tick-damage";
  operation: "add" | "multiply";
  value: number;
  cap?: { min?: number; max?: number };
}

/** Card-applied resource-trigger modifier (§15.4). When the matching
 *  `cpGainTrigger` fires, the dispatcher rewrites the configured field
 *  (`gain` or `perStack`) before crediting the resource. */
export interface TriggerModifier {
  /** Which `cpGainTrigger.on` this modifier targets. */
  triggerEvent: PassiveTrigger["on"];
  operation: "add" | "set" | "multiply";
  value: number;
  targetField: "gain" | "perStack";
  /** Optional gate evaluated when the trigger fires (e.g. defense-tier-min). */
  condition?: StateCheck;
}

/** Persistent ability modifier in flight on a player. Either applied by a
 *  played mastery card (`permanent: true`) or by a temporary effect.
 *  `discardOn` lets the engine remove the entry on a qualifying event.
 *  `creatorPlayer` + `creatorTurnsElapsed` (per §15.5) drive the
 *  turn-bounded discard variants — incremented when the creator's turn ends.
 *
 *  Carries the four operations supported by ladder upgrades — replacement
 *  short-circuits the transform pipeline; otherwise modifications + additional
 *  effects + repeat compose. */
export interface ActiveAbilityModifier {
  id: string;                   // unique within the snapshot; lets discardOn target it
  source: "mastery" | "card" | "ability";
  scope: AbilityScope;
  modifications: AbilityUpgradeMod[];
  /** Replacement-mode payload. When set, the matching ability is wholly
   *  replaced (combo + effect + name + damage type) before the transform
   *  pipeline runs. */
  replacement?: ReplacementAbilityDef;
  /** Transform-mode: append these sub-effects to the resolved ability's
   *  effect tree. Useful for "Cleave also heals 1" / "Cleave applies stun". */
  additionalEffects?: AbilityEffect[];
  /** Transform-mode: run the resolved effect this many times in sequence.
   *  Defaults to 1. `2` = "hits twice"; defensive reduction applies per hit,
   *  status stacks accumulate, heals stack. */
  repeat?: number;
  permanent: boolean;
  discardOn?: DiscardTrigger;
  /** PlayerId who created the buff. Used by turn-bounded discardOn. */
  creatorPlayer?: PlayerId;
  /** Number of times the creator's turn has ended since this buff was
   *  applied. Incremented at end-of-turn; consulted by `end-of-self-turn`
   *  (drops at 1) and `next-turn-of-self` (drops at 2). */
  creatorTurnsElapsed?: number;
}

/** A pipelineModifier currently in flight on a player. (§15.3) */
export interface ActivePipelineBuff {
  id: string;
  pipelineModifier: PipelineModifier;
  discardOn?: DiscardTrigger;
  creatorPlayer?: PlayerId;
  creatorTurnsElapsed?: number;
}

/** A triggerModifier currently in flight on a player. (§15.4) */
export interface ActiveTriggerBuff {
  id: string;
  triggerModifier: TriggerModifier;
  discardOn?: DiscardTrigger;
  creatorPlayer?: PlayerId;
  creatorTurnsElapsed?: number;
}

/** A combo-override currently in flight on a player. (§15.6) */
export interface ActiveComboOverride {
  id: string;
  scope: AbilityScope;
  override: DiceCombo;
  expires:
    | { kind: "this-roll";    appliedAtAttempt: number }
    | { kind: "this-turn";    appliedOnTurn: number }
    | { kind: "until-status"; status: StatusId; on: "applied" | "removed" };
}

/** Per-snapshot override of a registered status definition's mechanical
 *  fields. Created by `persistent-buff` effects whose `target` is a
 *  StatusId — e.g. Crater Wind boosts Cinder's `detonation.effect.amount`
 *  by patching `detonation-amount` here. Read by the status engine when
 *  it dispatches token logic for the player who owns the override. */
export interface TokenOverride {
  status: StatusId;
  modifications: AbilityUpgradeMod[];
}

/** A symbol bend currently in effect (face-symbol-bend). */
export interface ActiveSymbolBend {
  id: string;
  fromSymbol: SymbolId;
  toSymbol: SymbolId;
  expires:
    | { kind: "this-roll"; appliedAtAttempt: number }      // expires when roll attempts reset
    | { kind: "this-turn"; appliedOnTurn: number }
    | { kind: "until-status"; status: StatusId; on: "applied" | "removed" };
}

// ── Ladder live state (§4) ──────────────────────────────────────────────────
export type LadderRowState =
  | { kind: "firing";       tier: AbilityTier; lethal: boolean }
  | { kind: "triggered";    tier: AbilityTier; lethal: boolean }
  | { kind: "reachable";    tier: AbilityTier; probability: number; lethal: boolean }
  | { kind: "out-of-reach"; tier: AbilityTier };

// ── Hero snapshot ───────────────────────────────────────────────────────────
export interface HeroSnapshot {
  player: PlayerId;
  hero: HeroId;
  hp: number;
  hpStart: number;
  hpCap: number;             // start + 10
  cp: number;
  dice: Die[];               // length 5
  rollAttemptsRemaining: number;
  hand: Card[];
  deck: Card[];
  discard: Card[];
  statuses: StatusInstance[];
  upgrades: Record<AbilityTier, number>;
  /** Transient state for the signature mechanic — Rage stacks, Protect tokens, etc.
   *  Generic key-value bag so the engine doesn't need to know per-hero shapes. */
  signatureState: Record<string, number>;
  /** Variable length — matches the hero's abilityLadder length. */
  ladderState: LadderRowState[];
  isLowHp: boolean;
  /** Pending bonus to next offensive ability (e.g. Berserk Rush). */
  nextAbilityBonusDamage: number;
  /** Active ability modifiers (from masteries, persistent buffs, etc.). */
  abilityModifiers: ActiveAbilityModifier[];
  /** Active per-status token overrides (Crater Wind etc.). */
  tokenOverrides: TokenOverride[];
  /** Active face-symbol bends. */
  symbolBends: ActiveSymbolBend[];
  /** Active card-applied pipeline modifiers (Sanctuary etc.) — §15.3. */
  pipelineBuffs: ActivePipelineBuff[];
  /** Active card-applied trigger modifiers (Vow of Service etc.) — §15.4. */
  triggerBuffs: ActiveTriggerBuff[];
  /** Active combo-relaxation overrides (Sunburst etc.) — §15.6. */
  comboOverrides: ActiveComboOverride[];
  /** When set, the combo evaluator treats all of this hero's dice as the
   *  hero's `diceIdentity.faces[forcedFaceValue - 1]` regardless of the
   *  actual die state. Cleared at `passTurn`. Set by `force-face-value`
   *  (e.g. Last Stand). */
  forcedFaceValue?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Tracks the most-recent `remove-status` event by status id → stripped count.
   *  Reset at end of each phase. Read by ConditionalSource = "stripped-stack-count". */
  lastStripped: Record<StatusId, number>;
  /** True while a Mastery card is occupying the corresponding Hero Upgrade slot. */
  masterySlots: { 1?: CardId; 2?: CardId; 3?: CardId; defensive?: CardId };
  /** Card ids that have already been played this match for `oncePerMatch` cards.
   *  `canPlay` rejects further plays of any cardId in this list. */
  consumedOncePerMatchCards: CardId[];
  /** Card ids played this turn for `oncePerTurn` cards. Cleared at `passTurn`. */
  consumedOncePerTurnCards: CardId[];
}

// ── GameState (immutable; mutate only via applyAction) ──────────────────────
/** Held during the defensive flow: after the offensive ability is picked
 *  but before damage lands. Cleared once the defender's `select-defense`
 *  action resolves (or instantly, for undefendable / pure / ultimate). */
export interface PendingAttack {
  attacker: PlayerId;
  defender: PlayerId;
  /** Index into the attacker hero's `abilityLadder`. */
  abilityIndex: number;
  abilityName: string;
  tier: AbilityTier;
  damageType: DamageType;
  /** Pre-defense damage estimate (post crit + bonuses) — for the defender's
   *  selection overlay to show "incoming X damage". */
  incomingAmount: number;
  damageBonus: number;
  critFlat: number;
  critMul: number;
  isCritical: "minor" | "major" | false;
  /** True when the ability's `criticalCondition` matched (Tier 4 Critical
   *  Ultimate). The choreographer reads this to escalate the cinematic and
   *  the engine reads it to apply `criticalEffect`. */
  critTriggered: boolean;
  /** Snapshot of attacker's firing dice so scaling-damage can be computed
   *  after the defense resolves. */
  firingFaces: readonly DieFace[];
  /** Defensive reduction queued by card-context `reduce-damage` effects
   *  resolved between `attack-intended` and the defender's pick — most
   *  notably Phoenix-Veil-style Instants. Added to the final defensive
   *  reduction in `resolveDefenseChoice`. */
  injectedReduction?: number;
}

export interface GameState {
  rngSeed: number;
  rngCursor: number;
  turn: number;
  activePlayer: PlayerId;
  startPlayer: PlayerId;
  startPlayerSkippedFirstIncome: boolean;
  phase: Phase;
  players: Record<PlayerId, HeroSnapshot>;
  pendingCounter?: { card: Card; holder: PlayerId; expiresAt: number };
  /** A queued status removal awaiting the holder's interception response.
   *  Set when an opponent's `remove-status` effect targets the holder AND
   *  the holder has an Instant with a matching
   *  `opponent-attempts-remove-status` trigger in hand. The engine pauses
   *  for `respond-to-status-removal`; on accept the Instant resolves and
   *  may set `prevented`. The removal then either finalises or is dropped. */
  pendingStatusRemoval?: {
    holder: PlayerId;
    applier: PlayerId;
    status: StatusId;
    stacks: number;
    /** Set to true by `prevent-pending-status-removal` resolved from the
     *  matched Instant. */
    prevented?: boolean;
  };
  /** Offensive picker halt — set when the active player ends their offensive
   *  roll with one or more matching abilities. Cleared once the player
   *  dispatches `select-offensive-ability`. */
  pendingOffensiveChoice?: {
    attacker: PlayerId;
    defender: PlayerId;
    /** All abilities currently matched, sorted highest-tier-first then
     *  highest-base-damage-first. The UI lists them in this order. */
    matches: ReadonlyArray<{
      abilityIndex: number;
      abilityName: string;
      tier: AbilityTier;
      baseDamage: number;
      damageType: DamageType;
      shortText: string;
    }>;
  };
  /** Defensive flow halt — present while waiting for defender's `select-defense`. */
  pendingAttack?: PendingAttack;
  /** Bankable-passive spend prompt — set when the engine is about to resolve
   *  an effect where the player may opt to consume tokens (offensive vs.
   *  defensive spend modes are distinguished by `context`). */
  pendingBankSpend?: {
    holder: PlayerId;
    passiveKey: string;
    available: number;
    context: "offensive-resolution" | "defensive-resolution" | "main-phase-on-demand";
    /** The spend option being offered (engine resolves the effect on the
     *  number of tokens the player commits). */
    optionIndex: number;
  };
  /** Halted offensive-commit awaiting a `spend-bank` decision (Lightbearer's
   *  Radiance offers a spend option at offensive-resolution). When the
   *  player resolves the spend, the engine resumes by calling
   *  `commitOffensiveAbility` with this ability index. Cleared once the
   *  ability fires. */
  pendingOffensiveCommit?: {
    attacker: PlayerId;
    abilityIndex: number;
  };
  log: LogEntry[];
  winner?: PlayerId | "draw";
}

export interface LogEntry { turn: number; phase: Phase; text: string; t: number; }

// ── Actions ─────────────────────────────────────────────────────────────────
export type Action =
  | { kind: "start-match"; seed: number; p1: HeroId; p2: HeroId; coinFlipWinner: PlayerId;
      /** Optional custom decks per player. Each array is a 12-element list of
       *  CardIds that must resolve via getCardCatalog(heroId). When omitted,
       *  the engine falls back to that hero's recommendedDeck. */
      p1Deck?: ReadonlyArray<CardId>; p2Deck?: ReadonlyArray<CardId> }
  | { kind: "advance-phase" }
  | { kind: "toggle-die-lock"; die: 0 | 1 | 2 | 3 | 4 }
  | { kind: "roll-dice" }
  | { kind: "play-card"; card: CardId; targetDie?: 0 | 1 | 2 | 3 | 4; targetPlayer?: PlayerId;
      /** Explicit caster id. Required when both players hold the same
       *  card (mirror matches) and the engine needs to know which copy
       *  to consume — without it, `playCard` defaults to
       *  `state.activePlayer`, which is wrong for off-turn Instant
       *  responses. UI / AI drivers should set this whenever the
       *  intended caster differs from the active player. */
      casterPlayer?: PlayerId;
      /** Used by `set-die-face` effects whose target declares
       *  `{ kind: "face" }` without a faceValue — the UI surfaces a 1–6
       *  picker and forwards the choice here. */
      targetFaceValue?: 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: "sell-card"; card: CardId }
  | { kind: "end-turn" }
  | { kind: "respond-to-counter"; accept: boolean }
  /** Holder's response to a queued status-removal interception prompt.
   *  `cardId` (when set) names the Instant from the holder's hand to play.
   *  `null` declines: the queued removal proceeds normally. */
  | { kind: "respond-to-status-removal"; cardId: CardId | null }
  /** Active player's response to a `pendingOffensiveChoice`. `abilityIndex`
   *  is into the attacker's `abilityLadder`. `null` means "decline to fire"
   *  — the offensive turn fizzles (then `offensiveFallback` is checked). */
  | { kind: "select-offensive-ability"; abilityIndex: number | null }
  /** Defender's response to a `pendingAttack`. `abilityIndex` is into the
   *  defender hero's `defensiveLadder`; `null` means "take the hit
   *  undefended" (also used when the defender has no defenses available). */
  | { kind: "select-defense"; abilityIndex: number | null }
  /** Spend N tokens from a bankable signature passive (Lightbearer's
   *  Radiance, etc.). Only valid while `pendingBankSpend` is set. `amount`
   *  must be ≤ available counter and respects the spend option's costPerUnit. */
  | { kind: "spend-bank"; amount: number }
  | { kind: "decline-bank-spend" }
  /** Holder pays a configured cost (CP / HP / discard) to remove stacks of
   *  a status they carry — driven by the status definition's
   *  `holderRemovalActions[]` entries (§15.2). `actionIndex` selects which
   *  declared action to invoke when the token offers more than one.
   *  Only valid when the active phase matches the action's declared `phase`. */
  | { kind: "status-holder-action"; status: StatusId; actionIndex?: number }
  | { kind: "concede"; player: PlayerId };

// ── GameEvent (the choreography contract) ───────────────────────────────────
export type GameEvent =
  | { t: "match-started"; players: Record<PlayerId, HeroId>; startPlayer: PlayerId }
  | { t: "match-won"; winner: PlayerId | "draw" }
  | { t: "turn-started"; player: PlayerId; turn: number }
  | { t: "phase-changed"; player: PlayerId; from: Phase; to: Phase }
  | { t: "card-drawn"; player: PlayerId; cardId: CardId }
  | { t: "card-played"; player: PlayerId; cardId: CardId; target?: PlayerId | { die: number } }
  | { t: "card-sold"; player: PlayerId; cardId: CardId; cpGained: number }
  | { t: "card-discarded"; player: PlayerId; cardId: CardId }
  | { t: "cp-changed"; player: PlayerId; delta: number; total: number }
  | { t: "hp-changed"; player: PlayerId; delta: number; total: number }
  | { t: "dice-rolled"; player: PlayerId; dice: ReadonlyArray<{ index: number; current: number; symbol: SymbolId; locked: boolean }>; attemptNumber: number }
  | { t: "die-locked"; player: PlayerId; die: number; locked: boolean }
  | { t: "die-face-changed"; player: PlayerId; die: number; from: number; to: number; cause: "card" | "ability" }
  | { t: "ladder-state-changed"; player: PlayerId; rows: readonly LadderRowState[] }
  /** Player picker prompt — engine paused for active player to choose which
   *  matched offensive ability to fire. `matches` is sorted highest-tier-first
   *  then highest-base-damage-first; the player may also choose to pass. */
  | { t: "offensive-pick-prompt"; attacker: PlayerId; matches: ReadonlyArray<{ abilityIndex: number; abilityName: string; tier: AbilityTier; baseDamage: number; damageType: DamageType }> }
  /** Active player has chosen which ability to fire (or `null` = passed). */
  | { t: "offensive-choice-made"; attacker: PlayerId; abilityIndex: number | null; abilityName?: string }
  | { t: "ability-triggered"; player: PlayerId; tier: AbilityTier; abilityName: string; isCritical: "minor" | "major" | false }
  | { t: "ultimate-fired"; player: PlayerId; abilityName: string; isCritical: boolean }
  | { t: "damage-dealt"; from: PlayerId; to: PlayerId; amount: number; type: DamageType; mitigated: number }
  | { t: "heal-applied"; player: PlayerId; amount: number }
  /** Attack picked, paused for defender to choose their defense. */
  | { t: "attack-intended"; attacker: PlayerId; defender: PlayerId; abilityName: string; tier: AbilityTier; damageType: DamageType; incomingAmount: number; defendable: boolean }
  /** Defender has chosen which defense (or null = take-it-undefended). */
  | { t: "defense-intended"; defender: PlayerId; abilityIndex: number | null; abilityName?: string; diceCount?: number }
  /** Single defensive roll, no rerolls, no locking. */
  | { t: "defense-dice-rolled"; player: PlayerId; dice: ReadonlyArray<{ index: number; current: number; symbol: SymbolId }>; abilityName: string }
  | { t: "defense-resolved"; player: PlayerId; reduction: number; matchedTier?: AbilityTier; abilityName?: string; landed: boolean }
  | { t: "status-applied"; status: StatusId; holder: PlayerId; applier: PlayerId; stacks: number; total: number }
  | { t: "status-ticked"; status: StatusId; holder: PlayerId; effect: "damage" | "heal" | "decrement"; amount: number; stacksRemaining: number }
  | { t: "status-removed"; status: StatusId; holder: PlayerId; reason: "expired" | "stripped" | "ignited" }
  | { t: "status-triggered"; status: StatusId; holder: PlayerId; cause: string }
  | { t: "hero-state"; player: PlayerId; state: "idle" | "hit" | "defended" | "low-hp-enter" | "low-hp-exit" | "victorious" | "defeated" }
  | { t: "rage-changed"; player: PlayerId; stacks: number }
  | { t: "counter-prompt"; holder: PlayerId; cardId: CardId; expiresAt: number }
  | { t: "counter-resolved"; holder: PlayerId; cardId: CardId; accepted: boolean }
  /** Pre-removal pause. Fires when the engine has queued a status removal
   *  and the holder has at least one Instant whose
   *  `opponent-attempts-remove-status` trigger matches. */
  | { t: "status-remove-prompt"; holder: PlayerId; applier: PlayerId; status: StatusId; stacks: number }
  /** After the prompt resolves: tells the choreographer whether stacks were
   *  actually removed or the attempt was prevented. */
  | { t: "status-remove-attempted"; holder: PlayerId; applier: PlayerId; status: StatusId; stacks: number; prevented: boolean }
  // ── Correction 6 — additional engine events ─────────────────────────────
  /** A signature passive counter changed (Frenzy, Radiance, etc.). */
  | { t: "passive-counter-changed"; player: PlayerId; passiveKey: string; delta: number; total: number }
  /** A signature token reached its detonation threshold and exploded. */
  | { t: "status-detonated"; status: StatusId; holder: PlayerId; threshold: number }
  /** An ability-upgrade or persistent-buff was applied to a player. */
  | { t: "ability-modifier-added"; player: PlayerId; modifierId: string; source: "mastery" | "card" | "ability" }
  | { t: "ability-modifier-removed"; player: PlayerId; modifierId: string; reason: "discard-trigger" | "match-end" | "manual" }
  /** A face-symbol bend was created or expired. */
  | { t: "symbol-bend-applied"; player: PlayerId; bendId: string; from: SymbolId; to: SymbolId }
  | { t: "symbol-bend-expired"; player: PlayerId; bendId: string }
  /** Bankable-passive prompt + resolution. */
  | { t: "bank-spend-prompt"; holder: PlayerId; passiveKey: string; available: number; context: "offensive-resolution" | "defensive-resolution" | "main-phase-on-demand" }
  | { t: "bank-spent"; holder: PlayerId; passiveKey: string; amount: number }
  /** Holder paid the configured cost to remove stacks via the token's
   *  `holderRemovalActions[]` (§15.2). The downstream `status-removed`
   *  event still fires from the strip itself — this event records the
   *  player-initiated cause. */
  | { t: "status-removal-by-holder-action"; holder: PlayerId; status: StatusId; actionName: string; stacksRemoved: number };

// ── Engine entrypoint ───────────────────────────────────────────────────────
export interface ApplyResult { state: GameState; events: GameEvent[]; }

export const HP_CAP_BONUS = 10;
export const CP_CAP       = 15;
export const HAND_CAP     = 6;
export const STARTING_HAND= 4;
export const STARTING_HP  = 30;
export const STARTING_CP  = 2;
export const ROLL_ATTEMPTS= 3;        // 1 initial roll + 2 rerolls
