/**
 * Diceborn — damage pipeline.
 *
 * Order of operations on incoming damage:
 *   1. Pure damage:         skips Shield + Protect. Directly subtracts HP.
 *   2. Undefendable damage: skips defensive roll mitigation, but Shield + Protect still apply.
 *   3. Normal damage:       Shield (passive flat) → Protect (consumed) → defensive-roll reduction (engine.ts handles separately) → HP.
 *   4. Ultimate damage:     same as normal but cannot be cancelled by reactive cards.
 *
 * Healing clamps to hpCap (start + 10).
 */

import type { DamageType, GameEvent, HeroSnapshot, PlayerId } from "./types";
import { stacksOf, removeStatus } from "./status";

export interface DealDamageResult {
  events: GameEvent[];
  /** Final HP delta applied. Negative = damage taken. */
  delta: number;
  /** Amount of mitigation applied (≥0). */
  mitigated: number;
  /** Did this strike kill the target? */
  lethal: boolean;
}

/**
 * Apply a single source of damage to `target`.
 * `defensiveReduction` is provided externally (from the defensive-roll
 * resolution in phases.ts); pass 0 if undefendable/pure/ultimate.
 */
export function dealDamage(
  source: PlayerId,
  target: HeroSnapshot,
  amount: number,
  type: DamageType,
  defensiveReduction = 0,
): DealDamageResult {
  const events: GameEvent[] = [];
  if (amount <= 0) return { events, delta: 0, mitigated: 0, lethal: false };

  let working = amount;
  let mitigated = 0;

  if (type === "pure") {
    // Bypass everything.
  } else {
    // Shield: passive flat reduction (1 per stack), uncapped per hit but never below 0.
    const shieldStacks = stacksOf(target, "shield");
    if (shieldStacks > 0) {
      const reduce = Math.min(working, shieldStacks);
      working   -= reduce;
      mitigated += reduce;
    }

    // Protect tokens: consumed 1-at-a-time, each prevents 2.
    const protectStacks = stacksOf(target, "protect");
    if (protectStacks > 0 && working > 0) {
      const tokensToSpend = Math.min(protectStacks, Math.ceil(working / 2));
      // Decrement tokens directly (not via removeStatus's onRemove pipeline,
      // since Protect has no onRemove side-effect).
      const inst = target.statuses.find(s => s.id === "protect")!;
      inst.stacks -= tokensToSpend;
      const reduce = Math.min(working, tokensToSpend * 2);
      working   -= reduce;
      mitigated += reduce;
      if (inst.stacks <= 0) {
        const rem = removeStatus(target, "protect", 0, "expired");
        events.push(...rem.events);
      }
    }

    // Defensive-roll reduction: provided by caller for normal/ultimate damage.
    if ((type === "normal" || type === "ultimate" || type === "collateral") && defensiveReduction > 0) {
      const reduce = Math.min(working, defensiveReduction);
      working   -= reduce;
      mitigated += reduce;
    }
    // Undefendable: skip defensive-roll reduction; Shield + Protect already applied.
  }

  const finalDamage = Math.max(0, Math.floor(working));
  const before = target.hp;
  target.hp = Math.max(0, before - finalDamage);
  const delta = target.hp - before;

  events.push(
    { t: "damage-dealt", from: source, to: target.player, amount: finalDamage, type, mitigated },
    { t: "hp-changed",   player: target.player, delta, total: target.hp },
    { t: "hero-state",   player: target.player, state: "hit" },
  );

  // Low-HP transition.
  const wasLow = target.isLowHp;
  target.isLowHp = target.hp / target.hpStart <= 0.25 && target.hp > 0;
  if (!wasLow && target.isLowHp) events.push({ t: "hero-state", player: target.player, state: "low-hp-enter" });

  return { events, delta, mitigated, lethal: target.hp <= 0 };
}

/** Heal up to hpCap. */
export function heal(target: HeroSnapshot, amount: number): GameEvent[] {
  if (amount <= 0) return [];
  const before = target.hp;
  target.hp = Math.min(target.hpCap, before + Math.floor(amount));
  const delta = target.hp - before;
  if (delta <= 0) return [];
  const events: GameEvent[] = [
    { t: "heal-applied", player: target.player, amount: delta },
    { t: "hp-changed",   player: target.player, delta, total: target.hp },
  ];
  // Low-HP exit.
  const wasLow = target.isLowHp;
  target.isLowHp = target.hp / target.hpStart <= 0.25 && target.hp > 0;
  if (wasLow && !target.isLowHp) events.push({ t: "hero-state", player: target.player, state: "low-hp-exit" });
  return events;
}
