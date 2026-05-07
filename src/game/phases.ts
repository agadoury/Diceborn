/**
 * Diceborn — phase progression.
 *
 * The phase order:
 *   pre-match → upkeep → income → main-pre → offensive-roll → defensive-roll
 *               → main-post → discard → (next player's upkeep) → ...
 *
 * Most transitions are auto. The exceptions:
 *   - main-pre → offensive-roll: requires the active player to tap ROLL
 *     (action: "roll-dice") OR end-turn-without-rolling (rare; not in MVP).
 *   - main-post → discard: requires the active player to tap END TURN.
 *
 * Defensive roll is auto-resolved (no defender input). Returns the mitigation
 * amount + the matched defensive ability info for the choreographer.
 */

import type {
  GameEvent,
  GameState,
  HeroSnapshot,
  PlayerId,
  Phase,
  HeroDefinition,
  Die,
} from "./types";
import { getHero } from "../content";
import { tickStatusesAt, applyStatus, stacksOf } from "./status";
import { drawCards, gainCp, autoDiscardOverHandCap, resolveEffect } from "./cards";
import { dealDamage } from "./damage";
import {
  evaluateLadder,
  comboMatches,
  symbolsOnDice,
  classifyCrit,
  rollUnlocked,
} from "./dice";

// ── Phase transition table ──────────────────────────────────────────────────
const NEXT: Record<Phase, Phase> = {
  "pre-match":       "upkeep",
  "upkeep":          "income",
  "income":          "main-pre",
  "main-pre":        "offensive-roll",
  "offensive-roll":  "defensive-roll",
  "defensive-roll":  "main-post",
  "main-post":       "discard",
  "discard":         "upkeep",          // belongs to next player; engine.ts swaps activePlayer
  "match-end":       "match-end",
};

export function nextPhase(p: Phase): Phase { return NEXT[p]; }

// ── Phase enter handlers (auto-running pieces) ──────────────────────────────
export function enterPhase(state: GameState, phase: Phase): GameEvent[] {
  const events: GameEvent[] = [];
  const before = state.phase;
  state.phase = phase;
  if (before !== phase) {
    events.push({ t: "phase-changed", player: state.activePlayer, from: before, to: phase });
  }
  switch (phase) {
    case "upkeep":   events.push(...runUpkeep(state)); break;
    case "income":   events.push(...runIncome(state)); break;
    case "discard":  events.push(...runDiscard(state)); break;
    // main-pre, main-post, offensive-roll, defensive-roll: enter and wait.
    default: break;
  }
  return events;
}

// ── Upkeep ──────────────────────────────────────────────────────────────────
export function runUpkeep(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  const opponent = state.players[other(state.activePlayer)];

  // RAGE passive: at upkeep, if HP <= threshold, gain perTurnStack (cap).
  const heroDef = getHero(active.hero);
  if (heroDef.signatureMechanic.implementation.kind === "rage") {
    const r = heroDef.signatureMechanic.implementation;
    const frac = active.hp / active.hpStart;
    if (frac <= r.threshold) {
      const before = active.signatureState["rage"] ?? 0;
      const after = Math.min(r.cap, before + r.perTurnStack);
      if (after > before) {
        active.signatureState["rage"] = after;
        events.push({ t: "rage-changed", player: active.player, stacks: after });
      }
    }
  }

  // Tick own-upkeep statuses on the active player (Burn, Regen).
  const ownTick = tickStatusesAt(state, active, "ownUpkeep");
  events.push(...ownTick.events);
  if (ownTick.pendingDamage > 0) {
    const r = dealDamage(active.player, active, ownTick.pendingDamage, "pure", 0);
    events.push(...r.events);
    if (r.lethal) return [...events, ...endMatch(state, opponent.player)];
  }
  if (ownTick.pendingHeal > 0) {
    const before = active.hp;
    active.hp = Math.min(active.hpCap, before + ownTick.pendingHeal);
    const delta = active.hp - before;
    if (delta > 0) {
      events.push(
        { t: "heal-applied", player: active.player, amount: delta },
        { t: "hp-changed", player: active.player, delta, total: active.hp },
      );
    }
  }

  // Tick applier-upkeep statuses on the *opponent* (Bleeding applied by active).
  const applierTick = tickStatusesAt(state, opponent, "applierUpkeep");
  events.push(...applierTick.events);
  if (applierTick.pendingDamage > 0) {
    const r = dealDamage(active.player, opponent, applierTick.pendingDamage, "pure", 0);
    events.push(...r.events);
    if (r.lethal) return [...events, ...endMatch(state, active.player)];
  }
  return events;
}

// ── Income ──────────────────────────────────────────────────────────────────
export function runIncome(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  if (state.activePlayer === state.startPlayer && !state.startPlayerSkippedFirstIncome) {
    state.startPlayerSkippedFirstIncome = true;
    return events;            // Start Player skips their first Income only.
  }
  events.push(...gainCp(active, 1));
  events.push(...drawCards(state, active, 1));
  return events;
}

