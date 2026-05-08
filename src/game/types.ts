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
  | { kind: "opponent-has-status-min"; status: StatusId; count: number }
  | { kind: "self-has-status-min";     status: StatusId; count: number }
  | { kind: "self-stripped-status";    status: StatusId }      // set by remove-status; consumed by reader
  | { kind: "self-low-hp" }
  | { kind: "passive-counter-min";     passiveKey: string; count: number }
  | { kind: "combo-symbol-count";      symbol: SymbolId; count: number }   // counts on firingFaces
  | { kind: "combo-n-of-a-kind";       count: number };

/** How to count a "source" of bonus damage when a conditional fires. */
export type ConditionalSource =
  | "opponent-status-stacks"        // count of the named status on opponent
  | "self-status-stacks"
  | "stripped-stack-count"          // stacks removed in the most-recent strip-event
  | "self-passive-counter"          // signatureState[passiveKey]
  | "fixed-one";

/** Conditional bonus stamped onto `damage` / `scaling-damage` effects. */
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
export interface AbilityUpgradeMod {
  field:
    | "base-damage" | "scaling-damage-base" | "scaling-damage-per-extra" | "scaling-damage-max-extra"
    | "damage-type" | "self-cost" | "heal-amount" | "self-heal-amount"
    | "applied-status-stacks" | "reduce-damage-amount" | "defenseDiceCount";
  operation: "set" | "add" | "multiply";
  value: number | string;
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
   *  defensive roll. Used by defensive-ladder abilities. */
  | { kind: "reduce-damage"; amount: number }
  | { kind: "apply-status"; status: StatusId; stacks: number; target: "self" | "opponent" }
  | { kind: "remove-status"; status: StatusId; stacks: number; target: "self" | "opponent" }
  | { kind: "heal"; amount: number; target: "self" | "opponent" }
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
      target: { kind: "symbol"; symbol: SymbolId } | { kind: "face"; faceValue: 1|2|3|4|5|6 } }
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
   *  Hero Upgrade slot when `permanent: true`; otherwise lasts to end of turn. */
  | { kind: "ability-upgrade"; scope: AbilityScope;
      modifications: AbilityUpgradeMod[];
      permanent: boolean }
  /** Direct manipulation of a signature passive counter (e.g. War Cry adds
   *  +3 Frenzy without the "must take damage" trigger). */
  | { kind: "passive-counter-modifier"; passiveKey: string; operation: "add" | "set"; value: number; respectsCap?: boolean }
  /** Match-long buff applied immediately. The buff itself is any standard
   *  effect-shaped modifier (e.g. +1 dmg on offensive abilities). Discarded
   *  on the named trigger, if any. */
  | { kind: "persistent-buff"; id: string; modifier: AbilityUpgradeMod;
      scope: AbilityScope;
      discardOn?:
        | { kind: "damage-taken-from-tier"; tier: AbilityTier }
        | { kind: "status-removed"; status: StatusId }
        | { kind: "match-ends" } }
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
  // ── Legacy triggers (still accepted) ────────────────────────────────────
  | { kind: "on-symbol-rolled"; symbol: SymbolId | "*:ult"; by: "self" | "opponent" }
  | { kind: "on-tier-fired";    tier: AbilityTier; by: "self" | "opponent" };

export interface Card {
  id: CardId;
  hero: HeroId | "generic";
  kind: CardKind;
  name: string;
  cost: number;
  text: string;
  trigger: CardTrigger;
  effect: AbilityEffect;
  /** Optional gating, evaluated against game state at play-time. */
  playable?: { minHpFraction?: number; maxHpFraction?: number };
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
  cards: Card[];
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

/** Persistent ability modifier in flight on a player. Either applied by a
 *  played mastery card (`permanent: true`) or by a temporary effect.
 *  `discardOn` lets the engine remove the entry on a qualifying event. */
export interface ActiveAbilityModifier {
  id: string;                   // unique within the snapshot; lets discardOn target it
  source: "mastery" | "card" | "ability";
  scope: AbilityScope;
  modifications: AbilityUpgradeMod[];
  permanent: boolean;
  discardOn?:
    | { kind: "damage-taken-from-tier"; tier: AbilityTier }
    | { kind: "status-removed"; status: StatusId }
    | { kind: "match-ends" };
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
  /** Active face-symbol bends. */
  symbolBends: ActiveSymbolBend[];
  /** Tracks the most-recent `remove-status` event by status id → stripped count.
   *  Reset at end of each phase. Read by ConditionalSource = "stripped-stack-count". */
  lastStripped: Record<StatusId, number>;
  /** True while a Mastery card is occupying the corresponding Hero Upgrade slot. */
  masterySlots: { 1?: CardId; 2?: CardId; 3?: CardId; defensive?: CardId };
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
  log: LogEntry[];
  winner?: PlayerId | "draw";
}

export interface LogEntry { turn: number; phase: Phase; text: string; t: number; }

// ── Actions ─────────────────────────────────────────────────────────────────
export type Action =
  | { kind: "start-match"; seed: number; p1: HeroId; p2: HeroId; coinFlipWinner: PlayerId }
  | { kind: "advance-phase" }
  | { kind: "toggle-die-lock"; die: 0 | 1 | 2 | 3 | 4 }
  | { kind: "roll-dice" }
  | { kind: "play-card"; card: CardId; targetDie?: 0 | 1 | 2 | 3 | 4; targetPlayer?: PlayerId }
  | { kind: "sell-card"; card: CardId }
  | { kind: "end-turn" }
  | { kind: "respond-to-counter"; accept: boolean }
  /** Defender's response to a `pendingAttack`. `abilityIndex` is into the
   *  defender hero's `defensiveLadder`; `null` means "take the hit
   *  undefended" (also used when the defender has no defenses available). */
  | { kind: "select-defense"; abilityIndex: number | null }
  /** Spend N tokens from a bankable signature passive (Lightbearer's
   *  Radiance, etc.). Only valid while `pendingBankSpend` is set. `amount`
   *  must be ≤ available counter and respects the spend option's costPerUnit. */
  | { kind: "spend-bank"; amount: number }
  | { kind: "decline-bank-spend" }
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
  | { t: "bank-spent"; holder: PlayerId; passiveKey: string; amount: number };

// ── Engine entrypoint ───────────────────────────────────────────────────────
export interface ApplyResult { state: GameState; events: GameEvent[]; }

export const HP_CAP_BONUS = 10;
export const CP_CAP       = 15;
export const HAND_CAP     = 6;
export const STARTING_HAND= 4;
export const STARTING_HP  = 30;
export const STARTING_CP  = 2;
export const ROLL_ATTEMPTS= 3;        // 1 initial roll + 2 rerolls
