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
];
