# Deck-building

This file is the source of truth for how decks work in Pact of Heroes — what
goes in a deck, how the player builds and saves one, what the engine
does with it, and where the data lives.

## Table of contents

1. [Deck composition rules](#1-deck-composition-rules)
2. [Card categories](#2-card-categories)
3. [Card kinds (when a card can be played)](#3-card-kinds-when-a-card-can-be-played)
4. [The catalog: where cards live](#4-the-catalog-where-cards-live)
5. [The builder UI (`/deck-builder`)](#5-the-builder-ui-deck-builder)
6. [Persistence (localStorage)](#6-persistence-localstorage)
7. [Validation (`validateDeckComposition`)](#7-validation-validatedeckcomposition)
8. [In-match deck behaviour](#8-in-match-deck-behaviour)
9. [Recommended decks (per-hero starters)](#9-recommended-decks-per-hero-starters)
10. [Engine touchpoints](#10-engine-touchpoints)

---

## 1. Deck composition rules

Every deck is **exactly 12 cards**, split across four categories:

| Category | Count | Role |
|---|---|---|
| `generic` | 4 | Universal staples — heal, draw, cleanse, +CP. Same pool for every hero. |
| `dice-manip` | 3 | Hero-specific dice manipulation (set-face, reroll, symbol-bend). |
| `ladder-upgrade` | 3 | Each one targets a distinct **Mastery slot**: T1, T2, T3, or Defensive. Exactly one upgrade per slot, and never an upgrade for T4 — the Ultimate has no Mastery by design. |
| `signature` | 2 | The hero's marquee plays — instants, persistent buffs, once-per-match power moves. |

A deck that doesn't satisfy these counts can't be saved. The player's
recommendedDeck is always conformant; that's the safe fallback if a
build ever drifts out of compliance.

The 12-slot ceiling is intentional. With a 4-card starting hand and a
6-card hand cap, the deck cycles roughly twice in a typical 6–8 turn
match — long enough to plan, short enough that drawing the right card
matters.

## 2. Card categories

`CardCategory` (in `src/game/types.ts`) drives composition; it's
distinct from the orthogonal **card kind** (which drives *when* a card
plays — see §3 below).

- **`generic`** — universal cards usable by every hero. Lives in
  `src/content/cards/generic.ts`. Today's set: Quick Draw, Focus,
  Cleanse, Bandage, Battle Plan, Second Wind, Resolve. Pulls 4 of 7
  into each deck.

- **`dice-manip`** — the hero's tools for *changing the roll*: set a
  die to a specific face, reroll a filtered subset, bend one symbol to
  count as another for the rest of the turn. Each hero ships 3
  dice-manip cards, all 3 go in the deck.

- **`ladder-upgrade`** — also called Masteries. Each carries a
  `masteryTier: 1 | 2 | 3 | "defensive"` field, occupying a slot for
  the rest of the match (`HeroSnapshot.masterySlots`). Once played, the
  upgrade rewrites the targeted ability through the ladder-upgrade
  pipeline (replace + append + repeat) — the live UI surfaces the
  upgraded combo / name / effect. **Each tier slot holds at most one
  Mastery per match**, and **T4 Ultimates intentionally have no
  Mastery** — power lives at the curve peak.

- **`signature`** — the hero's identity moves. Persistent buffs,
  once-per-match instants, big-payoff plays. 2 of 4–6 candidates per
  hero make the deck.

## 3. Card kinds (when a card can be played)

Independent of category — `kind` controls *playability windows*:

| Kind | Playable when | Trigger | Notes |
|---|---|---|---|
| `main-phase` | Active player's `main-pre` or `main-post` | Manual | The default for utility plays. |
| `roll-phase` | Active player's `offensive-roll` OR defender's `defensive-roll` window | Manual | Includes most dice-manip cards. |
| `instant` | Any time, auto-prompts the holder on a qualifying event (`self-attacked`, `opponent-fires-ability`, `self-takes-damage`, etc.) | Structured trigger | Counterstrike, Phoenix Veil, Aegis of Dawn. |
| `mastery` | Active player's main phase, only once for the targeted slot | Manual | Sets `masterySlots[masteryTier]`. |

(Legacy kinds `main-action`, `roll-action`, `upgrade`, `status` are
still in the type union for backward compatibility but new content uses
the canonical four. The seven generic cards still ship as `main-action`
which is treated identically to `main-phase` by the engine.)

The full instant trigger taxonomy lives in
[`engine/cards.md` Instant trigger taxonomy](../engine/cards.md#instant-trigger-taxonomy-correction-6-§5).

## 4. The catalog: where cards live

Cards are **not** carried on `HeroDefinition`. They live in their own
modules under `src/content/cards/<heroId>.ts` and are resolved at
deck-build time via `getCardCatalog(heroId)`:

```ts
function getCardCatalog(id: HeroId): Card[]
//   = HERO_CARDS[id] ∪ GENERIC_CARDS
```

This split exists so the deck-builder can swap card lists per match
without touching hero data — the hero file stays a clean
`HeroDefinition`, the cards are independent.

For per-hero card listings see [`../content/`](../content/).

## 5. The builder UI (`/deck-builder`)

`src/components/screens/DeckBuilder.tsx`. URL:

```
/deck-builder?hero=<id>[&mode=<vs-ai|hot-seat>][&p1=<id>&p2=<id>]
```

### Entry points

The DeckBuilder reads three URL shapes that decide the post-save
navigation and the primary CTA label:

| Entry | URL shape | Reached from | Primary CTA | Save returns to |
|---|---|---|---|---|
| **Standalone** | `?hero=<id>` (no `mode`/`p1`/`p2`) | Main-menu **Deck Builder** → `/decks` → tap hero | `SAVE` | `/decks` (no match launched) |
| **Pre-pick** | `?hero=<id>&mode=...` | HeroSelect's **Customize deck** before commit | `SAVE` | `/heroes?mode=...` |
| **Match flow** | `?hero=<id>&mode=...&p1=...&p2=...` | HeroSelect's **PLAY** path with a deck open | `SAVE & PLAY` | `/play?mode=...&p1=...&p2=...` |

The standalone path is the canonical "I want to manage my decks"
entrypoint and never starts a match. The other two shapes are how
the builder is reached during the existing match-setup flow.

### Layout

- **Catalog** (left/top) — every card in `getCardCatalog(hero)`. Cards
  whose category is full, or whose `masteryTier` slot is taken, render
  at 40% opacity and refuse clicks.
- **Filter chips** — All / Generic / Dice / Upgrade / Signature.
- **Deck slots** (right/bottom, sticky on desktop) — 12 slots grouped
  by category, with `n / required` counters per group. Tap a deck slot
  to remove that card from the deck.
- **Validation strip** at the top — live `n/required` per category,
  showing the first composition issue (if any).
- **Sticky footer** — `Use default` (load `recommendedDeck`), `Reset`
  (empty the deck), and the primary commit button. The button label
  follows the entry-point table above; it shows `N TO GO` (disabled)
  until the deck is composition-conformant.

### `/decks` — the standalone hero picker

`src/components/screens/DeckSelect.tsx`. A hero-portrait grid; each
card shows the hero's portrait, name, archetype + complexity, signature
mechanic blurb, and a `SAVED` (emerald) or `DEFAULT` (muted) badge
indicating whether the player already has a custom deck. Tapping a
hero forwards to `/deck-builder?hero=<id>` (standalone entry).

## 6. Persistence (localStorage)

`src/store/deckStorage.ts`. Pure functions, no React.

Storage key: `pact-of-heroes:decks:v1`. (Legacy installs still
holding the previous `diceborn:decks:v1` key are auto-migrated forward
once at app boot via `src/lib/migrate-storage.ts`.)

Shape:

```ts
{
  version: 1,
  perHero: {
    [heroId]: { cardIds: CardId[], updatedAt: number }
  },
  defaultHero: HeroId | null
}
```

API:

| Function | Purpose |
|---|---|
| `loadDeck(heroId)` | Read the saved deck for a hero. Returns `null` if none. |
| `saveDeck(heroId, cardIds)` | Persist. Caller validates first. |
| `clearDeck(heroId)` | Remove this hero's saved deck. |
| `loadDefaultHero()` / `saveDefaultHero(id)` | Track the player's preferred hero for Quick Match. |
| `clearAll()` | Test / debug — wipe the whole storage root. |

All accesses are wrapped in `try/catch` so SSR, Safari private mode,
and quota errors degrade silently to "no saved deck".

## 7. Validation (`validateDeckComposition`)

`src/game/cards.ts` exports `validateDeckComposition(cards: Card[])
=> string[]`. Returns a list of human-readable issues; an empty list
means the deck is conformant.

Checks performed:

- Total count = 12.
- Per-category counts match `{ generic: 4, dice-manip: 3, ladder-upgrade: 3, signature: 2 }`.
- Every `ladder-upgrade` declares its `masteryTier`.
- No `ladder-upgrade` targets T4 (T4 Ultimates have no Mastery).
- No two `ladder-upgrade` cards target the same slot.

The DeckBuilder's `SAVE & PLAY` button mirrors the same checks live
(category fullness + duplicate-slot detection) so the validator is
mostly a safety net for programmatic deck imports.

## 8. In-match deck behaviour

When a match starts, the engine calls `getDeckCards(heroId, savedIds?)`
to assemble the actual deck:

1. If `savedIds` is provided (from `loadDeck(heroId)`) **and** every
   id resolves against the catalog, use those cards in the saved order.
2. If any id fails to resolve (e.g. a saved deck refers to a card that
   was removed in a content update), fall back wholesale to the hero's
   `recommendedDeck` — partial decks are never played.
3. The engine shuffles the result via `buildDeck(state, cards)` using
   the match seed.

Hand mechanics:

| Constant | Value | Where |
|---|---|---|
| `STARTING_HAND` | 4 | Cards drawn at match start. |
| `HAND_CAP` | 6 | Cards over this auto-sell at end-of-turn (Discard phase) for +1 CP each. |
| Deck reshuffle | When the deck is exhausted, the discard pile is shuffled back in. | |

## 9. Recommended decks (per-hero starters)

Every hero declares a `recommendedDeck: ReadonlyArray<CardId>` on its
`HeroDefinition` — exactly 12 conformant card ids. The HeroSelect "PLAY"
CTA uses it directly; the DeckBuilder loads it as the initial state for
new players.

The recommended decks for the three shipping heroes:

- [`../content/berserker/design.md`](../content/berserker/design.md) (linked card list in [`../content/berserker/cards.md`](../content/berserker/cards.md))
- [`../content/pyromancer/design.md`](../content/pyromancer/design.md) (linked card list in [`../content/pyromancer/cards.md`](../content/pyromancer/cards.md))
- [`../content/lightbearer/design.md`](../content/lightbearer/design.md) (linked card list in [`../content/lightbearer/cards.md`](../content/lightbearer/cards.md))

## 10. Engine touchpoints

| Concern | Engine site |
|---|---|
| Catalog assembly | `src/content/index.ts` → `getCardCatalog(heroId)` (hero pool ∪ generic pool) |
| Match-start deck assembly | `src/content/index.ts` → `getDeckCards(heroId, savedIds?)` with fallback to recommendedDeck |
| Initial draw + reshuffle | `src/game/cards.ts` → `buildDeck`, `drawCards`, `reshuffleIfNeeded` |
| Composition validator | `src/game/cards.ts` → `validateDeckComposition` |
| Persistence | `src/store/deckStorage.ts` |
| Builder UI | `src/components/screens/DeckBuilder.tsx` |
| Mastery slot occupation | `HeroSnapshot.masterySlots[masteryTier]` (set when a `mastery` card resolves; locked for the rest of the match) |
| Ladder-upgrade resolution | `src/game/cards.ts` → `resolveAbilityFor` (replace + append + repeat) |
| Hand cap auto-sell | `src/game/phases.ts` → `runDiscard` → `autoDiscardOverHandCap` |
| Card play timing gate | `src/game/cards.ts` → `canPlay` (kind / phase / cost / state-threshold blocks) |

## See also

- [`../content/`](../content/) — per-hero and generic card listings.
- [`../authoring/hero-spec.md`](../authoring/hero-spec.md) — what the hero authoring contract expects from a `recommendedDeck` and from each Mastery's `kind` + `cardCategory`.
- [`docs/engine/cards.md`](../engine/cards.md) — the effect resolver, instant-trigger taxonomy, and Mastery upgrade pipeline (replace + append + repeat).
- [`../ui/README.md`](../ui/README.md) — Match-screen and hand UI.
