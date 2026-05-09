/**
 * Diceborn — card registry.
 *
 * Cards live OUTSIDE `HeroDefinition` so the upcoming deck-builder feature
 * can swap a hero's card list without mutating hero data. Hero modules own
 * their dice / abilities / signature passive; card files own the deck.
 *
 * Layout:
 *   - generic.ts          — cross-hero universals (`hero: "generic"`)
 *   - <heroId>.ts         — hero-specific pool, exported as `<HERO>_CARDS`
 *
 * Adding a new hero:
 *   1. Drop `src/content/cards/<heroId>.ts` next to the existing pools.
 *   2. Register the per-hero pool in `HERO_CARDS` below.
 *   3. (No change to the hero file — it never imports cards.)
 *
 * The runtime entry point is `getDeckCards(heroId)` in `../index.ts`,
 * which composes a hero's deck from `HERO_CARDS[heroId]`. Generics are
 * NOT auto-mixed in yet — that decision belongs to the deck-builder when
 * it lands. Today's behaviour: the per-hero pool IS the deck.
 */

import type { Card, HeroId } from "../../game/types";
import { GENERIC_CARDS } from "./generic";
import { BERSERKER_CARDS } from "./berserker";
import { PYROMANCER_CARDS } from "./pyromancer";
import { LIGHTBEARER_CARDS } from "./lightbearer";

/** Per-hero card pools. Heroes that haven't been ingested yet are absent;
 *  `getDeckCards` returns an empty deck for them and the deck-validator
 *  will flag the missing 12-card composition. */
export const HERO_CARDS: Partial<Record<HeroId, Card[]>> = {
  berserker: BERSERKER_CARDS,
  pyromancer: PYROMANCER_CARDS,
  lightbearer: LIGHTBEARER_CARDS,
};

export { GENERIC_CARDS };
