/**
 * Diceborn — content registry. Pure exports; no logic.
 *
 * Heroes and cards are registered separately. Each hero module is
 * responsible for registering its own signature status tokens at import
 * time (see `heroes/berserker.ts` for the pattern). Card pools live in
 * `cards/` and are looked up by hero id at deck-build time — they are
 * NOT carried on `HeroDefinition`, so the upcoming deck-builder feature
 * can swap card lists without touching hero data.
 */

import type { Card, HeroDefinition, HeroId } from "../game/types";
import { GENERIC_CARDS, HERO_CARDS } from "./cards";
import { BERSERKER } from "./heroes/berserker";
import { PYROMANCER } from "./heroes/pyromancer";

export const HEROES: Partial<Record<HeroId, HeroDefinition>> = {
  [BERSERKER.id]: BERSERKER,
  [PYROMANCER.id]: PYROMANCER,
};

export function getHero(id: HeroId): HeroDefinition {
  const def = HEROES[id];
  if (!def) throw new Error(`Hero "${id}" is not registered.`);
  return def;
}

export function getRegisteredHeroIds(): HeroId[] {
  return Object.keys(HEROES) as HeroId[];
}

/** Resolve the deck for a hero. Today this is just the hero's per-hero
 *  pool from `HERO_CARDS`. The deck-builder feature (in flight) will
 *  layer in player-selected cards / generic universals on top of this
 *  same entry point so callers don't need to change. */
export function getDeckCards(id: HeroId): Card[] {
  const pool = HERO_CARDS[id];
  if (!pool) return [];
  return pool.slice();
}

export { GENERIC_CARDS };
