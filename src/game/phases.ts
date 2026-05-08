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
import { ROLL_ATTEMPTS } from "./types";
import { getHero } from "../content";
import { tickStatusesAt, applyStatus, stacksOf } from "./status";
import { drawCards, gainCp, autoDiscardOverHandCap, resolveEffect } from "./cards";
import { dealDamage } from "./damage";
import {
  evaluateLadder,
  comboMatchesFaces,
  computeComboExtras,
  classifyCrit,
  rollUnlocked,
} from "./dice";
import { nextInt } from "./rng";

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

  // Hero-specific signature passives at Upkeep land here when new content
  // is registered. Engine dispatches on hero.signatureMechanic.implementation.kind.

  // Tick own-upkeep statuses on the active player.
  const ownTick = tickStatusesAt(state, active, "ownUpkeep");
  events.push(...ownTick.events);

  // Generic hero CP-gain triggers tied to status ticks on opponent are
  // dispatched per the hero's resourceIdentity.cpGainTriggers when registered.
  for (const ev of ownTick.events) {
    if (ev.t === "status-ticked" && ev.holder === active.player) {
      const oppHero = getHero(opponent.hero);
      for (const trig of oppHero.resourceIdentity.cpGainTriggers) {
        if (trig.on === "statusTicked" && trig.status === ev.status && trig.on_target === "opponent") {
          events.push(...gainCp(opponent, trig.gain));
        }
      }
    }
  }
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
  rolledAttempt: number;
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
  // E.g. with ROLL_ATTEMPTS=3: 3→attempt 1, 2→attempt 2, 1→attempt 3.
  const attemptNumber = ROLL_ATTEMPTS - active.rollAttemptsRemaining + 1;
  rollUnlocked(state, active.dice);
  active.rollAttemptsRemaining = active.rollAttemptsRemaining - 1;

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

// ── Begin attack — picker + pause for defender's choice ────────────────────
/**
 * Picks the highest-tier matched offensive ability and emits the lead-up
 * events (`ability-triggered` + optional `ultimate-fired` + `attack-intended`).
 *
 * For undefendable / pure / ultimate damage types: there is no defense, so
 * we resolve damage immediately within this call.
 *
 * For normal / collateral damage types: we stash a `pendingAttack` on
 * `state` and return — engine.ts halts here until a `select-defense`
 * action arrives.
 *
 * Returns events emitted so far. State.pendingAttack indicates the halt.
 */
export function beginAttack(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  const opponent = state.players[other(state.activePlayer)];
  const hero = getHero(active.hero);

  // Picker: highest tier matched, then highest base damage among ties.
  const faces = active.dice.map(d => d.faces[d.current]);
  let firingIndex = -1;
  let firingTier = -1;
  let firingBaseDamage = -Infinity;
  for (let i = 0; i < hero.abilityLadder.length; i++) {
    if (!comboMatchesFaces(hero.abilityLadder[i].combo, faces)) continue;
    const a = hero.abilityLadder[i];
    const dmg = abilityBaseDamage(a, faces);
    if (a.tier > firingTier || (a.tier === firingTier && dmg > firingBaseDamage)) {
      firingIndex = i;
      firingTier = a.tier;
      firingBaseDamage = dmg;
    }
  }
  if (firingIndex < 0) return events;        // nothing landed — turn fizzled.

  const ability = hero.abilityLadder[firingIndex];
  const isCritical = classifyCrit(ability, active.dice);
  const upgradeBonus =
    ability.tier === 1 ? (active.upgrades[1] ?? 0) * 1 :
    ability.tier === 3 ? (active.upgrades[3] ?? 0) * 2 :
    0;
  const damageBonus = upgradeBonus + active.nextAbilityBonusDamage;
  active.nextAbilityBonusDamage = 0;
  const critFlat = isCritical === "minor" ? 1 : 0;
  const critMul  = isCritical === "major" ? 1.5 : 1;

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

  const defendable = ability.damageType === "normal" || ability.damageType === "collateral";
  const incomingAmount = computeIncomingAmount(ability.effect, ability.combo, faces, damageBonus, critFlat, critMul);

  events.push({
    t: "attack-intended",
    attacker: active.player,
    defender: opponent.player,
    abilityName: ability.name,
    tier: ability.tier,
    damageType: ability.damageType,
    incomingAmount,
    defendable,
  });

  if (!defendable) {
    // Undefendable / pure / ultimate: skip the defense flow entirely.
    events.push(...applyAttackEffects(state, firingIndex, faces, damageBonus, critFlat, critMul, isCritical, /*defensiveReduction*/ 0));
    return events;
  }

  // Stash pending attack and return — engine waits for select-defense action.
  state.pendingAttack = {
    attacker: active.player,
    defender: opponent.player,
    abilityIndex: firingIndex,
    abilityName: ability.name,
    tier: ability.tier,
    damageType: ability.damageType,
    incomingAmount,
    damageBonus,
    critFlat,
    critMul,
    isCritical,
    firingFaces: faces,
  };
  return events;
}

