/**
 * Diceborn — generic (universal) cards.
 *
 * MVP set is intentionally minimal — three universal staples that every
 * hero gets. The economy lives mainly in hero-specific decks for now.
 */

import type { Card } from "../../game/types";

export const GENERIC_CARDS: Card[] = [
  {
    id: "generic/quick-draw",
    hero: "generic",
    kind: "main-action",
    cardCategory: "generic",
    name: "Quick Draw",
    cost: 1,
    text: "Draw 2 cards.",
    trigger: { kind: "manual" },
    effect: { kind: "draw", amount: 2 },
  },
  {
    id: "generic/focus",
    hero: "generic",
    kind: "main-action",
    cardCategory: "generic",
    name: "Focus",
    cost: 0,
    text: "Gain 1 CP.",
    trigger: { kind: "manual" },
    effect: { kind: "gain-cp", amount: 1 },
  },
  {
    id: "generic/cleanse",
    hero: "generic",
    kind: "main-action",
    cardCategory: "generic",
    name: "Cleanse",
    cost: 2,
    text: "Remove all Burn stacks from yourself.",
    trigger: { kind: "manual" },
    effect: { kind: "remove-status", status: "burn", stacks: 99, target: "self" },
  },
  {
    id: "generic/bandage",
    hero: "generic",
    kind: "main-action",
    cardCategory: "generic",
    name: "Bandage",
    cost: 2,
    text: "Heal 2 HP.",
    trigger: { kind: "manual" },
    effect: { kind: "heal", amount: 2, target: "self" },
  },
  {
    id: "generic/battle-plan",
    hero: "generic",
    kind: "main-action",
    cardCategory: "generic",
    name: "Battle Plan",
    cost: 1,
    text: "Draw 1 card and gain 1 CP.",
    trigger: { kind: "manual" },
    effect: {
      kind: "compound",
      effects: [
        { kind: "draw", amount: 1 },
        { kind: "gain-cp", amount: 1 },
      ],
    },
  },
  {
    id: "generic/second-wind",
    hero: "generic",
    kind: "main-action",
    cardCategory: "generic",
    name: "Second Wind",
    cost: 3,
    text: "Heal 4 HP. Once per match.",
    trigger: { kind: "manual" },
    effect: { kind: "heal", amount: 4, target: "self" },
    oncePerMatch: true,
  },
  {
    id: "generic/resolve",
    hero: "generic",
    kind: "main-action",
    cardCategory: "generic",
    name: "Resolve",
    cost: 1,
    text: "Remove all Stun stacks from yourself.",
    trigger: { kind: "manual" },
    effect: { kind: "remove-status", status: "stun", stacks: 99, target: "self" },
  },
];
