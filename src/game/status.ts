/**
 * Diceborn — status engine.
 *
 * Generic application/tick/removal/stack-limit machinery + the 5 universal
 * token definitions (Burn, Stun, Protect, Shield, Regen) and the Barbarian's
 * signature token (Bleeding).
 *
 * Adding a new hero with a new signature token in a future step is a
 * data-only change: drop a new StatusDefinition into STATUS_REGISTRY.
 */

import type {
  AbilityEffect,
  AbilityTier,
  CardKind,
  DamageType,
  GameEvent,
  GameState,
  HeroSnapshot,
  PlayerId,
  StatusId,
  StatusInstance,
} from "./types";
import { CP_CAP } from "./types";

// ── Definition shape ─────────────────────────────────────────────────────────
export type TickPhase =
  | "ownUpkeep"        // ticks at the holder's Upkeep (Burn, Smolder, Regen)
  | "applierUpkeep"    // ticks at the upkeep of whoever applied it (Bleeding)
  | "neverTicks"       // Stun, Protect, Shield (consumed/expired by other rules)
  | "onTrigger";       // Judgment (resolved when its trigger event fires)

/** A continuous, non-tick effect a status applies while stacks > 0
 *  (Correction 6 §1a). Frost-bite uses this for "-1 dmg on holder's
 *  offensive abilities per stack". */
export interface PassiveModifier {
  scope: "holder" | "applier";
  trigger:
    | "on-offensive-ability"     // applied as a damage adjustment to the affected player's offensive abilities
    | "on-defensive-roll"        // adds to / subtracts from defensive dice count
    | "on-card-played"
    | "always";
  /** Per-stack effect description. The engine reads `field` + `valuePerStack`. */
  field: "damage" | "defensive-dice-count" | "card-cost";
  valuePerStack: number;
  /** Optional clamp (e.g. min: 0 to never push damage below 0). */
  cap?: { min?: number; max?: number };
}

/** A token whose presence at or above `threshold` stacks blocks game actions
 *  on the holder (Correction 6 §1c). Verdict at 3+ blocks main-phase cards
 *  and instants on the holder's next Main Phase. */
export interface StateThresholdEffect {
  threshold: number;
  effect:
    | { kind: "block-card-kind"; cardKind: CardKind }
    | { kind: "block-ability-tier"; tier: AbilityTier }
    | { kind: "modify-roll-dice-count"; delta: number };
  duration: "while-at-threshold" | "next-turn" | "this-phase";
}

/** A token that explodes when stacks reach a threshold (Correction 6 §1b).
 *  Cinder uses `threshold: 5, effect: 8 dmg, resetsStacksTo: 0`. */
export interface DetonationDefinition {
  threshold: number;
  triggerTiming: "on-application-overflow" | "on-holder-upkeep-at-threshold" | "on-event";
  effect: AbilityEffect;
  resetsStacksTo?: number;       // default 0
}

export interface StatusDefinition {
  id: StatusId;
  name: string;
  type: "buff" | "debuff";
  stackLimit: number;
  tickPhase: TickPhase;
  /** When ticked at upkeep, what does it do? */
  onTick?: (
    holder: HeroSnapshot,
    inst: StatusInstance,
  ) => { events: GameEvent[]; pendingDamage?: number; pendingHeal?: number; decrementBy?: number };
  /** When removed (decremented to 0 OR stripped), do anything? */
  onRemove?: (
    holder: HeroSnapshot,
    inst: StatusInstance,
    reason: "expired" | "stripped" | "ignited",
  ) => { events: GameEvent[]; pendingDamage?: number };
  /** Continuous modifier applied while stacks > 0. Read by ability resolver. */
  passiveModifier?: PassiveModifier;
  /** When true, the holder loses 1 stack after each defensive roll they
   *  perform. Used by single-use defensive penalty tokens like the
   *  Pyromancer's `defense-handicap-1`. */
  consumesOnDefensiveRoll?: boolean;
  /** Stacks threshold(s) that block specific actions on the holder. */
  stateThresholdEffects?: StateThresholdEffect[];
  /** Threshold-detonation: on apply (or upkeep), check stacks and trigger. */
  detonation?: DetonationDefinition;
  visualTreatment: { icon: string; color: string; pulse: boolean; particle?: string };
}

// ── Registry ─────────────────────────────────────────────────────────────────
const REGISTRY = new Map<StatusId, StatusDefinition>();

export function registerStatus(def: StatusDefinition): void {
  REGISTRY.set(def.id, def);
}
export function getStatusDef(id: StatusId): StatusDefinition | undefined {
  return REGISTRY.get(id);
}
export function listRegisteredStatuses(): StatusDefinition[] {
  return [...REGISTRY.values()];
}

