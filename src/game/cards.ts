/**
 * Pact of Heroes — card resolution, deck/hand/discard plumbing.
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
  ActiveAbilityModifier,
  ActiveSymbolBend,
  Card,
  CardId,
  ConditionalBonus,
  DieFace,
  GameEvent,
  GameState,
  HeroSnapshot,
  StateCheck,
  SymbolId,
} from "./types";
import { CP_CAP, HAND_CAP } from "./types";
import { applyStatus, stripStatus, stacksOf, getStatusDef } from "./status";
import { getHero } from "../content";
import { dealDamage, heal } from "./damage";
import { nextInt, rollOn, shuffleInPlace } from "./rng";

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
  /** Player-chosen face value for `set-die-face` effects whose target leaves
   *  faceValue unspecified (Iron Focus, Last Stand). */
  targetFaceValue?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Firing ability name + tier — passed when an effect is a leaf inside an
   *  ability's compound. Lets `passive-counter-modifier` honour
   *  `passive-counter-gain-amount` ability-upgrade modifications (Solar
   *  Devotion, Cathedral Light) and combo-gated conditionals (Cathedral
   *  Light's "+1 Radiance on 4+ sun"). */
  abilityName?: string;
  abilityTier?: import("./types").AbilityTier;
  /** Faces that fired the current ability — for combo-aware conditionals. */
  firingFaces?: ReadonlyArray<DieFace>;
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
      // Cards / Instants — used by Phoenix-Veil / Aegis-of-Dawn style cards
      // that fire mid-attack to reduce, halve, or negate the incoming damage
      // (Clarification B in §15: `reduce-damage` resolved from an Instant
      // response window injects on the queued in-flight damage via
      // `pendingAttack.injectedReduction`). We compute the prevented amount
      // based on the live `pendingAttack.incomingAmount` (if any), stash it
      // on the caster's `__damagePrevented` so a sibling apply-status with
      // `source: "damage-prevented-amount"` reads it, and queue the
      // reduction on `pendingAttack.injectedReduction`.
      const pa = ctx.state.pendingAttack;
      const incoming = pa?.incomingAmount ?? 0;
      let amount = effect.amount;
      if (
        effect.conditional_bonus &&
        checkState(ctx.state, ctx.caster, ctx.opponent, effect.conditional_bonus.condition)
      ) {
        amount += computeConditionalBonus(ctx.caster, ctx.opponent, effect.conditional_bonus);
      }
      // Resolution mode (mutually exclusive — multiplier > negate > flat amount).
      // §15.1: multiplier produces fractional reduction — final damage =
      // round(incoming × multiplier); reduction = incoming − final.
      let reduction: number;
      if (effect.multiplier != null) {
        const rounding = effect.rounding ?? "ceil";
        const finalDamage = rounding === "ceil"
          ? Math.ceil(incoming * effect.multiplier)
          : Math.floor(incoming * effect.multiplier);
        reduction = Math.max(0, incoming - finalDamage);
      } else if (effect.negate_attack) {
        reduction = incoming;
      } else {
        reduction = amount;
      }
      const prevented = Math.max(0, Math.min(reduction, incoming));
      ctx.caster.signatureState["__damagePrevented"] = prevented;
      if (pa) {
        pa.injectedReduction = (pa.injectedReduction ?? 0) + reduction;
      }
      const events: GameEvent[] = [];
      if (effect.apply_to_attacker) {
        const ata = effect.apply_to_attacker;
        let stacks = ata.stacks;
        if (
          ata.conditional_bonus &&
          checkState(ctx.state, ctx.caster, ctx.opponent, ata.conditional_bonus.condition)
        ) {
          stacks += computeConditionalBonus(ctx.caster, ctx.opponent, ata.conditional_bonus);
        }
        if (stacks > 0) {
          events.push(...applyStatus(ctx.opponent, ctx.caster.player, ata.status, stacks, ctx.caster));
        }
      }
      return events;
    }
    case "apply-status": {
      const target = effect.target === "self" ? ctx.caster : ctx.opponent;
      let stacks = effect.stacks;
      if (
        effect.conditional_bonus &&
        checkState(ctx.state, ctx.caster, ctx.opponent, effect.conditional_bonus.condition)
      ) {
        stacks += computeConditionalBonus(ctx.caster, ctx.opponent, effect.conditional_bonus);
      }
      return applyStatus(target, ctx.caster.player, effect.status, stacks, ctx.caster);
    }
    case "remove-status": {
      const target = effect.target === "self" ? ctx.caster : ctx.opponent;
      // §15.7 wildcard category resolution. `any-positive` is the legacy
      // alias of `any-buff`. The resolver picks ONE matching status per
      // resolution; multi-strip cards compose via `compound`.
      const wildcards = ["any-debuff", "any-buff", "any-positive", "any-status"] as const;
      const isWildcard = (wildcards as readonly string[]).includes(effect.status);
      const statusesForCategory = isWildcard
        ? listStatusesByCategory(target, effect.status as "any-debuff" | "any-buff" | "any-positive" | "any-status")
        : (target.statuses.find(s => s.id === effect.status) ? [target.statuses.find(s => s.id === effect.status)!] : []);
      const selection = effect.selection ?? "player-choice";
      const picked = pickWildcardSelection(statusesForCategory, selection);
      const statusToStrip = picked?.id ?? (!isWildcard ? effect.status : undefined);
      if (!statusToStrip) return [];

      // Opponent-initiated removal — give the holder a chance to intercept
      // via an Instant with a matching trigger. Pauses the resolver and
      // returns no events; the engine resumes via `respond-to-status-removal`
      // and finalises the strip (or drops it if `prevented`).
      if (target !== ctx.caster) {
        const intercept = maybeQueueStatusRemovalIntercept(ctx.state, target, ctx.caster.player, statusToStrip);
        if (intercept) return intercept;
      }
      // Snapshot applier-of-status BEFORE stripping; once stripped we lose
      // the inst.appliedBy reference.
      const stripped = target.statuses.find(s => s.id === statusToStrip);
      const stripCount = stripped?.stacks ?? 0;
      const applierId = stripped?.appliedBy;
      const events: GameEvent[] = [];
      // Determine the strip amount. `stacks: "all"` always strips fully;
      // a numeric `stacks` strips up to that count (legacy behaviour).
      // Wildcards default to "strip the whole resolved status" since the
      // category is itself the targeting decision.
      const stripAll = effect.stacks === "all" || isWildcard
        || (typeof effect.stacks === "number" && effect.stacks >= (stripped?.stacks ?? 0));
      if (stripAll) {
        events.push(...stripStatus(target, statusToStrip).events);
      } else {
        // Decrement-style remove (rare): trim N without firing onRemove.
        if (stripped && typeof effect.stacks === "number") {
          stripped.stacks = Math.max(0, stripped.stacks - effect.stacks);
          if (stripped.stacks === 0) {
            target.statuses = target.statuses.filter(s => s.id !== statusToStrip);
          }
        }
      }
      // Resource trigger on the *original applier*: opponent-removed-self-status.
      // The trigger fires when the strip is initiated by someone other than
      // the applier (i.e. opponent-initiated cleanse).
      if (applierId && applierId !== ctx.caster.player && stripCount > 0) {
        events.push(...dispatchOpponentRemovedSelfStatusTrigger(ctx.state, applierId, statusToStrip, stripCount));
      }
      return events;
    }
    case "heal": {
      const target = effect.target === "self" ? ctx.caster : ctx.opponent;
      let amount = effect.amount;
      if (
        effect.conditional_bonus &&
        checkState(ctx.state, ctx.caster, ctx.opponent, effect.conditional_bonus.condition)
      ) {
        amount += computeConditionalBonus(ctx.caster, ctx.opponent, effect.conditional_bonus);
      }
      return heal(target, amount);
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
    // ── Correction 6 — first-class primitives ────────────────────────────
    case "set-die-face":
      return setDieFace(ctx.state, ctx.caster, effect, ctx.targetDie, ctx.targetFaceValue);
    case "reroll-dice":
      return rerollDice(ctx.state, ctx.caster, effect);
    case "face-symbol-bend":
      return applySymbolBend(ctx.state, ctx.caster, effect);
    case "ability-upgrade":
      return addAbilityModifier(ctx.caster, {
        source: "card",
        scope: effect.scope,
        modifications: effect.modifications ?? [],
        replacement: effect.replacement,
        additionalEffects: effect.additionalEffects,
        repeat: effect.repeat,
        permanent: effect.permanent,
      });
    case "passive-counter-modifier":
      return modifyPassiveCounter(ctx, effect);
    case "persistent-buff": {
      // §15.3 / §15.4 / existing forms. Exactly one of `modifier` /
      // `pipelineModifier` / `triggerModifier` should be set.
      if (effect.pipelineModifier) {
        return addPipelineBuff(ctx.caster, effect.id, effect.pipelineModifier, effect.discardOn);
      }
      if (effect.triggerModifier) {
        return addTriggerBuff(ctx.caster, effect.id, effect.triggerModifier, effect.discardOn);
      }
      if (!effect.modifier) return [];
      // Token-targeted form (Crater Wind etc.) — patches the named status's
      // mechanical fields per-snapshot. Otherwise behaves as an ability-scoped
      // persistent modifier.
      if (effect.target) {
        return addTokenOverride(ctx.caster, effect.target, [effect.modifier]);
      }
      if (!effect.scope) return [];
      return addAbilityModifier(ctx.caster, {
        source: "card",
        scope: effect.scope,
        modifications: [effect.modifier],
        permanent: true,
        discardOn: effect.discardOn,
        creatorPlayer: ctx.caster.player,
        creatorTurnsElapsed: 0,
      }, effect.id);
    }
    case "combo-override":
      return applyComboOverride(ctx.state, ctx.caster, effect);
    case "bonus-dice-damage":
      return resolveBonusDiceDamage(ctx.state, ctx.caster, ctx.opponent, effect);
    case "force-face-value": {
      const fv = effect.faceValue ?? ctx.targetFaceValue;
      if (fv == null) return [];
      ctx.caster.forcedFaceValue = fv;
      // Duration "this-turn" — cleared by the engine at passTurn. No event
      // type for it yet; UIs can read the snapshot field if needed.
      return [];
    }
    case "prevent-pending-status-removal": {
      // Only meaningful when the engine is paused on a `pendingStatusRemoval`
      // — outside that context the flag has no effect.
      if (ctx.state.pendingStatusRemoval) {
        ctx.state.pendingStatusRemoval.prevented = true;
      }
      return [];
    }
  }
}

