/**
 * Diceborn — heuristic AI (Medium for MVP).
 *
 * The AI consumes the same `evaluateLadder` the player UI uses, so it can
 * never have asymmetric information about reachability. Decisions are
 * greedy + a few heuristic weights — no tree search.
 *
 * Decision points the AI is asked to make per turn:
 *   - Main Phase (pre-roll):  which cards to play/sell.
 *   - Offensive Roll:         which dice to lock between attempts.
 *   - Main Phase (post-roll): which cards to play/sell.
 *   - End turn.
 *
 * Counter-prompt responses are decided by a simple "is this worth it" check.
 */

import type { Action, GameState, PlayerId } from "./types";
import { ROLL_ATTEMPTS } from "./types";
import { getHero } from "../content";
import { evaluateLadder, pickKeepMask, symbolsOnDice, comboMatches } from "./dice";
import { stacksOf } from "./status";

// ── Top-level driver: returns the next action the AI wants to take. ─────────
export function nextAiAction(state: GameState, ai: PlayerId): Action {
  // On-turn: respond to the offensive picker prompt before anything else.
  if (state.pendingOffensiveChoice && state.pendingOffensiveChoice.attacker === ai) {
    // Pick the highest-tier highest-damage match (the matches array is
    // already sorted that way). Mirrors the legacy auto-pick behaviour.
    const top = state.pendingOffensiveChoice.matches[0];
    return { kind: "select-offensive-ability", abilityIndex: top?.abilityIndex ?? null };
  }
  // Off-turn: AI may need to respond to a pendingAttack against itself.
  if (state.pendingAttack && state.pendingAttack.defender === ai) {
    return { kind: "select-defense", abilityIndex: pickBestDefense(state, ai) };
  }
  if (state.activePlayer !== ai) {
    if (state.pendingCounter && state.pendingCounter.holder === ai) {
      return { kind: "respond-to-counter", accept: shouldAcceptCounter(state, ai) };
    }
    return { kind: "advance-phase" };
  }
  switch (state.phase) {
    case "pre-match":      return { kind: "advance-phase" };
    case "upkeep":
    case "income":         return { kind: "advance-phase" };
    case "main-pre":       return decideMainPre(state, ai);
    case "offensive-roll": return decideOffensiveRoll(state, ai);
    case "defensive-roll": return { kind: "advance-phase" };
    case "main-post":      return decideMainPost(state, ai);
    case "discard":        return { kind: "advance-phase" };
    case "match-end":      return { kind: "advance-phase" };
  }
}

/** Pick the highest-tier defense available — same intuition as the old
 *  auto-resolver's picker. Returns null if the defender has no ladder. */
function pickBestDefense(state: GameState, ai: PlayerId): number | null {
  const me = state.players[ai];
  const hero = getHero(me.hero);
  const dl = hero.defensiveLadder;
  if (!dl || dl.length === 0) return null;
  let bestIdx = 0;
  let bestTier = -1;
  for (let i = 0; i < dl.length; i++) {
    if (dl[i].tier > bestTier) { bestTier = dl[i].tier; bestIdx = i; }
  }
  return bestIdx;
}

// ── Main pre-roll: play cards, then ROLL ────────────────────────────────────
function decideMainPre(state: GameState, ai: PlayerId): Action {
  const me = state.players[ai];
  const opponent = state.players[other(ai)];
  void opponent;

  // 1) Removal: clear heavy generic DoTs (Burn) when affordable.
  const myBurn = stacksOf(me, "burn");
  if (myBurn >= 3 && me.hand.find(c => c.id === "generic/cleanse" && c.cost <= me.cp)) {
    return { kind: "play-card", card: "generic/cleanse" };
  }

  // 2) Quick Draw / Focus when CP and hand allow — generic resource cards.
  const draw = me.hand.find(c => c.id === "generic/quick-draw" && c.cost <= me.cp);
  if (draw && me.hand.length <= 3) return { kind: "play-card", card: draw.id };
  const focus = me.hand.find(c => c.id === "generic/focus" && c.cost <= me.cp);
  if (focus && me.cp <= 4) return { kind: "play-card", card: focus.id };

  // 3) Sell the oldest card to fund next turn if hand is overflowing.
  if (me.hand.length >= 5 && me.cp < 6) {
    return { kind: "sell-card", card: me.hand[0].id };
  }

  // Hero-specific cards plug in via additional rules added by content
  // modules. For now: only generic logic above.

  // Otherwise: roll.
  return { kind: "roll-dice" };
}

