/**
 * Diceborn — card resolution, deck/hand/discard plumbing.
 *
 * Cards' effects are resolved by a single dispatcher on AbilityEffect.kind.
 * Hero-specific cards whose effects don't fit the generic schema declare
 * `{ kind: "custom", id: "..." }` and the registry below handles them.
 *
 * The dispatcher is also reused by ability resolution (engine.ts) since
 * ability effects share the same shape.
 */

import type {
  AbilityEffect,
  ActiveAbilityModifier,
  ActiveSymbolBend,
  Card,
  CardId,
  ConditionalBonus,
  DieFace,
  GameEvent,
  GameState,
  HeroSnapshot,
  StateCheck,
  SymbolId,
} from "./types";
import { CP_CAP, HAND_CAP } from "./types";
import { applyStatus, stripStatus, stacksOf, getStatusDef } from "./status";
import { dealDamage, heal } from "./damage";
import { nextInt, rollOn, shuffleInPlace } from "./rng";

// ── Custom card registry ────────────────────────────────────────────────────
export interface CustomCardCtx {
  state: GameState;
  caster: HeroSnapshot;
  opponent: HeroSnapshot;
  /** Optional die index target (for cards like "Sharpen" / "Lock In"). */
  targetDie?: number;
}
export type CustomCardHandler = (ctx: CustomCardCtx) => GameEvent[];

const CUSTOM = new Map<string, CustomCardHandler>();
export function registerCustomCard(id: string, handler: CustomCardHandler): void {
  CUSTOM.set(id, handler);
}
export function getCustomHandler(id: string): CustomCardHandler | undefined {
  return CUSTOM.get(id);
}

// ── Effect resolution ───────────────────────────────────────────────────────
export interface ResolveCtx {
  state: GameState;
  caster: HeroSnapshot;
  opponent: HeroSnapshot;
  /** Set when this effect is the engine resolving an ability (vs a card). */
  isAbility?: boolean;
  /** Bonus damage to add to the next "damage" leaf (Rage, Berserk Rush). */
  damageBonus?: number;
  /** External defensive reduction supplied by phases.ts. */
  defensiveReduction?: number;
  targetDie?: number;
  /** Player-chosen face value for `set-die-face` effects whose target leaves
   *  faceValue unspecified (Iron Focus, Last Stand). */
  targetFaceValue?: 1 | 2 | 3 | 4 | 5 | 6;
}

