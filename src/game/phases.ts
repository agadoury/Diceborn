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
import { tickStatusesAt, applyStatus, stacksOf, applyTokenOverrideNumeric } from "./status";
import { drawCards, gainCp, autoDiscardOverHandCap, resolveEffect, checkState, computeConditionalBonus } from "./cards";
import { listRegisteredStatuses, getStatusDef } from "./status";
import { dealDamage } from "./damage";
import {
  evaluateLadder,
  comboMatchesFaces,
  computeComboExtras,
  classifyCrit,
  rollUnlocked,
  bentFaces,
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

/** Compute the effective firing faces for a hero — applies symbol bends and,
 *  if the hero has a `forcedFaceValue` set this turn (Last Stand), returns
 *  five copies of the hero's `diceIdentity.faces[forcedFaceValue - 1]`
 *  regardless of actual die state. Survives rerolls. */
export function effectiveFiringFaces(
  hero_snapshot: HeroSnapshot,
  hero: HeroDefinition,
): import("./types").DieFace[] {
  if (hero_snapshot.forcedFaceValue != null) {
    const forced = hero.diceIdentity.faces[hero_snapshot.forcedFaceValue - 1];
    return hero_snapshot.dice.map(() => ({ ...forced }));
  }
  const rawFaces = hero_snapshot.dice.map(d => d.faces[d.current]);
  return bentFaces(rawFaces, hero_snapshot.symbolBends);
}

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
  events.push(...resolveUpkeepSignaturePassive(active));

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

// ── Begin attack — open the offensive picker (Correction 7) ────────────────
/**
 * Compute every ability whose combo currently matches the caster's dice
 * (with active symbol bends applied) and emit `offensive-pick-prompt`.
 * The engine halts via `state.pendingOffensiveChoice` until the active
 * player dispatches `select-offensive-ability`.
 *
 * If zero abilities match, the offensive turn fizzles and `offensiveFallback`
 * (if any) is consulted.
 *
 * The actual ability resolution — `ability-triggered`, `attack-intended`,
 * applying damage or stashing `pendingAttack` — happens in
 * `commitOffensiveAbility`, which engine.ts calls from the
 * `select-offensive-ability` handler.
 */
export function beginOffensivePick(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  const opponent = state.players[other(state.activePlayer)];
  const hero = getHero(active.hero);

  const faces = effectiveFiringFaces(active, hero);

  // Collect all matching abilities, sorted highest-tier-first then
  // highest-base-damage-first (legacy auto-pick order — UX-friendly default
  // for the picker overlay).
  const matches: Array<{
    abilityIndex: number; abilityName: string;
    tier: import("./types").AbilityTier; baseDamage: number;
    damageType: import("./types").DamageType; shortText: string;
  }> = [];
  for (let i = 0; i < hero.abilityLadder.length; i++) {
    const a = hero.abilityLadder[i];
    if (!comboMatchesFaces(a.combo, faces)) continue;
    matches.push({
      abilityIndex: i,
      abilityName: a.name,
      tier: a.tier,
      baseDamage: abilityBaseDamage(a, faces),
      damageType: a.damageType,
      shortText: a.shortText,
    });
  }
  matches.sort((x, y) => y.tier - x.tier || y.baseDamage - x.baseDamage);

  if (matches.length === 0) {
    // Offense produced no ability. Per Correction 6 §7, the caster's own
    // defensive ladder is consulted for an `offensiveFallback` block.
    events.push(...tryOffensiveFallback(state));
    return events;
  }

  state.pendingOffensiveChoice = {
    attacker: active.player,
    defender: opponent.player,
    matches,
  };
  events.push({
    t: "offensive-pick-prompt",
    attacker: active.player,
    matches: matches.map(m => ({
      abilityIndex: m.abilityIndex,
      abilityName: m.abilityName,
      tier: m.tier,
      baseDamage: m.baseDamage,
      damageType: m.damageType,
    })),
  });
  return events;
}

/**
 * Resolve the ability the active player picked from `pendingOffensiveChoice`.
 * Mirrors the previous `beginAttack` body: emits `ability-triggered`,
 * (optionally) `ultimate-fired`, `attack-intended`. Then either applies
 * damage inline (undefendable / pure / ultimate) or stashes `pendingAttack`
 * for the defender's pick.
 *
 * `abilityIndex` is the chosen index into the attacker's `abilityLadder`.
 * Caller has already validated it against `pendingOffensiveChoice.matches`
 * and cleared `pendingOffensiveChoice`.
 */
export function commitOffensiveAbility(state: GameState, abilityIndex: number): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  const opponent = state.players[other(state.activePlayer)];
  const hero = getHero(active.hero);

  const faces = effectiveFiringFaces(active, hero);
  const ability = hero.abilityLadder[abilityIndex];

  events.push({
    t: "offensive-choice-made",
    attacker: active.player,
    abilityIndex,
    abilityName: ability.name,
  });

  // Critical Ultimate (Correction 6 §12): if the ability declares a more-
  // restrictive critical combo and that matches, escalate the crit class to
  // "major" so the choreographer plays the enhanced cinematic.
  let isCritical = classifyCrit(ability, active.dice);
  let critTriggered = false;
  if (ability.criticalCondition && comboMatchesFaces(ability.criticalCondition, faces)) {
    isCritical = "major";
    critTriggered = true;
  }
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
    events.push(...applyAttackEffects(state, abilityIndex, faces, damageBonus, critFlat, critMul, isCritical, /*defensiveReduction*/ 0, critTriggered));
    return events;
  }

  state.pendingAttack = {
    attacker: active.player,
    defender: opponent.player,
    abilityIndex,
    abilityName: ability.name,
    tier: ability.tier,
    damageType: ability.damageType,
    incomingAmount,
    damageBonus,
    critFlat,
    critMul,
    isCritical,
    critTriggered,
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

  let reduction = pa.injectedReduction ?? 0;
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
        state,
        defender,
        attacker: state.players[pa.attacker],
        firingCombo: chosen.combo,
        firingFaces: rolledFaces,
        abilityName: chosen.name,
        abilityTier: chosen.tier,
        incomingAmount: pa.incomingAmount,
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
    pa.critTriggered,
  ));

  state.pendingAttack = undefined;
  return events;
}

