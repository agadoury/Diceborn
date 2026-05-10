# Pact of Heroes

A 1v1 dice-and-card duel. Each player picks a hero with their own dice
faces, ability ladder, signature passive, and card pool, then takes
alternating turns rolling, locking, and playing cards to chase
combos that fire abilities. Match length: 5–8 minutes; play it in a
browser tab on mobile or desktop, or install it as a PWA.

> **Status: MVP under active development.** Three playable heroes
> (Berserker, Pyromancer, Lightbearer), hot-seat and Vs AI modes, a deck
> builder, and the full juice layer (dice tumble, hit-stop, screen
> shake, ability cinematics, status-token slam-ins, per-hero
> atmospherics) are in. Expect rough edges; tuning, content, and polish
> are all ongoing.

## Stack

- Vite + React 18 + TypeScript (strict)
- Tailwind CSS (mobile-first; `lg: 1024px` is the mobile → desktop boundary)
- Zustand for state, Framer Motion + GSAP for animation, Howler-ready audio
- Vitest for engine tests
- vite-plugin-pwa for service worker, manifest, install prompts

## Commands

```sh
npm install
npm run dev         # http://localhost:5173
npm run build       # tsc + vite build
npm run preview     # preview production build
npm test            # vitest run
npm run typecheck   # tsc -b --noEmit
npm run simulate    # bot-vs-bot match + landing-rate audit
npm run simulate -- --rates           # only the landing-rate audit
npm run simulate -- --n 100 --quiet   # bulk: 100 matches, summary only
```

## Routes

| Route               | What                                              |
|---------------------|---------------------------------------------------|
| `/`                 | Main menu                                         |
| `/heroes?mode=...`  | Hero Select (mode = `vs-ai` or `hot-seat`)        |
| `/decks`            | Deck Builder hero picker — standalone (no match) |
| `/deck-builder?hero=...` | Edit a hero's deck                            |
| `/play?...`         | Match screen                                      |
| `/how-to-play`      | Rules walkthrough                                 |
| `/settings`         | Audio + reduced-motion + haptics                  |
| `/dev/tokens`       | Design tokens showcase                            |
| `/dev/components`   | Component storybook + dice playground + choreographer test bench |

## Architecture

```
src/
├── game/        # Pure rules engine — zero React, zero DOM. Runs in Node for tests.
│   ├── types.ts        Action / GameEvent / GameState / HeroDefinition contract
│   ├── rng.ts          Seeded Mulberry32 — deterministic dice
│   ├── status.ts       Generic apply/tick/strip + 5 universal + 3 signature tokens
│   ├── dice.ts         Combo grammar + evaluateLadder + simulateLandingRate
│   ├── damage.ts       Pure / undefendable / normal / ultimate pipeline
│   ├── cards.ts        Effect resolver + custom-card registry
│   ├── phases.ts       5-phase progression, signature passive hooks
│   ├── engine.ts       applyAction reducer (the single mutation point)
│   ├── ai.ts           Heuristic AI — calls evaluateLadder for shared reach
│   └── match-summary.ts Descriptor + stats from the GameEvent log
├── content/     # Hero & card data files. Pure declarations — no engine code.
│   ├── heroes/      Per-hero HeroDefinition modules (3: berserker, pyromancer, lightbearer)
│   └── cards/       Hero-specific + generic card lists (per-hero + generic.ts)
├── store/       # Zustand: gameStore, choreoStore, uiStore.
├── components/  # ui/ primitives, game/ board parts, effects/, screens/.
├── audio/       # Synth-placeholder SFX library + Howler-ready manager facade.
├── hooks/
└── styles/      # tokens.css (the source of truth) + globals.css
```

The rules engine emits a `GameEvent[]` from every `applyAction` call. The
**Choreographer** consumes that list and runs it as a timed sequence —
hit-stops, screen shake, dice tumble, ability cinematics, status-token
slam-ins. The store enqueues events but does not block — UI components
gate their interactivity on `useInputUnlocked()` (queue drained).

This separation is what enables the juice: the engine resolves a turn
instantly; the presentation layer takes 2-6 seconds to *show* it.

## Heroes

Three heroes ship with the current build:

- **The Berserker** — rush archetype, frost-blue twin-axe warrior. Closes via Wolf's Howl on the rare 5-howl roll. See [`docs/heroes/berserker.md`](./docs/heroes/berserker.md).
- **The Pyromancer** — burn archetype, builds Cinder to critical-mass detonations. Career-moment T4 is God's Crater (5 ruin). See [`docs/heroes/pyromancer.md`](./docs/heroes/pyromancer.md).
- **The Lightbearer** — survival archetype, banks Radiance and closes with Judgment of the Sun (5 zenith). See [`docs/heroes/lightbearer.md`](./docs/heroes/lightbearer.md).

All three follow the canonical offensive ladder shape: 1× T1 + 3× T2 + 2× T3 + 1× T4, with the T4 always gated on `5× face-6`. To add a fourth hero, drop a `HeroDefinition` module in `src/content/heroes/` and register it in `src/content/index.ts`. See [`docs/HERO_REQUIREMENTS.md`](./docs/HERO_REQUIREMENTS.md) for the authoring contract.

Landing-rate audit runs against whichever heroes are registered:

```sh
npm run simulate -- --rates
```

## Mobile-first acceptance

Every step's done-check happens on iPhone (Safari, or Chrome DevTools at
iPhone 14 Pro / 390×844). Touch targets ≥44pt (≥56pt for primary actions),
tap-not-hover interactions, long-press for inspect, haptic feedback on
dice settle / damage / abilities (Android Chrome — iOS Safari ignores the
Vibration API and gracefully no-ops).

## Bundle

`npm run build` ships:
- JS:  ~140 KB gzipped (under 400 KB budget)
- CSS: ~7 KB gzipped
- PWA precache: ~480 KiB total (under 1.2 MB budget)

## How to add a new hero

1. Drop a new file in `src/content/heroes/<id>.ts` exporting a `HeroDefinition`
   with all 4 uniqueness pillars. Follow the canonical ladder shape — 1× T1
   + 3× T2 + 2× T3 + 1× T4 (Ultimate gated on `5× face-6`).
2. Drop the matching `src/content/cards/<id>.ts` (cards are split out from
   hero data — see [`docs/DECK_BUILDING.md`](./docs/DECK_BUILDING.md)).
3. If the hero needs new dice glyphs, add them to `src/components/game/dieFaces.tsx`.
4. If the hero has a new signature status token, register it in `src/game/status.ts`.
5. Register the hero in `src/content/index.ts` and the cards in `src/content/cards/index.ts`.
6. Add a hero design page in `docs/heroes/<id>.md` and a card listing in `docs/cards/<id>.md`.
7. Validate landing rates: `npm run simulate -- --rates`.

The engine itself never changes when adding a hero. If the hero needs a
genuinely new mechanic category (a new `PassiveBehavior` kind), add it
generically so future heroes can reuse it.

## Documentation

- [`docs/INDEX.md`](./docs/INDEX.md) — **start here.** Routes by intent: I'm a player, adding a hero, tuning, fixing the engine, working on UI.
- [`CHANGELOG.md`](./CHANGELOG.md) — design + architecture decisions over time. Read before proposing one that might contradict an earlier one.
- [`docs/ENGINE_AND_MECHANICS.md`](./docs/ENGINE_AND_MECHANICS.md) — game rules, engine architecture, event flow.
- [`docs/UI.md`](./docs/UI.md) — match-screen layout, overlays, choreography, design tokens.
- [`docs/DECK_BUILDING.md`](./docs/DECK_BUILDING.md) — deck composition, builder UI, persistence, validator.
- [`docs/cards/`](./docs/cards/) — per-hero card listings + the universal generic pool.
- [`docs/heroes/`](./docs/heroes/) — per-hero design notes (lore, dice, ability roles, tuning rationale; data lives in `src/content/`).
- [`docs/HERO_REQUIREMENTS.md`](./docs/HERO_REQUIREMENTS.md) — hero-authoring brief. Companions in [`docs/authoring/`](./docs/authoring/) (cheat sheet + worked examples).

## License & lore

All hero art, wordmarks, dice faces, and visual language are original to
this project.
