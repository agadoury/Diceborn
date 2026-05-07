/**
 * Diceborn — content registry. Pure exports; no logic.
 */

import type { Card, HeroDefinition, HeroId } from "../game/types";
import { BARBARIAN } from "./heroes/barbarian";
import { PYROMANCER } from "./heroes/pyromancer";
import { PALADIN } from "./heroes/paladin";
import { GENERIC_CARDS } from "./cards/generic";

export const HEROES: Record<HeroId, HeroDefinition> = {
  barbarian:  BARBARIAN,
  pyromancer: PYROMANCER,
  paladin:    PALADIN,
};

export function getHero(id: HeroId): HeroDefinition {
  const def = HEROES[id];
  if (!def) throw new Error(`Hero "${id}" is not registered.`);
  return def;
}

/** A hero's full deck = their hero-specific cards + the generic universals. */
export function getDeckCards(id: HeroId): Card[] {
  const hero = getHero(id);
  return [...hero.cards, ...GENERIC_CARDS];
}

export { GENERIC_CARDS, BARBARIAN, PYROMANCER, PALADIN };
