/**
 * Pact of Heroes — heuristic AI (Medium for MVP).
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

import type { Action, GameState, PlayerId, StatusId } from "./types";
import { ROLL_ATTEMPTS } from "./types";
import { getHero } from "../content";
import { evaluateLadder, pickKeepMask, symbolsOnDice, comboMatchesFaces } from "./dice";
import { stacksOf, getStatusDef } from "./status";
import { canPlay, resolveAbilityFor } from "./cards";

// ── Top-level driver: returns the next action the AI wants to take. ─────────
export function nextAiAction(state: GameState, ai: PlayerId): Action {
  // §Lightbearer: bankable spend prompt. Offensive-resolution: spend
  // generously when the attack is likely to land (we already committed
  // to firing) — every token banks +2 dmg / +1 heal. Defensive: spend
  // enough to fully mitigate the incoming damage when affordable;
  // otherwise spend whatever fits. This is intentionally aggressive —
  // the bankable resource is meant to be used.
  if (state.pendingBankSpend && state.pendingBankSpend.holder === ai) {
    const pbs = state.pendingBankSpend;
    if (pbs.context === "offensive-resolution") {
      // Spend up to 4 tokens per attack — caps the burst, leaves some
      // bank for the next turn. Career-moment closes can spend more.
      const want = Math.min(pbs.available, 4);
      return { kind: "spend-bank", amount: want };
    }
    if (pbs.context === "defensive-resolution") {
      const incoming = state.pendingAttack?.incomingAmount ?? 0;
      const want = Math.min(pbs.available, Math.ceil(incoming / 2));
      return { kind: "spend-bank", amount: want };
    }
    return { kind: "decline-bank-spend" };
  }
  // On-turn: respond to the offensive picker prompt before anything else.
  if (state.pendingOffensiveChoice && state.pendingOffensiveChoice.attacker === ai) {
    // Pick the highest-tier highest-damage match (the matches array is
    // already sorted that way). Mirrors the legacy auto-pick behaviour.
    const top = state.pendingOffensiveChoice.matches[0];
    return { kind: "select-offensive-ability", abilityIndex: top?.abilityIndex ?? null };
  }
  // Off-turn: AI may need to respond to a pendingAttack against itself.
  if (state.pendingAttack && state.pendingAttack.defender === ai) {
    // Instant window — fire a matching Instant (Aegis of Dawn,
    // Phoenix Veil, etc.) BEFORE committing to a defense pick. The
    // engine resolves the instant's effect immediately (e.g. Aegis
    // queues a multiplier reduce-damage onto pa.injectedReduction);
    // pendingAttack stays set so we re-enter this branch and can
    // either play another instant or finalise with select-defense.
    const me = state.players[ai];
    const opponent = state.players[other(ai)];
    const instant = me.hand.find(c => c.kind === "instant" && instantMatchesPendingAttack(c, state) && canPlay(state, me, opponent, c));
    if (instant) return { kind: "play-card", card: instant.id, casterPlayer: ai };

    // No instant to play — pick a defense. For non-defendable attacks
    // (undefendable / pure / ultimate) the defender cannot roll a
    // defense, so we resolve with abilityIndex: null and let any
    // injected reduction (from instants) carry through.
    const pa = state.pendingAttack;
    const defendable = pa.damageType === "normal" || pa.damageType === "collateral";
    const idx = defendable ? pickBestDefense(state, ai) : null;
    return { kind: "select-defense", abilityIndex: idx };
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
/** Decide whether a card's structured Instant trigger qualifies for the
 *  current `pendingAttack`. Currently handles `self-attacked` (any incoming
 *  attack) and `opponent-fires-ability` (matched on tier). Other trigger
 *  shapes are best-effort no-ops here — they'd fire on different events
 *  the AI doesn't currently inspect. */