export function resolveEffect(effect: AbilityEffect, ctx: ResolveCtx): GameEvent[] {
  switch (effect.kind) {
    case "damage": {
      const total = effect.amount + (ctx.damageBonus ?? 0);
      const r = dealDamage(
        ctx.caster.player, ctx.opponent, total, effect.type,
        effect.type === "normal" || effect.type === "ultimate" || effect.type === "collateral"
          ? (ctx.defensiveReduction ?? 0)
          : 0,
      );
      return r.events;
    }
    case "scaling-damage": {
      // Cards-context: no firing combo available, so apply baseAmount only.
      // Engine ability resolution handles scaling extras itself in phases.ts.
      const total = effect.baseAmount + (ctx.damageBonus ?? 0);
      const r = dealDamage(
        ctx.caster.player, ctx.opponent, total, effect.type,
        effect.type === "normal" || effect.type === "ultimate" || effect.type === "collateral"
          ? (ctx.defensiveReduction ?? 0)
          : 0,
      );
      return r.events;
    }
    case "reduce-damage": {
      // Cards-context shouldn't normally use reduce-damage (defensive abilities
      // resolve in phases.ts). No-op here so the switch stays exhaustive.
      return [];
    }
    case "apply-status": {
      const target = effect.target === "self" ? ctx.caster : ctx.opponent;
      let stacks = effect.stacks;
      if (
        effect.conditional_bonus &&
        checkState(ctx.state, ctx.caster, ctx.opponent, effect.conditional_bonus.condition)
      ) {
        stacks += computeConditionalBonus(ctx.caster, ctx.opponent, effect.conditional_bonus);
      }
      return applyStatus(target, ctx.caster.player, effect.status, stacks);
    }
    case "remove-status": {
      const target = effect.target === "self" ? ctx.caster : ctx.opponent;
      const r = stripStatus(target, effect.status);
      return r.events;
    }
    case "heal": {
      const target = effect.target === "self" ? ctx.caster : ctx.opponent;
      let amount = effect.amount;
      if (
        effect.conditional_bonus &&
        checkState(ctx.state, ctx.caster, ctx.opponent, effect.conditional_bonus.condition)
      ) {
        amount += computeConditionalBonus(ctx.caster, ctx.opponent, effect.conditional_bonus);
      }
      return heal(target, amount);
    }
    case "gain-cp": {
      return gainCp(ctx.caster, effect.amount);
    }
    case "draw": {
      return drawCards(ctx.state, ctx.caster, effect.amount);
    }
    case "compound": {
      const out: GameEvent[] = [];
      for (const e of effect.effects) out.push(...resolveEffect(e, ctx));
      return out;
    }
    case "custom": {
      const handler = CUSTOM.get(effect.id);
      if (!handler) {
        return [{ t: "phase-changed", player: ctx.caster.player, from: ctx.state.phase, to: ctx.state.phase }];
      }
      return handler({ state: ctx.state, caster: ctx.caster, opponent: ctx.opponent, targetDie: ctx.targetDie });
    }
    // ── Correction 6 — first-class primitives ────────────────────────────
    case "set-die-face":
      return setDieFace(ctx.state, ctx.caster, effect, ctx.targetDie, ctx.targetFaceValue);
    case "reroll-dice":
      return rerollDice(ctx.state, ctx.caster, effect);
    case "face-symbol-bend":
      return applySymbolBend(ctx.state, ctx.caster, effect);
    case "ability-upgrade":
      return addAbilityModifier(ctx.caster, {
        source: "card",
        scope: effect.scope,
        modifications: effect.modifications,
        permanent: effect.permanent,
      });
    case "passive-counter-modifier":
      return modifyPassiveCounter(ctx.caster, effect);
    case "persistent-buff":
      return addAbilityModifier(ctx.caster, {
        source: "card",
        scope: effect.scope,
        modifications: [effect.modifier],
        permanent: true,
        discardOn: effect.discardOn,
      }, effect.id);
    case "bonus-dice-damage":
      return resolveBonusDiceDamage(ctx.state, ctx.caster, ctx.opponent, effect);
    case "force-face-value": {
      const fv = effect.faceValue ?? ctx.targetFaceValue;
      if (fv == null) return [];
      ctx.caster.forcedFaceValue = fv;
      // Duration "this-turn" — cleared by the engine at passTurn. No event
      // type for it yet; UIs can read the snapshot field if needed.
      return [];
    }
  }
}

// ── New-primitive resolvers ─────────────────────────────────────────────────

function setDieFace(
  _state: GameState,
  caster: HeroSnapshot,
  effect: Extract<AbilityEffect, { kind: "set-die-face" }>,
  targetDie?: number,
  targetFaceValue?: 1|2|3|4|5|6,
): GameEvent[] {
  const events: GameEvent[] = [];
  const dice = caster.dice;
  const eligibleIdx: number[] = [];
  for (let i = 0; i < dice.length; i++) {
    const face = dice[i].faces[dice[i].current];
    if (effect.filter === "any") {
      eligibleIdx.push(i);
    } else if (effect.filter.kind === "specific-symbol") {
      if (face.symbol === effect.filter.symbol) eligibleIdx.push(i);
    } else if (effect.filter.kind === "specific-face") {
      if (face.faceValue === effect.filter.faceValue) eligibleIdx.push(i);
    }
  }
  // If a specific die was indicated and it's eligible, prefer it.
  const ordered = targetDie != null && eligibleIdx.includes(targetDie)
    ? [targetDie, ...eligibleIdx.filter(i => i !== targetDie)]
    : eligibleIdx;

  // Resolve the target face — when the effect leaves faceValue unspecified,
  // fall back to the action's `targetFaceValue`. If neither is set, the
  // effect is a no-op (no face to point at).
  let resolvedTarget: { kind: "symbol"; symbol: SymbolId } | { kind: "face"; faceValue: 1|2|3|4|5|6 } | null;
  if (effect.target.kind === "symbol") {
    resolvedTarget = effect.target;
  } else if (effect.target.faceValue != null) {
    resolvedTarget = { kind: "face", faceValue: effect.target.faceValue };
  } else if (targetFaceValue != null) {
    resolvedTarget = { kind: "face", faceValue: targetFaceValue };
  } else {
    resolvedTarget = null;
  }
  if (!resolvedTarget) return events;

  let setCount = 0;
  for (const idx of ordered) {
    if (setCount >= effect.count) break;
    const die = dice[idx];
    const targetFaceIdx = findFaceIndex(die.faces, resolvedTarget);
    if (targetFaceIdx < 0) continue;
    const from = die.current;
    if (from !== targetFaceIdx) {
      die.current = targetFaceIdx;
      events.push({ t: "die-face-changed", player: caster.player, die: idx, from, to: targetFaceIdx, cause: "card" });
    }
    if (effect.lockAfter) die.locked = true;
    setCount++;
  }
  return events;
}

