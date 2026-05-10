# Heroes

Reference docs for every hero registered in `src/content/`. Each hero
has its own page that mirrors the structure used in the original hero
submission (lore + visual identity + dice + signature passive +
signature token + ability ladder + defensive ladder + cards + audio +
tuning notes + quick reference).

**Source of truth for mechanical data is always the `.ts` file** —
combos, damage values, effect trees, tuning numbers. These pages are
*design intent* — lore, dice identity, ability roles, cinematic +
audio direction, tuning rationale. When the data and these docs
disagree, the data wins; patch the doc to match.

This split is deliberate: it lets tuning passes touch only the data
files, so the doc tree doesn't churn on every balance tweak.

## Roster

| Hero | Archetype | Complexity | Hero design | Card listing |
|---|---|---|---|---|
| [The Berserker](./berserker.md) | Rush | 1 | [`berserker.md`](./berserker.md) · [`heroes/berserker.ts`](../../src/content/heroes/berserker.ts) | [`cards/berserker.md`](../cards/berserker.md) · [`cards/berserker.ts`](../../src/content/cards/berserker.ts) |
| [The Pyromancer](./pyromancer.md) | Burn | 3 | [`pyromancer.md`](./pyromancer.md) · [`heroes/pyromancer.ts`](../../src/content/heroes/pyromancer.ts) | [`cards/pyromancer.md`](../cards/pyromancer.md) · [`cards/pyromancer.ts`](../../src/content/cards/pyromancer.ts) |
| [The Lightbearer](./lightbearer.md) | Survival | 2 | [`lightbearer.md`](./lightbearer.md) · [`heroes/lightbearer.ts`](../../src/content/heroes/lightbearer.ts) | [`cards/lightbearer.md`](../cards/lightbearer.md) · [`cards/lightbearer.ts`](../../src/content/cards/lightbearer.ts) |

For card-system mechanics, deck composition, and the builder UI see
[`../DECK_BUILDING.md`](../DECK_BUILDING.md). For per-hero card
listings see [`../cards/`](../cards/).

When adding a hero (per the [card-file split](../engine/cards.md#card-files-separate-from-hero-data)):
1. Drop `src/content/heroes/<id>.ts` (HeroDefinition — no `cards` field).
2. Drop `src/content/cards/<id>.ts` (`<HERO>_CARDS: Card[]`).
3. Register the hero in `src/content/index.ts` and the cards in `src/content/cards/index.ts`.
4. Add a hero design page in `docs/heroes/<id>.md` and a card listing in `docs/cards/<id>.md`; update both roster columns above.