// ── New-primitive resolvers ─────────────────────────────────────────────────

function setDieFace(
  _state: GameState,
  caster: HeroSnapshot,
  effect: Extract<AbilityEffect, { kind: "set-die-face" }>,
  targetDie?: number,
  targetFaceValue?: 1|2|3|4|5|6,
): GameEvent[] {
  const events: GameEvent[] = [];
  const dice = caster.dice;
  const eligibleIdx: number[] = [];
  for (let i = 0; i < dice.length; i++) {
    const face = dice[i].faces[dice[i].current];
    if (effect.filter === "any") {
      eligibleIdx.push(i);
    } else if (effect.filter.kind === "specific-symbol") {
      if (face.symbol === effect.filter.symbol) eligibleIdx.push(i);
    } else if (effect.filter.kind === "specific-face") {
      if (face.faceValue === effect.filter.faceValue) eligibleIdx.push(i);
    }
  }
  // If a specific die was indicated and it's eligible, prefer it.
  const ordered = targetDie != null && eligibleIdx.includes(targetDie)
    ? [targetDie, ...eligibleIdx.filter(i => i !== targetDie)]
    : eligibleIdx;

  // Resolve the target face — when the effect leaves faceValue unspecified,
  // fall back to the action's `targetFaceValue`. If neither is set, the
  // effect is a no-op (no face to point at).
  let resolvedTarget: { kind: "symbol"; symbol: SymbolId } | { kind: "face"; faceValue: 1|2|3|4|5|6 } | null;
  if (effect.target.kind === "symbol") {
    resolvedTarget = effect.target;
  } else if (effect.target.faceValue != null) {
    resolvedTarget = { kind: "face", faceValue: effect.target.faceValue };
  } else if (targetFaceValue != null) {
    resolvedTarget = { kind: "face", faceValue: targetFaceValue };
  } else {
    resolvedTarget = null;
  }
  if (!resolvedTarget) return events;

  let setCount = 0;
  for (const idx of ordered) {
    if (setCount >= effect.count) break;
    const die = dice[idx];
    const targetFaceIdx = findFaceIndex(die.faces, resolvedTarget);
    if (targetFaceIdx < 0) continue;
    const from = die.current;
    if (from !== targetFaceIdx) {
      die.current = targetFaceIdx;
      events.push({ t: "die-face-changed", player: caster.player, die: idx, from, to: targetFaceIdx, cause: "card" });
    }
    if (effect.lockAfter) die.locked = true;
    setCount++;
  }
  return events;
}