/** Apply the picked offensive ability's effects + on-hit + CP triggers + lethal.
 *  Shared between the undefendable branch in `beginAttack` and the
 *  defendable resolution in `resolveDefenseChoice`. When `critTriggered`,
 *  consumes the ability's `criticalEffect` (Correction 6 §12). */
function applyAttackEffects(
  state: GameState,
  abilityIndex: number,
  firingFaces: ReadonlyArray<import("./types").DieFace>,
  damageBonus: number,
  critFlat: number,
  critMul: number,
  isCritical: "minor" | "major" | false,
  defensiveReduction: number,
  critTriggered: boolean,
): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  const opponent = state.players[other(state.activePlayer)];
  const hero = getHero(active.hero);
  const ability = hero.abilityLadder[abilityIndex];

  // Critical Ultimate damage modifiers — applied once at the top of the
  // effect resolution. damageOverride takes precedence over multiplier.
  // Cosmetic-only crits leave damageBonus untouched.
  let effectiveBonus = damageBonus;
  let critEffectMul = 1;
  if (critTriggered && ability.criticalEffect && !ability.criticalEffect.cosmeticOnly) {
    if (ability.criticalEffect.damageOverride != null) {
      // Override is realised by replacing the leaf damage; for a clean
      // implementation we add the diff between override and the picker's
      // best estimate to damageBonus (works for single-leaf damage abilities).
      const baseEstimate = effectMaxDamage(ability.effect);
      effectiveBonus += (ability.criticalEffect.damageOverride - baseEstimate);
    } else if (ability.criticalEffect.damageMultiplier != null) {
      critEffectMul = ability.criticalEffect.damageMultiplier;
    }
  }

  events.push(...resolveAbilityEffect(state, ability.effect, {
    caster: active, opponent,
    damageBonus: effectiveBonus,
    defensiveReduction,
    critFlat,
    critMul: critMul * critEffectMul,
    firingCombo: ability.combo,
    firingFaces,
    abilityName: ability.name,
    abilityTier: ability.tier,
  }));

  // Critical effect-additions (extra effects that fire on top of the base).
  if (critTriggered && ability.criticalEffect?.effectAdditions) {
    for (const add of ability.criticalEffect.effectAdditions) {
      events.push(...resolveAbilityEffect(state, add, {
        caster: active, opponent,
        damageBonus: 0, defensiveReduction: 0, critFlat: 0, critMul: 1,
        firingCombo: ability.combo, firingFaces,
        abilityName: ability.name, abilityTier: ability.tier,
      }));
    }
  }

  // On-hit signature application.
  if (hero.onHitApplyStatus) {
    let stacks = hero.onHitApplyStatus.stacks;
    if (isCritical) stacks += 1;
    events.push(...applyStatus(opponent, active.player, hero.onHitApplyStatus.status, stacks, active));
  }

  // Resource gain: +CP on ability landed.
  for (const trig of hero.resourceIdentity.cpGainTriggers) {
    if (trig.on === "abilityLanded") events.push(...gainCp(active, trig.gain));
  }

  // Defender-side signature passive trigger — Frenzy registers any HP loss
  // dealt to `opponent` (the defender of this attack) so it grants +1 stack
  // at the defender's next Upkeep.
  let damageToOpponent = 0;
  for (const ev of events) {
    if (ev.t === "damage-dealt" && ev.from === active.player && ev.to === opponent.player) {
      damageToOpponent += ev.amount;
    }
  }
  noteOffensiveDamageTaken(opponent, damageToOpponent);

  if (opponent.hp <= 0) events.push(...endMatch(state, active.player));
  return events;
}

