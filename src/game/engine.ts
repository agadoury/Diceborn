/**
 * Diceborn — engine reducer.
 *
 * The single mutation point. `applyAction(state, action) => { state, events }`.
 * Cloning is shallow-by-default; we mutate the state we return, but callers
 * should treat each ApplyResult.state as a new object reference (the engine
 * never reuses a passed-in state for the next call without going through this
 * function).
 *
 * The choreographer / store reads `events` to drive presentation.
 */

import type {
  Action,
  ApplyResult,
  Die,
  GameEvent,
  GameState,
  HeroDefinition,
  HeroId,
  HeroSnapshot,
  PlayerId,
} from "./types";
import {
  STARTING_HP, STARTING_CP, STARTING_HAND, ROLL_ATTEMPTS, HP_CAP_BONUS,
} from "./types";
import { getHero, getDeckCards } from "../content";
import { getCustomHandler, canPlay, drawCards, sellCard, gainCp, resolveEffect, discardCard } from "./cards";
import { applyStatus, stacksOf } from "./status";
import { buildDeck } from "./cards";
import {
  enterPhase, performRoll, resolveOffensiveAbility, emitLadderState, other, endMatch,
} from "./phases";
import { coinFlip } from "./rng";

// ── Public entrypoint ───────────────────────────────────────────────────────
export function applyAction(state: GameState, action: Action): ApplyResult {
  const next: GameState = cloneState(state);
  const events: GameEvent[] = [];

  switch (action.kind) {
    case "start-match":     events.push(...startMatch(next, action.seed, action.p1, action.p2, action.coinFlipWinner)); break;
    case "advance-phase":   events.push(...advancePhase(next)); break;
    case "toggle-die-lock": events.push(...toggleDieLock(next, action.die)); break;
    case "roll-dice":       events.push(...rollAction(next)); break;
    case "play-card":       events.push(...playCard(next, action.card, action.targetDie, action.targetPlayer)); break;
    case "sell-card":       events.push(...sellCardAction(next, action.card)); break;
    case "end-turn":        events.push(...endTurn(next)); break;
    case "respond-to-counter": events.push(...respondToCounter(next, action.accept)); break;
    case "concede":         events.push(...endMatch(next, other(action.player))); break;
  }

  return { state: next, events };
}

// ── start-match ─────────────────────────────────────────────────────────────
function startMatch(
  state: GameState, seed: number, p1: HeroId, p2: HeroId, coin: PlayerId,
): GameEvent[] {
  state.rngSeed = seed;
  state.rngCursor = 1;          // skip 0 so coinFlip is deterministic but consumed.
  state.startPlayer = coin;
  state.activePlayer = coin;
  state.startPlayerSkippedFirstIncome = false;
  state.turn = 1;
  state.players = {
    p1: makeHeroSnapshot("p1", p1, state),
    p2: makeHeroSnapshot("p2", p2, state),
  };
  // Apply hero-specific starting state (Paladin's 2 starting Protect tokens, etc.).
  for (const pid of ["p1", "p2"] as const) {
    const snap = state.players[pid];
    const def = getHero(snap.hero);
    if (def.signatureMechanic.implementation.kind === "divine-favor") {
      const start = def.signatureMechanic.implementation.startingProtect;
      if (start > 0) {
        // Direct apply (Paladin's starting Protects come from the hero's identity).
        const e = applyStatus(snap, pid, "protect", start);
        // We don't surface these as events on the very first turn — they're part of setup.
        // (But emitting is harmless; choreographer can choose to ignore on match-start.)
        for (const ev of e) (state.log as unknown as GameEvent[]).push?.(ev as never);
      }
    }
  }
  // Initial draws.
  const events: GameEvent[] = [];
  events.push({
    t: "match-started",
    players: { p1: state.players.p1.hero, p2: state.players.p2.hero },
    startPlayer: coin,
  });
  for (const pid of ["p1", "p2"] as const) {
    events.push(...drawCards(state, state.players[pid], STARTING_HAND));
  }

  // Enter the first phase: upkeep for the start player.
  state.phase = "pre-match";
  events.push({ t: "turn-started", player: state.activePlayer, turn: state.turn });
  events.push(...enterPhase(state, "upkeep"));
  // Run upkeep → income → main-pre auto-progression at match start.
  events.push(...autoAdvanceTrivialPhases(state));
  // Emit initial ladder state for the active player.
  events.push(...emitLadderState(state, getHero(state.players[state.activePlayer].hero), state.players[state.activePlayer]));
  return events;
}