/** Estimate the maximum damage this attack could deal, pre-defense, used for
 *  the defender's overlay ("incoming X damage"). Mirrors the actual resolver
 *  for damage / scaling-damage / compound, with crit + bonus applied. */
function computeIncomingAmount(
  effect: import("./types").AbilityEffect,
  firingCombo: import("./types").DiceCombo,
  firingFaces: ReadonlyArray<import("./types").DieFace>,
  damageBonus: number,
  critFlat: number,
  critMul: number,
): number {
  switch (effect.kind) {
    case "damage":
      return Math.ceil(effect.amount * critMul + critFlat) + damageBonus;
    case "scaling-damage": {
      const extras = computeComboExtras(firingCombo, firingFaces);
      const clamped = Math.min(extras, effect.maxExtra);
      const baseAmt = effect.baseAmount + clamped * effect.perExtra;
      return Math.ceil(baseAmt * critMul + critFlat) + damageBonus;
    }
    case "compound":
      return effect.effects.reduce((acc, e) => acc + computeIncomingAmount(e, firingCombo, firingFaces, damageBonus, critFlat, critMul), 0);
    default:
      return 0;
  }
}

// ── Defender selects a defense — single roll, resolve, apply damage ────────
/**
 * Called from engine.ts when the defender dispatches `select-defense`.
 * Resolves the chosen defense (or skip), then applies the attack effects
 * with the computed reduction, then runs on-hit + CP triggers + lethal.
 *
 * Returns events emitted, and clears `state.pendingAttack`.
 */