function findFaceIndex(faces: readonly DieFace[], target: { kind: "symbol"; symbol: SymbolId } | { kind: "face"; faceValue: 1|2|3|4|5|6 }): number {
  if (target.kind === "symbol") return faces.findIndex(f => f.symbol === target.symbol);
  return faces.findIndex(f => f.faceValue === target.faceValue);
}

function rerollDice(
  state: GameState,
  caster: HeroSnapshot,
  effect: Extract<AbilityEffect, { kind: "reroll-dice" }>,
): GameEvent[] {
  const events: GameEvent[] = [];
  const eligible = caster.dice.filter(d => {
    if (!effect.ignoresLock && d.locked) return false;
    if (effect.filter === "all") return true;
    if (effect.filter === "not-locked") return !d.locked;
    if (effect.filter.kind === "not-showing-symbols") {
      return !effect.filter.symbols.includes(d.faces[d.current].symbol);
    }
    return true;
  });
  for (const d of eligible) {
    const r = nextInt(state.rngSeed, state.rngCursor, d.faces.length);
    state.rngCursor = r.cursor;
    d.current = r.value;
  }
  events.push({
    t: "dice-rolled",
    player: caster.player,
    dice: caster.dice.map(d => ({ index: d.index, current: d.current, symbol: d.faces[d.current].symbol, locked: d.locked })),
    attemptNumber: 1,
  });
  return events;
}

function applySymbolBend(
  state: GameState,
  caster: HeroSnapshot,
  effect: Extract<AbilityEffect, { kind: "face-symbol-bend" }>,
): GameEvent[] {
  const id = `bend-${state.rngCursor}-${caster.symbolBends.length}`;
  let expires: ActiveSymbolBend["expires"];
  if (effect.duration === "this-roll") {
    expires = { kind: "this-roll", appliedAtAttempt: caster.rollAttemptsRemaining };
  } else if (effect.duration === "this-turn") {
    expires = { kind: "this-turn", appliedOnTurn: state.turn };
  } else {
    expires = { kind: "until-status", status: effect.duration.status, on: effect.duration.on };
  }
  caster.symbolBends.push({ id, fromSymbol: effect.from_symbol, toSymbol: effect.to_symbol, expires });
  return [{ t: "symbol-bend-applied", player: caster.player, bendId: id, from: effect.from_symbol, to: effect.to_symbol }];
}

let _modIdCounter = 1;
function addAbilityModifier(
  caster: HeroSnapshot,
  spec: Omit<ActiveAbilityModifier, "id">,
  givenId?: string,
): GameEvent[] {
  const id = givenId ?? `mod-${_modIdCounter++}`;
  caster.abilityModifiers.push({ id, ...spec });
  return [{ t: "ability-modifier-added", player: caster.player, modifierId: id, source: spec.source }];
}

function modifyPassiveCounter(
  caster: HeroSnapshot,
  effect: Extract<AbilityEffect, { kind: "passive-counter-modifier" }>,
): GameEvent[] {
  const before = caster.signatureState[effect.passiveKey] ?? 0;
  const after = effect.operation === "set" ? effect.value : before + effect.value;
  // Respect cap from hero passive definition (read by phases.ts when the cap
  // is known); cards-context can't see it, so allow if respectsCap: false,
  // otherwise clamp at CP_CAP as a sane default.
  const clamped = effect.respectsCap === false ? after : Math.min(after, CP_CAP);
  caster.signatureState[effect.passiveKey] = Math.max(0, clamped);
  const delta = caster.signatureState[effect.passiveKey] - before;
  if (delta === 0) return [];
  return [{ t: "passive-counter-changed", player: caster.player, passiveKey: effect.passiveKey, delta, total: caster.signatureState[effect.passiveKey] }];
}

