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
  CardId,
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
import { getHero, getDeckCards, HEROES } from "../content";

// Wire the status engine's applier-hero lookup once. status.ts can't import
// the content registry directly (cycle), so we hand it a lookup function.
setHeroLookup((id) => HEROES[id] ?? undefined);
import { getCustomHandler, canPlay, drawCards, sellCard, gainCp, resolveEffect, discardCard, tickTurnBuffs } from "./cards";
import { stacksOf, stripStatus, setHeroLookup, getStatusDef } from "./status";
import { buildDeck } from "./cards";
import {
  enterPhase, performRoll, beginOffensivePick, commitOffensiveAbility,
  resolveDefenseChoice, emitLadderState, other, endMatch,
} from "./phases";
import { coinFlip } from "./rng";

// ── Public entrypoint ───────────────────────────────────────────────────────
export function applyAction(state: GameState, action: Action): ApplyResult {
  const next: GameState = cloneState(state);
  const events: GameEvent[] = [];

  switch (action.kind) {
    case "start-match":     events.push(...startMatch(next, action.seed, action.p1, action.p2, action.coinFlipWinner, action.p1Deck, action.p2Deck)); break;
    case "advance-phase":   events.push(...advancePhase(next)); break;
    case "toggle-die-lock": events.push(...toggleDieLock(next, action.die)); break;
    case "roll-dice":       events.push(...rollAction(next)); break;
    case "play-card":       events.push(...playCard(next, action.card, action.targetDie, action.targetPlayer, action.targetFaceValue, action.casterPlayer)); break;
    case "sell-card":       events.push(...sellCardAction(next, action.card)); break;
    case "end-turn":        events.push(...endTurn(next)); break;
    case "respond-to-counter": events.push(...respondToCounter(next, action.accept)); break;
    case "respond-to-status-removal": events.push(...respondToStatusRemoval(next, action.cardId)); break;
    case "select-offensive-ability": events.push(...selectOffensiveAbility(next, action.abilityIndex)); break;
    case "select-defense":  events.push(...selectDefense(next, action.abilityIndex)); break;
    case "spend-bank":      events.push(...resolveBankSpend(next, action.amount)); break;
    case "decline-bank-spend": events.push(...resolveBankSpend(next, 0)); break;
    case "status-holder-action": events.push(...resolveStatusHolderAction(next, action.status, action.actionIndex)); break;
    case "concede":         events.push(...endMatch(next, other(action.player))); break;
  }

  return { state: next, events };
}