// ── Universal status tokens ──────────────────────────────────────────────────
registerStatus({
  id: "burn",
  name: "Burn",
  type: "debuff",
  stackLimit: 5,
  tickPhase: "ownUpkeep",
  onTick: (_holder, inst) => ({
    events: [],
    pendingDamage: inst.stacks,
    decrementBy: 1,
  }),
  visualTreatment: { icon: "burn", color: "var(--c-dmg)", pulse: true, particle: "embers" },
});

registerStatus({
  id: "stun",
  name: "Stun",
  type: "debuff",
  stackLimit: 1,
  tickPhase: "neverTicks",         // consumed by phase logic in phases.ts
  visualTreatment: { icon: "stun", color: "#FACC15", pulse: true },
});

registerStatus({
  id: "protect",
  name: "Protect",
  type: "buff",
  stackLimit: 5,
  tickPhase: "neverTicks",         // consumed by damage pipeline
  visualTreatment: { icon: "protect", color: "var(--c-cyan)", pulse: false, particle: "shimmer" },
});

registerStatus({
  id: "shield",
  name: "Shield",
  type: "buff",
  stackLimit: 3,
  tickPhase: "neverTicks",         // passive flat reduction in damage pipeline
  visualTreatment: { icon: "shield", color: "var(--c-cyan)", pulse: false },
});

registerStatus({
  id: "regen",
  name: "Regen",
  type: "buff",
  stackLimit: 5,
  tickPhase: "ownUpkeep",
  onTick: (_holder, inst) => ({
    events: [],
    pendingHeal: inst.stacks,
    decrementBy: 1,
  }),
  visualTreatment: { icon: "regen", color: "var(--c-heal)", pulse: false, particle: "leaves" },
});

// Hero-signature tokens are registered by their respective hero content
// modules when those heroes are introduced. Engine plumbing (applierUpkeep
// ticking, onRemove ignition bursts, onTrigger CP grants) all stays in
// status.ts but no specific signature is registered until content lands.

// ── Helpers used by the engine ───────────────────────────────────────────────

/** Apply N stacks; clamps to the definition's stackLimit. Emits status-applied.
 *  Per Correction 6 §1b, if the definition declares a `detonation` block and
 *  the post-apply count meets the threshold, we emit `status-detonated`,
 *  resolve the detonation effect, and reset stacks per the definition. The
 *  detonation effect is resolved against the holder's opponent (caller can
 *  re-target if needed). */
export function applyStatus(
  holder: HeroSnapshot,
  applier: PlayerId,
  status: StatusId,
  stacks: number,
  applierSnapshot?: HeroSnapshot,
): GameEvent[] {
  const def = REGISTRY.get(status);
  if (!def || stacks <= 0) return [];
  const events: GameEvent[] = [];

  const stackLimit = applyTokenOverrideNumeric(applierSnapshot, status, "stack-limit", def.stackLimit);

  const existing = holder.statuses.find(s => s.id === status);
  let postCount = 0;
  if (existing) {
    const before = existing.stacks;
    existing.stacks = Math.min(stackLimit, before + stacks);
    if (existing.stacks === before) {
      // Already capped — but detonation may still trigger when at threshold.
      postCount = existing.stacks;
    } else {
      existing.appliedBy = applier;
      events.push({ t: "status-applied", status, holder: holder.player, applier, stacks: existing.stacks - before, total: existing.stacks });
      postCount = existing.stacks;
    }
  } else {
    const inst: StatusInstance = { id: status, stacks: Math.min(stackLimit, stacks), appliedBy: applier };
    holder.statuses.push(inst);
    events.push({ t: "status-applied", status, holder: holder.player, applier, stacks: inst.stacks, total: inst.stacks });
    postCount = inst.stacks;
  }

  const detThreshold = def.detonation
    ? applyTokenOverrideNumeric(applierSnapshot, status, "detonation-threshold", def.detonation.threshold)
    : 0;
  if (def.detonation && def.detonation.triggerTiming === "on-application-overflow" && postCount >= detThreshold) {
    events.push({ t: "status-detonated", status, holder: holder.player, threshold: detThreshold });
    // Reset stacks (default 0).
    const resetTo = def.detonation.resetsStacksTo ?? 0;
    const inst2 = holder.statuses.find(s => s.id === status);
    if (inst2) {
      if (resetTo <= 0) holder.statuses = holder.statuses.filter(s => s.id !== status);
      else inst2.stacks = resetTo;
    }
    // Resolve the detonation effect inline. We support the most common
    // shape — `damage` to the holder — directly here. More exotic shapes
    // are deferred to the broader resolver via the pending flag (kept for
    // backwards compatibility with code that may consult it).
    events.push(...resolveDetonationEffect(def.detonation.effect, status, holder, applierSnapshot));
    holder.signatureState[`__pendingDetonation:${status}`] = 1;

    // CP economy: fire `selfStatusDetonated` resource trigger on the applier.
    // "Self" in the trigger means the applier — when *their* signature token
    // detonates on the holder, they bank CP.
    if (applierSnapshot) {
      const heroDef = APPLIER_HERO_LOOKUP?.(applierSnapshot.hero);
      if (heroDef) {
        for (const trig of heroDef.resourceIdentity.cpGainTriggers) {
          if (trig.on === "selfStatusDetonated" && (!trig.status || trig.status === status)) {
            const before = applierSnapshot.cp;
            const cap = trig.capAt ?? CP_CAP;
            applierSnapshot.cp = Math.min(cap, before + trig.gain);
            const delta = applierSnapshot.cp - before;
            if (delta !== 0) events.push({ t: "cp-changed", player: applierSnapshot.player, delta, total: applierSnapshot.cp });
          }
        }
      }
    }
  }
  return events;
}

