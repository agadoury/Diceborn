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
  Card,
  CardId,
  GameEvent,
  GameState,
  HeroSnapshot,
} from "./types";
import { CP_CAP, HAND_CAP } from "./types";
import { applyStatus, stripStatus, stacksOf } from "./status";
import { dealDamage, heal } from "./damage";
import { rollOn, shuffleInPlace } from "./rng";

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
      return applyStatus(target, ctx.caster.player, effect.status, effect.stacks);
    }
    case "remove-status": {
      const target = effect.target === "self" ? ctx.caster : ctx.opponent;
      const r = stripStatus(target, effect.status);
      return r.events;
    }
    case "heal": {
      const target = effect.target === "self" ? ctx.caster : ctx.opponent;
      return heal(target, effect.amount);
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
  }
}

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

/** Whether a given card can be played given current state & costs. */
export function canPlay(state: GameState, hero: HeroSnapshot, opponent: HeroSnapshot, card: Card): boolean {
  if (hero.cp < card.cost) return false;
  if (card.playable) {
    const frac = hero.hp / hero.hpStart;
    if (card.playable.minHpFraction != null && frac < card.playable.minHpFraction) return false;
    if (card.playable.maxHpFraction != null && frac > card.playable.maxHpFraction) return false;
  }
  // Phase gating: roll-action cards play during offensive-roll; main-action during main-pre/main-post.
  switch (card.kind) {
    case "main-action":
    case "upgrade":
      if (state.phase !== "main-pre" && state.phase !== "main-post") return false;
      break;
    case "roll-action":
      if (state.phase !== "offensive-roll") return false;
      break;
    case "status":
      if (state.phase !== "main-pre" && state.phase !== "main-post") return false;
      break;
  }
  void opponent;
  return true;
}

/** Used for the AI to surface "what could push tier X into reach right now." */
export { stacksOf };

/** RNG-aware roll exposed so simulator/AI can share the seeded stream. */
export { rollOn };
