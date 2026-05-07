/**
 * Diceborn — Barbarian-specific cards.
 *
 * Cards whose effects fit the generic AbilityEffect schema use the schema.
 * Cards whose effects need hero-specific state (Rage stacks, "next ability"
 * damage rider, free die-lock, die-face-set) declare `{ kind: "custom", id }`
 * and the handler is registered here at module load.
 */

import type { Card, GameEvent } from "../../game/types";
import { registerCustomCard } from "../../game/cards";
import { stacksOf, applyStatus } from "../../game/status";

// ── Symbol shortcuts (kept in sync with content/heroes/barbarian.ts) ─────────
const SYM_AXE  = "barbarian:axe";
const SYM_SHIELD = "barbarian:shield";

// ── Custom handlers ──────────────────────────────────────────────────────────
registerCustomCard("barbarian/sharpen", ({ caster, targetDie }) => {
  // "Change one die showing FIST or FURY to AXE."
  const events: GameEvent[] = [];
  let idx = targetDie;
  if (idx == null) {
    idx = caster.dice.findIndex(d => {
      const sym = d.faces[d.current].symbol;
      return sym === "barbarian:fist" || sym === "barbarian:fury";
    });
  }
  if (idx == null || idx < 0) return events;
  const die = caster.dice[idx];
  const target = die.faces.findIndex(f => f.symbol === SYM_AXE);
  if (target < 0) return events;
  const from = die.current;
  die.current = target;
  events.push({ t: "die-face-changed", player: caster.player, die: idx, from, to: target, cause: "card" });
  return events;
});

registerCustomCard("barbarian/lock-in", ({ caster, targetDie }) => {
  // "Lock a die without spending an attempt." (Just locks it; attempt economy
  // is handled in engine.ts per roll, so 'free' simply means we lock without
  // requiring a roll button press.)
  let idx = targetDie ?? caster.dice.findIndex(d => !d.locked);
  if (idx < 0 || idx >= caster.dice.length) return [];
  caster.dice[idx].locked = true;
  return [{ t: "die-locked", player: caster.player, die: idx, locked: true }];
});

registerCustomCard("barbarian/reckless-swing", ({ state, caster }) => {
  // "Reroll any 2 dice. Take 1 damage." Implementation: unlock 2 currently-
  // locked dice (or pick 2 unlocked ones with worst symbol) for the next roll
  // attempt — for MVP we mark them unlocked and the next roll handles them.
  // Self-damage is resolved as a pure-damage event so it bypasses defenses.
  const events: GameEvent[] = [];
  let unlocked = 0;
  for (let i = 0; i < caster.dice.length && unlocked < 2; i++) {
    if (caster.dice[i].locked) {
      caster.dice[i].locked = false;
      events.push({ t: "die-locked", player: caster.player, die: i, locked: false });
      unlocked++;
    }
  }
  // Self damage (1, pure)
  caster.hp = Math.max(0, caster.hp - 1);
  events.push(
    { t: "damage-dealt", from: caster.player, to: caster.player, amount: 1, type: "pure", mitigated: 0 },
    { t: "hp-changed",   player: caster.player, delta: -1, total: caster.hp },
  );
  void state;
  return events;
});

registerCustomCard("barbarian/upgrade-cleave", ({ caster }) => {
  // "Upgrade Cleave (Tier 1): +1 damage and applies Bleeding 2 instead of 1."
  caster.upgrades[1] = (caster.upgrades[1] ?? 0) + 1;
  return [];
});
registerCustomCard("barbarian/upgrade-frenzy", ({ caster }) => {
  // "Upgrade Berserker Frenzy (Tier 3): +2 damage."
  caster.upgrades[3] = (caster.upgrades[3] ?? 0) + 1;
  return [];
});

registerCustomCard("barbarian/berserk-rush", ({ caster }) => {
  // "Your next ability deals +3 damage. Take 2 damage now."
  caster.nextAbilityBonusDamage += 3;
  const before = caster.hp;
  caster.hp = Math.max(0, before - 2);
  return [
    { t: "damage-dealt", from: caster.player, to: caster.player, amount: 2, type: "pure", mitigated: 0 },
    { t: "hp-changed",   player: caster.player, delta: caster.hp - before, total: caster.hp },
  ];
});

registerCustomCard("barbarian/blood-debt", ({ caster, opponent }) => {
  // "If opponent has Bleeding, gain that many Rage stacks."
  const bleed = stacksOf(opponent, "bleeding");
  if (bleed <= 0) return [];
  const before = caster.signatureState["rage"] ?? 0;
  const cap = 5;
  const after = Math.min(cap, before + bleed);
  caster.signatureState["rage"] = after;
  if (after === before) return [];
  return [{ t: "rage-changed", player: caster.player, stacks: after }];
});

