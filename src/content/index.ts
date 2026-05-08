/**
 * Diceborn — content registry. Pure exports; no logic.
 *
 * Heroes are registered via the HEROES record. Each hero module is
 * responsible for registering its own signature status tokens at
 * import time (see `heroes/berserker.ts` for the pattern).
 */

import type { Card, HeroDefinition, HeroId } from "../game/types";
import { GENERIC_CARDS } from "./cards/generic";
import { BERSERKER } from "./heroes/berserker";

export const HEROES: Partial<Record<HeroId, HeroDefinition>> = {
  [BERSERKER.id]: BERSERKER,
};

export function getHero(id: HeroId): HeroDefinition {
  const def = HEROES[id];
  if (!def) throw new Error(`Hero "${id}" is not registered.`);
  return def;
}

export function getRegisteredHeroIds(): HeroId[] {
  return Object.keys(HEROES) as HeroId[];
}

/** A hero's full deck = their hero-specific cards + the generic universals. */
export function getDeckCards(id: HeroId): Card[] {
  const hero = getHero(id);
  return [...hero.cards, ...GENERIC_CARDS];
}

export { GENERIC_CARDS };
