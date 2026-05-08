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

  // Tick own-upkeep statuses on the active player (Burn, Regen, Smolder).
  const ownTick = tickStatusesAt(state, active, "ownUpkeep");
  events.push(...ownTick.events);
  // Pyromancer "+1 CP whenever Smolder ticks on opponent" — the Smolder-bearer
  // is the active player; the *opponent* (who applied Smolder) gains CP.
  for (const ev of ownTick.events) {
    if (ev.t === "status-ticked" && ev.status === "smolder" && ev.holder === active.player) {
      const oppHero = getHero(opponent.hero);
      for (const trig of oppHero.resourceIdentity.cpGainTriggers) {
        if (trig.on === "statusTicked" && trig.status === "smolder" && trig.on_target === "opponent") {
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

// ── Resolve the highest-tier matched ability (called when Offensive roll ends) ─
export function resolveOffensiveAbility(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const active = state.players[state.activePlayer];
  const opponent = state.players[other(state.activePlayer)];
  const hero = getHero(active.hero);

  // Picker: highest tier among matched abilities, then highest base damage
  // among ties. Works with any ability count per tier.
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

  // Judgment consumption — if the attacker has Judgment, this ability deals
  // -2 damage per stack and the *applier* (defender, who is the Paladin)
  // gains +1 CP per stack. All Judgment stacks are consumed on a single hit.
  let judgmentReduction = 0;
  const judgmentInst = active.statuses.find(s => s.id === "judgment");
  if (judgmentInst && judgmentInst.stacks > 0) {
    judgmentReduction = judgmentInst.stacks * 2;
    const paladin = state.players[judgmentInst.appliedBy];
    events.push(...gainCp(paladin, judgmentInst.stacks));
    active.statuses = active.statuses.filter(s => s.id !== "judgment");
    events.push({ t: "status-removed", status: "judgment", holder: active.player, reason: "expired" });
    events.push({ t: "status-triggered", status: "judgment", holder: active.player, cause: "ability-fired" });
  }
  damageBonus -= judgmentReduction;

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
    firingCombo: ability.combo,
    firingFaces: faces,
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
  const events: GameEvent[] = [];
  // Reset locks on the defender's dice and reroll all (defense is fresh).
  for (const d of defender.dice) d.locked = false;
  rollUnlocked(state, defender.dice);
  events.push({
    t: "dice-rolled",
    player: defender.player,
    dice: defender.dice.map(d => ({ index: d.index, current: d.current, symbol: d.faces[d.current].symbol, locked: d.locked })),
    attemptNumber: 1,
  });

  const defHero = getHero(defender.hero);
  const attacker = state.players[other(defender.player)];
  const faces = defender.dice.map(d => d.faces[d.current]);
  let reduction = 0;
  let matchedTier: 1 | 2 | 3 | 4 | undefined;
  let matchedAbilityName: string | undefined;

  // Evaluate the hero's defensive ladder if declared. Picker is the same
  // highest-tier-then-highest-reduction policy as the offensive ladder.
  const dl = defHero.defensiveLadder;
  if (dl && dl.length > 0) {
    let bestIdx = -1;
    let bestTier = -1;
    let bestReduction = -Infinity;
    for (let i = 0; i < dl.length; i++) {
      if (!comboMatchesFaces(dl[i].combo, faces)) continue;
      const a = dl[i];
      const r = effectReductionAmount(a.effect);
      if (a.tier > bestTier || (a.tier === bestTier && r > bestReduction)) {
        bestIdx = i;
        bestTier = a.tier;
        bestReduction = r;
      }
    }
    if (bestIdx >= 0) {
      const ability = dl[bestIdx];
      matchedTier = ability.tier;
      matchedAbilityName = ability.name;
      const r = resolveDefensiveEffect(ability.effect, {
        defender, attacker, firingCombo: ability.combo, firingFaces: faces,
      });
      reduction += r.reduction;
      events.push(...r.events);
    }
  } else {
    // Legacy fallback — heroes without a declared defensiveLadder still get
    // the simple shield-face reduction so existing content keeps working.
    for (const d of defender.dice) {
      if (d.faces[d.current].symbol.endsWith(":shield")) reduction++;
    }
  }

  events.push({
    t: "defense-resolved",
    player: defender.player,
    reduction,
    matchedTier,
    abilityName: matchedAbilityName,
  });
  if (reduction >= 2) events.push({ t: "hero-state", player: defender.player, state: "defended" });

  // Hero passives — Paladin's Divine Favor on successful defense.
  const sig = defHero.signatureMechanic.implementation;
  if (sig.kind === "divine-favor" && reduction >= 1) {
    events.push(...applyStatus(defender, defender.player, "protect", sig.protectPerDefense));
    events.push(...applyStatus(attacker, defender.player, "judgment", sig.judgmentPerDefense));
  }
  if (reduction >= 1) {
    for (const trig of defHero.resourceIdentity.cpGainTriggers) {
      if (trig.on === "successfulDefense") events.push(...gainCp(defender, trig.gain));
    }
  }
  return { reduction, events };
}

/** Sum reduce-damage amounts across an effect tree — used by the picker so
 *  defensive abilities are compared on their reduction value. */
function effectReductionAmount(effect: import("./types").AbilityEffect): number {
  switch (effect.kind) {
    case "reduce-damage": return effect.amount;
    case "compound":      return effect.effects.reduce((a, e) => a + effectReductionAmount(e), 0);
    default:              return 0;
  }
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
