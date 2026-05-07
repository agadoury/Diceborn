# Diceborn

Hearthstone with dice. A fan-made, single-page web adaptation in the spirit of
Dice Throne — designed mobile-first for iPhone Safari, fully supported on
desktop, distributed as an installable PWA.

> **Status: Step 1 (scaffold).** No game logic yet. The rules engine, dice
> tray, ability ladder, and choreography layer land in subsequent steps.

## Stack

- Vite + React 18 + TypeScript (strict)
- Tailwind CSS (mobile-first; `lg: 1024px` is the mobile → desktop boundary)
- Zustand for state, Framer Motion + GSAP for animation, Howler for audio
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
```

## Routes

| Route             | What                                      | Where it lands |
|-------------------|-------------------------------------------|----------------|
| `/`               | Main menu                                 | Step 1 stub; full version Step 10 |
| `/play`           | Match screen                              | Step 5 (mobile) / Step 6 (desktop) |
| `/dev/tokens`     | Design tokens showcase                    | Step 1 (this commit) |
| `/dev/components` | Component storybook + dice playground     | Step 3 |

## Architecture (target)

```
src/
├── game/        # Pure rules engine — zero React, zero DOM. Runs in Node for tests.
├── content/     # Hero & card data files. Pure declarations.
├── store/       # Zustand wrappers around the engine + UI state.
├── components/  # ui/ primitives, game/ board parts, screens/, effects/.
├── audio/       # Howler wrapper, ducking, channels, named SFX library.
├── hooks/
└── styles/      # tokens.css (the source of truth) + globals.css
```

The rules engine emits a `GameEvent[]` from every `applyAction` call. The
**Choreographer** consumes that event list and runs it as a 2–6 second
theatrical sequence — hit-stops, screen shake, dice tumble, ability
cinematics, status-token animations. The Zustand store does not advance
state until the Choreographer has drained its queue.

This separation is what enables the juice: the engine resolves a turn
instantly; the presentation layer takes time to *show* it.

## Mobile-first acceptance

Every step's done-check happens on iPhone (Safari, or Chrome DevTools at
iPhone 14 Pro / 390×844). If a feature works on desktop but breaks on
mobile, the step is not done.

## License & lore

Fan project. Do not reuse Roxley / Nerd Ninjas trademarks, official hero art,
or the "Dice Throne" wordmark. Visual language is original.