function findFaceIndex(faces: readonly DieFace[], target: { kind: "symbol"; symbol: SymbolId } | { kind: "face"; faceValue: 1|2|3|4|5|6 }): number {
  if (target.kind === "symbol") return faces.findIndex(f => f.symbol === target.symbol);
  return faces.findIndex(f => f.faceValue === target.faceValue);
}

function rerollDice(
  state: GameState,
  caster: HeroSnapshot,
  effect: Extract<AbilityEffect, { kind: "reroll-dice" }>,
): GameEvent[] {
  const events: GameEvent[] = [];
  const eligible = caster.dice.filter(d => {
    if (!effect.ignoresLock && d.locked) return false;
    if (effect.filter === "all") return true;
    if (effect.filter === "not-locked") return !d.locked;
    if (effect.filter.kind === "not-showing-symbols") {
      return !effect.filter.symbols.includes(d.faces[d.current].symbol);
    }
    return true;
  });
  for (const d of eligible) {
    const r = nextInt(state.rngSeed, state.rngCursor, d.faces.length);
    state.rngCursor = r.cursor;
    d.current = r.value;
  }
  events.push({
    t: "dice-rolled",
    player: caster.player,
    dice: caster.dice.map(d => ({ index: d.index, current: d.current, symbol: d.faces[d.current].symbol, locked: d.locked })),
    attemptNumber: 1,
  });
  return events;
}

function applySymbolBend(
  state: GameState,
  caster: HeroSnapshot,
  effect: Extract<AbilityEffect, { kind: "face-symbol-bend" }>,
): GameEvent[] {
  const id = `bend-${state.rngCursor}-${caster.symbolBends.length}`;
  let expires: ActiveSymbolBend["expires"];
  if (effect.duration === "this-roll") {
    expires = { kind: "this-roll", appliedAtAttempt: caster.rollAttemptsRemaining };
  } else if (effect.duration === "this-turn") {
    expires = { kind: "this-turn", appliedOnTurn: state.turn };
  } else {
    expires = { kind: "until-status", status: effect.duration.status, on: effect.duration.on };
  }
  caster.symbolBends.push({ id, fromSymbol: effect.from_symbol, toSymbol: effect.to_symbol, expires });
  return [{ t: "symbol-bend-applied", player: caster.player, bendId: id, from: effect.from_symbol, to: effect.to_symbol }];
}

let _modIdCounter = 1;
function addAbilityModifier(
  caster: HeroSnapshot,
  spec: Omit<ActiveAbilityModifier, "id">,
  givenId?: string,
): GameEvent[] {
  const id = givenId ?? `mod-${_modIdCounter++}`;
  caster.abilityModifiers.push({ id, ...spec });
  return [{ t: "ability-modifier-added", player: caster.player, modifierId: id, source: spec.source }];
}

// ── Ability resolution (ladder-upgrade composition) ─────────────────────────
/** A read-only view of an ability after the ladder-upgrade pipeline has
 *  composed any active replacement / append / repeat operations for the
 *  caster. Drop-in compatible with `AbilityDef` so phases.ts / dice.ts /
 *  ai.ts can swap their `snapshot.activeOffense[i]` reads for `resolveAbilityFor`
 *  without signature churn.
 *
 *  Field-tweak modifications (today's Mastery system) are NOT folded into
 *  this view — they're applied later, at effect-resolution time inside
 *  phases.ts, by reading `caster.abilityModifiers[*].modifications`. The
 *  resolver only swaps the structural pieces that must change before
 *  resolution: combo, name, damageType, the post-append effect tree, and
 *  the repeat multiplier. */
import type { AbilityDef, AbilityScope, ReplacementAbilityDef } from "./types";

export type ResolvedAbilityView = AbilityDef & {
  /** True when a replacement modifier is in flight on this slot — UI may
   *  decorate the ladder row to indicate the swap. */
  isReplaced: boolean;
};

function abilityScopeMatches(scope: AbilityScope, ability: AbilityDef, context: "offensive" | "defensive"): boolean {
  switch (scope.kind) {
    case "ability-ids":
      return scope.ids.some(id => id.toLowerCase() === ability.name.toLowerCase());
    case "all-tier":
      return ability.tier === scope.tier;
    case "all-defenses":
      return context === "defensive";
  }
}

function findReplacement(
  modifiers: ReadonlyArray<ActiveAbilityModifier>,
  ability: AbilityDef,
  context: "offensive" | "defensive",
): ReplacementAbilityDef | undefined {
  for (const m of modifiers) {
    if (!m.replacement) continue;
    if (abilityScopeMatches(m.scope, ability, context)) return m.replacement;
  }
  return undefined;
}

function collectAdditionalEffects(
  modifiers: ReadonlyArray<ActiveAbilityModifier>,
  ability: AbilityDef,
  context: "offensive" | "defensive",
): AbilityEffect[] {
  const out: AbilityEffect[] = [];
  for (const m of modifiers) {
    if (!m.additionalEffects || m.additionalEffects.length === 0) continue;
    if (abilityScopeMatches(m.scope, ability, context)) out.push(...m.additionalEffects);
  }
  return out;
}

function resolveRepeat(
  modifiers: ReadonlyArray<ActiveAbilityModifier>,
  ability: AbilityDef,
  context: "offensive" | "defensive",
): number {
  let total = 1;
  for (const m of modifiers) {
    if (!m.repeat || m.repeat <= 1) continue;
    if (abilityScopeMatches(m.scope, ability, context)) total *= m.repeat;
  }
  return total;
}

/** Resolve the live ability view a caster fires from a given ladder slot,
 *  after walking their active ability modifiers. `context` distinguishes
 *  offensive vs defensive ladders for `all-defenses`-scoped modifiers. */