function resolveBonusDiceDamage(
  state: GameState,
  caster: HeroSnapshot,
  opponent: HeroSnapshot,
  effect: Extract<AbilityEffect, { kind: "bonus-dice-damage" }>,
): GameEvent[] {
  const events: GameEvent[] = [];
  const faceCount = caster.dice[0]?.faces.length ?? 6;
  const rolledFaces: DieFace[] = [];
  for (let i = 0; i < effect.bonusDice; i++) {
    const r = nextInt(state.rngSeed, state.rngCursor, faceCount);
    state.rngCursor = r.cursor;
    rolledFaces.push(caster.dice[0]!.faces[r.value]);
  }
  let amount = 0;
  if (effect.damageFormula === "sum-of-faces") {
    amount = rolledFaces.reduce((a, f) => a + f.faceValue, 0);
  } else if (effect.damageFormula === "highest-face") {
    amount = Math.max(0, ...rolledFaces.map(f => f.faceValue));
  } else if (effect.damageFormula.kind === "count-symbol") {
    amount = rolledFaces.filter(f => f.symbol === (effect.damageFormula as { symbol: SymbolId }).symbol).length;
  }
  const r = dealDamage(caster.player, opponent, amount, effect.type, 0);
  events.push(...r.events);
  if (effect.thresholdBonus && amount >= effect.thresholdBonus.threshold) {
    events.push(...resolveEffect(effect.thresholdBonus.bonus, { state, caster, opponent }));
  }
  return events;
}

// ── Discard-trigger evaluator + state-check helper (Correction 6) ───────────

/** Called when an event happens that may discard ability modifiers (e.g. a
 *  T4 hit clears Ancestral Spirits). Iterates each player's modifiers and
 *  removes those whose `discardOn` matches the event. */
export function evaluateModifierDiscards(state: GameState, ev: GameEvent): GameEvent[] {
  const events: GameEvent[] = [];
  for (const pid of ["p1", "p2"] as const) {
    const player = state.players[pid];
    const keep: ActiveAbilityModifier[] = [];
    for (const m of player.abilityModifiers) {
      if (!m.discardOn) { keep.push(m); continue; }
      const d = m.discardOn;
      let match = false;
      if (d.kind === "damage-taken-from-tier" && ev.t === "damage-dealt" && ev.to === pid) {
        // Damage-tier requires reading the originating ability — we approximate
        // by carrying tier on damage-dealt? Currently we do not. Defer: leave
        // intact (tier-aware discard will need a richer event payload).
      } else if (d.kind === "status-removed" && ev.t === "status-removed" && ev.holder === pid && ev.status === d.status) {
        match = true;
      } else if (d.kind === "match-ends" && ev.t === "match-won") {
        match = true;
      }
      if (match) {
        events.push({ t: "ability-modifier-removed", player: pid, modifierId: m.id, reason: "discard-trigger" });
      } else {
        keep.push(m);
      }
    }
    player.abilityModifiers = keep;
  }
  return events;
}

/** Evaluate a state-check predicate against the engine state. Used by
 *  conditional damage bonuses and critical evaluations. */
/** Compute the bonus contribution from a `ConditionalBonus`. The caller is
 *  expected to have already verified the bonus's `condition` via `checkState`
 *  — this function only multiplies the `bonusPerUnit` by the source's unit
 *  count. */
export function computeConditionalBonus(
  caster: HeroSnapshot,
  opponent: HeroSnapshot,
  cb: ConditionalBonus,
): number {
  let units = 0;
  switch (cb.source) {
    case "opponent-status-stacks": {
      const fallbackStatus = cb.condition.kind.endsWith("status-min")
        ? (cb.condition as { status: string }).status
        : "";
      units = opponent.statuses.find(s => s.id === (cb.sourceStatus ?? fallbackStatus))?.stacks ?? 0;
      break;
    }
    case "self-status-stacks":
      units = caster.statuses.find(s => s.id === (cb.sourceStatus ?? ""))?.stacks ?? 0;
      break;
    case "stripped-stack-count":
      units = caster.lastStripped[cb.sourceStatus ?? ""] ?? 0;
      break;
    case "self-passive-counter":
      units = caster.signatureState[cb.sourcePassiveKey ?? ""] ?? 0;
      break;
    case "opponent-passive-counter":
      units = opponent.signatureState[cb.sourcePassiveKey ?? ""] ?? 0;
      break;
    case "fixed-one":
      units = 1;
      break;
  }
  return units * cb.bonusPerUnit;
}

