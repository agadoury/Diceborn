# Content

Per-hero design pages and card listings. Each hero has a folder under `docs/content/<hero>/` containing two files:

- `design.md` — lore, visual identity, dice, signature passive, signature token, ability ladder, defensive ladder, audio, tuning notes, quick reference. *Design intent only — mechanical numbers live in the `.ts`.*
- `cards.md` — full card catalog for the hero with cost / kind / rules-text. *A snapshot of the data file — `.ts` wins on disagreement.*

The universal generic-card pool (available to every hero) lives at [`generic-cards.md`](./generic-cards.md).

> **Source of truth for mechanical data is always the `.ts` file** — combos, damage values, effect trees, tuning numbers. These pages are *design intent* — lore, dice identity, ability roles, cinematic + audio direction, tuning rationale. When the data and these docs disagree, the data wins; patch the doc to match.
>
> This split is deliberate: it lets tuning passes touch only the data files, so the doc tree doesn't churn on every balance tweak.

## Roster

| Hero | Archetype | Complexity | Design | Cards | Source (data) |
|---|---|---|---|---|---|
| [The Berserker](./berserker/design.md) | Rush | 1 | [`berserker/design.md`](./berserker/design.md) | [`berserker/cards.md`](./berserker/cards.md) | [`heroes/berserker.ts`](../../src/content/heroes/berserker.ts) · [`cards/berserker.ts`](../../src/content/cards/berserker.ts) |
| [The Pyromancer](./pyromancer/design.md) | Burn | 3 | [`pyromancer/design.md`](./pyromancer/design.md) | [`pyromancer/cards.md`](./pyromancer/cards.md) | [`heroes/pyromancer.ts`](../../src/content/heroes/pyromancer.ts) · [`cards/pyromancer.ts`](../../src/content/cards/pyromancer.ts) |
| [The Lightbearer](./lightbearer/design.md) | Survival | 2 | [`lightbearer/design.md`](./lightbearer/design.md) | [`lightbearer/cards.md`](./lightbearer/cards.md) | [`heroes/lightbearer.ts`](../../src/content/heroes/lightbearer.ts) · [`cards/lightbearer.ts`](../../src/content/cards/lightbearer.ts) |

Universal generic pool: [`generic-cards.md`](./generic-cards.md) · [`src/content/cards/generic.ts`](../../src/content/cards/generic.ts).

## Reading the card tables

Each hero's `cards.md` lists every card with these columns:

- **ID** — the engine-side `CardId` (e.g. `berserker/cleave-mastery`).
- **Cost** — CP cost to play.
- **Kind** — when the card is playable: `main-phase`, `roll-phase`, `instant`, or `mastery`. (See [`../design/deck-building.md` §3](../design/deck-building.md#3-card-kinds-when-a-card-can-be-played).)
- **Category** — composition slot: `dice-manip`, `ladder-upgrade`, `signature`, or (universal pool only) `generic`. Drives the deck-builder's 4 / 3 / 3 / 2 limits.
- **Slot** — for `ladder-upgrade` cards only: which Mastery slot the card occupies (`T1`, `T2`, `T3`, or `Defensive`). One Mastery per slot per match. T4 Ultimates intentionally have no Mastery.
- **Once** — `oncePerMatch: true` flag where applicable.
- **Text** — the player-facing rules text, copied verbatim from the data file. The actual mechanical primitive lives in the source — click through if you need the full effect tree.

The recommended starter deck for each hero is called out at the top of that hero's `cards.md`.

## Adding a hero

See [`../authoring/workflow.md` Scenario 1](../authoring/workflow.md#2-scenario-1--add-a-new-hero). Quick shape:

1. Drop `src/content/heroes/<id>.ts` (HeroDefinition — no `cards` field).
2. Drop `src/content/cards/<id>.ts` (`<HERO>_CARDS: Card[]`).
3. Register the hero in `src/content/index.ts` and the cards in `src/content/cards/index.ts`.
4. Drop `docs/content/<id>/design.md` and `docs/content/<id>/cards.md`; add a roster row above.

For deck-system mechanics, composition rules, and the builder UI see [`../design/deck-building.md`](../design/deck-building.md). For card-effect grammar see [`../engine/cards.md`](../engine/cards.md).