export function resolveDefenseChoice(state: GameState, abilityIndex: number | null): GameEvent[] {
  const events: GameEvent[] = [];
  const pa = state.pendingAttack;
  if (!pa) return events;

  const defender = state.players[pa.defender];
  const defHero = getHero(defender.hero);
  const dl = defHero.defensiveLadder;

  let reduction = 0;
  let matchedTier: 1 | 2 | 3 | 4 | undefined;
  let matchedName: string | undefined;
  let landed = false;

  if (abilityIndex == null || !dl || dl.length === 0 || abilityIndex < 0 || abilityIndex >= dl.length) {
    // Defender chose to take it (or has no defenses).
    events.push({ t: "defense-intended", defender: defender.player, abilityIndex: null });
    events.push({
      t: "defense-resolved",
      player: defender.player,
      reduction: 0,
      landed: false,
    });
  } else {
    const chosen = dl[abilityIndex];
    const diceCount = chosen.defenseDiceCount ?? 3;
    events.push({
      t: "defense-intended",
      defender: defender.player,
      abilityIndex,
      abilityName: chosen.name,
      diceCount,
    });

    // Single roll of the chosen number of dice. We reuse the defender's die
    // shape (their hero faces) but only roll `diceCount` of them. The rest
    // of the defender's dice array is untouched (they're not "in play" for
    // this defense). UI fades unused slots.
    const rolledFaces: import("./types").DieFace[] = [];
    const rolledDescriptors: { index: number; current: number; symbol: string }[] = [];
    const dieFaceCount = defender.dice[0]?.faces.length ?? 6;
    for (let i = 0; i < diceCount; i++) {
      const r = nextInt(state.rngSeed, state.rngCursor, dieFaceCount);
      state.rngCursor = r.cursor;
      const face = defender.dice[0]!.faces[r.value];
      rolledFaces.push(face);
      // Mirror the roll into the defender's dice array so the UI can render
      // the rolled values (the first `diceCount` slots are "in play").
      defender.dice[i].current = r.value;
      defender.dice[i].locked = false;
      rolledDescriptors.push({ index: i, current: r.value, symbol: face.symbol });
    }
    // Mark unused defender dice as visually inactive (locked = true acts as
    // the "not in play" signal for the renderer).
    for (let i = diceCount; i < defender.dice.length; i++) defender.dice[i].locked = true;

    events.push({
      t: "defense-dice-rolled",
      player: defender.player,
      dice: rolledDescriptors,
      abilityName: chosen.name,
    });

    // Did the chosen defense's combo land on the rolled dice?
    const matched = comboMatchesFaces(chosen.combo, rolledFaces);
    if (matched) {
      landed = true;
      matchedTier = chosen.tier;
      matchedName = chosen.name;
      const r = resolveDefensiveEffect(chosen.effect, {
        defender,
        attacker: state.players[pa.attacker],
        firingCombo: chosen.combo,
        firingFaces: rolledFaces,
      });
      reduction += r.reduction;
      events.push(...r.events);
    }

    events.push({
      t: "defense-resolved",
      player: defender.player,
      reduction,
      matchedTier,
      abilityName: matchedName,
      landed,
    });
    if (reduction >= 2) {
      events.push({ t: "hero-state", player: defender.player, state: "defended" });
    }
    // Generic CP-gain triggers tied to successful defense.
    if (landed && reduction >= 1) {
      for (const trig of defHero.resourceIdentity.cpGainTriggers) {
        if (trig.on === "successfulDefense") events.push(...gainCp(defender, trig.gain));
      }
    }
  }

  // Apply the attack effects with the computed reduction.
  events.push(...applyAttackEffects(
    state,
    pa.abilityIndex,
    pa.firingFaces,
    pa.damageBonus,
    pa.critFlat,
    pa.critMul,
    pa.isCritical,
    reduction,
  ));

  state.pendingAttack = undefined;
  return events;
}

/** Apply the picked offensive ability's effects + on-hit + CP triggers + lethal.
 *  Shared between the undefendable branch in `beginAttack` and the
 *  defendable resolution in `resolveDefenseChoice`. */
function applyAttackEffects(
  state: GameState,
  abilityIndex: number,
  firingFaces: ReadonlyArray<import("./types").DieFace>,
  damageBonus: number,
  critFlat: number,
  critMul: number,
  isCritical: "minor" | "major" | false,
  defensiveReduction: number,
): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  const opponent = state.players[other(state.activePlayer)];
  const hero = getHero(active.hero);
  const ability = hero.abilityLadder[abilityIndex];

  events.push(...resolveAbilityEffect(state, ability.effect, {
    caster: active, opponent,
    damageBonus, defensiveReduction, critFlat, critMul,
    firingCombo: ability.combo,
    firingFaces,
  }));

  // On-hit signature application.
  if (hero.onHitApplyStatus) {
    let stacks = hero.onHitApplyStatus.stacks;
    if (isCritical) stacks += 1;
    events.push(...applyStatus(opponent, active.player, hero.onHitApplyStatus.status, stacks));
  }

  // Resource gain: +CP on ability landed.
  for (const trig of hero.resourceIdentity.cpGainTriggers) {
    if (trig.on === "abilityLanded") events.push(...gainCp(active, trig.gain));
  }

  if (opponent.hp <= 0) events.push(...endMatch(state, active.player));
  return events;
}

interface DefenseCtx {
  defender: HeroSnapshot;
  attacker: HeroSnapshot;
  firingCombo: import("./types").DiceCombo;
  firingFaces: ReadonlyArray<import("./types").DieFace>;
}

/** Resolve the matched defensive ability's effect tree. Returns the
 *  damage reduction it contributes (from reduce-damage leaves) and any
 *  events from heal / apply-status / etc. */
