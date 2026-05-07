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
import { getHero } from "../content";
import { evaluateLadder, pickKeepMask, symbolsOnDice, comboMatches } from "./dice";
import { stacksOf } from "./status";

// ── Top-level driver: returns the next action the AI wants to take. ─────────
export function nextAiAction(state: GameState, ai: PlayerId): Action {
  if (state.activePlayer !== ai) {
    // Defensive moves: in MVP defense is auto-resolved, so the AI never acts off-turn.
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

// ── Main pre-roll: play cards, then ROLL ────────────────────────────────────
function decideMainPre(state: GameState, ai: PlayerId): Action {
  const me = state.players[ai];
  const opponent = state.players[other(ai)];

  // 1) Removal: opponent's heavy DoT on me?
  const myBleed = stacksOf(me, "bleeding");
  const myBurn  = stacksOf(me, "burn");
  if (myBurn >= 3 && me.hand.find(c => c.id === "generic/cleanse" && c.cost <= me.cp)) {
    return { kind: "play-card", card: "generic/cleanse" };
  }
  void myBleed;  // signature counter cards land later (Step 7).

  // 2) Heal if low HP and healing affordable.
  if (me.hp / me.hpStart <= 0.4) {
    const heal = me.hand.find(c => c.id === "barbarian/second-wind" && c.cost <= me.cp);
    if (heal) return { kind: "play-card", card: heal.id };
  }

  // 3) Last Stand if eligible.
  const lastStand = me.hand.find(c => c.id === "barbarian/last-stand" && me.hp <= 10);
  if (lastStand) return { kind: "play-card", card: lastStand.id };

  // 4) Buy upgrades when CP is comfortable.
  if (me.cp >= 4) {
    const upg = me.hand.find(c => (c.id === "barbarian/upgrade-cleave" || c.id === "barbarian/upgrade-frenzy") && c.cost <= me.cp);
    if (upg) return { kind: "play-card", card: upg.id };
  }

  // 5) Berserk Rush when at high HP and damage will land — we use it as a setup
  // for a known reachable Tier 2+.
  const wantsBigDmg = me.cp >= 2 && me.hp >= me.hpStart - 4;
  if (wantsBigDmg && me.hand.find(c => c.id === "barbarian/berserk-rush")) {
    return { kind: "play-card", card: "barbarian/berserk-rush" };
  }

  // 6) Blood Debt — if opponent has Bleeding stacks, cheap Rage gain.
  if (stacksOf(opponent, "bleeding") >= 2 && me.hand.find(c => c.id === "barbarian/blood-debt" && c.cost <= me.cp)) {
    return { kind: "play-card", card: "barbarian/blood-debt" };
  }

  // 7) Intimidate — apply Stun if opponent isn't stunned, and we have CP to spare.
  if (me.cp >= 3 && stacksOf(opponent, "stun") === 0 && me.hand.find(c => c.id === "barbarian/intimidate")) {
    return { kind: "play-card", card: "barbarian/intimidate" };
  }

  // 8) Sell the oldest card to fund next turn if hand is overflowing.
  if (me.hand.length >= 5 && me.cp < 6) {
    return { kind: "sell-card", card: me.hand[0].id };
  }

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
    // First, we must have rolled at least once already (rollAttemptsRemaining < 2).
    if (me.rollAttemptsRemaining < 2) {
      const targetTier = pickTargetTier(state, ai);
      if (targetTier >= 0) {
        const ability = hero.abilityLadder[targetTier];
        const symbols = symbolsOnDice(me.dice);
        const keep = pickKeepMask(ability.combo, symbols);
        // If lock states differ from keep mask, toggle one die.
        for (let i = 0; i < me.dice.length; i++) {
          const desired = keep[i];
          if (me.dice[i].locked !== desired) {
            return { kind: "toggle-die-lock", die: i as 0|1|2|3|4 };
          }
        }
      }
      // Locks already optimal — roll again or commit.
      const locksMatch = locksAreOptimal(state, ai);
      if (!locksMatch && me.rollAttemptsRemaining > 0) {
        // Still mismatch but everything's already toggled — roll.
        return { kind: "roll-dice" };
      }
      // Already firing tier 3 or 4? Don't burn a reroll; advance.
      const symbols = symbolsOnDice(me.dice);
      let firingTier = -1;
      for (let i = 0; i < hero.abilityLadder.length; i++) {
        if (comboMatches(hero.abilityLadder[i].combo, symbols)) firingTier = i;
      }
      if (firingTier >= 2) return { kind: "advance-phase" };
      return { kind: "roll-dice" };
    }
    // First attempt (rollAttemptsRemaining === 2): just roll.
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