export function resolveAbilityFor(
  snapshot: HeroSnapshot,
  ability: AbilityDef,
  context: "offensive" | "defensive" = "offensive",
): ResolvedAbilityView {
  const replacement = findReplacement(snapshot.abilityModifiers, ability, context);
  const base: AbilityDef = replacement
    ? {
        tier: ability.tier,
        name: replacement.name,
        combo: replacement.combo,
        effect: replacement.effect,
        shortText: replacement.shortText,
        longText: replacement.longText,
        damageType: replacement.damageType,
        targetLandingRate: replacement.targetLandingRate ?? ability.targetLandingRate,
        defenseDiceCount: replacement.defenseDiceCount ?? ability.defenseDiceCount,
        offensiveFallback: replacement.offensiveFallback ?? ability.offensiveFallback,
        // Replacements never carry T4 critical machinery.
      }
    : ability;

  let effect: AbilityEffect = base.effect;
  const additions = collectAdditionalEffects(snapshot.abilityModifiers, ability, context);
  if (additions.length > 0) effect = { kind: "compound", effects: [effect, ...additions] };
  const repeat = resolveRepeat(snapshot.abilityModifiers, ability, context);
  if (repeat > 1) effect = { kind: "compound", effects: Array.from({ length: repeat }, () => effect) };

  return { ...base, effect, isReplaced: !!replacement };
}

/** Pick the first buff-type status currently on `holder`. Returns undefined
 *  when none. Used by the `any-positive` wildcard target on remove-status. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findFirstBuffStatusId(holder: HeroSnapshot): import("./types").StatusId | undefined {
  for (const inst of holder.statuses) {
    const def = getStatusDef(inst.id);
    if (def?.type === "buff") return inst.id;
  }
  return undefined;
}
void findFirstBuffStatusId;

/** §15.3: register a card-applied pipeline modifier. */
function addPipelineBuff(
  caster: HeroSnapshot,
  givenId: string,
  pm: import("./types").PipelineModifier,
  discardOn?: import("./types").DiscardTrigger,
): GameEvent[] {
  const id = givenId || `pipe-${_modIdCounter++}`;
  caster.pipelineBuffs.push({
    id,
    pipelineModifier: pm,
    discardOn,
    creatorPlayer: caster.player,
    creatorTurnsElapsed: 0,
  });
  return [{ t: "ability-modifier-added", player: caster.player, modifierId: id, source: "card" }];
}

/** §15.4: register a card-applied trigger modifier. */
function addTriggerBuff(
  caster: HeroSnapshot,
  givenId: string,
  tm: import("./types").TriggerModifier,
  discardOn?: import("./types").DiscardTrigger,
): GameEvent[] {
  const id = givenId || `trig-${_modIdCounter++}`;
  caster.triggerBuffs.push({
    id,
    triggerModifier: tm,
    discardOn,
    creatorPlayer: caster.player,
    creatorTurnsElapsed: 0,
  });
  return [{ t: "ability-modifier-added", player: caster.player, modifierId: id, source: "card" }];
}

/** §15.6: register a combo override on the caster. Same lifecycle shape
 *  as ActiveSymbolBend so the dice evaluator can age them on the same
 *  pass at end-of-turn / end-of-roll. */
function applyComboOverride(
  state: GameState,
  caster: HeroSnapshot,
  effect: Extract<AbilityEffect, { kind: "combo-override" }>,
): GameEvent[] {
  const id = `combo-${state.rngCursor}-${caster.comboOverrides.length}`;
  let expires: import("./types").ActiveComboOverride["expires"];
  if (effect.duration === "this-roll") {
    expires = { kind: "this-roll", appliedAtAttempt: caster.rollAttemptsRemaining };
  } else if (effect.duration === "this-turn") {
    expires = { kind: "this-turn", appliedOnTurn: state.turn };
  } else {
    expires = { kind: "until-status", status: effect.duration.status, on: effect.duration.on };
  }
  caster.comboOverrides.push({ id, scope: effect.scope, override: effect.override, expires });
  return [{ t: "ability-modifier-added", player: caster.player, modifierId: id, source: "card" }];
}

/** List the holder's statuses matching a wildcard category (§15.7). */
function listStatusesByCategory(
  holder: HeroSnapshot,
  category: "any-debuff" | "any-buff" | "any-positive" | "any-status",
): import("./types").StatusInstance[] {
  return holder.statuses.filter(inst => {
    const def = getStatusDef(inst.id);
    if (!def) return false;
    if (category === "any-status") return true;
    if (category === "any-buff" || category === "any-positive") return def.type === "buff";
    if (category === "any-debuff") return def.type === "debuff";
    return false;
  });
}

/** Resolve the wildcard `selection` modifier on a list of candidates.
 *  `player-choice` is best-effort deterministic (no UI prompt is wired in
 *  the engine; a UI overlay can intercept the action and pre-pick before
 *  dispatch). The deterministic options resolve immediately. */
function pickWildcardSelection(
  candidates: ReadonlyArray<import("./types").StatusInstance>,
  selection: "player-choice" | "highest-stack" | "lowest-stack" | "longest-active",
): import("./types").StatusInstance | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  switch (selection) {
    case "highest-stack":
      return candidates.reduce((a, b) => (b.stacks > a.stacks ? b : a));
    case "lowest-stack":
      return candidates.reduce((a, b) => (b.stacks < a.stacks ? b : a));
    case "longest-active":
      // No timestamp on the StatusInstance — fall back to first-found
      // (insertion-order proxy for "applied earliest").
      return candidates[0];
    case "player-choice":
    default:
      return candidates[0];
  }
}

/** Dispatch the `opponentRemovedSelfStatus` resource trigger on the applier
 *  of a stripped status. When `perStack` is set, the gain is multiplied by
 *  the number of stacks that were stripped. */
function dispatchOpponentRemovedSelfStatusTrigger(
  state: GameState,
  applier: import("./types").PlayerId,
  status: import("./types").StatusId,
  strippedCount: number,
): GameEvent[] {
  const events: GameEvent[] = [];
  const applierSnap = state.players[applier];
  const heroDef = getHero(applierSnap.hero);
  for (const trig of heroDef.resourceIdentity.cpGainTriggers) {
    if (trig.on !== "opponentRemovedSelfStatus") continue;
    if (trig.status && trig.status !== status) continue;
    const gain = trig.perStack ? trig.gain * strippedCount : trig.gain;
    const before = applierSnap.cp;
    const cap = trig.capAt ?? CP_CAP;
    applierSnap.cp = Math.min(cap, before + gain);
    const delta = applierSnap.cp - before;
    if (delta !== 0) events.push({ t: "cp-changed", player: applier, delta, total: applierSnap.cp });
  }
  return events;
}