export function checkState(
  state: GameState,
  caster: HeroSnapshot,
  opponent: HeroSnapshot,
  check: StateCheck,
  firingFaces?: ReadonlyArray<DieFace>,
): boolean {
  void state;
  switch (check.kind) {
    case "opponent-has-status-min": return stacksOf(opponent, check.status) >= check.count;
    case "self-has-status-min":     return stacksOf(caster, check.status) >= check.count;
    case "self-stripped-status":    return (caster.lastStripped[check.status] ?? 0) > 0;
    case "self-low-hp":             return caster.isLowHp;
    case "passive-counter-min":     return (caster.signatureState[check.passiveKey] ?? 0) >= check.count;
    case "combo-symbol-count":
      if (!firingFaces) return false;
      return firingFaces.filter(f => f.symbol === check.symbol).length >= check.count;
    case "combo-n-of-a-kind": {
      if (!firingFaces) return false;
      const counts = new Map<number, number>();
      for (const f of firingFaces) counts.set(f.faceValue, (counts.get(f.faceValue) ?? 0) + 1);
      return Math.max(0, ...counts.values()) >= check.count;
    }
    case "combo-straight": {
      if (!firingFaces) return false;
      return longestStraight(firingFaces.map(f => f.faceValue)) >= check.length;
    }
  }
}

/** Length of the longest contiguous-value run in a list of faceValues. */
function longestStraight(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const seen = new Set(values);
  let best = 0;
  for (const v of seen) {
    let len = 1;
    while (seen.has(v + len)) len++;
    if (len > best) best = len;
  }
  return best;
}

void rollOn;            // re-export keeps the AI/sim sharing the seeded stream
void _modIdCounter;     // counter is module-local; signal usage

// ── Hand / deck / discard ───────────────────────────────────────────────────
export function drawCards(state: GameState, hero: HeroSnapshot, n: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    if (hero.deck.length === 0) {
      if (hero.discard.length === 0) break;
      hero.deck = hero.discard;
      hero.discard = [];
      shuffleInPlace(hero.deck, state);
    }
    const card = hero.deck.shift()!;
    hero.hand.push(card);
    events.push({ t: "card-drawn", player: hero.player, cardId: card.id });
  }
  return events;
}

export function gainCp(hero: HeroSnapshot, amount: number): GameEvent[] {
  if (amount === 0) return [];
  const before = hero.cp;
  hero.cp = Math.max(0, Math.min(CP_CAP, before + amount));
  const delta = hero.cp - before;
  if (delta === 0) return [];
  return [{ t: "cp-changed", player: hero.player, delta, total: hero.cp }];
}

/** Remove a card from hand and place it in discard. */
export function discardCard(hero: HeroSnapshot, cardId: CardId): GameEvent[] {
  const idx = hero.hand.findIndex(c => c.id === cardId);
  if (idx < 0) return [];
  const [card] = hero.hand.splice(idx, 1);
  hero.discard.push(card);
  return [{ t: "card-discarded", player: hero.player, cardId: card.id }];
}

/** Sell a card: removes it from hand, gives +1 CP, places in discard. */
export function sellCard(hero: HeroSnapshot, cardId: CardId): GameEvent[] {
  const idx = hero.hand.findIndex(c => c.id === cardId);
  if (idx < 0) return [];
  const [card] = hero.hand.splice(idx, 1);
  hero.discard.push(card);
  const cpEvents = gainCp(hero, 1);
  return [
    { t: "card-sold", player: hero.player, cardId: card.id, cpGained: 1 },
    ...cpEvents,
  ];
}

/** Auto-discard from front (FIFO) until hand <= HAND_CAP, selling each for +1 CP. */
export function autoDiscardOverHandCap(hero: HeroSnapshot): GameEvent[] {
  const events: GameEvent[] = [];
  while (hero.hand.length > HAND_CAP) {
    const oldest = hero.hand[0];
    events.push(...sellCard(hero, oldest.id));
  }
  return events;
}

/** Build a fresh deck for a hero by cloning + shuffling its declared cards. */
export function buildDeck(state: GameState, cards: ReadonlyArray<Card>): Card[] {
  const deck = cards.map(c => ({ ...c }));
  shuffleInPlace(deck, state);
  return deck;
}

/** Validate a hero's deck composition per Correction 6 §9: exactly 12 cards,
 *  exactly 4 Masteries (one per T1 / T2 / T3 / defensive). T4 abilities have
 *  no Mastery — power lives at the curve peak. Returns issues found; an
 *  empty array means the deck is conformant. */
