# Documentation index

Route by what you're trying to do. Each row links to the doc you should
read first; that doc cross-links to siblings.

## I'm a player

- [`how-to-play` (in-app screen)](../src/components/screens/HowToPlay.tsx) — the rules walkthrough that ships at `/how-to-play`. Same content, but inside the app.
- [`heroes/`](./heroes/) — per-hero design pages. Lore, dice, ability roles, tuning notes.
- [`cards/`](./cards/) — per-hero card listings + the universal generic pool.

## I'm adding or updating a hero or cards

1. **Read first**: [`authoring/workflow.md`](./authoring/workflow.md) — the operational guide. Covers four scenarios (new hero, add cards, tune hero, update / remove cards), files to touch in each, validation checklist, submission rules.
2. **Design contract**: [`HERO_REQUIREMENTS.md`](./HERO_REQUIREMENTS.md) — the authoring brief. Constraints, primitives, tuning bands, template, self-check. Read end-to-end when designing a brand-new hero.
3. **Reference**: [`authoring/cheatsheet.md`](./authoring/cheatsheet.md) (what each template field becomes), [`authoring/examples.md`](./authoring/examples.md) (worked patterns for every primitive).
4. **Companion**: [`DECK_BUILDING.md`](./DECK_BUILDING.md) — what shape the hero's card pool should take and how the deck-builder uses it.

The `.ts` files in `src/content/` are the source of truth for mechanical data. The `.md` pages in `docs/heroes/` and `docs/cards/` are for design intent — lore, ability roles, cinematics, tuning rationale. Tuning passes typically only edit `.ts` files. See [`authoring/workflow.md` §1](./authoring/workflow.md#1-source-of-truth-in-one-rule).

## I'm fixing or extending the engine

1. **Read first**: [`ENGINE_AND_MECHANICS.md`](./ENGINE_AND_MECHANICS.md) — top-level engine doc; routes you into one of four sub-pages by topic:
   - [`engine/rules.md`](./engine/rules.md) — match loop, phases, dice grammar, ability ladders, damage pipeline, status system.
   - [`engine/cards.md`](./engine/cards.md) — CP, hand, card kinds, effect resolver, modifier evaluation, instant triggers, deck-validation.
   - [`engine/runtime.md`](./engine/runtime.md) — `HeroDefinition` contract, reducer, stores, events, choreographer, AI, simulator, constants.
   - [`engine/glossary.md`](./engine/glossary.md) — terminology.
2. **Source**: `src/game/` — `engine.ts` (the `applyAction` reducer), `phases.ts` (per-phase handlers), `cards.ts` (effect resolver), `dice.ts` (combo grammar + ladder evaluator), `damage.ts`, `status.ts`, `types.ts` (the canonical type contract).
3. **Tests**: `tests/*.test.ts` — Vitest. `npm test` runs the full suite.

## I'm working on the UI

- [`UI.md`](./UI.md) — match-screen layout, overlays, choreographer + beat durations, design tokens, hero theming pipeline.
- Source: `src/components/` (game/ for board parts, effects/ for choreography layers + overlays, screens/ for routes), `src/store/` (Zustand stores), `src/styles/`.

## I'm deciding what to ship next

- [`/CHANGELOG.md`](../CHANGELOG.md) — design + architecture decisions made so far. Useful before proposing one that contradicts a previous one.
- The README's `Status` block — what the project considers in-progress vs. done.

## Folder map

```
docs/
├── INDEX.md                ← you are here
├── ENGINE_AND_MECHANICS.md ← engine doc index → routes into engine/*
├── engine/
│   ├── rules.md            ← match loop, phases, dice, ladders, damage, status
│   ├── cards.md            ← CP, hand, card kinds, effect resolver, instants
│   ├── runtime.md          ← reducer, events, choreographer, AI, simulator
│   └── glossary.md         ← terminology
├── UI.md                   ← match screen + theming
├── DECK_BUILDING.md        ← deck system
├── HERO_REQUIREMENTS.md    ← hero authoring brief (design contract)
├── authoring/
│   ├── workflow.md         ← how to add/tune heroes & cards (operational)
│   ├── cheatsheet.md       ← field-by-field reference
│   └── examples.md         ← worked patterns per primitive
├── heroes/
│   ├── README.md           ← roster index
│   ├── berserker.md
│   ├── pyromancer.md
│   └── lightbearer.md
└── cards/
    ├── README.md           ← card-pages index
    ├── generic.md
    ├── berserker.md
    ├── pyromancer.md
    └── lightbearer.md
```
