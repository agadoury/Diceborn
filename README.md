# Diceborn

Hearthstone with dice. A fan-made, single-page web adaptation in the spirit of
Dice Throne — designed mobile-first for iPhone Safari, fully supported on
desktop, distributed as an installable PWA.

> **Status: MVP complete.** All 12 steps of the execution plan are in. Three
> playable heroes, hot-seat + Vs AI, full juice (dice tumble, hit-stop, screen
> shake, ability cinematics, status-token slam-ins, hero atmospherics).

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
│   ├── heroes/      Per-hero HeroDefinition modules (currently empty)
│   └── cards/       Hero-specific + generic card lists (generic.ts only)
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

No heroes are currently registered. Drop a `HeroDefinition` module in
`src/content/heroes/` and register it in `src/content/index.ts` to
populate the menu, hero-select, simulator, and dev showcase.

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
   with all 4 uniqueness pillars.
2. If the hero needs new dice glyphs, add them to `src/components/game/dieFaces.tsx`.
3. If the hero has a new signature status token, register it in `src/game/status.ts`.
4. Register the hero in `src/content/index.ts`.
5. Validate landing rates: `npm run simulate -- --rates`.

The engine itself never changes when adding a hero. If the hero needs a
genuinely new mechanic category (a new `PassiveBehavior` kind), add it
generically so future heroes can reuse it.

## License & lore

Fan project. Do not reuse Roxley / Nerd Ninjas trademarks, official hero art,
or the "Dice Throne" wordmark. Visual language is original.