registerCustomCard("barbarian/last-stand", ({ caster }) => {
  // "Playable only at <=10 HP. Gain 3 Rage stacks immediately."
  // Playability gating is enforced at the card-play action site (canPlay in
  // cards.ts via `playable.maxHpFraction`); this handler just applies the buff.
  const before = caster.signatureState["rage"] ?? 0;
  const after = Math.min(5, before + 3);
  caster.signatureState["rage"] = after;
  return after === before ? [] : [{ t: "rage-changed", player: caster.player, stacks: after }];
});

registerCustomCard("barbarian/parry", ({ caster, opponent, targetDie }) => {
  // Counter: when opponent rolls their ULT symbol, change *that* die to a Shield.
  // The engine surfaces the relevant die index via targetDie when prompting.
  if (targetDie == null) return [];
  const die = opponent.dice[targetDie];
  const shieldIdx = die.faces.findIndex(f => f.symbol === SYM_SHIELD);
  if (shieldIdx < 0) return [];
  const from = die.current;
  die.current = shieldIdx;
  return [{ t: "die-face-changed", player: caster.player, die: targetDie, from, to: shieldIdx, cause: "card" }];
});

// (No custom handler for "barbarian/no-mercy" — its effect fits the schema.)
// (No custom handler for "barbarian/intimidate" — apply-status fits the schema.)
// (No custom handler for "barbarian/second-wind" — heal fits the schema.)

// Side-effect-free import (we want the registry populated when the hero loads).
void applyStatus;

// ── Card data ────────────────────────────────────────────────────────────────
export const BARBARIAN_CARDS: Card[] = [
  // Dice manipulation (3)
  { id: "barbarian/sharpen", hero: "barbarian", kind: "roll-action",
    name: "Sharpen", cost: 0,
    text: "Change one die showing Fist or Fury to Axe.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "barbarian/sharpen" } },
  { id: "barbarian/reckless-swing", hero: "barbarian", kind: "roll-action",
    name: "Reckless Swing", cost: 1,
    text: "Reroll any 2 dice. Take 1 damage.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "barbarian/reckless-swing" } },
  { id: "barbarian/lock-in", hero: "barbarian", kind: "roll-action",
    name: "Lock In", cost: 1,
    text: "Lock a die without spending an attempt.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "barbarian/lock-in" } },

  // Upgrades (2)
  { id: "barbarian/upgrade-cleave", hero: "barbarian", kind: "upgrade",
    name: "Honed Edge", cost: 2,
    text: "Upgrade Cleave: +1 damage and applies Bleeding 2 instead of 1.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "barbarian/upgrade-cleave" } },
  { id: "barbarian/upgrade-frenzy", hero: "barbarian", kind: "upgrade",
    name: "Bloodlust", cost: 3,
    text: "Upgrade Berserker Frenzy: +2 damage.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "barbarian/upgrade-frenzy" } },

  // Status / utility (2)
  { id: "barbarian/intimidate", hero: "barbarian", kind: "main-action",
    name: "Intimidate", cost: 2,
    text: "Apply Stun 1 to opponent.",
    trigger: { kind: "manual" },
    effect: { kind: "apply-status", status: "stun", stacks: 1, target: "opponent" } },
  { id: "barbarian/second-wind", hero: "barbarian", kind: "main-action",
    name: "Second Wind", cost: 1, text: "Heal 3.",
    trigger: { kind: "manual" },
    effect: { kind: "heal", amount: 3, target: "self" } },

  // Counters (2)
  { id: "barbarian/parry", hero: "barbarian", kind: "roll-action",
    name: "Parry", cost: 1,
    text: "When the opponent rolls their Roar (ult), change that die to a Shield.",
    trigger: { kind: "on-symbol-rolled", symbol: "*:ult", by: "opponent" },
    effect: { kind: "custom", id: "barbarian/parry" } },
  { id: "barbarian/no-mercy", hero: "barbarian", kind: "roll-action",
    name: "No Mercy", cost: 2,
    text: "When opponent fires Tier 2 or higher, deal 2 pure damage to them.",
    trigger: { kind: "on-tier-fired", tier: 2, by: "opponent" },
    effect: { kind: "damage", amount: 2, type: "pure" } },

  // Hero signature (3)
  { id: "barbarian/berserk-rush", hero: "barbarian", kind: "main-action",
    name: "Berserk Rush", cost: 2,
    text: "Your next ability deals +3 damage. Take 2 damage now.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "barbarian/berserk-rush" } },
  { id: "barbarian/blood-debt", hero: "barbarian", kind: "main-action",
    name: "Blood Debt", cost: 1,
    text: "If opponent has Bleeding, gain that many Rage stacks (cap 5).",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "barbarian/blood-debt" } },
  { id: "barbarian/last-stand", hero: "barbarian", kind: "main-action",
    name: "Last Stand", cost: 0,
    text: "Playable only at ≤ 10 HP. Gain 3 Rage stacks immediately.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "barbarian/last-stand" },
    playable: { maxHpFraction: 10 / 30 + 0.0001 } },
];
