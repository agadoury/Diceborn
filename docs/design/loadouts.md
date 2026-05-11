# Loadouts

This document is the source of truth for the pre-match ability draft —
what a loadout is, how the player builds one, what the engine does with
it, and where the data lives. Companion to
[`deck-building.md`](./deck-building.md) — together they describe the
two-step customize flow each player completes before a match.

## Table of contents

1. [Loadout composition rules](#1-loadout-composition-rules)
2. [Catalog vs. loadout](#2-catalog-vs-loadout)
3. [The builder UI (`/loadout`)](#3-the-builder-ui-loadout)
4. [Persistence (localStorage)](#4-persistence-localstorage)
5. [Validation (`validateLoadout`)](#5-validation-validateloadout)
6. [In-match loadout behaviour](#6-in-match-loadout-behaviour)
7. [Loadout × Mastery interaction](#7-loadout--mastery-interaction)
8. [Recommended loadouts (per-hero starters)](#8-recommended-loadouts-per-hero-starters)
9. [Engine touchpoints](#9-engine-touchpoints)

---

## 1. Loadout composition rules

Every loadout is **6 abilities total**, split across two ladders:

| Ladder | Count | Rule |
|---|---|---|
| Offensive | 4 | **Exactly one ability per tier** (T1, T2, T3, T4). |
| Defensive | 2 | **Two distinct entries** from the defensive catalog, any tier. |

The "one per offensive tier" rule means a match cannot surface more than
one match per tier in the offensive picker — the choice between options
within a tier is made pre-match, not on the dice tray.

A loadout that doesn't satisfy these counts can't be saved. The
hero's `recommendedLoadout` is always conformant; that's the safe
fallback if a build ever drifts out of compliance (e.g. a catalog
rename retires a previously-selected ability).

## 2. Catalog vs. loadout

The hero ships a **catalog** of authored abilities — typically more than
will be drafted into any single match. The player picks 4 offensive + 2
defensive from that catalog as their **loadout**, which is what the
engine actually consults during a match.

| | Lives on | Sized | Used for |
|---|---|---|---|
| Catalog | `HeroDefinition.abilityCatalog` / `defensiveCatalog` | Full authored pool (≥4 offensive, ≥2 defensive) | Builder UI options, simulator landing-rate audit, mastery scope resolution |
| Loadout | `HeroSnapshot.activeOffense` / `activeDefense` | 4 / 2 | Live ladder evaluator, picker matches, defensive picks, engine indices |

The simulator's `simulateLandingRate` iterates the **catalog** so every
authored ability stays in band even when not selected. The live UI's
`AbilityLadder` renders the **loadout** so the player sees their 4
drafted offensive options.

## 3. The builder UI (`/loadout`)

`src/components/screens/LoadoutBuilder.tsx`. URL:

```
/loadout?hero=<id>[&mode=<vs-ai|hot-seat>][&p1=<id>&p2=<id>]
```

### Entry points

| Entry | URL shape | Reached from | Primary CTA | Save returns to |
|---|---|---|---|---|
| **Standalone** | `?hero=<id>` (no `mode`/`p1`/`p2`) | Main-menu **Loadouts** → `/loadouts` → tap hero | `SAVE` | `/loadouts` (no match launched) |
| **Wizard step 1** | `?hero=<id>&mode=...[&p1=...&p2=...]` | HeroSelect's **Customize** button | `NEXT: DECK` | `/deck-builder?...` (step 2) |

The standalone path is the canonical "manage my loadouts" entrypoint
and never starts a match. The wizard path is the first step of a
2-step customize flow — HeroSelect → Loadout → Deck → Play.

### Layout

- **Tier sections** (left/top) — one card per tier (T1 → T4) listing
  every catalog entry at that tier. Single-select per tier. Defensive
  picker sits below as a two-select group with a `n/2` counter.
- **Summary panel** (right/bottom, sticky on desktop) — shows the
  currently-drafted 4 + 2, with a tier label and ability name per
  slot (or `—` when empty).
- **Validation strip** at the top — `Offense N/4` and `Defense N/2`
  counters plus the first issue (if any).
- **Sticky footer** — `Use default` (load `recommendedLoadout`) plus
  the primary commit button. The label follows the entry-point
  table; the button is disabled with `PICK ALL TIERS` until the
  selection is composition-conformant.

### `/loadouts` — the standalone hero picker

`src/components/screens/LoadoutSelect.tsx`. A hero-portrait grid
mirroring `/decks`. Each card shows the hero's portrait, name,
archetype + complexity, the size of their offensive and defensive
catalogs, and a `SAVED` (emerald) or `DEFAULT` (muted) badge
indicating whether the player already has a custom loadout. Tapping a
hero forwards to `/loadout?hero=<id>` (standalone entry).

## 4. Persistence (localStorage)

`src/store/loadoutStorage.ts`. Pure functions, no React.

Storage key: `pact-of-heroes:loadouts:v1`. Shape:

```ts
{
  version: 1,
  perHero: {
    [heroId]: { offense: string[], defense: string[], updatedAt: number }
  }
}
```

API:

| Function | Purpose |
|---|---|
| `loadLoadout(heroId)` | Read the saved loadout for a hero. Returns `null` if none. |
| `saveLoadout(heroId, sel)` | Persist. Caller validates first. |
| `clearLoadout(heroId)` | Remove this hero's saved loadout. |
| `clearAllLoadouts()` | Test / debug — wipe the whole storage root. |

All accesses are wrapped in `try/catch` so SSR, Safari private mode,
and quota errors degrade silently to "no saved loadout".

## 5. Validation (`validateLoadout`)

`src/game/loadout.ts` exports `validateLoadout(hero, sel) => string[]`.
Returns a list of human-readable issues; an empty list means
conformant.

Checks performed:

- `offense.length === 4`, `defense.length === 2`.
- Every ability name resolves against the hero's catalog
  (case-insensitive).
- Each tier T1, T2, T3, T4 appears exactly once across the offensive
  selection.
- The two defensive entries are distinct (no duplicate names).

The LoadoutBuilder's `NEXT: DECK` / `SAVE` button mirrors the same
checks live, so the validator is mostly a safety net for programmatic
loadout imports.

## 6. In-match loadout behaviour

When a match starts, the engine calls `resolveLoadout(hero, sel?)` to
materialise the player's drafted abilities onto the
`HeroSnapshot.activeOffense` and `activeDefense` arrays:

1. If `sel` is provided **and** `validateLoadout(hero, sel)` is empty,
   use it.
2. Otherwise fall back wholesale to `hero.recommendedLoadout` (mirrors
   `getDeckCards`'s wholesale-fallback policy).
3. Offensive abilities are sorted T1 → T4 on the snapshot for
   consistent ladder rendering.
4. As a last-resort safety net, if either array would still be empty
   (e.g. a recommendedLoadout referencing a renamed ability), the
   resolver pads from the catalog so the engine stays bootable.

After materialisation:
- `state.players[pid].activeOffense.length === 4`
- `state.players[pid].activeDefense.length === 2`
- `state.players[pid].ladderState.length === 4`

Every engine read that previously walked `hero.abilityLadder` now
walks `snapshot.activeOffense`; same for `defensiveLadder` →
`activeDefense`. Indices on `pendingAttack.abilityIndex` and
`select-defense.abilityIndex` are into the active arrays.

## 7. Loadout × Mastery interaction

Mastery cards target abilities either by tier (`scope: { kind:
"all-tier", tier: N }`) or by name (`scope: { kind: "ability-ids", ids:
[...] }`). The two cases interact differently with the loadout:

- **Tier-scoped masteries** always have a target — whichever ability
  the player drafted at that tier — so they're never dead-weight.
- **Name-scoped masteries** require the named ability to be in the
  loadout. If it isn't, the mastery has no effect in match.

The DeckBuilder surfaces a soft warning chip (`NO TARGET`) on
catalog cards whose mastery target isn't in the player's current
loadout. The deck is still savable; the warning is a player-facing
hint, not a block. (See
[`deck-building.md`](./deck-building.md) for the deck-builder details.)

Hero authoring guideline: when shipping a name-scoped mastery, make
sure its target ability is in the hero's `recommendedLoadout` so the
starter deck has its upgrades actually firing.

## 8. Recommended loadouts (per-hero starters)

Every hero declares a `recommendedLoadout: LoadoutSelection` on its
`HeroDefinition`. The HeroSelect "PLAY" CTA uses it directly; the
LoadoutBuilder loads it as the initial state for new players. The
field must reference ability names that resolve against the hero's
catalogs.

Today's three shipping heroes:

- Berserker: offense `[Cleave, Winter Storm, Blood Harvest, Wolf's Howl]`, defense `[Wolfhide, Bloodoath]`
- Pyromancer: offense `[Ember Strike, Firestorm, Pyro Lance, God's Crater]`, defense `[Magma Shield, Disperse]`
- Lightbearer: offense `[Dawnblade, Sun Strike, Solar Blade, Judgment of the Sun]`, defense `[Dawn-Ward, Prayer of Shielding]`

Each hero's catalog ships with at least one alternate per tier so the
draft has real choices; see the per-hero `design.md` pages for the
full catalog.

## 9. Engine touchpoints

| Concern | Engine site |
|---|---|
| Loadout resolution | `src/game/loadout.ts` → `resolveLoadout`, `validateLoadout` |
| Snapshot materialisation | `src/game/engine.ts` → `makeHeroSnapshot` reads the loadout, writes `activeOffense`/`activeDefense` |
| Offensive picker | `src/game/phases.ts` → `beginOffensivePick` iterates `activeOffense` |
| Offensive resolution | `src/game/phases.ts` → `commitOffensiveAbility` / `applyAttackEffects` index `activeOffense` |
| Defensive resolution | `src/game/phases.ts` → `resolveDefenseChoice` indexes `activeDefense` |
| Offensive fallback | `src/game/phases.ts` → `tryOffensiveFallback` iterates `activeDefense` |
| Live ladder evaluator | `src/game/dice.ts` → `evaluateLadder` iterates `activeOffense` |
| Landing-rate audit | `src/game/dice.ts` → `simulateLandingRate` iterates the full `abilityCatalog` |
| AI defense pick | `src/game/ai.ts` → `pickBestDefense` reads `activeDefense` |
| Persistence | `src/store/loadoutStorage.ts` |
| Builder UI | `src/components/screens/LoadoutBuilder.tsx` |
| Standalone entry | `src/components/screens/LoadoutSelect.tsx` |
| AbilityLadder render | `src/components/game/AbilityLadder.tsx` reads `snapshot.activeOffense` |
| DefenseSelect render | `src/components/effects/DefenseSelect.tsx` reads `defender.activeDefense` |

## See also

- [`deck-building.md`](./deck-building.md) — the second step of the
  customize flow.
- [`../engine/rules.md`](../engine/rules.md) §5 — ability ladders and
  the picker behaviour.
- [`../authoring/hero-spec.md`](../authoring/hero-spec.md) — what the
  hero authoring contract expects from `abilityCatalog`,
  `defensiveCatalog`, and `recommendedLoadout`.
