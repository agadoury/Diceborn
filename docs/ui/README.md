# UI / UX

Reference for the player-facing surface of Pact of Heroes — how screens are composed, how choreography is layered, where the design tokens come from, and what's still placeholder.

## Pages in this folder

| Page | Covers |
|---|---|
| [`match-screen.md`](./match-screen.md) | Match-screen layout, component catalog, overlays. |
| [`choreography.md`](./choreography.md) | Choreographer pump, beat durations, state stores, `useInputUnlocked()` gating, AI driver. |
| [`tokens-and-theming.md`](./tokens-and-theming.md) | Design tokens (color, type, spacing, motion), per-hero theming pipeline. |

This page (`README.md`) covers the cross-cutting bits: design philosophy, the route map, touch / accessibility / motion, audio, PWA, known gaps.

For game rules see [`../engine/README.md`](../engine/README.md). For hero authoring see [`../authoring/hero-spec.md`](../authoring/hero-spec.md).

---

## Design philosophy

**Mobile-first.** The match screen is designed for iPhone Safari (390×844) first; desktop is a reflow via Tailwind's `lg:` (1024px+) breakpoint, not a redesign.

**Juice over chrome.** Every important game event has presentation weight: dice tumble + settle, hit-stop, screen shake, damage-number floaters, ability cinematics, status-token slam-ins, hero portrait reactivity. The engine resolves a turn in milliseconds; the presentation layer takes 2–6 seconds to *show* it. See [`choreography.md`](./choreography.md).

**Two interactive picks per attack.** The attacker picks which ability to fire from the matched list; the defender picks which defense to attempt. Both surfaces are bottom-anchored overlays gated on the choreographer being idle so the lead-up beats land first.

**Presentation never reaches into the engine.** Components subscribe to the `GameState` snapshot and the choreographer's event queue. They never call into game logic — they dispatch actions and react.

**One mutation point.** All input becomes an `Action` dispatched through `useGameStore.dispatch`. The reducer in `src/game/engine.ts applyAction` produces `{ state, events }`; events feed the choreographer queue for presentation.

---

## Routes & screens

Defined in `src/main.tsx` and routed with `react-router-dom`.

| Route | Component | Purpose |
|---|---|---|
| `/` | `MainMenu` | Stacked CTAs: Vs AI (recommended), Hot-Seat, Deck Builder, How to play, Settings, plus dev links. |
| `/heroes?mode=...` | `HeroSelect` | Pick hero(es). `mode=vs-ai` picks one hero; `mode=hot-seat` picks p1 then p2 with a curtain transition. Shows the live hero registry — empty-state if no heroes are registered. |
| `/decks` | `DeckSelect` | Standalone entry to the deck builder. Hero-portrait grid; each card shows a `SAVED` / `DEFAULT` badge. Tapping a hero forwards to `/deck-builder?hero=<id>` with no match params (standalone mode). |
| `/deck-builder?hero=...` | `DeckBuilder` | Edit one hero's deck. Reads three entry shapes from URL params: standalone (no params → CTA "SAVE", returns to `/decks`); pre-pick (`mode=...` only → CTA "SAVE", returns to `/heroes?mode=...`); match flow (`mode + p1 + p2` → CTA "SAVE & PLAY", forwards to `/play`). |
| `/play?mode=...&p1=...&p2=...` | `MatchScreen` | Full match UI. See [`match-screen.md`](./match-screen.md). |
| `/how-to-play` | `HowToPlay` | Static rules walkthrough as numbered cards — 7 sections covering goal, turn flow, rolling + ladder, picking what to fire, defending, cards/decks, and status tokens. |
| `/settings` | `Settings` | Audio mute, reduced motion, haptics. Persists to `localStorage`. |
| `/dev/tokens` | `DevTokens` | Design-tokens showcase. |
| `/dev/components` | `DevComponents` | Component storybook + dice playground + choreographer test bench. |

All screens use the `safe-pad` utility (`max(12px, env(safe-area-inset-*))`) so iPhone notches don't clip content.

---

## Touch, accessibility, motion

### Touch targets

Tailwind utilities (in `tailwind.config.ts` extend):

- `min-h-tap` / `min-w-tap` — **44pt minimum** (Apple HIG floor).
- `min-h-tap-l` — **56pt** for primary actions.
- `min-h-tap-xl` — **64pt** for the action bar's primary CTA.

Every interactive element either uses these utilities directly or has explicit `px / py` spacing that meets the floor.

### Safe-area padding

`.safe-pad` utility on every full-screen container reads `env(safe-area-inset-*)` so iPhone notch / home-indicator do not clip content. Bottom-fixed bars (action bar, overlays) use `pb-[max(env(safe-area-inset-bottom),12px)]` directly.

### Tap, not hover

Mobile interactions are tap-driven. Hover states still exist for desktop but no UI requires hover to discover. Long-press (`>500ms` press) opens an inspect tooltip on cards / status chips / ladder rows; the tooltip auto-positions to stay in viewport.

### Haptics