/** When an opponent's effect is about to strip a status from `holder`,
 *  inspect `holder.hand` for any Instant with a matching
 *  `opponent-attempts-remove-status` trigger (and affordable CP). If one
 *  is found, queue `state.pendingStatusRemoval` and emit `status-remove-prompt`.
 *  Returns the events to short-circuit the caller's resolver. Returns null
 *  when no intercept fires, in which case the caller proceeds with the strip. */
function maybeQueueStatusRemovalIntercept(
  state: GameState,
  holder: HeroSnapshot,
  applier: import("./types").PlayerId,
  status: import("./types").StatusId,
): GameEvent[] | null {
  // Engine guards: only pause once per attempt, ignore self-strips, and
  // only when the holder actually has stacks to lose.
  if (state.pendingStatusRemoval) return null;
  const inst = holder.statuses.find(s => s.id === status);
  if (!inst || inst.stacks <= 0) return null;
  const matching = holder.hand.find(c =>
    c.kind === "instant"
    && c.trigger.kind === "opponent-attempts-remove-status"
    && c.trigger.status === status
    && holder.cp >= c.cost,
  );
  if (!matching) return null;
  state.pendingStatusRemoval = { holder: holder.player, applier, status, stacks: inst.stacks };
  // Pre-stamp `lastStripped` with the *attempted* count so any
  // `stripped-stack-count` conditional_bonus inside the responding instant
  // reads the correct number even though the stacks may end up untouched.
  holder.lastStripped[status] = inst.stacks;
  return [{ t: "status-remove-prompt", holder: holder.player, applier, status, stacks: inst.stacks }];
}

/** Append per-snapshot token modifications. Coalesces with any existing
 *  override for the same status so multiple `persistent-buff` plays on
 *  the same token accumulate cleanly. */
function addTokenOverride(
  caster: HeroSnapshot,
  status: import("./types").StatusId,
  modifications: import("./types").AbilityUpgradeMod[],
): GameEvent[] {
  const existing = caster.tokenOverrides.find(o => o.status === status);
  if (existing) {
    existing.modifications.push(...modifications);
  } else {
    caster.tokenOverrides.push({ status, modifications: modifications.slice() });
  }
  return [];
}

function modifyPassiveCounter(
  ctx: ResolveCtx,
  effect: Extract<AbilityEffect, { kind: "passive-counter-modifier" }>,
): GameEvent[] {
  // §15.8: optional conditional gate — skip the modifier when the state
  // check is false at resolution time (e.g. Cathedral Light's "+1 Radiance
  // when 4+ sun faces" — only fires on the stricter combo). When the
  // ability context is present we forward firing-faces so combo-state
  // checks evaluate correctly.
  if (effect.conditional
      && !checkState(ctx.state, ctx.caster, ctx.opponent, effect.conditional, ctx.firingFaces, ctx.abilityTier)) {
    return [];
  }
  const caster = ctx.caster;
  // Lightbearer §Mastery: `passive-counter-gain-amount` ability-upgrade
  // modifications rewrite the leaf's `value` when this modifier resolves
  // inside an ability's compound (Solar Devotion bumps Sun Strike's
  // Radiance gain 1→2, Cathedral Light activates Dawn-Ward's inert gain).
  let value = effect.value;
  if (ctx.isAbility && ctx.abilityName) {
    value = applyPassiveCounterGainModifier(ctx.caster, ctx.abilityName, ctx.abilityTier ?? 0, value, ctx.firingFaces);
  }
  const before = caster.signatureState[effect.passiveKey] ?? 0;
  // Clarification A: `operation: "add"` accepts negative values for
  // spending the resource (Dawnsong burns 2 Radiance for +4 CP). The
  // result is clamped to ≥ 0 below; no separate "subtract" operation.
  const after = effect.operation === "set" ? value : before + value;
  // Respect cap from hero passive definition (read by phases.ts when the cap
  // is known); cards-context can't see it, so allow if respectsCap: false,
  // otherwise clamp at the hero's bankCap (when registered) or CP_CAP.
  const bankCap = bankCapFor(caster, effect.passiveKey);
  const cap = bankCap ?? CP_CAP;
  const clamped = effect.respectsCap === false ? after : Math.min(after, cap);
  caster.signatureState[effect.passiveKey] = Math.max(0, clamped);
  const delta = caster.signatureState[effect.passiveKey] - before;
  if (delta === 0) return [];
  return [{ t: "passive-counter-changed", player: caster.player, passiveKey: effect.passiveKey, delta, total: caster.signatureState[effect.passiveKey] }];
}

/** Lightbearer §Mastery: walk active ability-upgrade modifiers targeting
 *  `passive-counter-gain-amount` and rewrite the firing leaf's `value`.
 *  Mirrors phases.ts `applyNumericModifier`'s shape so authoring is
 *  consistent. Cards-context resolutions skip this lookup entirely. */
function applyPassiveCounterGainModifier(
  caster: HeroSnapshot,
  abilityName: string,
  tier: number,
  base: number,
  firingFaces?: ReadonlyArray<DieFace>,
): number {
  let value = base;
  for (const m of caster.abilityModifiers) {
    let scopeMatches = false;
    if (m.scope.kind === "ability-ids") scopeMatches = m.scope.ids.some(id => id.toLowerCase() === abilityName.toLowerCase());
    else if (m.scope.kind === "all-tier") scopeMatches = m.scope.tier === tier;
    else if (m.scope.kind === "all-defenses") scopeMatches = true;
    if (!scopeMatches) continue;
    for (const mod of m.modifications) {
      if (mod.field !== "passive-counter-gain-amount") continue;
      if (mod.conditional && !checkStateForMod(mod.conditional, caster, firingFaces, tier)) continue;
      const v = typeof mod.value === "number" ? mod.value : 0;
      if (mod.operation === "set") value = v;
      else if (mod.operation === "add") value += v;
      else if (mod.operation === "multiply") value = Math.ceil(value * v);
    }
  }
  return value;
}

