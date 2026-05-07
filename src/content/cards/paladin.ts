/**
 * Paladin cards — defensive / heal / mitigation / Judgment kit.
 */
import type { Card, GameEvent } from "../../game/types";
import { registerCustomCard } from "../../game/cards";
import { stacksOf, applyStatus } from "../../game/status";

const SYM_HAMMER = "paladin:hammer";

registerCustomCard("paladin/holy-strike", ({ caster, targetDie }) => {
  const events: GameEvent[] = [];
  let idx = targetDie ?? caster.dice.findIndex(d => d.faces[d.current].symbol === "paladin:fist");
  if (idx == null || idx < 0) return events;
  const die = caster.dice[idx];
  const hammerIdx = die.faces.findIndex(f => f.symbol === SYM_HAMMER);
  if (hammerIdx < 0) return events;
  const from = die.current;
  die.current = hammerIdx;
  events.push({ t: "die-face-changed", player: caster.player, die: idx, from, to: hammerIdx, cause: "card" });
  return events;
});

registerCustomCard("paladin/upgrade-smite", ({ caster }) => { caster.upgrades[1] = (caster.upgrades[1] ?? 0) + 1; return []; });
registerCustomCard("paladin/upgrade-decree", ({ caster }) => { caster.upgrades[3] = (caster.upgrades[3] ?? 0) + 1; return []; });

// "Lay on Hands" — heal a chunk; signature.
// Schema-supported via heal effect; no custom needed.

export const PALADIN_CARDS: Card[] = [
  // Dice manipulation (3)
  { id: "paladin/holy-strike", hero: "paladin", kind: "roll-action",
    name: "Holy Strike", cost: 0,
    text: "Change one die showing Fist to Hammer.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "paladin/holy-strike" } },
  { id: "paladin/divine-foresight", hero: "paladin", kind: "main-action",
    name: "Divine Foresight", cost: 1, text: "Draw 2 cards.",
    trigger: { kind: "manual" },
    effect: { kind: "draw", amount: 2 } },
  { id: "paladin/steady-hand", hero: "paladin", kind: "main-action",
    name: "Steady Hand", cost: 1, text: "Gain 1 Protect token.",
    trigger: { kind: "manual" },
    effect: { kind: "apply-status", status: "protect", stacks: 1, target: "self" } },

  // Upgrades (2)
  { id: "paladin/upgrade-smite", hero: "paladin", kind: "upgrade",
    name: "Sanctified Blade", cost: 2, text: "Upgrade Smite: +1 damage.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "paladin/upgrade-smite" } },
  { id: "paladin/upgrade-decree", hero: "paladin", kind: "upgrade",
    name: "Judgment Gathered", cost: 3, text: "Upgrade Divine Decree: +2 damage.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "paladin/upgrade-decree" } },

  // Status / utility (3)
  { id: "paladin/lay-on-hands", hero: "paladin", kind: "main-action",
    name: "Lay on Hands", cost: 3, text: "Heal 8.",
    trigger: { kind: "manual" },
    effect: { kind: "heal", amount: 8, target: "self" } },
  { id: "paladin/aegis", hero: "paladin", kind: "main-action",
    name: "Aegis", cost: 2, text: "Gain Shield 2.",
    trigger: { kind: "manual" },
    effect: { kind: "apply-status", status: "shield", stacks: 2, target: "self" } },
  { id: "paladin/blessing", hero: "paladin", kind: "main-action",
    name: "Blessing", cost: 2, text: "Gain Regen 3.",
    trigger: { kind: "manual" },
    effect: { kind: "apply-status", status: "regen", stacks: 3, target: "self" } },

  // Hero signature (3)
  { id: "paladin/divine-favor", hero: "paladin", kind: "main-action",
    name: "Divine Favor", cost: 2, text: "Apply +2 Judgment to the opponent.",
    trigger: { kind: "manual" },
    effect: { kind: "apply-status", status: "judgment", stacks: 2, target: "opponent" } },
  { id: "paladin/conviction", hero: "paladin", kind: "main-action",
    name: "Conviction", cost: 1,
    text: "Spend 1 Protect for +3 damage on your next ability.",
    trigger: { kind: "manual" },
    effect: { kind: "custom", id: "paladin/conviction" } },
  { id: "paladin/sanctuary", hero: "paladin", kind: "main-action",
    name: "Sanctuary", cost: 0, text: "Playable at ≤15 HP. Gain 3 Protect.",
    trigger: { kind: "manual" },
    effect: { kind: "apply-status", status: "protect", stacks: 3, target: "self" },
    playable: { maxHpFraction: 15 / 30 + 0.0001 } },
];

registerCustomCard("paladin/conviction", ({ caster }) => {
  if (stacksOf(caster, "protect") <= 0) return [];
  const inst = caster.statuses.find(s => s.id === "protect")!;
  inst.stacks -= 1;
  caster.nextAbilityBonusDamage += 3;
  if (inst.stacks <= 0) caster.statuses = caster.statuses.filter(s => s.id !== "protect");
  return [{ t: "status-ticked", status: "protect", holder: caster.player, effect: "decrement", amount: 1, stacksRemaining: Math.max(0, inst.stacks) }];
});

// Side-effect import keeper.
void applyStatus;
