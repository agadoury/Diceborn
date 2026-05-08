/**
 * Diceborn — content registry. Pure exports; no logic.
 *
 * Heroes are registered via the HEROES record. Currently empty —
 * hero content is provided fresh; previous specific heroes were
 * removed at the user's request.
 */

import type { Card, HeroDefinition, HeroId } from "../game/types";
import { GENERIC_CARDS } from "./cards/generic";

export const HEROES: Partial<Record<HeroId, HeroDefinition>> = {
  // Hero registrations land here as content is provided.
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