// ── start-match ─────────────────────────────────────────────────────────────
function startMatch(
  state: GameState, seed: number, p1: HeroId, p2: HeroId, coin: PlayerId,
  p1Deck?: ReadonlyArray<CardId>, p2Deck?: ReadonlyArray<CardId>,
): GameEvent[] {
  state.rngSeed = seed;
  state.rngCursor = 1;          // skip 0 so coinFlip is deterministic but consumed.
  state.startPlayer = coin;
  state.activePlayer = coin;
  state.startPlayerSkippedFirstIncome = false;
  state.turn = 1;
  state.players = {
    p1: makeHeroSnapshot("p1", p1, state, p1Deck),
    p2: makeHeroSnapshot("p2", p2, state, p2Deck),
  };
  // Bankable signature passive: seed signatureState[passiveKey] with bankStartsAt.
  for (const pid of ["p1", "p2"] as const) {
    const heroDef = getHero(state.players[pid].hero);
    const impl = heroDef.signatureMechanic?.implementation;
    if (impl?.passiveKey != null && typeof impl.bankStartsAt === "number") {
      state.players[pid].signatureState[impl.passiveKey] = impl.bankStartsAt;
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

function makeHeroSnapshot(player: PlayerId, heroId: HeroId, state: GameState, savedDeckIds?: ReadonlyArray<CardId>): HeroSnapshot {
  const hero = getHero(heroId);
  const cards = getDeckCards(heroId, savedDeckIds);
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
    ladderState: hero.abilityLadder.map(a => ({ kind: "out-of-reach", tier: a.tier })),
    isLowHp: false,
    nextAbilityBonusDamage: 0,
    abilityModifiers: [],
    tokenOverrides: [],
    symbolBends: [],
    pipelineBuffs: [],
    triggerBuffs: [],
    comboOverrides: [],
    lastStripped: {},
    masterySlots: {},
    consumedOncePerMatchCards: [],
    consumedOncePerTurnCards: [],
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
    case "offensive-roll": {
      // Open the offensive picker. Emits offensive-pick-prompt and halts via
      // pendingOffensiveChoice if any abilities matched; otherwise the turn
      // fizzles (offensiveFallback may still fire). Engine waits for
      // select-offensive-ability.
      events.push(...beginOffensivePick(state));
      if (state.pendingOffensiveChoice) return events;
      // No matches and no fallback ⇒ skip straight to main-post.
      if (state.winner) return events;
      events.push(...enterPhase(state, "defensive-roll"));
      events.push(...enterPhase(state, "main-post"));
      events.push(...emitLadderState(state, getHero(state.players[state.activePlayer].hero), state.players[state.activePlayer]));
      return events;
    }
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
  // Cannot reroll once the offensive picker is up — the player has committed
  // to this set of dice by ending the roll phase.
  if (state.pendingOffensiveChoice) return [];
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
  // §15.5: tick turn-bounded persistent buffs (end-of-self-turn /
  // next-turn-of-self / end-of-any-turn) BEFORE swapping the active
  // player so the outgoing player is still the "ending" player.
  const turnEvents = tickTurnBuffs(state, state.activePlayer);
  state.activePlayer = other(state.activePlayer);
  state.turn += 1;
  // Reset roll attempts and dice locks for incoming player.
  const incoming = state.players[state.activePlayer];
  incoming.rollAttemptsRemaining = ROLL_ATTEMPTS;
  for (const d of incoming.dice) d.locked = false;
  // Per-turn card-consumption list resets when the *outgoing* player's turn
  // ends. We clear both sides so each player starts their own turn fresh.
  state.players.p1.consumedOncePerTurnCards = [];
  state.players.p2.consumedOncePerTurnCards = [];
  // Forced face-value overrides (Last Stand) are also turn-scoped.
  state.players.p1.forcedFaceValue = undefined;
  state.players.p2.forcedFaceValue = undefined;
  const events: GameEvent[] = [
    ...turnEvents,
    { t: "turn-started", player: state.activePlayer, turn: state.turn },
  ];
  events.push(...enterPhase(state, "upkeep"));
  events.push(...autoAdvanceTrivialPhases(state));
  events.push(...emitLadderState(state, getHero(incoming.hero), incoming));
  return events;
}

// ── Card play / sell / counter ──────────────────────────────────────────────
function playCard(state: GameState, cardId: string, targetDie?: number, _targetPlayer?: PlayerId, targetFaceValue?: 1|2|3|4|5|6, casterPlayer?: PlayerId): GameEvent[] {
  // Search both hands so off-turn Instants (Phoenix Veil, Counterstrike,
  // Final Heat) are reachable. Card holder, not active player, is the caster.
  // When `casterPlayer` is supplied we prefer that hand FIRST — required
  // when both players hold the same card (mirror matches) so the off-turn
  // responder doesn't accidentally consume the active player's copy.
  const tryOrder: PlayerId[] = casterPlayer
    ? [casterPlayer, other(casterPlayer)]
    : [state.activePlayer, other(state.activePlayer)];
  let casterId: PlayerId | undefined;
  let card: import("./types").Card | undefined;
  for (const pid of tryOrder) {
    const found = state.players[pid].hand.find(c => c.id === cardId);
    if (found) {
      // Off-turn play is only permitted for Instants — every other card kind
      // is phase-gated and `canPlay` will reject it.
      if (pid !== state.activePlayer && found.kind !== "instant") continue;
      casterId = pid;
      card = found;
      break;
    }
  }
  if (!card || !casterId) return [];
  const caster = state.players[casterId];
  const opponent = state.players[other(casterId)];
  if (!canPlay(state, caster, opponent, card)) return [];

  // Pay cost
  const events: GameEvent[] = [];
  events.push(...gainCp(caster, -card.cost));
  // Move card to discard FIRST so handlers that read hand don't double-resolve.
  caster.hand = caster.hand.filter(c => c.id !== cardId);
  caster.discard.push(card);
  // Mastery cards occupy a Hero Upgrade slot for the rest of the match.
  if (card.kind === "mastery" && card.masteryTier != null && (card.occupiesSlot ?? true)) {
    caster.masterySlots[card.masteryTier as 1 | 2 | 3 | "defensive"] = card.id;
  }
  // Once-per-match / once-per-turn consumption.
  if (card.oncePerMatch) caster.consumedOncePerMatchCards.push(card.id);
  if (card.oncePerTurn) caster.consumedOncePerTurnCards.push(card.id);
  events.push({ t: "card-played", player: caster.player, cardId, target: targetDie != null ? { die: targetDie } : undefined });

  // Resolve effect
  if (card.effect.kind === "custom") {
    const handler = getCustomHandler(card.effect.id);
    if (handler) events.push(...handler({ state, caster, opponent, targetDie }));
  } else {
    events.push(...resolveEffect(card.effect, { state, caster, opponent, targetDie, targetFaceValue }));
  }

  // Re-emit ladder state (cards may have changed dice / upgrades / damage bonus).
  events.push(...emitLadderState(state, getHero(caster.hero), caster));

  // Lethality check
  if (opponent.hp <= 0) events.push(...endMatch(state, caster.player));
  return events;
}

function sellCardAction(state: GameState, cardId: string): GameEvent[] {
  if (state.phase !== "main-pre" && state.phase !== "main-post") return [];
  return sellCard(state.players[state.activePlayer], cardId);
}

/** Active player's response to a `pendingOffensiveChoice`. Resolves the
 *  chosen ability (or fizzles + tries offensive fallback). When the chosen
 *  ability is defendable, transitions into `defensive-roll` and pauses
 *  again on `pendingAttack`. */
function selectOffensiveAbility(state: GameState, abilityIndex: number | null): GameEvent[] {
  const choice = state.pendingOffensiveChoice;
  if (!choice) return [];
  const events: GameEvent[] = [];

  // Validate index is in the matches list (or null = decline).
  const valid = abilityIndex != null && choice.matches.some(m => m.abilityIndex === abilityIndex);

  if (!valid) {
    // Player declined OR provided an invalid index — turn fizzles.
    state.pendingOffensiveChoice = undefined;
    events.push({ t: "offensive-choice-made", attacker: choice.attacker, abilityIndex: null });
    if (state.winner) return events;
    events.push(...enterPhase(state, "defensive-roll"));
    events.push(...enterPhase(state, "main-post"));
    events.push(...emitLadderState(state, getHero(state.players[state.activePlayer].hero), state.players[state.activePlayer]));
    return events;
  }

  state.pendingOffensiveChoice = undefined;
  events.push(...enterPhase(state, "defensive-roll"));
  // §Lightbearer: bankable spend prompt at offensive-resolution. If the
  // attacker has tokens AND their hero declares an `offensive-resolution`
  // spend option, halt for `spend-bank` (or `decline-bank-spend`) before
  // committing. The resolved spend writes its bonus into the attacker's
  // `nextAbilityBonusDamage` (damage-bonus mode) and applies any
  // heal-self effect; `commitOffensiveAbility` then resumes via
  // `pendingOffensiveCommit` on the spend-bank action.
  const attacker = state.players[state.activePlayer];
  const attackerHero = getHero(attacker.hero);
  const offensiveSpendKey = attackerHero.signatureMechanic.implementation.passiveKey;
  const offensiveSpendOpts = (attackerHero.signatureMechanic.implementation.spendOptions ?? [])
    .filter(o => o.context === "offensive-resolution");
  const banked = offensiveSpendKey ? (attacker.signatureState[offensiveSpendKey] ?? 0) : 0;
  if (offensiveSpendKey && offensiveSpendOpts.length > 0 && banked > 0) {
    state.pendingOffensiveCommit = { attacker: state.activePlayer, abilityIndex: abilityIndex! };
    state.pendingBankSpend = {
      holder: state.activePlayer,
      passiveKey: offensiveSpendKey,
      available: banked,
      context: "offensive-resolution",
      optionIndex: 0,
    };
    events.push({
      t: "bank-spend-prompt",
      holder: state.activePlayer,
      passiveKey: offensiveSpendKey,
      available: banked,
      context: "offensive-resolution",
    });
    return events;
  }
  events.push(...commitOffensiveAbility(state, abilityIndex!));
  if (state.pendingAttack) return events;          // halted — wait for select-defense
  if (state.winner) return events;
  events.push(...enterPhase(state, "main-post"));
  events.push(...emitLadderState(state, getHero(state.players[state.activePlayer].hero), state.players[state.activePlayer]));
  return events;
}

/** Defender's response to a `pendingAttack`. Resolves the chosen defense
 *  (or skip), applies damage with the resulting reduction, then proceeds
 *  to main-post. */
function selectDefense(state: GameState, abilityIndex: number | null): GameEvent[] {
  if (!state.pendingAttack) return [];
  const events: GameEvent[] = [];
  events.push(...resolveDefenseChoice(state, abilityIndex));
  if (state.winner) return events;
  events.push(...enterPhase(state, "main-post"));
  events.push(...emitLadderState(state, getHero(state.players[state.activePlayer].hero), state.players[state.activePlayer]));
  return events;
}

/** Resolve a pending bankable-passive spend prompt. `amount` is the number
 *  of tokens the player commits (0 = decline). Engine deducts the tokens,
 *  emits `bank-spent`, and clears `pendingBankSpend`. The actual effect
 *  resolution happens in the caller's flow (phases.ts re-checks pending
 *  after this action and continues). */
function resolveBankSpend(state: GameState, amount: number): GameEvent[] {
  const pbs = state.pendingBankSpend;
  if (!pbs) return [];
  const events: GameEvent[] = [];
  const holder = state.players[pbs.holder];
  const spend = Math.max(0, Math.min(amount, pbs.available));
  if (spend > 0) {
    holder.signatureState[pbs.passiveKey] = (holder.signatureState[pbs.passiveKey] ?? 0) - spend;
    events.push({ t: "bank-spent", holder: pbs.holder, passiveKey: pbs.passiveKey, amount: spend });
    events.push({ t: "passive-counter-changed", player: pbs.holder, passiveKey: pbs.passiveKey, delta: -spend, total: holder.signatureState[pbs.passiveKey] });

    // Apply ALL matching spend options for this context (Lightbearer's
    // offensive-resolution offers both damage-bonus AND heal-self per
    // token; the engine fans both out). Damage-bonus accumulates onto
    // `nextAbilityBonusDamage` so `commitOffensiveAbility`'s damage-leaf
    // resolution picks it up. Heal-self resolves immediately.
    const heroDef = getHero(holder.hero);
    const opts = (heroDef.signatureMechanic.implementation.spendOptions ?? [])
      .filter(o => o.context === pbs.context);
    for (const opt of opts) {
      const eff = opt.effect as { kind: string; perUnit?: number };
      const perUnit = eff.perUnit ?? 0;
      const total = perUnit * spend;
      if (total <= 0) continue;
      if (eff.kind === "damage-bonus") {
        holder.nextAbilityBonusDamage += total;
      } else if (eff.kind === "heal-self") {
        const before = holder.hp;
        holder.hp = Math.min(holder.hpCap, before + total);
        const delta = holder.hp - before;
        if (delta > 0) {
          events.push({ t: "heal-applied", player: holder.player, amount: delta });
          events.push({ t: "hp-changed", player: holder.player, delta, total: holder.hp });
        }
      } else if (eff.kind === "reduce-incoming") {
        // Defensive-context reduction is added to the pending attack's
        // injectedReduction so the defense resolver picks it up.
        if (state.pendingAttack) {
          state.pendingAttack.injectedReduction = (state.pendingAttack.injectedReduction ?? 0) + total;
        }
      }
    }
  }
  state.pendingBankSpend = undefined;
  holder.signatureState["__lastSpend"] = spend;

  // Resume any halted offensive commit. The engine paused before firing
  // the ability so the spend bonus could be folded into its damage leaf.
  const poc = state.pendingOffensiveCommit;
  if (poc && poc.attacker === pbs.holder) {
    state.pendingOffensiveCommit = undefined;
    events.push(...commitOffensiveAbility(state, poc.abilityIndex));
  }
  return events;
}

/** Resolve a `pendingStatusRemoval` prompt. When `cardId` names an Instant
 *  with a matching `opponent-attempts-remove-status` trigger, the engine
 *  pays its cost, resolves it, and finalises the queued removal — dropping
 *  the strip if the resolved effect set `prevented`, or completing it
 *  otherwise. `cardId === null` declines: removal completes normally. */
function respondToStatusRemoval(state: GameState, cardId: import("./types").CardId | null): GameEvent[] {
  const psr = state.pendingStatusRemoval;
  if (!psr) return [];
  const events: GameEvent[] = [];
  const holder = state.players[psr.holder];

  if (cardId != null) {
    const card = holder.hand.find(c => c.id === cardId);
    const trigger = card?.trigger;
    const valid =
      !!card
      && card.kind === "instant"
      && trigger?.kind === "opponent-attempts-remove-status"
      && trigger.status === psr.status
      && holder.cp >= card.cost;
    if (valid && card) {
      events.push(...gainCp(holder, -card.cost));
      holder.hand = holder.hand.filter(c => c.id !== cardId);
      holder.discard.push(card);
      events.push({ t: "card-played", player: holder.player, cardId });
      const opponent = state.players[other(holder.player)];
      if (card.effect.kind === "custom") {
        const handler = getCustomHandler(card.effect.id);
        if (handler) events.push(...handler({ state, caster: holder, opponent }));
      } else {
        events.push(...resolveEffect(card.effect, { state, caster: holder, opponent }));
      }
    }
  }

  // Finalise.
  const prevented = psr.prevented === true;
  if (!prevented) {
    const holderSnap = state.players[psr.holder];
    const stripped = holderSnap.statuses.find(s => s.id === psr.status);
    const stripCount = stripped?.stacks ?? 0;
    const originalApplier = stripped?.appliedBy;
    const r = stripStatus(holderSnap, psr.status);
    events.push(...r.events);
    if (originalApplier && originalApplier !== psr.applier && stripCount > 0) {
      const applierSnap = state.players[originalApplier];
      const heroDef = getHero(applierSnap.hero);
      for (const trig of heroDef.resourceIdentity.cpGainTriggers) {
        if (trig.on !== "opponentRemovedSelfStatus") continue;
        if (trig.status && trig.status !== psr.status) continue;
        const gain = trig.perStack ? trig.gain * stripCount : trig.gain;
        events.push(...gainCp(applierSnap, gain));
      }
    }
  }
  events.push({
    t: "status-remove-attempted",
    holder: psr.holder, applier: psr.applier, status: psr.status,
    stacks: psr.stacks, prevented,
  });
  state.pendingStatusRemoval = undefined;
  return events;
}

/** §15.2: resolve a player-initiated "atonement"-style status removal.
 *  Validates that the active player carries the named status, the active
 *  phase matches the action's `phase`, the cost is affordable, and the
 *  per-turn limit (if any) hasn't been hit. Pays the cost, fires
 *  `status-removal-by-holder-action`, strips the stacks (which emits
 *  `status-removed`), and resolves any `additionalEffect`. */
function resolveStatusHolderAction(
  state: GameState,
  statusId: import("./types").StatusId,
  actionIndex = 0,
): GameEvent[] {
  const holder = state.players[state.activePlayer];
  const inst = holder.statuses.find(s => s.id === statusId);
  if (!inst) return [];
  const def = getStatusDef(statusId);
  const action = def?.holderRemovalActions?.[actionIndex];
  if (!def || !action) return [];

  // Phase gate: `main-phase` shorthand matches both main-pre and main-post.
  const phaseOk =
    action.phase === state.phase
    || (action.phase === "main-phase" && (state.phase === "main-pre" || state.phase === "main-post"));
  if (!phaseOk) return [];

  // Per-turn limit — reuse the existing once-per-turn list with a synthetic
  // key so it persists across the same set of cleared-on-passTurn slots.
  const onceKey = `__holderAction:${statusId}:${actionIndex}`;
  if (action.oncePerTurn && holder.consumedOncePerTurnCards.includes(onceKey)) return [];

  // Pay the cost.
  if (action.cost.resource === "cp") {
    if (holder.cp < action.cost.amount) return [];
  } else if (action.cost.resource === "hp") {
    if (holder.hp <= action.cost.amount) return [];
  } else if (action.cost.resource === "discard-card") {
    if (holder.hand.length < action.cost.amount) return [];
  }

  const events: GameEvent[] = [];
  if (action.cost.resource === "cp") {
    events.push(...gainCp(holder, -action.cost.amount));
  } else if (action.cost.resource === "hp") {
    holder.hp -= action.cost.amount;
    events.push({ t: "hp-changed", player: holder.player, delta: -action.cost.amount, total: holder.hp });
  } else if (action.cost.resource === "discard-card") {
    // Auto-discard the leftmost N cards in hand (UI overlay can pre-reorder).
    for (let i = 0; i < action.cost.amount && holder.hand.length > 0; i++) {
      const card = holder.hand.shift()!;
      holder.discard.push(card);
      events.push({ t: "card-discarded", player: holder.player, cardId: card.id });
    }
  }

  // Strip the configured stacks. "all" → full strip; numeric → up to N.
  const before = inst.stacks;
  const stripCount = action.effect.stacksRemoved === "all" ? before : Math.min(before, action.effect.stacksRemoved);
  const stripResult = action.effect.stacksRemoved === "all"
    ? stripStatus(holder, statusId)
    : { events: [] as GameEvent[], pendingDamage: 0 };
  if (action.effect.stacksRemoved !== "all") {
    inst.stacks -= stripCount;
    if (inst.stacks <= 0) {
      holder.statuses = holder.statuses.filter(s => s.id !== statusId);
      events.push({ t: "status-removed", status: statusId, holder: holder.player, reason: "stripped" });
    }
  }
  events.push({
    t: "status-removal-by-holder-action",
    holder: holder.player,
    status: statusId,
    actionName: action.ui.actionName,
    stacksRemoved: stripCount,
  });
  events.push(...stripResult.events);

  // Optional ride-along effect — resolved with the holder as caster.
  if (action.effect.additionalEffect) {
    const opp = state.players[other(holder.player)];
    events.push(...resolveEffect(action.effect.additionalEffect, { state, caster: holder, opponent: opp }));
  }

  if (action.oncePerTurn) holder.consumedOncePerTurnCards.push(onceKey);
  return events;
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
    pendingOffensiveChoice: state.pendingOffensiveChoice ? { ...state.pendingOffensiveChoice, matches: state.pendingOffensiveChoice.matches.slice() } : undefined,
    pendingAttack: state.pendingAttack ? { ...state.pendingAttack } : undefined,
    pendingBankSpend: state.pendingBankSpend ? { ...state.pendingBankSpend } : undefined,
    pendingStatusRemoval: state.pendingStatusRemoval ? { ...state.pendingStatusRemoval } : undefined,
    pendingOffensiveCommit: state.pendingOffensiveCommit ? { ...state.pendingOffensiveCommit } : undefined,
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
    abilityModifiers: p.abilityModifiers.map(m => ({ ...m, modifications: m.modifications.map(x => ({ ...x })) })),
    tokenOverrides: p.tokenOverrides.map(o => ({ ...o, modifications: o.modifications.map(x => ({ ...x })) })),
    symbolBends: p.symbolBends.map(b => ({ ...b })),
    pipelineBuffs: p.pipelineBuffs?.map(b => ({ ...b, pipelineModifier: { ...b.pipelineModifier, cap: b.pipelineModifier.cap ? { ...b.pipelineModifier.cap } : undefined }, discardOn: b.discardOn ? { ...b.discardOn } : undefined })) ?? [],
    triggerBuffs: p.triggerBuffs?.map(b => ({ ...b, triggerModifier: { ...b.triggerModifier }, discardOn: b.discardOn ? { ...b.discardOn } : undefined })) ?? [],
    comboOverrides: p.comboOverrides?.map(c => ({ ...c, expires: { ...c.expires } })) ?? [],
    lastStripped: { ...p.lastStripped },
    masterySlots: { ...p.masterySlots },
    consumedOncePerMatchCards: p.consumedOncePerMatchCards.slice(),
    consumedOncePerTurnCards: p.consumedOncePerTurnCards.slice(),
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
