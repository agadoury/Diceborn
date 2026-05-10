# Generic cards

> **📦 Source of truth: [`src/content/cards/generic.ts`](../../src/content/cards/generic.ts).** Costs, kinds, and rules text below are a snapshot of the data file — convenient for browsing, but if a number here disagrees with the `.ts` the `.ts` wins; please patch this page or open an issue.

Universal pool, available to every hero. The deck-builder pulls **4 of
the 7** into every deck (per the `generic` category limit).

All seven generic cards are `main-phase` plays (still tagged with the
legacy alias `main-action`, which the engine treats identically to
`main-phase`).

## Listing

| ID | Cost | Kind | Once | Text |
|---|---|---|---|---|
| `generic/quick-draw` | 1 | main-phase | — | Draw 2 cards. |
| `generic/focus` | 0 | main-phase | — | Gain 1 CP. |
| `generic/cleanse` | 2 | main-phase | — | Remove all Burn stacks from yourself. |
| `generic/bandage` | 2 | main-phase | — | Heal 2 HP. |
| `generic/battle-plan` | 1 | main-phase | — | Draw 1 card and gain 1 CP. |
| `generic/second-wind` | 3 | main-phase | ✓ | Heal 4 HP. Once per match. |
| `generic/resolve` | 1 | main-phase | — | Remove all Stun stacks from yourself. |

All seven cards have `cardCategory: "generic"`. Heroes never author
their own generic cards — `generic` is reserved for this universal
pool.

## See also

- [`../design/deck-building.md`](../design/deck-building.md) — deck composition rules and the 4 / 3 / 3 / 2 split.
- [`../engine/README.md`](../engine/README.md) — full effect grammar.