/** Lightweight StateCheck evaluator for ability-modifier conditionals.
 *  Mirrors the cheap evaluator in phases.ts but lives here so cards.ts
 *  can use it without importing back into phases.ts. Only handles the
 *  shapes a Mastery `conditional` realistically uses. */
function checkStateForMod(
  cond: import("./types").StateCheck,
  caster: HeroSnapshot,
  firingFaces?: ReadonlyArray<DieFace>,
  firingTier?: number,
): boolean {
  switch (cond.kind) {
    case "always":              return true;
    case "self-low-hp":         return caster.isLowHp;
    case "self-has-status-min": return (caster.statuses.find(s => s.id === cond.status)?.stacks ?? 0) >= cond.count;
    case "passive-counter-min": return (caster.signatureState[cond.passiveKey] ?? 0) >= cond.count;
    case "combo-symbol-count":  return !!firingFaces && firingFaces.filter(f => f.symbol === cond.symbol).length >= cond.count;
    case "defense-tier-min":    return firingTier != null && firingTier >= cond.tier;
    default:                    return false;
  }
}

/** Resolve a hero's `bankCap` for the named passive key, when registered. */
function bankCapFor(caster: HeroSnapshot, passiveKey: string): number | undefined {
  // Late-bind via the content registry to avoid a circular import; the
  // registry exposes `getHero` lazily.
  const heroDef = getHero(caster.hero);
  const impl = heroDef?.signatureMechanic?.implementation;
  if (impl?.passiveKey === passiveKey && typeof impl.bankCap === "number") return impl.bankCap;
  return undefined;
}

function resolveBonusDiceDamage(
  state: GameState,
  caster: HeroSnapshot,
  opponent: HeroSnapshot,
  effect: Extract<AbilityEffect, { kind: "bonus-dice-damage" }>,
): GameEvent[] {
  const events: GameEvent[] = [];
  const faceCount = caster.dice[0]?.faces.length ?? 6;
  const rolledFaces: DieFace[] = [];
  for (let i = 0; i < effect.bonusDice; i++) {
    const r = nextInt(state.rngSeed, state.rngCursor, faceCount);
    state.rngCursor = r.cursor;
    rolledFaces.push(caster.dice[0]!.faces[r.value]);
  }
  let amount = 0;
  if (effect.damageFormula === "sum-of-faces") {
    amount = rolledFaces.reduce((a, f) => a + f.faceValue, 0);
  } else if (effect.damageFormula === "highest-face") {
    amount = Math.max(0, ...rolledFaces.map(f => f.faceValue));
  } else if (effect.damageFormula.kind === "count-symbol") {
    amount = rolledFaces.filter(f => f.symbol === (effect.damageFormula as { symbol: SymbolId }).symbol).length;
  }
  const r = dealDamage(caster.player, opponent, amount, effect.type, 0);
  events.push(...r.events);
  if (effect.thresholdBonus && amount >= effect.thresholdBonus.threshold) {
    events.push(...resolveEffect(effect.thresholdBonus.bonus, { state, caster, opponent }));
  }
  return events;
}

// ── Discard-trigger evaluator + state-check helper (Correction 6) ───────────

/** Called when an event happens that may discard ability modifiers (e.g. a
 *  T4 hit clears Ancestral Spirits). Iterates each player's modifiers and
 *  removes those whose `discardOn` matches the event. Also walks the
 *  pipeline / trigger buff lists added in §15.3 / §15.4. */
export function evaluateModifierDiscards(state: GameState, ev: GameEvent): GameEvent[] {
  const events: GameEvent[] = [];
  for (const pid of ["p1", "p2"] as const) {
    const player = state.players[pid];
    const matchEvent = (d: import("./types").DiscardTrigger | undefined): boolean => {
      if (!d) return false;
      if (d.kind === "damage-taken-from-tier" && ev.t === "damage-dealt" && ev.to === pid) {
        // Damage-tier requires reading the originating ability — we approximate
        // by carrying tier on damage-dealt? Currently we do not. Defer.
        return false;
      }
      if (d.kind === "status-removed" && ev.t === "status-removed" && ev.holder === pid && ev.status === d.status) return true;
      if (d.kind === "match-ends" && ev.t === "match-won") return true;
      // Turn-bounded discards (§15.5) are evaluated by `tickTurnBuffs`,
      // not from a single GameEvent.
      return false;
    };
    const keep: ActiveAbilityModifier[] = [];
    for (const m of player.abilityModifiers) {
      if (matchEvent(m.discardOn)) {
        events.push({ t: "ability-modifier-removed", player: pid, modifierId: m.id, reason: "discard-trigger" });
      } else {
        keep.push(m);
      }
    }
    player.abilityModifiers = keep;

    const keepPipe: import("./types").ActivePipelineBuff[] = [];
    for (const b of player.pipelineBuffs) {
      if (matchEvent(b.discardOn)) {
        events.push({ t: "ability-modifier-removed", player: pid, modifierId: b.id, reason: "discard-trigger" });
      } else {
        keepPipe.push(b);
      }
    }
    player.pipelineBuffs = keepPipe;

    const keepTrig: import("./types").ActiveTriggerBuff[] = [];
    for (const b of player.triggerBuffs) {
      if (matchEvent(b.discardOn)) {
        events.push({ t: "ability-modifier-removed", player: pid, modifierId: b.id, reason: "discard-trigger" });
      } else {
        keepTrig.push(b);
      }
    }
    player.triggerBuffs = keepTrig;
  }
  return events;
}

/** §15.5 turn-bounded discard sweep. Called from passTurn AFTER incrementing
 *  the outgoing player's `creatorTurnsElapsed` counters. `endingPlayer` is
 *  the player whose turn just ended.
 *
 *  - `end-of-self-turn`     drops at creatorTurnsElapsed === 1 on the creator.
 *  - `next-turn-of-self`    drops at creatorTurnsElapsed === 2 on the creator.
 *  - `end-of-any-turn`      drops at any turn end. */