// ── Discard (auto-sell down to HAND_CAP) ────────────────────────────────────
export function runDiscard(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  events.push(...autoDiscardOverHandCap(active));
  return events;
}

// ── Offensive roll resolution (called by engine.ts on roll-dice action) ─────
export interface OffensiveResolveResult {
  events: GameEvent[];
  rolledAttempt: 1 | 2;
  /** True if the player has more attempts left and may roll again. */
  canRollAgain: boolean;
}

export function performRoll(state: GameState): OffensiveResolveResult {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  const hero = getHero(active.hero);

  // Stunned? Skip the offensive-roll entirely. Stun decrements by 1.
  if (stacksOf(active, "stun") > 0) {
    const inst = active.statuses.find(s => s.id === "stun")!;
    inst.stacks = 0;
    active.statuses = active.statuses.filter(s => s.id !== "stun");
    events.push({ t: "status-removed", status: "stun", holder: active.player, reason: "expired" });
    active.rollAttemptsRemaining = 0;
    // Re-evaluate ladder so the UI shows nothing firing.
    events.push(...emitLadderState(state, hero, active));
    return { events, rolledAttempt: 1, canRollAgain: false };
  }

  if (active.rollAttemptsRemaining <= 0) {
    return { events, rolledAttempt: 1, canRollAgain: false };
  }

  // Determine attempt number (used by the choreographer for staggered visuals).
  const attemptNumber = (active.rollAttemptsRemaining === 2 ? 1 : 2) as 1 | 2;
  rollUnlocked(state, active.dice);
  active.rollAttemptsRemaining = (active.rollAttemptsRemaining - 1) as 0 | 1 | 2;

  events.push({
    t: "dice-rolled",
    player: active.player,
    dice: active.dice.map(d => ({ index: d.index, current: d.current, symbol: d.faces[d.current].symbol, locked: d.locked })),
    attemptNumber,
  });

  // Update ladder state immediately after each roll.
  events.push(...emitLadderState(state, hero, active));

  return {
    events,
    rolledAttempt: attemptNumber,
    canRollAgain: active.rollAttemptsRemaining > 0,
  };
}

// ── Resolve the highest-tier matched ability (called when Offensive roll ends) ─
export function resolveOffensiveAbility(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  const opponent = state.players[other(state.activePlayer)];
  const hero = getHero(active.hero);

  const symbols = symbolsOnDice(active.dice);
  let firingIndex = -1;
  for (let i = 0; i < hero.abilityLadder.length; i++) {
    if (comboMatches(hero.abilityLadder[i].combo, symbols)) firingIndex = i;
  }
  if (firingIndex < 0) {
    // Nothing fired — the player's offensive turn produced no ability.
    return events;
  }

  const ability = hero.abilityLadder[firingIndex];
  const isCritical = classifyCrit(ability, active.dice);

  // Damage bonus aggregator.
  const ragePerStack = (() => {
    if (hero.signatureMechanic.implementation.kind !== "rage") return 0;
    return hero.signatureMechanic.implementation.perStackBonus;
  })();
  const rageStacks = active.signatureState["rage"] ?? 0;
  const upgradeBonus = (() => {
    // Honed Edge upgrades Tier 1 with +1 dmg; Bloodlust upgrades Tier 3 with +2 dmg.
    if (ability.tier === 1) return (active.upgrades[1] ?? 0) * 1;
    if (ability.tier === 3) return (active.upgrades[3] ?? 0) * 2;
    return 0;
  })();
  let damageBonus = rageStacks * ragePerStack + upgradeBonus + active.nextAbilityBonusDamage;
  // Crit: minor +1, major +50% (rounded up).
  // Note: major (Tier 4) crit's damage scaling happens after we know base damage.
  active.nextAbilityBonusDamage = 0;       // consumed.

  events.push({
    t: "ability-triggered",
    player: active.player,
    tier: ability.tier,
    abilityName: ability.name,
    isCritical,
  });
  if (ability.tier === 4) {
    events.push({ t: "ultimate-fired", player: active.player, abilityName: ability.name, isCritical: !!isCritical });
  }

  // Defensive roll for normal/ultimate/collateral damage.
  let defensiveReduction = 0;
  if (ability.damageType === "normal" || ability.damageType === "ultimate" || ability.damageType === "collateral") {
    const def = autoResolveDefense(state, opponent);
    defensiveReduction = def.reduction;
    events.push(...def.events);
  }

  // Resolve the ability effect, with bonus + crit modulation.
  // For minor crit: +1 dmg flat per damage-leaf in the effect tree.
  // For major crit: +50% rounded up per damage-leaf in the effect tree.
  const critFlat = isCritical === "minor" ? 1 : 0;
  const critMul  = isCritical === "major" ? 1.5 : 1;

  const baseEvents = resolveAbilityEffect(state, ability.effect, {
    caster: active, opponent,
    damageBonus, defensiveReduction, critFlat, critMul,
  });
  events.push(...baseEvents);

  // On-hit signature application (Bleeding for Barbarian).
  if (hero.onHitApplyStatus) {
    let stacks = hero.onHitApplyStatus.stacks;
    if (isCritical) stacks += 1;
    events.push(...applyStatus(opponent, active.player, hero.onHitApplyStatus.status, stacks));
  }

  // Resource gain: hero's CP triggers (Barbarian: +1 CP on ability landed).
  for (const trig of hero.resourceIdentity.cpGainTriggers) {
    if (trig.on === "abilityLanded") events.push(...gainCp(active, trig.gain));
  }

  // Lethal check.
  if (opponent.hp <= 0) {
    events.push(...endMatch(state, active.player));
  }
  return events;
}