interface DefenseCtx {
  state: GameState;
  defender: HeroSnapshot;
  attacker: HeroSnapshot;
  firingCombo: import("./types").DiceCombo;
  firingFaces: ReadonlyArray<import("./types").DieFace>;
  /** The chosen defense ability — used to dispatch ability-modifiers
   *  (`all-defenses` masteries like Wolfborn). */
  abilityName?: string;
  abilityTier?: import("./types").AbilityTier;
  /** Pre-defense estimate of damage about to land — used by `negate_attack`
   *  and the `damage-prevented-amount` conditional_bonus source. */
  incomingAmount: number;
}

/** Resolve the matched defensive ability's effect tree. Returns the
 *  damage reduction it contributes (from reduce-damage leaves) and any
 *  events from heal / apply-status / etc. */
function resolveDefensiveEffect(
  effect: import("./types").AbilityEffect,
  ctx: DefenseCtx,
): { reduction: number; events: GameEvent[] } {
  switch (effect.kind) {
    case "reduce-damage": {
      // Negation supersedes graded reduction. Mastery mods can flip
      // `negate-attack` on/off via `reduce-damage-negate-attack`.
      const negate = applyDefensiveBooleanModifier(
        ctx.defender, ctx.abilityName ?? "", "reduce-damage-negate-attack",
        effect.negate_attack === true, ctx.firingFaces,
      );
      let amount: number;
      if (negate) {
        amount = ctx.incomingAmount;
      } else {
        amount = applyDefensiveNumericModifier(ctx.defender, ctx.abilityName ?? "", "reduce-damage-amount", effect.amount, ctx.firingFaces);
        if (
          effect.conditional_bonus &&
          checkState(ctx.state, ctx.defender, ctx.attacker, effect.conditional_bonus.condition, ctx.firingFaces)
        ) {
          amount += computeConditionalBonus(ctx.defender, ctx.attacker, effect.conditional_bonus);
        }
      }
      // Prevented amount is min(reduction, incoming) — clamped because the
      // engine can't reduce below zero.
      const prevented = Math.max(0, Math.min(amount, ctx.incomingAmount));
      ctx.defender.signatureState["__damagePrevented"] = prevented;

      const events: GameEvent[] = [];
      if (effect.apply_to_attacker) {
        const ata = effect.apply_to_attacker;
        const status = applyDefensiveStringModifier(
          ctx.defender, ctx.abilityName ?? "", "reduce-damage-apply-to-attacker-status",
          ata.status, ctx.firingFaces,
        );
        let stacks = applyDefensiveNumericModifier(
          ctx.defender, ctx.abilityName ?? "", "reduce-damage-apply-to-attacker-stacks",
          ata.stacks, ctx.firingFaces,
        );
        if (
          ata.conditional_bonus &&
          checkState(ctx.state, ctx.defender, ctx.attacker, ata.conditional_bonus.condition, ctx.firingFaces)
        ) {
          stacks += computeConditionalBonus(ctx.defender, ctx.attacker, ata.conditional_bonus);
        }
        if (stacks > 0) {
          events.push(...applyStatus(ctx.attacker, ctx.defender.player, status, stacks, ctx.defender));
        }
      }
      return { reduction: amount, events };
    }
    case "heal": {
      const target = effect.target === "self" ? ctx.defender : ctx.attacker;
      let amount = applyDefensiveNumericModifier(ctx.defender, ctx.abilityName ?? "", "heal-amount", effect.amount, ctx.firingFaces);
      if (
        effect.conditional_bonus &&
        checkState(ctx.state, ctx.defender, ctx.attacker, effect.conditional_bonus.condition, ctx.firingFaces)
      ) {
        amount += computeConditionalBonus(ctx.defender, ctx.attacker, effect.conditional_bonus);
      }
      const before = target.hp;
      target.hp = Math.min(target.hpCap, before + amount);
      const delta = target.hp - before;
      if (delta <= 0) return { reduction: 0, events: [] };
      return { reduction: 0, events: [
        { t: "heal-applied", player: target.player, amount: delta },
        { t: "hp-changed", player: target.player, delta, total: target.hp },
      ]};
    }
    case "apply-status": {
      const target = effect.target === "self" ? ctx.defender : ctx.attacker;
      let stacks = applyDefensiveNumericModifier(ctx.defender, ctx.abilityName ?? "", "applied-status-stacks", effect.stacks, ctx.firingFaces);
      if (
        effect.conditional_bonus &&
        checkState(ctx.state, ctx.defender, ctx.attacker, effect.conditional_bonus.condition, ctx.firingFaces)
      ) {
        stacks += computeConditionalBonus(ctx.defender, ctx.attacker, effect.conditional_bonus);
      }
      return { reduction: 0, events: applyStatus(target, ctx.defender.player, effect.status, stacks, ctx.defender) };
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
  /** Name + tier of the firing ability — used by ability-modifier scope matching. */
  abilityName?: string;
  abilityTier?: import("./types").AbilityTier;
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
  // Walk the effect tree; for damage leaves apply crit + damageBonus + ability
  // modifiers + passive token modifiers + conditional bonus + self_cost.
  if (effect.kind === "damage") {
    const out: GameEvent[] = [];
    let amount = effect.amount;
    let type = effect.type;
    // Active ability-upgrade modifiers (masteries, persistent buffs).
    amount = applyModifiersToBaseDamage(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, amount, ctx.firingFaces);
    type = applyModifiersToDamageType(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, type, ctx.firingFaces) ?? type;
    // Conditional damage-type override on the effect itself.
    if (effect.conditional_type_override && checkState(state, ctx.caster, ctx.opponent, effect.conditional_type_override.condition, ctx.firingFaces)) {
      type = effect.conditional_type_override.overrideTo;
    }
    // Conditional bonus on the effect itself — Mastery mods can adjust
    // its `bonusPerUnit` via `damage-conditional-bonus-bonus-per-unit`.
    let condBonus = 0;
    if (effect.conditional_bonus && checkState(state, ctx.caster, ctx.opponent, effect.conditional_bonus.condition, ctx.firingFaces)) {
      const cb = patchConditionalBonusPerUnit(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, "damage-conditional-bonus-bonus-per-unit", effect.conditional_bonus, ctx.firingFaces);
      condBonus = computeConditionalBonus(ctx.caster, ctx.opponent, cb);
    }
    // Passive-token modifier on attacker (e.g. Frost-bite -1 dmg per stack).
    const tokenAdj = aggregatePassiveModifiers(ctx.caster, "on-offensive-ability", "damage", state);
    let total = Math.ceil((amount * ctx.critMul) + ctx.critFlat) + ctx.damageBonus + condBonus + tokenAdj;
    if (total < 0) total = 0;
    const isDefendable = (type === "normal" || type === "ultimate" || type === "collateral");
    const r = dealDamage(ctx.caster.player, ctx.opponent, total, type, isDefendable ? ctx.defensiveReduction : 0);
    out.push(...r.events);
    // self_cost: unblockable HP loss to caster, doesn't trigger on-hit / passive gains.
    const selfCost = applyNumericModifier(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, "damage-self-cost", effect.self_cost ?? 0, ctx.firingFaces);
    if (selfCost > 0) {
      const sc = dealDamage(ctx.caster.player, ctx.caster, selfCost, "pure", 0);
      out.push(...sc.events);
    }
    return out;
  }
  if (effect.kind === "scaling-damage") {
    const out: GameEvent[] = [];
    let extras = 0;
    if (ctx.firingCombo && ctx.firingFaces) {
      extras = computeComboExtras(ctx.firingCombo, ctx.firingFaces);
    }
    const clamped = Math.min(extras, effect.maxExtra);
    let baseAmt = effect.baseAmount + clamped * effect.perExtra;
    let type = effect.type;
    baseAmt = applyModifiersToBaseDamage(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, baseAmt, ctx.firingFaces);
    type = applyModifiersToDamageType(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, type, ctx.firingFaces) ?? type;
    if (effect.conditional_type_override && checkState(state, ctx.caster, ctx.opponent, effect.conditional_type_override.condition, ctx.firingFaces)) {
      type = effect.conditional_type_override.overrideTo;
    }
    let condBonus = 0;
    if (effect.conditional_bonus && checkState(state, ctx.caster, ctx.opponent, effect.conditional_bonus.condition, ctx.firingFaces)) {
      const cb = patchConditionalBonusPerUnit(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, "damage-conditional-bonus-bonus-per-unit", effect.conditional_bonus, ctx.firingFaces);
      condBonus = computeConditionalBonus(ctx.caster, ctx.opponent, cb);
    }
    const tokenAdj = aggregatePassiveModifiers(ctx.caster, "on-offensive-ability", "damage", state);
    let total = Math.ceil(baseAmt * ctx.critMul + ctx.critFlat) + ctx.damageBonus + condBonus + tokenAdj;
    if (total < 0) total = 0;
    const isDefendable = (type === "normal" || type === "ultimate" || type === "collateral");
    const r = dealDamage(ctx.caster.player, ctx.opponent, total, type, isDefendable ? ctx.defensiveReduction : 0);
    out.push(...r.events);
    const selfCost = applyNumericModifier(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, "damage-self-cost", effect.self_cost ?? 0, ctx.firingFaces);
    if (selfCost > 0) {
      const sc = dealDamage(ctx.caster.player, ctx.caster, selfCost, "pure", 0);
      out.push(...sc.events);
    }
    return out;
  }
  if (effect.kind === "compound") {
    const out: GameEvent[] = [];
    for (const e of effect.effects) out.push(...resolveAbilityEffect(state, e, ctx));
    return out;
  }
  // Patch bonus-dice-damage with `bonus-dice-count` and `bonus-dice-threshold`
  // ability modifiers before forwarding to the shared resolver.
  if (effect.kind === "bonus-dice-damage") {
    const patched = applyModifiersToBonusDiceDamage(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, effect, ctx.firingFaces);
    return resolveEffect(patched, { state, caster: ctx.caster, opponent: ctx.opponent, isAbility: true });
  }
  // Patch heal with `heal-amount`, `self-heal-amount` (on self target), and
  // `heal-conditional-bonus` modifiers.
  if (effect.kind === "heal") {
    const patched = applyModifiersToHeal(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, effect, ctx.firingFaces);
    return resolveEffect(patched, { state, caster: ctx.caster, opponent: ctx.opponent, isAbility: true });
  }
  // Patch remove-status with `removed-status-stacks` modifier.
  if (effect.kind === "remove-status") {
    const stacks = applyNumericModifier(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, "removed-status-stacks", effect.stacks, ctx.firingFaces);
    if (stacks !== effect.stacks) {
      return resolveEffect({ ...effect, stacks }, { state, caster: ctx.caster, opponent: ctx.opponent, isAbility: true });
    }
  }
  // For non-damage effects: apply crit flat to status stacks. Conditional
  // bonus is folded in *before* the crit doubling and the bonus is stripped
  // from the forwarded effect so resolveEffect doesn't apply it twice.
  if (effect.kind === "apply-status") {
    // Target-aware field selection: self-target apply-status reads
    // `applied-status-stacks-self`; opponent-target reads `applied-status-stacks`.
    const stacksField: import("./types").AbilityUpgradeField =
      effect.target === "self" ? "applied-status-stacks-self" : "applied-status-stacks";
    const patchedStacks = applyNumericModifier(
      ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, stacksField, effect.stacks, ctx.firingFaces,
    );
    // Mastery may patch the conditional_bonus.bonusPerUnit too.
    const patchedCB = effect.conditional_bonus
      ? patchConditionalBonusPerUnit(ctx.caster, ctx.abilityName ?? "", ctx.abilityTier ?? 0, "applied-status-conditional-bonus", effect.conditional_bonus, ctx.firingFaces)
      : undefined;
    if (ctx.critMul > 1) {
      let bonus = 0;
      if (patchedCB && checkState(state, ctx.caster, ctx.opponent, patchedCB.condition, ctx.firingFaces)) {
        bonus = computeConditionalBonus(ctx.caster, ctx.opponent, patchedCB);
      }
      const stacked: import("./types").AbilityEffect = {
        ...effect,
        stacks: (patchedStacks + bonus) * 2,
        conditional_bonus: undefined,
      };
      return resolveEffect(stacked, { state, caster: ctx.caster, opponent: ctx.opponent, isAbility: true });
    }
    if (patchedStacks !== effect.stacks || patchedCB !== effect.conditional_bonus) {
      return resolveEffect({ ...effect, stacks: patchedStacks, conditional_bonus: patchedCB }, { state, caster: ctx.caster, opponent: ctx.opponent, isAbility: true });
    }
  }
  return resolveEffect(effect, { state, caster: ctx.caster, opponent: ctx.opponent, isAbility: true });
}

// ── Offensive fallback (Correction 6 §7) ────────────────────────────────────
function tryOffensiveFallback(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  const hero = getHero(active.hero);
  const dl = hero.defensiveLadder;
  if (!dl) return events;
  const candidates = dl.filter(d => d.offensiveFallback);
  if (candidates.length === 0) return events;
  // Pick the first matching fallback. Roll its dice count once and check the
  // (possibly overridden) combo. If it lands, resolve the fallback effect.
  for (const def of candidates) {
    const fb = def.offensiveFallback!;
    const diceCount = fb.diceCount ?? def.defenseDiceCount ?? 3;
    const rolledFaces: import("./types").DieFace[] = [];
    const dieFaceCount = active.dice[0]?.faces.length ?? 6;
    for (let i = 0; i < diceCount; i++) {
      const r = nextInt(state.rngSeed, state.rngCursor, dieFaceCount);
      state.rngCursor = r.cursor;
      rolledFaces.push(active.dice[0]!.faces[r.value]);
    }
    const combo = fb.combo ?? def.combo;
    if (!comboMatchesFaces(combo, rolledFaces)) continue;
    // Fire the fallback effect — uses the standard resolveEffect path.
    events.push(...resolveEffect(fb.effect, { state, caster: active, opponent: state.players[other(active.player)] }));
    break;
  }
  return events;
}

// ── Modifier evaluators (Correction 6) ──────────────────────────────────────

/** True if an ActiveAbilityModifier's scope matches the firing ability. */
function modifierMatches(m: import("./types").ActiveAbilityModifier, abilityName: string, tier: number): boolean {
  switch (m.scope.kind) {
    case "ability-ids": return m.scope.ids.some(id => id.toLowerCase() === abilityName.toLowerCase());
    case "all-tier":    return m.scope.tier === tier;
    case "all-defenses": return false;       // defensive scope; not for offensive ladder
  }
}

/** Sum of all ability-modifier base-damage adjustments matching the firing ability. */
function applyModifiersToBaseDamage(
  caster: HeroSnapshot,
  abilityName: string,
  tier: number,
  base: number,
  firingFaces?: ReadonlyArray<import("./types").DieFace>,
): number {
  let amount = base;
  for (const m of caster.abilityModifiers) {
    if (!modifierMatches(m, abilityName, tier)) continue;
    for (const mod of m.modifications) {
      if (mod.field !== "base-damage" && mod.field !== "scaling-damage-base") continue;
      if (mod.conditional && !conditionalMatches(mod.conditional, caster, firingFaces)) continue;
      const val = typeof mod.value === "number" ? mod.value : 0;
      if (mod.operation === "set") amount = val;
      else if (mod.operation === "add") amount += val;
      else if (mod.operation === "multiply") amount = Math.ceil(amount * val);
    }
  }
  return amount;
}

/** Read damage-type override modifier. Returns null if no modifier sets it. */
function applyModifiersToDamageType(
  caster: HeroSnapshot,
  abilityName: string,
  tier: number,
  base: import("./types").DamageType,
  firingFaces?: ReadonlyArray<import("./types").DieFace>,
): import("./types").DamageType | null {
  for (const m of caster.abilityModifiers) {
    if (!modifierMatches(m, abilityName, tier)) continue;
    for (const mod of m.modifications) {
      if (mod.field !== "damage-type") continue;
      if (mod.conditional && !conditionalMatches(mod.conditional, caster, firingFaces)) continue;
      if (typeof mod.value === "string") return mod.value as import("./types").DamageType;
    }
  }
  void base;
  return null;
}

/** Cheap conditional-state evaluator that only needs the caster + firing dice
 *  (no opponent/state lookup needed for the modifier conditions we support
 *  inside applyModifiers*). */
function conditionalMatches(
  cond: import("./types").StateCheck,
  caster: HeroSnapshot,
  firingFaces?: ReadonlyArray<import("./types").DieFace>,
): boolean {
  switch (cond.kind) {
    case "self-low-hp":              return caster.isLowHp;
    case "self-has-status-min":      return (caster.statuses.find(s => s.id === cond.status)?.stacks ?? 0) >= cond.count;
    case "passive-counter-min":      return (caster.signatureState[cond.passiveKey] ?? 0) >= cond.count;
    case "combo-symbol-count":
      return !!firingFaces && firingFaces.filter(f => f.symbol === cond.symbol).length >= cond.count;
    case "combo-n-of-a-kind": {
      if (!firingFaces) return false;
      const counts = new Map<number, number>();
      for (const f of firingFaces) counts.set(f.faceValue, (counts.get(f.faceValue) ?? 0) + 1);
      return Math.max(0, ...counts.values()) >= cond.count;
    }
    case "combo-straight": {
      if (!firingFaces) return false;
      const seen = new Set<number>(firingFaces.map(f => f.faceValue));
      let best = 0;
      for (const v of seen) {
        let len = 1;
        while (seen.has(v + len)) len++;
        if (len > best) best = len;
      }
      return best >= cond.length;
    }
    default: return false;
  }
}

/** Defensive-side numeric modifier reducer. Active modifiers whose scope is
 *  `all-defenses` (Wolfborn) or `ability-ids` matching the chosen defense
 *  apply here. */
function applyDefensiveNumericModifier(
  defender: HeroSnapshot,
  abilityName: string,
  field: import("./types").AbilityUpgradeMod["field"],
  base: number,
  firingFaces?: ReadonlyArray<import("./types").DieFace>,
): number {
  let amount = base;
  for (const mod of iterDefensiveMods(defender, abilityName, field, firingFaces)) {
    const val = typeof mod.value === "number" ? mod.value : 0;
    if (mod.operation === "set") amount = val;
    else if (mod.operation === "add") amount += val;
    else if (mod.operation === "multiply") amount = Math.ceil(amount * val);
  }
  return amount;
}

/** Defensive-side string modifier — used by `reduce-damage-apply-to-attacker-status`
 *  to swap the reflected status. Only `set` is meaningful for strings. */
function applyDefensiveStringModifier(
  defender: HeroSnapshot,
  abilityName: string,
  field: import("./types").AbilityUpgradeMod["field"],
  base: string,
  firingFaces?: ReadonlyArray<import("./types").DieFace>,
): string {
  let value = base;
  for (const mod of iterDefensiveMods(defender, abilityName, field, firingFaces)) {
    if (mod.operation === "set" && typeof mod.value === "string") value = mod.value;
  }
  return value;
}

/** Defensive-side boolean modifier — used by `reduce-damage-negate-attack`.
 *  `set` with value 1 → true, value 0 → false. */
function applyDefensiveBooleanModifier(
  defender: HeroSnapshot,
  abilityName: string,
  field: import("./types").AbilityUpgradeMod["field"],
  base: boolean,
  firingFaces?: ReadonlyArray<import("./types").DieFace>,
): boolean {
  let value = base;
  for (const mod of iterDefensiveMods(defender, abilityName, field, firingFaces)) {
    if (mod.operation !== "set") continue;
    value = typeof mod.value === "number" ? mod.value !== 0 : Boolean(mod.value);
  }
  return value;
}

function* iterDefensiveMods(
  defender: HeroSnapshot,
  abilityName: string,
  field: import("./types").AbilityUpgradeMod["field"],
  firingFaces: ReadonlyArray<import("./types").DieFace> | undefined,
): Generator<import("./types").AbilityUpgradeMod> {
  for (const m of defender.abilityModifiers) {
    let matches = false;
    if (m.scope.kind === "all-defenses") matches = true;
    else if (m.scope.kind === "ability-ids") matches = m.scope.ids.some(id => id.toLowerCase() === abilityName.toLowerCase());
    if (!matches) continue;
    for (const mod of m.modifications) {
      if (mod.field !== field) continue;
      if (mod.conditional && !conditionalMatches(mod.conditional, defender, firingFaces)) continue;
      yield mod;
    }
  }
}

/** Generic numeric modifier reducer — walks active ability modifiers and
 *  applies set/add/multiply ops on the matching field, respecting any
 *  conditional StateCheck. Used by heal-amount / applied-status-stacks /
 *  bonus-dice-threshold / heal-conditional-bonus etc. */
function applyNumericModifier(
  caster: HeroSnapshot,
  abilityName: string,
  tier: number,
  field: import("./types").AbilityUpgradeMod["field"],
  base: number,
  firingFaces?: ReadonlyArray<import("./types").DieFace>,
): number {
  let amount = base;
  for (const m of caster.abilityModifiers) {
    if (!modifierMatches(m, abilityName, tier)) continue;
    for (const mod of m.modifications) {
      if (mod.field !== field) continue;
      if (mod.conditional && !conditionalMatches(mod.conditional, caster, firingFaces)) continue;
      const val = typeof mod.value === "number" ? mod.value : 0;
      if (mod.operation === "set") amount = val;
      else if (mod.operation === "add") amount += val;
      else if (mod.operation === "multiply") amount = Math.ceil(amount * val);
    }
  }
  return amount;
}

/** Patch a `bonus-dice-damage` effect with active ability modifiers —
 *  rewrites `bonusDice` (`bonus-dice-count`) and the optional
 *  `thresholdBonus.threshold` (`bonus-dice-threshold`). */
function applyModifiersToBonusDiceDamage(
  caster: HeroSnapshot,
  abilityName: string,
  tier: number,
  effect: Extract<import("./types").AbilityEffect, { kind: "bonus-dice-damage" }>,
  firingFaces?: ReadonlyArray<import("./types").DieFace>,
): import("./types").AbilityEffect {
  let next = effect;
  const bonusDice = applyNumericModifier(caster, abilityName, tier, "bonus-dice-count", effect.bonusDice, firingFaces);
  if (bonusDice !== effect.bonusDice) next = { ...next, bonusDice };
  if (next.thresholdBonus) {
    const threshold = applyNumericModifier(caster, abilityName, tier, "bonus-dice-threshold", next.thresholdBonus.threshold, firingFaces);
    if (threshold !== next.thresholdBonus.threshold) next = { ...next, thresholdBonus: { ...next.thresholdBonus, threshold } };
  }
  return next;
}

/** Re-stamp `conditional_bonus.bonusPerUnit` from a Mastery numeric mod. */
function patchConditionalBonusPerUnit(
  caster: HeroSnapshot,
  abilityName: string,
  tier: number,
  field: import("./types").AbilityUpgradeField,
  cb: import("./types").ConditionalBonus,
  firingFaces?: ReadonlyArray<import("./types").DieFace>,
): import("./types").ConditionalBonus {
  const next = applyNumericModifier(caster, abilityName, tier, field, cb.bonusPerUnit, firingFaces);
  if (next === cb.bonusPerUnit) return cb;
  return { ...cb, bonusPerUnit: next };
}

/** Patch a `heal` effect with active ability modifiers — `heal-amount`
 *  (or `self-heal-amount` for self-target) on the base amount and
 *  `heal-conditional-bonus` on `conditional_bonus.bonusPerUnit`. */
function applyModifiersToHeal(
  caster: HeroSnapshot,
  abilityName: string,
  tier: number,
  effect: Extract<import("./types").AbilityEffect, { kind: "heal" }>,
  firingFaces?: ReadonlyArray<import("./types").DieFace>,
): import("./types").AbilityEffect {
  const amountField: import("./types").AbilityUpgradeField =
    effect.target === "self" ? "self-heal-amount" : "heal-amount";
  let amount = applyNumericModifier(caster, abilityName, tier, amountField, effect.amount, firingFaces);
  if (effect.target === "self") {
    // `heal-amount` also matches self-heals (it's the more common field).
    amount = applyNumericModifier(caster, abilityName, tier, "heal-amount", amount, firingFaces);
  }
  let conditional_bonus = effect.conditional_bonus;
  if (conditional_bonus) {
    const perUnit = applyNumericModifier(caster, abilityName, tier, "heal-conditional-bonus", conditional_bonus.bonusPerUnit, firingFaces);
    if (perUnit !== conditional_bonus.bonusPerUnit) {
      conditional_bonus = { ...conditional_bonus, bonusPerUnit: perUnit };
    }
  }
  if (amount === effect.amount && conditional_bonus === effect.conditional_bonus) return effect;
  return { ...effect, amount, conditional_bonus };
}


/** Sum per-stack passive modifiers from active statuses on the caster matching
 *  the trigger / field. Frost-bite contributes -1 dmg per stack on
 *  on-offensive-ability + damage. */
function aggregatePassiveModifiers(
  caster: HeroSnapshot,
  trigger: "on-offensive-ability" | "on-defensive-roll" | "on-card-played" | "always",
  field: "damage" | "defensive-dice-count" | "card-cost",
  state?: GameState,
): number {
  let total = 0;
  for (const inst of caster.statuses) {
    const def = getStatusDef(inst.id);
    const pm = def?.passiveModifier;
    if (!pm) continue;
    if (pm.scope !== "holder") continue;     // applier-scope handled at the source side
    if (pm.trigger !== trigger) continue;
    if (pm.field !== field) continue;
    // Token override on the *applier* (per-instance) — Crater Wind
    // boosts the Pyromancer's own Cinder via `passive-modifier-value-per-stack`.
    const applierSnap = state ? state.players[inst.appliedBy] : undefined;
    const valuePerStack = applyTokenOverrideNumeric(applierSnap, inst.id, "passive-modifier-value-per-stack", pm.valuePerStack);
    let contrib = valuePerStack * inst.stacks;
    if (pm.cap?.max != null) contrib = Math.min(contrib, pm.cap.max);
    if (pm.cap?.min != null) contrib = Math.max(contrib, pm.cap.min);
    total += contrib;
  }
  return total;
}

void listRegisteredStatuses;

// ── Hero-specific signature passives ───────────────────────────────────────
const FRENZY_TICK_PENDING = "__frenzyTickPending";

/** Set on a defender when they take ≥1 damage from an opponent's offensive
 *  ability. Read at the defender's next Upkeep by `resolveUpkeepSignaturePassive`
 *  to grant +1 to the hero's bankable counter (capped per-turn). */
export function noteOffensiveDamageTaken(defender: HeroSnapshot, amount: number): void {
  if (amount <= 0) return;
  const heroDef = getHero(defender.hero);
  if (heroDef.signatureMechanic.implementation.kind !== "frenzy") return;
  defender.signatureState[FRENZY_TICK_PENDING] = 1;
}

/** Dispatch the active player's signature passive at Upkeep. Currently
 *  implements `kind: "frenzy"` — +1 to the bankable counter (respecting cap)
 *  if the hero took offensive damage on the previous turn. The flag is
 *  cleared regardless of whether the bonus actually landed. */
function resolveUpkeepSignaturePassive(active: HeroSnapshot): GameEvent[] {
  const events: GameEvent[] = [];
  const heroDef = getHero(active.hero);
  const impl = heroDef.signatureMechanic.implementation;
  if (impl.kind !== "frenzy") return events;
  const flagged = (active.signatureState[FRENZY_TICK_PENDING] ?? 0) > 0;
  if (!flagged) return events;
  delete active.signatureState[FRENZY_TICK_PENDING];
  const key = impl.passiveKey ?? "frenzy";
  const cap = impl.bankCap ?? Infinity;
  const before = active.signatureState[key] ?? 0;
  const after = Math.min(cap, before + 1);
  const delta = after - before;
  if (delta === 0) return events;
  active.signatureState[key] = after;
  events.push({ t: "passive-counter-changed", player: active.player, passiveKey: key, delta, total: after });
  return events;
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
