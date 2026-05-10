/**
 * Diceborn — content registry. Pure exports; no logic.
 *
 * Heroes and cards are registered separately. Each hero module is
 * responsible for registering its own signature status tokens at import
 * time (see `heroes/berserker.ts` for the pattern). Card pools live in
 * `cards/` and are looked up by hero id at deck-build time — they are
 * NOT carried on `HeroDefinition`, so the deck-builder feature can swap
 * card lists without touching hero data.
 */

import type { Card, CardId, HeroDefinition, HeroId } from "../game/types";
import { GENERIC_CARDS, HERO_CARDS } from "./cards";
import { BERSERKER } from "./heroes/berserker";
import { PYROMANCER } from "./heroes/pyromancer";
import { LIGHTBEARER } from "./heroes/lightbearer";

export const HEROES: Partial<Record<HeroId, HeroDefinition>> = {
  [BERSERKER.id]: BERSERKER,
  [PYROMANCER.id]: PYROMANCER,
  [LIGHTBEARER.id]: LIGHTBEARER,
};

export function getHero(id: HeroId): HeroDefinition {
  const def = HEROES[id];
  if (!def) throw new Error(`Hero "${id}" is not registered.`);
  return def;
}

export function getRegisteredHeroIds(): HeroId[] {
  return Object.keys(HEROES) as HeroId[];
}

/** Every card a hero can draft into a deck — hero-specific pool plus
 *  the universal generic pool. Used by the deck-builder catalog view. */
export function getCardCatalog(id: HeroId): Card[] {
  const pool = HERO_CARDS[id] ?? [];
  return [...pool, ...GENERIC_CARDS];
}

/** Build the in-match deck for a hero. When `savedDeckIds` is provided we
 *  resolve each id via the catalog and use those cards in their stated
 *  order (the engine still shuffles the result via `buildDeck`). When
 *  omitted — or when any id fails to resolve — we fall back to the
 *  hero's recommendedDeck. */
export function getDeckCards(id: HeroId, savedDeckIds?: ReadonlyArray<CardId>): Card[] {
  const catalog = getCardCatalog(id);
  const byId = new Map(catalog.map(c => [c.id, c]));
  const hero = getHero(id);
  const deckIds = savedDeckIds ?? hero.recommendedDeck;
  const cards: Card[] = [];
  for (const cardId of deckIds) {
    const card = byId.get(cardId);
    if (!card) {
      // Unknown id in saved deck — fall back to recommended deck wholesale
      // rather than playing a partial/invalid hand.
      return hero.recommendedDeck.map(rid => {
        const c = byId.get(rid);
        if (!c) throw new Error(`Hero "${id}" recommendedDeck references unknown card id "${rid}"`);
        return c;
      });
    }
    cards.push(card);
  }
  return cards;
}

export { GENERIC_CARDS };
