# Documentation

Route by what you're trying to do. Each row links to the doc you should read first; that doc cross-links to siblings.

## I'm a player

- [`how-to-play` (in-app screen)](../src/components/screens/HowToPlay.tsx) — the rules walkthrough that ships at `/how-to-play`. Same content, but inside the app.
- [`content/`](./content/) — per-hero design pages, card listings, and the universal generic card pool.

## I'm adding or updating a hero or cards

1. **Read first**: [`authoring/workflow.md`](./authoring/workflow.md) — the operational guide. Covers four scenarios (new hero, add cards, tune hero, update / remove cards), files to touch in each, validation checklist, submission rules.
2. **Design contract**: [`authoring/hero-spec.md`](./authoring/hero-spec.md) — the authoring brief. Constraints, primitives, tuning bands, template, self-check. Read end-to-end when designing a brand-new hero.
3. **Reference**: [`authoring/cheatsheet.md`](./authoring/cheatsheet.md) (what each template field becomes), [`authoring/examples.md`](./authoring/examples.md) (worked patterns for every primitive).
4. **Companions**: [`design/loadouts.md`](./design/loadouts.md) — the pre-match ability draft (catalog → 4-offense + 2-defense loadout); [`design/deck-building.md`](./design/deck-building.md) — what shape the hero's card pool should take and how the deck-builder uses it.

The `.ts` files in `src/content/` are the source of truth for mechanical data. The `.md` pages in `docs/content/<hero>/` are for design intent — lore, ability roles, cinematics, tuning rationale. Tuning passes typically only edit `.ts` files. See [`authoring/workflow.md` §1](./authoring/workflow.md#1-source-of-truth-in-one-rule).

## I'm fixing or extending the engine

1. **Read first**: [`engine/README.md`](./engine/README.md) — top-level engine doc; routes you into one of four sub-pages by topic:
   - [`engine/rules.md`](./engine/rules.md) — match loop, phases, dice grammar, ability ladders, damage pipeline, status system.
   - [`engine/cards.md`](./engine/cards.md) — CP, hand, card kinds, effect resolver, modifier evaluation, instant triggers, deck-validation.
   - [`engine/runtime.md`](./engine/runtime.md) — `HeroDefinition` contract, reducer, stores, events, choreographer, AI, simulator, constants.
   - [`engine/glossary.md`](./engine/glossary.md) — terminology.
2. **Source**: `src/game/` — `engine.ts` (the `applyAction` reducer), `phases.ts` (per-phase handlers), `cards.ts` (effect resolver), `dice.ts` (combo grammar + ladder evaluator), `damage.ts`, `status.ts`, `types.ts` (the canonical type contract).
3. **Tests**: `tests/*.test.ts` — Vitest. `npm test` runs the full suite.

## I'm working on the UI

- [`ui/README.md`](./ui/README.md) — UI overview, routes, accessibility, audio, PWA. Routes into:
  - [`ui/match-screen.md`](./ui/match-screen.md) — match-screen layout, components, overlays.
  - [`ui/choreography.md`](./ui/choreography.md) — choreographer pump, beat durations, state stores, input gating.
  - [`ui/tokens-and-theming.md`](./ui/tokens-and-theming.md) — design tokens, hero theming pipeline.
- Source: `src/components/` (game/ for board parts, effects/ for choreography layers + overlays, screens/ for routes), `src/store/` (Zustand stores), `src/styles/`.

## I'm deciding what to ship next

- [`/CHANGELOG.md`](../CHANGELOG.md) — design + architecture decisions made so far. Useful before proposing one that contradicts a previous one.
- The repo `README.md` `Status` block — what the project considers in-progress vs. done.

## Folder map

```
docs/
├── README.md                  ← you are here (intent-based router)
├── audio-credits.md           ← content credits
│
├── design/                    ← player-facing & game-design docs
│   ├── README.md
│   ├── loadouts.md            ← pre-match ability draft system
│   └── deck-building.md       ← deck system
│
├── engine/                    ← engine internals
│   ├── README.md              ← top-level engine doc, routes into the 4 sub-pages
│   ├── rules.md               ← match loop, phases, dice, ladders, damage, status
│   ├── cards.md               ← CP, hand, card kinds, effect resolver, instants
│   ├── runtime.md             ← reducer, stores, events, choreographer, AI, simulator
│   └── glossary.md            ← terminology
│
├── ui/                        ← player-facing surface
│   ├── README.md              ← UI overview, routes, accessibility, audio, PWA
│   ├── match-screen.md        ← layout, components, overlays
│   ├── choreography.md        ← choreographer, beats, stores, input gating
│   └── tokens-and-theming.md  ← tokens, hero theming pipeline
│
├── authoring/                 ← how to add/change content
│   ├── README.md
│   ├── workflow.md            ← operational guide (start here)
│   ├── hero-spec.md           ← design contract for new heroes
│   ├── cheatsheet.md          ← field-by-field reference
│   └── examples.md            ← worked patterns per primitive
│
└── content/                   ← per-hero reference + generic pool
    ├── README.md              ← roster index
    ├── generic-cards.md       ← universal card pool
    ├── berserker/
    │   ├── design.md          ← lore, dice, ability roles, tuning notes
    │   └── cards.md           ← card catalog snapshot
    ├── pyromancer/
    │   ├── design.md
    │   └── cards.md
    └── lightbearer/
        ├── design.md
        └── cards.md
```

## Naming conventions

- **Folders & files**: kebab-case (`hero-spec.md`, `deck-building.md`, `tokens-and-theming.md`).
- **Folder index**: every folder has a `README.md` (GitHub auto-renders it when browsing the folder).
- **Per-hero pages**: each hero gets a folder under `content/<hero>/` with two files (`design.md` for design intent, `cards.md` for the card listing).
- **Source of truth**: mechanical numbers live in `src/content/*.ts`. Doc pages are *design intent* and should not duplicate live values.