function makeHeroSnapshot(player: PlayerId, heroId: HeroId, state: GameState): HeroSnapshot {
  const hero = getHero(heroId);
  const cards = getDeckCards(heroId);
  return {
    player, hero: heroId,
    hp: STARTING_HP,
    hpStart: STARTING_HP,
    hpCap: STARTING_HP + HP_CAP_BONUS,
    cp: STARTING_CP,
    dice: makeDice(hero, state.rngSeed),
    rollAttemptsRemaining: ROLL_ATTEMPTS,
    hand: [],
    deck: buildDeck(state, cards),
    discard: [],
    statuses: [],
    upgrades: { 1: 0, 2: 0, 3: 0, 4: 0 },
    signatureState: {},
    ladderState: [
      { kind: "out-of-reach", tier: 1 },
      { kind: "out-of-reach", tier: 2 },
      { kind: "out-of-reach", tier: 3 },
      { kind: "out-of-reach", tier: 4 },
    ],
    isLowHp: false,
    nextAbilityBonusDamage: 0,
  };
}

function makeDice(hero: HeroDefinition, _seed: number): Die[] {
  return [0, 1, 2, 3, 4].map(i => ({
    index: i as Die["index"],
    faces: hero.diceIdentity.faces,
    current: 0,           // pre-roll resting state; first roll randomises
    locked: false,
  }));
}

// ── advance-phase / auto progression ────────────────────────────────────────
function advancePhase(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  switch (state.phase) {
    case "main-pre":
      // No auto-roll; engine waits for "roll-dice" action. But if the active
      // player is stunned, we resolve their stun-skip and move straight to
      // defensive-roll cleanup.
      if (stacksOf(state.players[state.activePlayer], "stun") > 0) {
        const skip = performRoll(state);   // performRoll auto-handles stun.
        events.push(...skip.events);
        events.push(...enterPhase(state, "defensive-roll"));
        events.push(...enterPhase(state, "main-post"));
      } else {
        events.push(...enterPhase(state, "offensive-roll"));
      }
      return events;
    case "offensive-roll":
      // Resolve highest matched ability (if any) → defensive-roll → main-post.
      events.push(...resolveOffensiveAbility(state));
      if (state.winner) return events;
      events.push(...enterPhase(state, "defensive-roll"));
      events.push(...enterPhase(state, "main-post"));
      events.push(...emitLadderState(state, getHero(state.players[state.activePlayer].hero), state.players[state.activePlayer]));
      return events;
    case "main-post":
      events.push(...enterPhase(state, "discard"));
      events.push(...passTurn(state));
      return events;
    default:
      events.push(...enterPhase(state, nextPhaseFor(state.phase)));
      return events;
  }
}

function nextPhaseFor(p: import("./types").Phase): import("./types").Phase {
  // Use the local phases.ts table for trivial moves; fallback for safety.
  switch (p) {
    case "pre-match":      return "upkeep";
    case "upkeep":         return "income";
    case "income":         return "main-pre";
    case "main-pre":       return "offensive-roll";
    case "offensive-roll": return "defensive-roll";
    case "defensive-roll": return "main-post";
    case "main-post":      return "discard";
    case "discard":        return "upkeep";
    default:               return p;
  }
}

/** When entering a turn we auto-roll upkeep + income + land in main-pre. */
function autoAdvanceTrivialPhases(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  // Already in upkeep (set by startMatch / passTurn). Move forward.
  events.push(...enterPhase(state, "income"));
  events.push(...enterPhase(state, "main-pre"));
  return events;
}

// ── Dice locks ──────────────────────────────────────────────────────────────
function toggleDieLock(state: GameState, idx: number): GameEvent[] {
  if (state.phase !== "offensive-roll") return [];
  const active = state.players[state.activePlayer];
  if (idx < 0 || idx >= active.dice.length) return [];
  active.dice[idx].locked = !active.dice[idx].locked;
  const events: GameEvent[] = [{ t: "die-locked", player: active.player, die: idx, locked: active.dice[idx].locked }];
  events.push(...emitLadderState(state, getHero(active.hero), active));
  return events;
}

// ── Roll ────────────────────────────────────────────────────────────────────
function rollAction(state: GameState): GameEvent[] {
  if (state.phase !== "offensive-roll") {
    // Allow rolling from main-pre as the trigger that *enters* the roll phase.
    if (state.phase === "main-pre") {
      const events: GameEvent[] = [];
      events.push(...enterPhase(state, "offensive-roll"));
      const r = performRoll(state);
      events.push(...r.events);
      return events;
    }
    return [];
  }
  return performRoll(state).events;
}

// ── End turn (from main-post) ───────────────────────────────────────────────
function endTurn(state: GameState): GameEvent[] {
  if (state.phase !== "main-post") return [];
  const events: GameEvent[] = [];
  events.push(...enterPhase(state, "discard"));
  events.push(...passTurn(state));
  return events;
}