// ── Offensive roll: lock dice contributing to best target tier ──────────────
function decideOffensiveRoll(state: GameState, ai: PlayerId): Action {
  const me = state.players[ai];
  const opponent = state.players[other(ai)];
  const hero = getHero(me.hero);

  // If we have rolls left, lock optimally then return roll-dice.
  if (me.rollAttemptsRemaining > 0) {
    // First, we must have rolled at least once already
    // (rollAttemptsRemaining < ROLL_ATTEMPTS means at least one attempt used).
    if (me.rollAttemptsRemaining < ROLL_ATTEMPTS) {
      // If any ability is currently firing, pin the target to the highest
      // firing tier. This avoids the lock/reachability oscillation where
      // pickTargetTier flip-flops between tiers as we toggle locks.
      const symbols = symbolsOnDice(me.dice);
      let firingTier = -1;
      for (let i = 0; i < hero.abilityLadder.length; i++) {
        if (comboMatches(hero.abilityLadder[i].combo, symbols)) firingTier = i;
      }
      const targetTier = firingTier >= 0 ? firingTier : pickTargetTier(state, ai);
      if (targetTier >= 0) {
        const ability = hero.abilityLadder[targetTier];
        const keep = pickKeepMask(ability.combo, symbols);
        // If lock states differ from keep mask, toggle one die.
        for (let i = 0; i < me.dice.length; i++) {
          const desired = keep[i];
          if (me.dice[i].locked !== desired) {
            return { kind: "toggle-die-lock", die: i as 0|1|2|3|4 };
          }
        }
      }
      // Locks match the keep mask. Already firing tier 2+? Commit; otherwise
      // burn the remaining attempt to fish for an upgrade.
      if (firingTier >= 2) return { kind: "advance-phase" };
      return { kind: "roll-dice" };
    }
    // First attempt (rollAttemptsRemaining === ROLL_ATTEMPTS): just roll.
    return { kind: "roll-dice" };
  }

  // No rolls left — commit by advancing the phase.
  void opponent;
  return { kind: "advance-phase" };
}

function pickTargetTier(state: GameState, ai: PlayerId): number {
  const me = state.players[ai];
  const opponent = state.players[other(ai)];
  const hero = getHero(me.hero);
  const rows = evaluateLadder(hero, me, me.rollAttemptsRemaining, {
    opponentHp: opponent.hp,
    pendingOpponentDamage: stacksOf(opponent, "bleeding"),
    damageBonus: (me.signatureState["rage"] ?? 0) + me.nextAbilityBonusDamage,
    reachabilitySamples: 200,
    reachabilitySeed: state.rngSeed,
  });
  // Lethal-with-≥30%-prob commitment override.
  const lethal = rows.findIndex(r =>
    (r.kind === "firing" || r.kind === "triggered" || (r.kind === "reachable" && r.probability >= 0.3))
    && "lethal" in r && r.lethal,
  );
  if (lethal >= 0) return lethal;
  // Highest reachable with EV weighting (prefer higher tier when prob ≥ 0.25).
  let best = -1; let bestScore = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let prob: number; let tierScore: number;
    if (r.kind === "firing" || r.kind === "triggered") { prob = 1; tierScore = (i + 1) * 4; }
    else if (r.kind === "reachable") { prob = r.probability; tierScore = (i + 1) * 4 * prob; }
    else continue;
    const score = tierScore + (prob >= 0.25 ? i * 0.5 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** Unused after pinning the target to the highest firing tier — kept for
 *  reference/follow-up if we revive the oscillating eval path. */
function locksAreOptimal(state: GameState, ai: PlayerId): boolean {
  const me = state.players[ai];
  const hero = getHero(me.hero);
  const target = pickTargetTier(state, ai);
  if (target < 0) return true;
  const ability = hero.abilityLadder[target];
  const symbols = symbolsOnDice(me.dice);
  const keep = pickKeepMask(ability.combo, symbols);
  for (let i = 0; i < me.dice.length; i++) {
    if (me.dice[i].locked !== keep[i]) return false;
  }
  return true;
}
void locksAreOptimal;

// ── Main post-roll: play follow-up cards, then end turn ─────────────────────
function decideMainPost(state: GameState, ai: PlayerId): Action {
  const me = state.players[ai];
  // Cheap CP-fueled plays only — most decisions happen pre-roll.
  if (me.cp >= 1 && me.hand.find(c => c.id === "generic/focus" && c.cost === 0)) {
    return { kind: "play-card", card: "generic/focus" };
  }
  // Sell extras if we're way over hand cap.
  if (me.hand.length >= 6) return { kind: "sell-card", card: me.hand[0].id };
  return { kind: "end-turn" };
}

// ── Counter-prompt response ─────────────────────────────────────────────────
function shouldAcceptCounter(state: GameState, ai: PlayerId): boolean {
  const pending = state.pendingCounter;
  if (!pending) return false;
  // For MVP: cheap heuristic — accept if expected damage prevented ≥ 4.
  const card = pending.card;
  if (card.effect.kind === "damage") return card.effect.amount >= 2;
  void ai;
  return true;
}

function other(p: PlayerId): PlayerId { return p === "p1" ? "p2" : "p1"; }