export function tickTurnBuffs(state: GameState, endingPlayer: import("./types").PlayerId): GameEvent[] {
  const events: GameEvent[] = [];
  for (const pid of ["p1", "p2"] as const) {
    const player = state.players[pid];

    const bumpAndCheck = <T extends { id: string; discardOn?: import("./types").DiscardTrigger; creatorPlayer?: import("./types").PlayerId; creatorTurnsElapsed?: number }>(b: T): boolean => {
      // Increment elapsed counter when the creator's turn just ended.
      if (b.creatorPlayer === endingPlayer) {
        b.creatorTurnsElapsed = (b.creatorTurnsElapsed ?? 0) + 1;
      }
      const d = b.discardOn;
      if (!d) return true;
      if (d.kind === "end-of-any-turn") return false;
      if (d.kind === "end-of-self-turn"
          && b.creatorPlayer === endingPlayer
          && (b.creatorTurnsElapsed ?? 0) >= 1) return false;
      if (d.kind === "next-turn-of-self"
          && b.creatorPlayer === endingPlayer
          && (b.creatorTurnsElapsed ?? 0) >= 2) return false;
      return true;
    };

    const keepMods: ActiveAbilityModifier[] = [];
    for (const m of player.abilityModifiers) {
      if (bumpAndCheck(m)) keepMods.push(m);
      else events.push({ t: "ability-modifier-removed", player: pid, modifierId: m.id, reason: "discard-trigger" });
    }
    player.abilityModifiers = keepMods;

    const keepPipe: import("./types").ActivePipelineBuff[] = [];
    for (const b of player.pipelineBuffs) {
      if (bumpAndCheck(b)) keepPipe.push(b);
      else events.push({ t: "ability-modifier-removed", player: pid, modifierId: b.id, reason: "discard-trigger" });
    }
    player.pipelineBuffs = keepPipe;

    const keepTrig: import("./types").ActiveTriggerBuff[] = [];
    for (const b of player.triggerBuffs) {
      if (bumpAndCheck(b)) keepTrig.push(b);
      else events.push({ t: "ability-modifier-removed", player: pid, modifierId: b.id, reason: "discard-trigger" });
    }
    player.triggerBuffs = keepTrig;

    // Combo overrides on `this-turn` duration drop when the creator's turn ends.
    const keepCombo: import("./types").ActiveComboOverride[] = [];
    for (const c of player.comboOverrides) {
      if (c.expires.kind === "this-turn" && pid === endingPlayer) {
        events.push({ t: "ability-modifier-removed", player: pid, modifierId: c.id, reason: "discard-trigger" });
      } else {
        keepCombo.push(c);
      }
    }
    player.comboOverrides = keepCombo;
  }
  return events;
}

/** Evaluate a state-check predicate against the engine state. Used by
 *  conditional damage bonuses and critical evaluations. */
/** Compute the bonus contribution from a `ConditionalBonus`. The caller is
 *  expected to have already verified the bonus's `condition` via `checkState`
 *  — this function only multiplies the `bonusPerUnit` by the source's unit
 *  count. */
export function computeConditionalBonus(
  caster: HeroSnapshot,
  opponent: HeroSnapshot,
  cb: ConditionalBonus,
): number {
  let units = 0;
  switch (cb.source) {
    case "opponent-status-stacks": {
      const fallbackStatus = cb.condition.kind.endsWith("status-min")
        ? (cb.condition as { status: string }).status
        : "";
      units = opponent.statuses.find(s => s.id === (cb.sourceStatus ?? fallbackStatus))?.stacks ?? 0;
      break;
    }
    case "self-status-stacks":
      units = caster.statuses.find(s => s.id === (cb.sourceStatus ?? ""))?.stacks ?? 0;
      break;
    case "stripped-stack-count":
      units = caster.lastStripped[cb.sourceStatus ?? ""] ?? 0;
      break;
    case "self-passive-counter":
      units = caster.signatureState[cb.sourcePassiveKey ?? ""] ?? 0;
      break;
    case "opponent-passive-counter":
      units = opponent.signatureState[cb.sourcePassiveKey ?? ""] ?? 0;
      break;
    case "damage-prevented-amount":
      // Set by the most-recent reduce-damage resolution on the caster (the
      // defender for defensive contexts, the instant-card holder for card
      // contexts). Naturally 0 outside a defensive resolution — the bonus
      // contributes nothing, which is the correct behavior.
      units = caster.signatureState["__damagePrevented"] ?? 0;
      break;
    case "fixed-one":
      units = 1;
      break;
  }
  return units * cb.bonusPerUnit;
}

export function checkState(
  state: GameState,
  caster: HeroSnapshot,
  opponent: HeroSnapshot,
  check: StateCheck,
  firingFaces?: ReadonlyArray<DieFace>,
  /** Optional firing-ability tier — supplied by the defensive resolver
   *  so `defense-tier-min` (and similar tier-aware checks) can evaluate. */
  firingAbilityTier?: import("./types").AbilityTier,
): boolean {
  void state;
  switch (check.kind) {
    case "always":                  return true;
    case "opponent-has-status-min": return stacksOf(opponent, check.status) >= check.count;
    case "self-has-status-min":     return stacksOf(caster, check.status) >= check.count;
    case "self-stripped-status":    return (caster.lastStripped[check.status] ?? 0) > 0;
    case "self-low-hp":             return caster.isLowHp;
    case "passive-counter-min":     return (caster.signatureState[check.passiveKey] ?? 0) >= check.count;
    case "combo-symbol-count":
      if (!firingFaces) return false;
      return firingFaces.filter(f => f.symbol === check.symbol).length >= check.count;
    case "combo-n-of-a-kind": {
      if (!firingFaces) return false;
      const counts = new Map<number, number>();
      for (const f of firingFaces) counts.set(f.faceValue, (counts.get(f.faceValue) ?? 0) + 1);
      return Math.max(0, ...counts.values()) >= check.count;
    }
    case "combo-straight": {
      if (!firingFaces) return false;
      return longestStraight(firingFaces.map(f => f.faceValue)) >= check.length;
    }
    case "defense-tier-min":
      // Only meaningful inside a defensive-resolution context. Evaluators
      // that don't have the firing tier available (e.g. card-context
      // resolution) fall through as false, which is the safe default.
      return firingAbilityTier != null && firingAbilityTier >= check.tier;
  }
}

/** Length of the longest contiguous-value run in a list of faceValues. */
function longestStraight(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const seen = new Set(values);
  let best = 0;
  for (const v of seen) {
    let len = 1;
    while (seen.has(v + len)) len++;
    if (len > best) best = len;
  }
  return best;
}

void rollOn;            // re-export keeps the AI/sim sharing the seeded stream
void _modIdCounter;     // counter is module-local; signal usage

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

