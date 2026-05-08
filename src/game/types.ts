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

export type AbilityEffect =
  | { kind: "damage"; amount: number; type: DamageType }
  /** Damage that scales with how many extra dice contribute beyond the
   *  combo's minimum. E.g. for symbol-count(sword,3): 3 swords = base,
   *  4 swords = base + perExtra, 5 swords = base + 2*perExtra. Capped by
   *  maxExtra (typically 2 since 5 dice − 3 minimum = 2 extras). */
  | { kind: "scaling-damage"; baseAmount: number; perExtra: number; maxExtra: number; type: DamageType }
  /** Defensive: reduce incoming damage by this amount during the current
   *  defensive roll. Used by defensive-ladder abilities. */
  | { kind: "reduce-damage"; amount: number }
  | { kind: "apply-status"; status: StatusId; stacks: number; target: "self" | "opponent" }
  | { kind: "remove-status"; status: StatusId; stacks: number; target: "self" | "opponent" }
  | { kind: "heal"; amount: number; target: "self" | "opponent" }
  | { kind: "gain-cp"; amount: number }
  | { kind: "draw"; amount: number }
  | { kind: "compound"; effects: AbilityEffect[] }
  | { kind: "custom"; id: string };       // dispatched by registry in cards.ts

// ── Abilities ───────────────────────────────────────────────────────────────
export interface AbilityDef {
  tier: AbilityTier;
  name: string;
  combo: DiceCombo;
  effect: AbilityEffect;
  shortText: string;
  longText: string;
  damageType: DamageType;
  targetLandingRate: [number, number];  // used by simulate.ts for tuning audit
}

// ── Cards ───────────────────────────────────────────────────────────────────
// Per spec Correction 4, the canonical categories per the rulebook are
// main-phase, roll-phase, instant. Legacy "upgrade" and "status" labels are
// kept for backward compatibility with existing hero data.
export type CardKind =
  | "upgrade" | "main-action" | "roll-action" | "status"   // legacy
  | "main-phase" | "roll-phase" | "instant";               // canonical
export type CardTrigger =
  | { kind: "manual" }
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
}

// ── Hero definition (the four uniqueness pillars) ───────────────────────────
export type PassiveTrigger =
  | { on: "abilityLanded"; gain: number }
  | { on: "statusTicked"; status: StatusId; on_target: "opponent" | "self"; gain: number }
  | { on: "successfulDefense"; gain: number };

/** Open shape — each hero declares its own kind + parameters. The engine
 *  in phases.ts dispatches on `kind` and applies the corresponding
 *  passive behavior at the relevant phase boundaries. New heroes extend
 *  this union (or use a generic kind) when they introduce new mechanics. */
export type PassiveBehavior = { kind: string; [key: string]: unknown };

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
}

// ── GameState (immutable; mutate only via applyAction) ──────────────────────
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
  | { t: "defense-resolved"; player: PlayerId; reduction: number; matchedTier?: AbilityTier; abilityName?: string }
  | { t: "status-applied"; status: StatusId; holder: PlayerId; applier: PlayerId; stacks: number; total: number }
  | { t: "status-ticked"; status: StatusId; holder: PlayerId; effect: "damage" | "heal" | "decrement"; amount: number; stacksRemaining: number }
  | { t: "status-removed"; status: StatusId; holder: PlayerId; reason: "expired" | "stripped" | "ignited" }
  | { t: "status-triggered"; status: StatusId; holder: PlayerId; cause: string }
  | { t: "hero-state"; player: PlayerId; state: "idle" | "hit" | "defended" | "low-hp-enter" | "low-hp-exit" | "victorious" | "defeated" }
  | { t: "rage-changed"; player: PlayerId; stacks: number }
  | { t: "counter-prompt"; holder: PlayerId; cardId: CardId; expiresAt: number }
  | { t: "counter-resolved"; holder: PlayerId; cardId: CardId; accepted: boolean };

// ── Engine entrypoint ───────────────────────────────────────────────────────
export interface ApplyResult { state: GameState; events: GameEvent[]; }

export const HP_CAP_BONUS = 10;
export const CP_CAP       = 15;
export const HAND_CAP     = 6;
export const STARTING_HAND= 4;
export const STARTING_HP  = 30;
export const STARTING_CP  = 2;
export const ROLL_ATTEMPTS= 3;        // 1 initial roll + 2 rerolls