function passTurn(state: GameState): GameEvent[] {
  if (state.winner) return [];
  state.activePlayer = other(state.activePlayer);
  state.turn += 1;
  // Reset roll attempts and dice locks for incoming player.
  const incoming = state.players[state.activePlayer];
  incoming.rollAttemptsRemaining = ROLL_ATTEMPTS;
  for (const d of incoming.dice) d.locked = false;
  const events: GameEvent[] = [
    { t: "turn-started", player: state.activePlayer, turn: state.turn },
  ];
  events.push(...enterPhase(state, "upkeep"));
  events.push(...autoAdvanceTrivialPhases(state));
  events.push(...emitLadderState(state, getHero(incoming.hero), incoming));
  return events;
}

// ── Card play / sell / counter ──────────────────────────────────────────────
function playCard(state: GameState, cardId: string, targetDie?: number, _targetPlayer?: PlayerId): GameEvent[] {
  const active = state.players[state.activePlayer];
  const opponent = state.players[other(state.activePlayer)];
  const card = active.hand.find(c => c.id === cardId);
  if (!card) return [];
  if (!canPlay(state, active, opponent, card)) return [];

  // Pay cost
  const events: GameEvent[] = [];
  events.push(...gainCp(active, -card.cost));
  // Move card to discard FIRST so handlers that read hand don't double-resolve.
  active.hand = active.hand.filter(c => c.id !== cardId);
  active.discard.push(card);
  events.push({ t: "card-played", player: active.player, cardId, target: targetDie != null ? { die: targetDie } : undefined });

  // Resolve effect
  if (card.effect.kind === "custom") {
    const handler = getCustomHandler(card.effect.id);
    if (handler) events.push(...handler({ state, caster: active, opponent, targetDie }));
  } else {
    events.push(...resolveEffect(card.effect, { state, caster: active, opponent, targetDie }));
  }

  // Re-emit ladder state (cards may have changed dice / upgrades / damage bonus).
  events.push(...emitLadderState(state, getHero(active.hero), active));

  // Lethality check
  if (opponent.hp <= 0) events.push(...endMatch(state, active.player));
  return events;
}

function sellCardAction(state: GameState, cardId: string): GameEvent[] {
  if (state.phase !== "main-pre" && state.phase !== "main-post") return [];
  return sellCard(state.players[state.activePlayer], cardId);
}

function respondToCounter(state: GameState, accept: boolean): GameEvent[] {
  const pending = state.pendingCounter;
  if (!pending) return [];
  const events: GameEvent[] = [
    { t: "counter-resolved", holder: pending.holder, cardId: pending.card.id, accepted: accept },
  ];
  if (accept) {
    const holder = state.players[pending.holder];
    const opponent = state.players[other(pending.holder)];
    events.push(...gainCp(holder, -pending.card.cost));
    events.push(...discardCard(holder, pending.card.id));
    if (pending.card.effect.kind === "custom") {
      const handler = getCustomHandler(pending.card.effect.id);
      if (handler) events.push(...handler({ state, caster: holder, opponent }));
    } else {
      events.push(...resolveEffect(pending.card.effect, { state, caster: holder, opponent }));
    }
  }
  state.pendingCounter = undefined;
  return events;
}

// ── Cloning ─────────────────────────────────────────────────────────────────
function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: {
      p1: clonePlayer(state.players.p1),
      p2: clonePlayer(state.players.p2),
    },
    log: state.log.slice(),
  };
}
function clonePlayer(p: HeroSnapshot | undefined): HeroSnapshot {
  // Pre-match the snapshots are undefined; start-match populates them.
  if (!p) return undefined as unknown as HeroSnapshot;
  return {
    ...p,
    dice: p.dice.map(d => ({ ...d })),
    hand: p.hand.slice(),
    deck: p.deck.slice(),
    discard: p.discard.slice(),
    statuses: p.statuses.map(s => ({ ...s })),
    upgrades: { ...p.upgrades },
    signatureState: { ...p.signatureState },
    ladderState: [...p.ladderState] as HeroSnapshot["ladderState"],
  };
}

// ── Initial empty state factory (for tests / store bootstrap) ───────────────
export function makeEmptyState(): GameState {
  return {
    rngSeed: 0,
    rngCursor: 0,
    turn: 0,
    activePlayer: "p1",
    startPlayer: "p1",
    startPlayerSkippedFirstIncome: false,
    phase: "pre-match",
    players: {
      // Real player snapshots are built by start-match.
      p1: undefined as unknown as HeroSnapshot,
      p2: undefined as unknown as HeroSnapshot,
    },
    log: [],
  };
}

// ── Coin-flip helper exposed for the menu/store ─────────────────────────────
export { coinFlip };