function resolveDefensiveEffect(
  effect: import("./types").AbilityEffect,
  ctx: DefenseCtx,
): { reduction: number; events: GameEvent[] } {
  switch (effect.kind) {
    case "reduce-damage":
      return { reduction: effect.amount, events: [] };
    case "heal": {
      const target = effect.target === "self" ? ctx.defender : ctx.attacker;
      const before = target.hp;
      target.hp = Math.min(target.hpCap, before + effect.amount);
      const delta = target.hp - before;
      if (delta <= 0) return { reduction: 0, events: [] };
      return { reduction: 0, events: [
        { t: "heal-applied", player: target.player, amount: delta },
        { t: "hp-changed", player: target.player, delta, total: target.hp },
      ]};
    }
    case "apply-status": {
      const target = effect.target === "self" ? ctx.defender : ctx.attacker;
      return { reduction: 0, events: applyStatus(target, ctx.defender.player, effect.status, effect.stacks) };
    }
    case "compound": {
      let reduction = 0;
      const events: GameEvent[] = [];
      for (const e of effect.effects) {
        const r = resolveDefensiveEffect(e, ctx);
        reduction += r.reduction;
        events.push(...r.events);
      }
      return { reduction, events };
    }
    default:
      return { reduction: 0, events: [] };
  }
}

// ── Effect resolver wrapper that applies crit modulation ────────────────────
interface AbilityCtx {
  caster: HeroSnapshot;
  opponent: HeroSnapshot;
  damageBonus: number;
  defensiveReduction: number;
  critFlat: number;
  critMul: number;
  /** Combo + faces of the firing ability — used by scaling-damage effects
   *  to compute "extras beyond combo minimum." */
  firingCombo?: import("./types").DiceCombo;
  firingFaces?: ReadonlyArray<import("./types").DieFace>;
}

/** Picker-time base damage estimate for an ability. Compound effects sum
 *  their damage leaves; scaling-damage uses the *max* possible scaling
 *  (baseAmount + maxExtra * perExtra). */
function abilityBaseDamage(a: import("./types").AbilityDef, _faces: ReadonlyArray<import("./types").DieFace>): number {
  return effectMaxDamage(a.effect);
}
function effectMaxDamage(effect: import("./types").AbilityEffect): number {
  switch (effect.kind) {
    case "damage":          return effect.amount;
    case "scaling-damage":  return effect.baseAmount + effect.perExtra * effect.maxExtra;
    case "compound":        return effect.effects.reduce((acc, e) => acc + effectMaxDamage(e), 0);
    default:                return 0;
  }
}

function resolveAbilityEffect(state: GameState, effect: import("./types").AbilityEffect, ctx: AbilityCtx): GameEvent[] {
  // Walk the effect tree; for damage leaves apply critFlat + critMul + damageBonus.
  if (effect.kind === "damage") {
    const total = Math.ceil((effect.amount * ctx.critMul) + ctx.critFlat) + ctx.damageBonus;
    const r = dealDamage(ctx.caster.player, ctx.opponent, total, effect.type, ctx.defensiveReduction);
    return r.events;
  }
  if (effect.kind === "scaling-damage") {
    let extras = 0;
    if (ctx.firingCombo && ctx.firingFaces) {
      extras = computeComboExtras(ctx.firingCombo, ctx.firingFaces);
    }
    const clamped = Math.min(extras, effect.maxExtra);
    const baseAmt = effect.baseAmount + clamped * effect.perExtra;
    const total = Math.ceil(baseAmt * ctx.critMul + ctx.critFlat) + ctx.damageBonus;
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
  // Hero-specific damageBonus contributions (signature passives) plug in here
  // once new heroes register their behaviors. For now: only transient
  // nextAbilityBonusDamage (set by cards like "next ability +N dmg").
  const damageBonus = active.nextAbilityBonusDamage;
  const rows = evaluateLadder(hero, active, active.rollAttemptsRemaining, {
    opponentHp: opponent.hp,
    pendingOpponentDamage: 0,
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