/** Resolve a detonation effect inline against the holder. Supports the
 *  common `damage` shape with optional `detonation-amount` token override.
 *  Falls back to a no-op for unsupported effect kinds. */
function resolveDetonationEffect(
  effect: AbilityEffect,
  status: StatusId,
  holder: HeroSnapshot,
  applierSnapshot: HeroSnapshot | undefined,
): GameEvent[] {
  if (effect.kind !== "damage") return [];
  const amount = applyTokenOverrideNumeric(applierSnapshot, status, "detonation-amount", effect.amount);
  if (amount <= 0) return [];
  // The detonation hits the holder (the player who carries the token).
  // Detonation damage bypasses the defensive roll machinery — the type on
  // the effect controls Shield/Protect interaction (typically `undefendable`
  // which still passes through Shield/Protect; or `pure` to bypass tokens).
  return runDetonationDamage(holder, amount, effect.type);
}

/** Minimal `dealDamage` analogue for detonation. We can't import damage.ts
 *  from status.ts (would create a cycle). Instead we apply the same Shield
 *  → Protect → HP order inline, emit a `damage-dealt` event, and update HP. */
function runDetonationDamage(holder: HeroSnapshot, amount: number, type: DamageType): GameEvent[] {
  let working = amount;
  let mitigated = 0;
  if (type !== "pure") {
    const shieldStacks = stacksOf(holder, "shield");
    const shieldReduction = Math.min(working, shieldStacks);
    working -= shieldReduction;
    mitigated += shieldReduction;
    const protectStacks = stacksOf(holder, "protect");
    if (protectStacks > 0 && working > 0) {
      const tokensToSpend = Math.min(protectStacks, Math.ceil(working / 2));
      const protectReduction = Math.min(working, tokensToSpend * 2);
      working -= protectReduction;
      mitigated += protectReduction;
      const inst = holder.statuses.find(s => s.id === "protect");
      if (inst) {
        inst.stacks -= tokensToSpend;
        if (inst.stacks <= 0) holder.statuses = holder.statuses.filter(s => s.id !== "protect");
      }
    }
  }
  const dealt = Math.max(0, Math.floor(working));
  const before = holder.hp;
  holder.hp = Math.max(0, before - dealt);
  const events: GameEvent[] = [
    { t: "damage-dealt", from: holder.player, to: holder.player, amount: dealt, type, mitigated },
  ];
  if (holder.hp !== before) events.push({ t: "hp-changed", player: holder.player, delta: holder.hp - before, total: holder.hp });
  return events;
}

// status.ts can't import from `../content` (would create a cycle: content
// imports status to register its tokens). The engine wires this lookup at
// startup so `applyStatus` can resolve the applier's hero definition for
// resource-trigger dispatch.
type HeroLookup = (heroId: import("./types").HeroId) => import("./types").HeroDefinition | undefined;
let APPLIER_HERO_LOOKUP: HeroLookup | undefined;
export function setHeroLookup(fn: HeroLookup): void { APPLIER_HERO_LOOKUP = fn; }