`src/hooks/useHaptics.ts` wraps the Vibration API with a feature-detect + a localStorage toggle (`pact-of-heroes:haptics`). iOS Safari ignores the API and silently no-ops; Android Chrome honours it. Patterns:

| Pattern | Duration |
|---|---|
| `die-lock` | 10ms tick |
| `die-settle` | 12ms tick |
| `card-play` | 15ms |
| `damage-taken` | 25ms |
| `ability` | 40ms |
| `victory` | `[60, 40, 60, 40, 120]` long pattern |

Settings screen has a haptics toggle that disables the entire system.

### Reduced motion

Two layers:

1. **Token-level.** `tokens.css @media (prefers-reduced-motion: reduce)` cuts long durations dramatically.
2. **Choreographer-level.** `Choreographer.tsx readReduced()` returns `true` if the localStorage flag (`pact-of-heroes:reduced-motion`) is set or the OS media query matches. When `true`, `playEvent` clamps each beat to ≤220ms so the timing still resolves but everything plays fast. Cinematics still run — the player must see what happened — just briefly.

Players can override the OS preference in `/settings`.

### Keyboard

Every interactive button is a real `<button>`. Tab order follows DOM order. There's no global keyboard shortcut layer beyond standard browser focus management — Pact of Heroes is touch-first.

---

## Audio

### Architecture

`src/audio/manager.ts` is the facade. WebAudio synth placeholder ships in MVP; Howler-ready API stays compatible with file-based assets later without changing call sites.

`src/audio/library.ts` maps `GameEvent` → `Sfx | null`. The choreographer pump asks for the SFX of each event and plays it at beat start. Examples:

| Event | SFX |
|---|---|
| `dice-rolled` | (DiceTray plays its own three-stage roll/tumble/settle audio) |
| `ability-triggered` | `ability-sting` (skipped on Tier 4 — cinematic owns it) |
| `ultimate-fired` | `ult-sting` |
| `damage-dealt` | `damage-thud` |
| `heal-applied` | `heal-shimmer` |
| `defense-resolved` | `shield-block` only if `reduction > 0` |
| `card-played` | `card-thud` |
| `card-drawn` | `card-shuffle` |
| `status-applied` | `status-apply` |
| `status-detonated` | `damage-thud` |
| `bank-spent` | `rage-pulse` |

### Mute / volume

Settings screen has a master mute. Choreographer gates audio output via `audio.play(fx)` which respects the mute flag. There's no mid-beat volume duck; the synth placeholder sits at -12dB peak.

---

## PWA & offline

`vite-plugin-pwa` config in `vite.config.ts`:

- **Service worker:** generated automatically; precaches the core JS / CSS / index.html.
- **Manifest:** `public/manifest.webmanifest` with name, short_name, icons (192, 512, maskable), theme_color = `#A855F7` (brand purple), background_color = `#0E0814` (arena-0).
- **iOS standalone:** `index.html` carries `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style="black-translucent"`, and a 180px Apple touch icon so the app installs cleanly to the iOS home screen with no Safari chrome.
- **Install prompt:** the browser fires `beforeinstallprompt`; we don't show a custom prompt UI in MVP — relies on the browser's native suggestion.

**Bundle budget** (from `npm run build`): JS ~140 KB gzipped, CSS ~7 KB gzipped, total precache ~480 KiB. Comfortably under the 1.2 MB precache budget.

---

## Known gaps

Things that are **stale or placeholder** and should be addressed before ship:

- **AbilityCinematic / AttackEffect** can fall back to a generic name + accent if a not-yet-registered hero ships — the three current heroes (Berserker, Pyromancer, Lightbearer) have full theming.
- **Status detonation event is emitted but the configured `effect` isn't auto-resolved** at the call site yet — see [`../engine/README.md`](../engine/README.md) known-follow-ups for the queue mechanism.
- **Bankable spend prompts** (`pendingBankSpend`) — engine support + UI overlay are wired and dispatchable, but the auto-open from `applyAttackEffects` / `resolveDefenseChoice` based on hero `spendOptions` isn't yet auto-triggered.
- **`Settings` does not expose** an "audio volume" slider (just mute) or a "spectator hand-off" toggle for hot-seat (always shows curtain).
- **Custom drag-to-play** for cards on desktop is intentionally not built — tap-to-lift only on both platforms. May add an opt-in drag mode later.
- **No keyboard shortcut layer.** Touch-first by design.

---

## See also

- [`../README.md`](../README.md) — doc tree routed by intent
- [`../engine/README.md`](../engine/README.md) — game rules, engine architecture, event flow
- [`../design/deck-building.md`](../design/deck-building.md) — deck composition rules, builder UI, persistence
- [`../content/`](../content/) — per-hero card listings + design pages
- [`../authoring/hero-spec.md`](../authoring/hero-spec.md) — hero authoring brief
- [`../../CHANGELOG.md`](../../CHANGELOG.md) — design + architecture decisions log
- `../../README.md` — project overview, commands, routes, bundle stats
