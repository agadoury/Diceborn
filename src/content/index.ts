/**
 * Diceborn — content registry. Pure exports; no logic.
 */

import type { Card, HeroDefinition, HeroId } from "../game/types";
import { BARBARIAN } from "./heroes/barbarian";
import { GENERIC_CARDS } from "./cards/generic";

export const HEROES: Partial<Record<HeroId, HeroDefinition>> = {
  barbarian: BARBARIAN,
  // pyromancer / paladin land in Step 7.
};

export function getHero(id: HeroId): HeroDefinition {
  const def = HEROES[id];
  if (!def) throw new Error(`Hero "${id}" is not registered (Step 7 lands the rest).`);
  return def;
}

/** A hero's full deck = their hero-specific cards + the generic universals. */
export function getDeckCards(id: HeroId): Card[] {
  const hero = getHero(id);
  return [...hero.cards, ...GENERIC_CARDS];
}

export { GENERIC_CARDS, BARBARIAN };