function instantMatchesPendingAttack(card: import("./types").Card, state: GameState): boolean {
  const pa = state.pendingAttack;
  if (!pa) return false;
  const trig = card.trigger;
  if (trig.kind === "self-attacked") {
    return trig.tier == null || trig.tier === "any" || trig.tier === pa.tier;
  }
  if (trig.kind === "opponent-fires-ability") {
    return trig.tier == null || trig.tier === "any" || trig.tier === pa.tier;
  }
  return false;
}

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

  // §15.2: holder-paid status removal. If we carry a status with a
  // `holderRemovalActions[]` entry and the cost is affordable AND the
  // stacks are high enough to be worth the spend, trigger atonement.
  // Without this the AI can sit under permanently-applied debuffs (e.g.
  // Verdict's -2 dmg/stack) and stall the match indefinitely.
  const atone = pickHolderRemovalAction(me);
  if (atone) {
    return { kind: "status-holder-action", status: atone.status, actionIndex: atone.actionIndex };
  }

  // 0) Masteries first — they're permanent upgrades and only occupy a
  // hero-upgrade slot once. Play whichever's affordable AND whose slot
  // isn't already filled. Higher tier masteries first (defensive →
  // T3 → T2 → T1) so we lock in the biggest leverage when CP allows.
  const masteryOrder: Array<1 | 2 | 3 | "defensive"> = ["defensive", 3, 2, 1];
  for (const tier of masteryOrder) {
    if (me.masterySlots[tier]) continue;
    const card = me.hand.find(c =>
      c.kind === "mastery"
      && c.masteryTier === tier
      && canPlay(state, me, opponent, c),
    );
    if (card) return { kind: "play-card", card: card.id };
  }

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

  // 2b) Hero-specific main-phase plays. Each card is hand-tuned —
  // until cards declare their own AI heuristics, this dispatch table
  // hard-codes the priority. The decisions are intentionally coarse
  // (cost-affordable + simple state precondition) so the heuristic
  // doesn't over-fit; we want the cards to *fire* from the AI, not
  // necessarily fire optimally.
  const heroCard = pickHeroMainPhaseCard(state, ai);
  if (heroCard) return { kind: "play-card", card: heroCard };

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
      // Face-aware match — symbol-only `comboMatches` misses n-of-a-kind
      // and straight combos, which would leave firingTier=-1 and dump
      // every decision through the unstable pickTargetTier path.
      const symbols = symbolsOnDice(me.dice);
      const faces = me.dice.map(d => d.faces[d.current]);
      const resolved = hero.abilityLadder.map(a => resolveAbilityFor(me, a, "offensive"));
      let firingTier = -1;
      for (let i = 0; i < resolved.length; i++) {
        if (comboMatchesFaces(resolved[i].combo, faces)) firingTier = i;
      }
      const targetTier = firingTier >= 0 ? firingTier : pickTargetTier(state, ai);
      if (targetTier >= 0) {
        const ability = resolved[targetTier];
        const keep = pickKeepMask(ability.combo, symbols);
        // Monotonic lock policy: only LOCK a die that the keep mask wants
        // locked. Never UNLOCK mid-attempt — `pickTargetTier`'s MC depends
        // on current locks, so an unlock could flip the target tier and
        // produce a different keep mask, causing an infinite toggle cycle.
        // Locks naturally reset at `passTurn` so this is purely scoped
        // to the current attempt.
        for (let i = 0; i < me.dice.length; i++) {
          if (keep[i] && !me.dice[i].locked) {
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
  const ability = resolveAbilityFor(me, hero.abilityLadder[target], "offensive");
  const symbols = symbolsOnDice(me.dice);
  const keep = pickKeepMask(ability.combo, symbols);
  for (let i = 0; i < me.dice.length; i++) {
    if (me.dice[i].locked !== keep[i]) return false;
  }
  return true;
}
void locksAreOptimal;

/** Hand-tuned per-card priority for hero-specific main-phase plays.
 *  Returns the card id to play (or null). Each entry tests affordability,
 *  card kind, and a card-specific precondition. Iterate the player's
 *  hand for the FIRST matching card so order = priority. */
function pickHeroMainPhaseCard(state: GameState, ai: PlayerId): string | null {
  const me = state.players[ai];
  const opp = state.players[other(ai)];
  for (const card of me.hand) {
    // Defer the full legality check to canPlay — it covers cost,
    // playCondition, state-threshold blocks (Verdict at 3+ blocks
    // main-phase cards on the holder), once-per-match / once-per-turn,
    // and phase. Without this guard the AI can pick a card the engine
    // then refuses, producing a no-op action and an infinite loop.
    if (card.kind !== "main-phase" && card.kind !== "main-action") continue;
    if (!canPlay(state, me, opp, card)) continue;

    switch (card.id) {
      // Lightbearer
      case "lightbearer/sanctuary":
        // Play when wounded (HP < 60%) — pre-emptive damage soak.
        if (me.hp / me.hpStart < 0.6) return card.id;
        break;
      case "lightbearer/vow-of-service":
        // Long-term economic buff — play first chance.
        return card.id;
      case "lightbearer/dawnsong":
        // Burn 2 Radiance for +4 CP when CP-starved.
        if ((me.signatureState["radiance"] ?? 0) >= 3 && me.cp <= 4) return card.id;
        break;
      case "lightbearer/resolve":
        // Cheap dice-bend — play when dawn faces are showing.
        if (me.dice.some(d => d.faces[d.current].symbol === "lightbearer:dawn")) return card.id;
        break;
      // Berserker (existing hero — fill in obvious plays)
      case "berserker/ancestral-spirits":
        // Persistent +1 dmg buff — play first chance.
        return card.id;
      case "berserker/war-cry":
        // Frenzy bump — play when below cap.
        if ((me.signatureState["frenzy"] ?? 0) <= 3) return card.id;
        break;
      case "berserker/hunters-mark":
        // Status apply on opponent — always good early.
        return card.id;
      // Pyromancer
      case "pyromancer/crater-wind":
        // Boost Cinder detonation — play first chance once Cinder is a thing.
        if ((opp.statuses.find(s => s.id === "pyromancer:cinder")?.stacks ?? 0) >= 1) return card.id;
        return card.id;
      default:
        break;
    }
  }
  return null;
}

/** §15.2: scan the holder's statuses for a `holderRemovalActions[]` entry
 *  worth invoking now. Picks the first action whose cost is affordable
 *  and whose stack count is "worth" stripping — defined as either ≥ the
 *  smallest `stateThresholdEffects.threshold` on the status (so we
 *  evict before the bind fires) or ≥ 75% of `stackLimit`. Returns
 *  `{ status, actionIndex }` or `null`. */
function pickHolderRemovalAction(holder: import("./types").HeroSnapshot): { status: StatusId; actionIndex: number } | null {
  for (const inst of holder.statuses) {
    const def = getStatusDef(inst.id);
    const actions = def?.holderRemovalActions;
    if (!def || !actions || actions.length === 0) continue;

    // "Worth it" threshold: smallest threshold among stateThresholdEffects,
    // or 75% of stackLimit when no thresholds are declared.
    const lowestThreshold = def.stateThresholdEffects?.length
      ? Math.min(...def.stateThresholdEffects.map(s => s.threshold))
      : Math.ceil(def.stackLimit * 0.75);
    if (inst.stacks < lowestThreshold) continue;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const affordable =
        action.cost.resource === "cp"           ? holder.cp >= action.cost.amount :
        action.cost.resource === "hp"           ? holder.hp >  action.cost.amount + 4 : // keep a 4-HP cushion
        action.cost.resource === "discard-card" ? holder.hand.length >= action.cost.amount + 1 :
        false;
      if (!affordable) continue;
      return { status: inst.id, actionIndex: i };
    }
  }
  return null;
}

// ── Main post-roll: play follow-up cards, then end turn ─────────────────────
function decideMainPost(state: GameState, ai: PlayerId): Action {
  const me = state.players[ai];
  // §15.2 atonement is also valid during main-post.
  const atone = pickHolderRemovalAction(me);
  if (atone) {
    return { kind: "status-holder-action", status: atone.status, actionIndex: atone.actionIndex };
  }
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