/** Remove up to N stacks. If status reaches 0, fires onRemove and emits removed. */
export function removeStatus(
  holder: HeroSnapshot,
  status: StatusId,
  stacks: number,
  reason: "expired" | "stripped" | "ignited",
): { events: GameEvent[]; pendingDamage: number } {
  const def = REGISTRY.get(status);
  const inst = holder.statuses.find(s => s.id === status);
  if (!def || !inst) return { events: [], pendingDamage: 0 };
  inst.stacks -= stacks;
  if (inst.stacks > 0) return { events: [], pendingDamage: 0 };

  // Fully removed
  holder.statuses = holder.statuses.filter(s => s.id !== status);
  let pendingDamage = 0;
  const events: GameEvent[] = [];
  if (def.onRemove) {
    const r = def.onRemove(holder, inst, reason);
    events.push(...r.events);
    pendingDamage += r.pendingDamage ?? 0;
  }
  events.push({ t: "status-removed", status, holder: holder.player, reason });
  return { events, pendingDamage };
}

/** Strip a status entirely — removes all stacks, returns events. Records the
 *  stripped-stack-count on `holder.lastStripped[status]` so downstream
 *  conditional-bonus checks can read it (e.g. Solar Blade's per-Verdict-stack
 *  bonus). The record persists until the holder's next phase. */
export function stripStatus(holder: HeroSnapshot, status: StatusId): { events: GameEvent[]; pendingDamage: number } {
  const inst = holder.statuses.find(s => s.id === status);
  if (!inst) return { events: [], pendingDamage: 0 };
  const stacksBefore = inst.stacks;
  const result = removeStatus(holder, status, inst.stacks, "stripped");
  holder.lastStripped[status] = stacksBefore;
  return result;
}

/** Tick all statuses on `holder` whose tickPhase matches. Used by phases.ts. */
export function tickStatusesAt(
  state: GameState,
  holder: HeroSnapshot,
  tickPhase: TickPhase,
): { events: GameEvent[]; pendingDamage: number; pendingHeal: number } {
  const events: GameEvent[] = [];
  let pendingDamage = 0;
  let pendingHeal = 0;
  // Snapshot — we'll mutate stacks inside the loop.
  const order = [...holder.statuses];
  for (const inst of order) {
    const def = REGISTRY.get(inst.id);
    if (!def || def.tickPhase !== tickPhase) continue;

    // Bleeding ticks only on the *applier's* upkeep.
    if (def.tickPhase === "applierUpkeep" && state.activePlayer !== inst.appliedBy) continue;

    if (!def.onTick) continue;
    const r = def.onTick(holder, inst);
    events.push(...r.events);
    pendingDamage += r.pendingDamage ?? 0;
    pendingHeal   += r.pendingHeal   ?? 0;
    const dec = r.decrementBy ?? 0;
    const remainingAfter = Math.max(0, inst.stacks - dec);

    if ((r.pendingDamage ?? 0) > 0) {
      events.push({ t: "status-ticked", status: inst.id, holder: holder.player, effect: "damage", amount: r.pendingDamage!, stacksRemaining: remainingAfter });
    } else if ((r.pendingHeal ?? 0) > 0) {
      events.push({ t: "status-ticked", status: inst.id, holder: holder.player, effect: "heal", amount: r.pendingHeal!, stacksRemaining: remainingAfter });
    } else if (dec > 0) {
      events.push({ t: "status-ticked", status: inst.id, holder: holder.player, effect: "decrement", amount: dec, stacksRemaining: remainingAfter });
    }

    // Apply the decrement
    inst.stacks = remainingAfter;
    if (inst.stacks <= 0) {
      const rem = removeStatus(holder, inst.id, 0, "expired");
      events.push(...rem.events);
      pendingDamage += rem.pendingDamage;
    }
  }
  return { events, pendingDamage, pendingHeal };
}

/** Stack count for a given status (0 if absent). */
export function stacksOf(holder: HeroSnapshot, status: StatusId): number {
  return holder.statuses.find(s => s.id === status)?.stacks ?? 0;
}

// ── Per-player token overrides (Crater Wind etc.) ───────────────────────────

/** Apply a numeric token-override modification (set/add/multiply) to a base
 *  value, scanning the applier's `tokenOverrides` for the named field on the
 *  named status. Used for `detonation-amount`, `detonation-threshold`,
 *  `passive-modifier-value-per-stack`, `stack-limit`. */
export function applyTokenOverrideNumeric(
  applier: HeroSnapshot | undefined,
  status: StatusId,
  field: string,
  base: number,
): number {
  if (!applier) return base;
  const ov = applier.tokenOverrides.find(o => o.status === status);
  if (!ov) return base;
  let amount = base;
  for (const mod of ov.modifications) {
    if (mod.field !== field) continue;
    const val = typeof mod.value === "number" ? mod.value : 0;
    if (mod.operation === "set") amount = val;
    else if (mod.operation === "add") amount += val;
    else if (mod.operation === "multiply") amount = Math.ceil(amount * val);
  }
  return amount;
}
