/**
 * Pyromancer cards — burn / DoT / setup-acceleration kit.
 */
import type { Card, GameEvent } from "../../game/types";
import { registerCustomCard } from "../../game/cards";
import { stacksOf, applyStatus } from "../../game/status";

const SYM_FLAME = "pyromancer:flame";

// Custom handlers
registerCustomCard("pyromancer/conjure-flame", ({ caster, targetDie }) => {
  const events: GameEvent[] = [];
  let idx = targetDie ?? caster.dice.findIndex(d => {
    const s = d.faces[d.current].symbol;
    return s === "pyromancer:spark" || s === "pyromancer:staff";
  });
  if (idx == null || idx < 0) return events;
  const die = caster.dice[idx];
  const flameIdx = die.faces.findIndex(f => f.symbol === SYM_FLAME);
  if (flameIdx < 0) return events;
  const from = die.current;
  die.current = flameIdx;
  events.push({ t: "die-face-changed", player: caster.player, die: idx, from, to: flameIdx, cause: "card" });
  return events;
});

registerCustomCard("pyromancer/upgrade-firebolt", ({ caster }) => {
  caster.upgrades[1] = (caster.upgrades[1] ?? 0) + 1;
  return [];
});
registerCustomCard("pyromancer/upgrade-fireball", ({ caster }) => {
  caster.upgrades[3] = (caster.upgrades[3] ?? 0) + 1;
  return [];
});

// Spread Smolder card — applies +1 stack of Smolder regardless of dice
registerCustomCard("pyromancer/spread-smolder", ({ caster, opponent }) => {
  return applyStatus(opponent, caster.player, "smolder", 1);
});

// Combust — strip all Smolder, dealing 2 damage per stack
registerCustomCard("pyromancer/combust", ({ caster, opponent }) => {
  const stacks = stacksOf(opponent, "smolder");
  if (stacks <= 0) return [];
  // Strip handles ignition naturally (each stack triggers onRemove which fires 2 dmg).
  // But we want PROPORTIONAL — 2 dmg per stack flat, not multiple ignitions.
  // Cleanest: directly deal 2*stacks pure damage and remove the status without ignition.
  const inst = opponent.statuses.find(s => s.id === "smolder");
  if (!inst) return [];
  opponent.statuses = opponent.statuses.filter(s => s.id !== "smolder");
  const dmg = 2 * stacks;
  const before = opponent.hp;
  opponent.hp = Math.max(0, before - dmg);
  return [
    { t: "status-removed", status: "smolder", holder: opponent.player, reason: "stripped" },
    { t: "damage-dealt", from: caster.player, to: opponent.player, amount: dmg, type: "pure", mitigated: 0 },
    { t: "hp-changed", player: opponent.player, delta: opponent.hp - before, total: opponent.hp },
    { t: "hero-state", player: opponent.player, state: "hit" },
  ];
});

export const PYROMANCER_CARDS: Card[] = [
  // Dice manipulation (3)
  { id: "pyromancer/conjure-flame", hero: "pyromancer", kind: "roll-action",
    name: "Conjure Flame", cost: 0,
    text: "Change one die showing Spark or Staff to Flame.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "pyromancer/conjure-flame" } },
  { id: "pyromancer/wild-magic", hero: "pyromancer", kind: "roll-action",
    name: "Wild Magic", cost: 1,
    text: "Reroll any 3 dice. (Engine reroll handled by next ROLL.)",
    trigger: { kind: "manual" },
    effect: { kind: "draw", amount: 1 } /* MVP placeholder: just draw a card; real reroll lands v2 */ },
  { id: "pyromancer/scry", hero: "pyromancer", kind: "main-action",
    name: "Scry", cost: 1,
    text: "Draw 2 cards.",
    trigger: { kind: "manual" },
    effect: { kind: "draw", amount: 2 } },

  // Upgrades (2)
  { id: "pyromancer/upgrade-firebolt", hero: "pyromancer", kind: "upgrade",
    name: "Hot Hand", cost: 2,
    text: "Upgrade Firebolt: +1 damage and +1 Smolder stack.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "pyromancer/upgrade-firebolt" } },
  { id: "pyromancer/upgrade-fireball", hero: "pyromancer", kind: "upgrade",
    name: "Burning Sigil", cost: 3,
    text: "Upgrade Fireball: +2 damage.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "pyromancer/upgrade-fireball" } },

  // Status / utility (3)
  { id: "pyromancer/spread-smolder", hero: "pyromancer", kind: "main-action",
    name: "Spread Smolder", cost: 1, text: "Apply +1 Smolder to opponent.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "pyromancer/spread-smolder" } },
  { id: "pyromancer/cleanse",    hero: "pyromancer", kind: "main-action",
    name: "Quench", cost: 2, text: "Remove all Burn from yourself.",
    trigger: { kind: "manual" },
    effect: { kind: "remove-status", status: "burn", stacks: 99, target: "self" } },
  { id: "pyromancer/manashield", hero: "pyromancer", kind: "main-action",
    name: "Manashield", cost: 2, text: "Gain Shield 2.",
    trigger: { kind: "manual" },
    effect: { kind: "apply-status", status: "shield", stacks: 2, target: "self" } },

  // Hero signature (3)
  { id: "pyromancer/combust", hero: "pyromancer", kind: "main-action",
    name: "Combust", cost: 2,
    text: "Remove all Smolder from opponent, deal 2 pure damage per stack.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "pyromancer/combust" } },
  { id: "pyromancer/inner-fire", hero: "pyromancer", kind: "main-action",
    name: "Inner Fire", cost: 1,
    text: "Apply +1 Burn to yourself; gain +2 CP.",
    trigger: { kind: "manual" },
    effect: { kind: "compound", effects: [
      { kind: "apply-status", status: "burn", stacks: 1, target: "self" },
      { kind: "gain-cp", amount: 2 },
    ]} },
  { id: "pyromancer/firebrand", hero: "pyromancer", kind: "main-action",
    name: "Firebrand", cost: 0,
    text: "Heal 2 for every Smolder stack on opponent.",
    trigger: { kind: "manual" },
    effect: { kind: "heal", amount: 0, target: "self" } /* see custom effect below */ },
];

// "Firebrand" needs custom logic since heal amount depends on opponent state.
registerCustomCard("pyromancer/firebrand", ({ caster, opponent }) => {
  const stacks = stacksOf(opponent, "smolder");
  if (stacks <= 0) return [];
  const before = caster.hp;
  caster.hp = Math.min(caster.hpCap, before + stacks * 2);
  const delta = caster.hp - before;
  if (delta <= 0) return [];
  return [
    { t: "heal-applied", player: caster.player, amount: delta },
    { t: "hp-changed",   player: caster.player, delta, total: caster.hp },
  ];
});
// Override the schema effect at module load — switch firebrand's `effect` to custom.
{
  const fb = PYROMANCER_CARDS.find(c => c.id === "pyromancer/firebrand");
  if (fb) fb.effect = { kind: "custom", id: "pyromancer/firebrand" };
}
