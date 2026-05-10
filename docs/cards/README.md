# Cards

Reference listings of every card the engine knows about, grouped by
hero (plus the universal generic pool).

For the deck-building rules — composition limits, the builder UI,
persistence, and the validator — see
[`../DECK_BUILDING.md`](../DECK_BUILDING.md).
For the card-effect grammar (the primitives `damage` /
`apply-status` / `ability-upgrade` / `persistent-buff` / etc.), see
[`../ENGINE_AND_MECHANICS.md`](../ENGINE_AND_MECHANICS.md).
**Adding or updating cards?** See [`../authoring/workflow.md`](../authoring/workflow.md) — Scenario 2 (add cards) and Scenario 4 (update / remove cards).

## Index

| Hero | Card pool size | File | Source |
|---|---|---|---|
| (universal) | 7 | [`generic.md`](./generic.md) | [`src/content/cards/generic.ts`](../../src/content/cards/generic.ts) |
| Berserker | 14 | [`berserker.md`](./berserker.md) | [`src/content/cards/berserker.ts`](../../src/content/cards/berserker.ts) |
| Pyromancer | 13 | [`pyromancer.md`](./pyromancer.md) | [`src/content/cards/pyromancer.ts`](../../src/content/cards/pyromancer.ts) |
| Lightbearer | 12 | [`lightbearer.md`](./lightbearer.md) | [`src/content/cards/lightbearer.ts`](../../src/content/cards/lightbearer.ts) |

## Reading the tables

Each hero page lists every card the hero ships with these columns:

- **ID** — the engine-side `CardId` (e.g. `berserker/cleave-mastery`).
- **Cost** — CP cost to play.
- **Kind** — when the card is playable: `main-phase`, `roll-phase`, `instant`, or `mastery`. (See [`DECK_BUILDING.md` §3](../DECK_BUILDING.md#3-card-kinds-when-a-card-can-be-played).)
- **Category** — composition slot: `dice-manip`, `ladder-upgrade`, `signature`, or (universal pool only) `generic`. Drives the deck-builder's 4 / 3 / 3 / 2 limits.
- **Slot** — for `ladder-upgrade` cards only: which Mastery slot the card occupies (`T1`, `T2`, `T3`, or `Defensive`). One Mastery per slot per match. T4 Ultimates intentionally have no Mastery.
- **Once** — `oncePerMatch: true` flag where applicable.
- **Text** — the player-facing rules text, copied verbatim from the
  data file. The actual mechanical primitive lives in the source —
  click through if you need the full effect tree.

The recommended starter deck for each hero is called out at the top of
that hero's page.