export function validateDeckComposition(cards: ReadonlyArray<Card>): string[] {
  const issues: string[] = [];
  if (cards.length !== 12) {
    issues.push(`deck size is ${cards.length}, expected exactly 12`);
  }
  const masteries = cards.filter(c => c.kind === "mastery");
  if (masteries.length !== 4) {
    issues.push(`deck contains ${masteries.length} mastery cards, expected exactly 4`);
  }
  const tiers = new Set(masteries.map(m => m.masteryTier));
  for (const required of [1, 2, 3, "defensive"] as const) {
    if (!tiers.has(required)) issues.push(`missing mastery for tier ${required}`);
  }
  for (const m of masteries) {
    if ((m.masteryTier as number | string) === 4) {
      issues.push(`mastery card "${m.name}" targets T4 — T4 ultimates intentionally have no mastery`);
    }
  }
  return issues;
}

/** Whether a given card can be played given current state & costs.
 *  Per Correction 6 §1c: state-threshold effects on active statuses can
 *  block specific card kinds (e.g. Verdict at 3+ blocks main-phase + instants
 *  on the holder for one Main Phase). */
export function canPlay(state: GameState, hero: HeroSnapshot, opponent: HeroSnapshot, card: Card): boolean {
  if (hero.cp < card.cost) return false;
  // While the active player is being asked to pick which attack to fire,
  // freeze card play except for instants — the engine has emitted the
  // offensive-pick-prompt and is waiting for select-offensive-ability.
  if (state.pendingOffensiveChoice && card.kind !== "instant") return false;
  if (card.playable) {
    const frac = hero.hp / hero.hpStart;
    if (card.playable.minHpFraction != null && frac < card.playable.minHpFraction) return false;
    if (card.playable.maxHpFraction != null && frac > card.playable.maxHpFraction) return false;
  }
  // Once-per-match / once-per-turn consumption checks.
  if (card.oncePerMatch && hero.consumedOncePerMatchCards.includes(card.id)) return false;
  if (card.oncePerTurn && hero.consumedOncePerTurnCards.includes(card.id)) return false;
  // Richer play-time gate.
  if (card.playCondition) {
    const pc = card.playCondition;
    if (pc.kind === "match-state-threshold") {
      const value = pc.metric === "self-hp" ? hero.hp : opponent.hp;
      if (pc.op === "<=" && !(value <= pc.value)) return false;
      if (pc.op === ">=" && !(value >= pc.value)) return false;
    }
  }
  // Phase gating per Correction 5: roll-phase / roll-action cards are
  // playable during BOTH the offensive-roll AND the defensive-roll phase
  // (defender's roll counts as a roll window for dice-manipulation cards).
  // Instants are evaluated by the choreographer's instant-prompt path and
  // accepted in any phase.
  switch (card.kind) {
    case "main-action":
    case "upgrade":
    case "main-phase":
      if (state.phase !== "main-pre" && state.phase !== "main-post") return false;
      break;
    case "roll-action":
    case "roll-phase":
      if (state.phase !== "offensive-roll" && state.phase !== "defensive-roll") return false;
      break;
    case "status":
      if (state.phase !== "main-pre" && state.phase !== "main-post") return false;
      break;
    case "instant":
      // Instants are always playable subject to CP + their own trigger.
      break;
    case "mastery":
      // Masteries are played from the main phase like persistent buffs.
      // They occupy a slot per `masteryTier`; if the slot is full, refuse.
      if (state.phase !== "main-pre" && state.phase !== "main-post") return false;
      if (card.masteryTier != null) {
        const slot = card.masteryTier;
        if ((hero.masterySlots as Record<string, unknown>)[slot]) return false;
      }
      break;
  }
  // State-threshold blocks: walk the holder's active statuses and reject if
  // any threshold-effect blocks this card kind.
  for (const inst of hero.statuses) {
    const def = getStatusDef(inst.id);
    const blocks = def?.stateThresholdEffects ?? [];
    for (const ste of blocks) {
      if (inst.stacks < ste.threshold) continue;
      if (ste.effect.kind === "block-card-kind" && ste.effect.cardKind === card.kind) return false;
    }
  }
  return true;
}

/** Used for the AI to surface "what could push tier X into reach right now." */
export { stacksOf };

/** RNG-aware roll exposed so simulator/AI can share the seeded stream. */
export { rollOn };