// ── Defensive auto-resolve ─────────────────────────────────────────────────
function autoResolveDefense(
  state: GameState,
  defender: HeroSnapshot,
): { reduction: number; events: GameEvent[] } {
  // MVP: simple deterministic reduction policy — sum 1 for every SHIELD face
  // showing on the defender's current dice (fresh single roll, no rerolls).
  const events: GameEvent[] = [];
  rollUnlocked(state, defender.dice);
  let reduction = 0;
  for (const d of defender.dice) {
    if (d.faces[d.current].symbol.endsWith(":shield")) reduction++;
  }
  events.push({
    t: "dice-rolled",
    player: defender.player,
    dice: defender.dice.map(d => ({ index: d.index, current: d.current, symbol: d.faces[d.current].symbol, locked: d.locked })),
    attemptNumber: 1,
  });
  events.push({ t: "defense-resolved", player: defender.player, reduction });
  if (reduction >= 2) events.push({ t: "hero-state", player: defender.player, state: "defended" });
  return { reduction, events };
}

// ── Effect resolver wrapper that applies crit modulation ────────────────────
interface AbilityCtx {
  caster: HeroSnapshot;
  opponent: HeroSnapshot;
  damageBonus: number;
  defensiveReduction: number;
  critFlat: number;
  critMul: number;
}

function resolveAbilityEffect(state: GameState, effect: import("./types").AbilityEffect, ctx: AbilityCtx): GameEvent[] {
  // Walk the effect tree; for damage leaves apply critFlat + critMul + damageBonus.
  if (effect.kind === "damage") {
    const total = Math.ceil((effect.amount * ctx.critMul) + ctx.critFlat) + ctx.damageBonus;
    const r = dealDamage(ctx.caster.player, ctx.opponent, total, effect.type, ctx.defensiveReduction);
    return r.events;
  }
  if (effect.kind === "compound") {
    const out: GameEvent[] = [];
    for (const e of effect.effects) out.push(...resolveAbilityEffect(state, e, ctx));
    return out;
  }
  // For non-damage effects: apply crit flat to status stacks.
  if (effect.kind === "apply-status" && ctx.critMul > 1) {
    const stacked: import("./types").AbilityEffect = { ...effect, stacks: effect.stacks * 2 };
    return resolveEffect(stacked, { state, caster: ctx.caster, opponent: ctx.opponent, isAbility: true });
  }
  return resolveEffect(effect, { state, caster: ctx.caster, opponent: ctx.opponent, isAbility: true });
}

// ── Ladder emission ─────────────────────────────────────────────────────────
export function emitLadderState(state: GameState, hero: HeroDefinition, active: HeroSnapshot): GameEvent[] {
  const opponent = state.players[other(active.player)];
  const rage = active.signatureState["rage"] ?? 0;
  const ragePerStack =
    hero.signatureMechanic.implementation.kind === "rage"
      ? hero.signatureMechanic.implementation.perStackBonus
      : 0;
  const damageBonus = rage * ragePerStack + active.nextAbilityBonusDamage;
  const rows = evaluateLadder(hero, active, active.rollAttemptsRemaining, {
    opponentHp: opponent.hp,
    pendingOpponentDamage: stacksOf(opponent, "bleeding"),  // ticks at applier upkeep next turn
    damageBonus,
    reachabilitySamples: 200,
    reachabilitySeed: state.rngSeed,
  });
  active.ladderState = rows;
  return [{ t: "ladder-state-changed", player: active.player, rows }];
}

// ── Match end ───────────────────────────────────────────────────────────────
export function endMatch(state: GameState, winner: PlayerId | "draw"): GameEvent[] {
  state.winner = winner;
  state.phase = "match-end";
  const events: GameEvent[] = [{ t: "match-won", winner }];
  if (winner === "draw") {
    events.push({ t: "hero-state", player: "p1", state: "defeated" });
    events.push({ t: "hero-state", player: "p2", state: "defeated" });
  } else {
    events.push({ t: "hero-state", player: winner, state: "victorious" });
    events.push({ t: "hero-state", player: other(winner), state: "defeated" });
  }
  return events;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
export function other(p: PlayerId): PlayerId { return p === "p1" ? "p2" : "p1"; }
export { rollUnlocked };
export type { Die };
