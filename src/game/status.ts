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
  GameEvent,
  GameState,
  HeroSnapshot,
  PlayerId,
  StatusId,
  StatusInstance,
} from "./types";

// ── Definition shape ─────────────────────────────────────────────────────────
export type TickPhase =
  | "ownUpkeep"        // ticks at the holder's Upkeep (Burn, Smolder, Regen)
  | "applierUpkeep"    // ticks at the upkeep of whoever applied it (Bleeding)
  | "neverTicks"       // Stun, Protect, Shield (consumed/expired by other rules)
  | "onTrigger";       // Judgment (resolved when its trigger event fires)

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

// ── Signature: Bleeding (Barbarian) ──────────────────────────────────────────
registerStatus({
  id: "bleeding",
  name: "Bleeding",
  type: "debuff",
  stackLimit: 5,
  tickPhase: "applierUpkeep",     // ticks at the *applier's* (Barbarian's) upkeep
  onTick: (_holder, inst) => ({
    events: [],
    pendingDamage: inst.stacks,
    decrementBy: 1,
  }),
  visualTreatment: { icon: "bleeding", color: "#9F1239", pulse: true, particle: "drips" },
});

// ── Helpers used by the engine ───────────────────────────────────────────────

/** Apply N stacks; clamps to the definition's stackLimit. Emits status-applied. */
export function applyStatus(
  holder: HeroSnapshot,
  applier: PlayerId,
  status: StatusId,
  stacks: number,
): GameEvent[] {
  const def = REGISTRY.get(status);
  if (!def || stacks <= 0) return [];
  const existing = holder.statuses.find(s => s.id === status);
  if (existing) {
    const before = existing.stacks;
    existing.stacks = Math.min(def.stackLimit, before + stacks);
    if (existing.stacks === before) return [];   // already capped
    // Track the most recent applier (matters for Bleeding ticking on their turn)
    existing.appliedBy = applier;
    return [{ t: "status-applied", status, holder: holder.player, applier, stacks: existing.stacks - before, total: existing.stacks }];
  }
  const inst: StatusInstance = {
    id: status,
    stacks: Math.min(def.stackLimit, stacks),
    appliedBy: applier,
  };
  holder.statuses.push(inst);
  return [{ t: "status-applied", status, holder: holder.player, applier, stacks: inst.stacks, total: inst.stacks }];
}

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

/** Strip a status entirely — removes all stacks, returns events. */
export function stripStatus(holder: HeroSnapshot, status: StatusId): { events: GameEvent[]; pendingDamage: number } {
  const inst = holder.statuses.find(s => s.id === status);
  if (!inst) return { events: [], pendingDamage: 0 };
  return removeStatus(holder, status, inst.stacks, "stripped");
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