/** Validate a deck's composition per the deck-building overhaul: exactly
 *  12 cards split 4 generic / 3 dice-manip / 3 ladder-upgrade / 2 signature.
 *  Ladder upgrades may target any 3 of {T1, T2, T3, defensive}, but no two
 *  upgrades may target the same slot (one upgrade per ladder tier per game).
 *  T4 ultimates intentionally have no upgrade. Returns issues found; an
 *  empty array means the deck is conformant. */
export function validateDeckComposition(cards: ReadonlyArray<Card>): string[] {
  const issues: string[] = [];
  if (cards.length !== 12) {
    issues.push(`deck size is ${cards.length}, expected exactly 12`);
  }
  const counts: Record<Card["cardCategory"], number> = {
    "generic": 0, "dice-manip": 0, "ladder-upgrade": 0, "signature": 0,
  };
  for (const c of cards) counts[c.cardCategory]++;
  const required = { "generic": 4, "dice-manip": 3, "ladder-upgrade": 3, "signature": 2 } as const;
  for (const cat of ["generic", "dice-manip", "ladder-upgrade", "signature"] as const) {
    if (counts[cat] !== required[cat]) {
      issues.push(`category "${cat}" has ${counts[cat]} cards, expected ${required[cat]}`);
    }
  }
  // One upgrade per ladder tier slot. Each ladder-upgrade card declares its
  // target slot via `masteryTier`. Duplicate slots are rejected at deck-build
  // time so the player can't accidentally bring two T1 upgrades.
  const upgrades = cards.filter(c => c.cardCategory === "ladder-upgrade");
  const slotCounts = new Map<string, number>();
  for (const u of upgrades) {
    if (u.masteryTier == null) {
      issues.push(`ladder-upgrade "${u.name}" is missing masteryTier slot`);
      continue;
    }
    if ((u.masteryTier as unknown) === 4) {
      issues.push(`ladder-upgrade "${u.name}" targets T4 — T4 ultimates intentionally have no upgrade`);
      continue;
    }
    const key = String(u.masteryTier);
    slotCounts.set(key, (slotCounts.get(key) ?? 0) + 1);
  }
  for (const [slot, n] of slotCounts) {
    if (n > 1) issues.push(`two ladder-upgrades target slot "${slot}" — only one upgrade per ladder tier per game`);
  }
  return issues;
}

/** Whether a given card can be played given current state & costs.
 *  Per Correction 6 §1c: state-threshold effects on active statuses can
 *  block specific card kinds (e.g. Verdict at 3+ blocks main-phase + instants
 *  on the holder for one Main Phase). */
export function canPlay(state: GameState, hero: HeroSnapshot, opponent: HeroSnapshot, card: Card): boolean {
  if (hero.cp < card.cost) return false;
  // While the active player is being asked to pick which attack to fire,
  // freeze card play except for instants — the engine has emitted the
  // offensive-pick-prompt and is waiting for select-offensive-ability.
  if (state.pendingOffensiveChoice && card.kind !== "instant") return false;
  if (card.playable) {
    const frac = hero.hp / hero.hpStart;
    if (card.playable.minHpFraction != null && frac < card.playable.minHpFraction) return false;
    if (card.playable.maxHpFraction != null && frac > card.playable.maxHpFraction) return false;
  }
  // Once-per-match / once-per-turn consumption checks.
  if (card.oncePerMatch && hero.consumedOncePerMatchCards.includes(card.id)) return false;
  if (card.oncePerTurn && hero.consumedOncePerTurnCards.includes(card.id)) return false;
  // Richer play-time gate.
  if (card.playCondition) {
    const pc = card.playCondition;
    if (pc.kind === "match-state-threshold") {
      const value = pc.metric === "self-hp" ? hero.hp : opponent.hp;
      if (pc.op === "<=" && !(value <= pc.value)) return false;
      if (pc.op === ">=" && !(value >= pc.value)) return false;
    } else if (pc.kind === "incoming-attack-damage-type") {
      // Only meaningful while a `pendingAttack` is held (instant card flow).
      const dt = state.pendingAttack?.damageType;
      if (!dt) return false;
      if (pc.op === "is"     && dt !== pc.value) return false;
      if (pc.op === "is-not" && dt === pc.value) return false;
    } else if (pc.kind === "passive-counter-min") {
      const count = hero.signatureState[pc.passiveKey] ?? 0;
      if (count < pc.count) return false;
    }
  }
  // Phase gating per Correction 5: roll-phase / roll-action cards are
  // playable during BOTH the offensive-roll AND the defensive-roll phase
  // (defender's roll counts as a roll window for dice-manipulation cards).
  // Instants are evaluated by the choreographer's instant-prompt path and
  // accepted in any phase.
  switch (card.kind) {
    case "main-action":
    case "upgrade":
    case "main-phase":
      if (state.phase !== "main-pre" && state.phase !== "main-post") return false;
      break;
    case "roll-action":
    case "roll-phase":
      if (state.phase !== "offensive-roll" && state.phase !== "defensive-roll") return false;
      break;
    case "status":
      if (state.phase !== "main-pre" && state.phase !== "main-post") return false;
      break;
    case "instant":
      // Instants are always playable subject to CP + their own trigger.
      break;
    case "mastery":
      // Masteries are played from the main phase like persistent buffs.
      // They occupy a slot per `masteryTier`; if the slot is full, refuse.
      if (state.phase !== "main-pre" && state.phase !== "main-post") return false;
      if (card.masteryTier != null) {
        const slot = card.masteryTier;
        if ((hero.masterySlots as Record<string, unknown>)[slot]) return false;
      }
      break;
  }
  // State-threshold blocks: walk the holder's active statuses and reject if
  // any threshold-effect blocks this card kind.
  for (const inst of hero.statuses) {
    const def = getStatusDef(inst.id);
    const blocks = def?.stateThresholdEffects ?? [];
    for (const ste of blocks) {
      if (inst.stacks < ste.threshold) continue;
      if (ste.effect.kind === "block-card-kind" && ste.effect.cardKind === card.kind) return false;
    }
  }
  return true;
}

/** Used for the AI to surface "what could push tier X into reach right now." */
export { stacksOf };

/** RNG-aware roll exposed so simulator/AI can share the seeded stream. */
export { rollOn };
