# Diceborn — UI / UX Reference

This document maps the player-facing surface of Diceborn to the components that render it: how the screen is laid out, what reacts to what, where touch targets live, what plays when, and where the design tokens come from.

It is meant for someone who wants to:
- understand the match screen at a glance,
- know which component owns which slot before editing,
- find the right token / animation / overlay primitive instead of reinventing one,
- see what's still placeholder or stale.

For game rules see [`ENGINE_AND_MECHANICS.md`](./ENGINE_AND_MECHANICS.md). For hero authoring see [`HERO_REQUIREMENTS.md`](./HERO_REQUIREMENTS.md).

---

## Table of contents

1. [Design philosophy](#1-design-philosophy)
2. [Routes & screens](#2-routes--screens)
3. [Match screen layout](#3-match-screen-layout)
4. [Component catalog](#4-component-catalog)
5. [Overlays](#5-overlays)
6. [Choreography layers](#6-choreography-layers)
7. [State & input gating](#7-state--input-gating)
8. [Design tokens](#8-design-tokens)
9. [Hero theming pipeline](#9-hero-theming-pipeline)
10. [Touch, accessibility, motion](#10-touch-accessibility-motion)
11. [Audio](#11-audio)
12. [PWA & offline](#12-pwa--offline)
13. [Known gaps](#13-known-gaps)

---

## 1. Design philosophy

**Mobile-first.** The match screen is designed for iPhone Safari (390×844) first; desktop is a reflow via Tailwind's `lg:` (1024px+) breakpoint, not a redesign.

**Juice over chrome.** Every important game event has presentation weight: dice tumble + settle, hit-stop, screen shake, damage-number floaters, ability cinematics, status-token slam-ins, hero portrait reactivity. The engine resolves a turn in milliseconds; the presentation layer takes 2–6 seconds to *show* it. See [§6](#6-choreography-layers).

**Two interactive picks per attack.** The attacker picks which ability to fire from the matched list; the defender picks which defense to attempt. Both surfaces are bottom-anchored overlays gated on the choreographer being idle so the lead-up beats land first.

**Presentation never reaches into the engine.** Components subscribe to the `GameState` snapshot and the choreographer's event queue. They never call into game logic — they dispatch actions and react.

**One mutation point.** All input becomes an `Action` dispatched through `useGameStore.dispatch`. The reducer in `src/game/engine.ts applyAction` produces `{ state, events }`; events feed the choreographer queue for presentation.

---

## 2. Routes & screens

Defined in `src/main.tsx` and routed with `react-router-dom`.

| Route | Component | Purpose |
|---|---|---|
| `/` | `MainMenu` | Stacked CTAs: Vs AI (recommended), Hot-Seat, How to play, Settings, plus dev links. |
| `/heroes?mode=...` | `HeroSelect` | Pick hero(es). `mode=vs-ai` picks one hero; `mode=hot-seat` picks p1 then p2 with a curtain transition. Shows the live hero registry — empty-state if no heroes are registered. |
| `/play?mode=...&p1=...&p2=...` | `MatchScreen` | Full match UI. See [§3](#3-match-screen-layout). |
| `/how-to-play` | `HowToPlay` | Static rules walkthrough as numbered cards. **Currently stale** — see [§13](#13-known-gaps). |
| `/settings` | `Settings` | Audio mute, reduced motion, haptics. Persists to `localStorage`. |
| `/dev/tokens` | `DevTokens` | Design-tokens showcase. |
| `/dev/components` | `DevComponents` | Component storybook + dice playground + choreographer test bench. |

All screens use the `safe-pad` utility (`max(12px, env(safe-area-inset-*))`) so iPhone notches don't clip content.

---

## 3. Match screen layout

`src/components/screens/MatchScreen.tsx`. The layout uses one CSS grid that reflows between mobile (single column) and desktop (3-column rail + center + rail).

### Mobile (<1024px)

```
┌────────────────────────────────────────┐
│ HeroPanel — opponent  (compact)        │  top
├────────────────────────────────────────┤
│ PhaseIndicator                         │
│                                        │
│ DiceTray  (dimmed outside roll phases) │  arena center
│                                        │
├────────────────────────────────────────┤
│ HeroPanel — active   (full + ladder)   │
│                                        │
│ Hand   (horizontal scroll, fanned)     │
├────────────────────────────────────────┤
│ ActionBar  (fixed bottom, primary CTA) │  fixed
└────────────────────────────────────────┘
```

The opponent ladder is collapsed under their HeroPanel on mobile (read-only). The active hero's ladder hangs under their HeroPanel as a `CollapsibleLadder` (open by default).

### Desktop (≥1024px)

```
┌──────────┬─────────────────┬──────────┐
│ Opponent │ Opponent panel  │ My       │
│ ladder   │   (top, capped  │ ladder   │
│ rail     │    max-w-2xl)   │ rail     │
│ (sticky) │                 │ (sticky) │
│          ├─────────────────┤          │
│          │ DiceTray +      │          │
│          │ PhaseIndicator  │          │
│          │ (centered)      │          │
│          ├─────────────────┤          │
│          │ My panel + Hand │          │
│          │   (capped)      │          │
└──────────┴─────────────────┴──────────┘
                ActionBar (fixed bottom)
```

Both ladders sit in 260px sticky side rails (`lg:sticky lg:top-6`). The center column is capped at `max-w-2xl` for symmetry between the opponent and active panels. The action bar stays fixed-bottom on both layouts.

### Atmospheric background

`HeroBackground` renders a full-bleed atmospheric layer behind everything. It cross-fades when the active player changes — particles drift in the active hero's accent color. Intensity is `"ambient"` during a match, `"full"` on the HeroSelect screen.

### Hot-seat curtain

`HotSeatCurtain` is a full-screen overlay that raises when `state.activePlayer` changes mid-match in hot-seat mode. The viewer (whose perspective the screen renders from) doesn't change automatically — the curtain forces an explicit hand-off so player 2 doesn't see player 1's hand.

### Result screen

`ResultScreen` is a full-screen overlay rendered when `state.winner` is set. It runs `buildMatchSummary(matchLog, ...)` to produce a stats panel — turn count, total damage, biggest hit, ability landings — plus rematch / menu CTAs.

---

## 4. Component catalog

### `src/components/ui/` — primitives

| Component | Purpose |
|---|---|
| `Button` | Primary CTA. Variants: `primary` (accent-filled), `ghost`, `surface`. Sizes: `sm` / `md` / `lg`. Optional `heroAccent` prop for per-hero theming. Plays a `sound` SFX on press unless `sound={null}`. |
| `HealthBar` | HP bar with optional label. Colors: green→amber→red gradient via accent. Animated width transitions on hp-changed. |
| `CPMeter` | Pip row showing current CP / cap. Filled pips up to current; pulsing pip on the next-fillable slot. |
| `Tooltip` | Hover/long-press tooltip. Mobile: long-press; desktop: hover. Auto-positions to stay in viewport. |

### `src/components/game/` — match parts

| Component | Purpose |
|---|---|
| `HeroPanel` | Portrait + name + HP + CP + status track + optional collapsible ladder (mobile only). Two variants: `opponent` (compact, top of screen) and `active` (full). Reactive to `hero-state` events from the choreographer — portrait shifts to hit / defended / low-hp / victorious / defeated. |
| `HeroPortrait` | Per-hero sigil renderer. Falls back to a generic concentric-circle placeholder when no sigil is registered. Accent-glow ring on the active player. State variants drive subtle pose / glow shifts. |
| `AbilityLadder` | Vertical stack of ability rows, T4 at top → T1 at bottom. Live-state styling per row: FIRING (bright glow + scale 1.04 + READY flag), TRIGGERED (60% glow + scale 1.02), REACHABLE (default + % badge), OUT-OF-REACH (40% opacity desaturated). LETHAL flag overlays a red-gold border + skull badge + bell sting on first appearance. Combos render as inline face-icons, not text. |
| `DiceTray` | 5 hero dice in a row. Tap to lock/unlock during offensive roll. Tumble animation on `dice-rolled` events (900ms mobile / 1200ms desktop, 260ms in reduced-motion). Each die plays an overshoot bounce on land + dust + thud SFX + haptic tick. Dimmed at 45% opacity outside roll phases. `centerStage` prop scales it up during offensive-roll for focus. |
| `Die` | Single die. Renders a hero-specific glyph for the current face symbol (via `FACE_GLYPHS`). Tinted with the symbol's `FACE_TINT` color. Lock overlay = small padlock + dim background. |
| `Hand` | Horizontally scrolling card row. Tap a card → lifts (scale 1.05 + translate-y -3 + accent ring) and opens a CardLiftedOverlay with PLAY / Sell / Cancel. Long-press for inspect tooltip. Cards that aren't currently playable fade to 60% opacity with a "not playable" badge. |
| `CardView` | Single card. Visual treatment differentiates kind label (ACTION / ROLL / INSTANT / MASTERY / etc.), shows cost in an ember-gold disc, name in display font, text in body, optional flavor in italics. Hero-specific cards get the hero accent in the kind chip. |
| `ActionBar` | Bottom-anchored primary CTA. Phase-driven label: ROLL / REROLL (n left) / CONFIRM / END TURN / OPPONENT'S TURN / MATCH OVER. Includes a left-side menu button. |
| `PhaseIndicator` | Small banner above the dice tray showing phase name + active player + "thinking..." spinner when AI is acting. |
| `StatusTrack` / `StatusBadge` / `StatusIcon` | Status token chip row. Each chip shows the icon + stack count. Pulses if the status's `pulse` flag is set. Hover/long-press for tooltip. |
| `dieFaces.tsx` | `FACE_GLYPHS: Record<symbol, ReactNode>` and `FACE_TINT: Record<symbol, hex>`. Heroes register their own glyphs here when they're added. Empty by default. |
| `HotSeatCurtain` | Full-screen hand-off overlay between turns in hot-seat mode. Shows the next player's hero portrait + "Pass to PX" + a big TAP TO CONTINUE button. |

### `src/components/screens/` — full screens

`MainMenu`, `HeroSelect`, `MatchScreen`, `HowToPlay`, `Settings`, `ResultScreen`, `DevComponents`, `DevTokens`. See [§2](#2-routes--screens).

### `src/components/effects/` — choreography + overlays

See [§5](#5-overlays) and [§6](#6-choreography-layers).

---

## 5. Overlays

Bottom-anchored or full-screen modal layers gated on the choreographer being idle. Listed roughly in z-order from lowest to highest.

| Overlay | Trigger | Z | Behaviour |
|---|---|---|---|
| `ResultScreen` | `state.winner != null` | full | Match summary + rematch / menu CTAs. Replaces the match UI entirely. |
| `HotSeatCurtain` | `state.activePlayer` flips in hot-seat mode | 60 | Full-screen hand-off. Player must tap to continue. |
| `CardLiftedOverlay` (in `Hand.tsx`) | Active card lifted | 30 | Dimmed backdrop + enlarged card + PLAY / Sell / Cancel buttons. Tap outside dismisses. |
| `AttackSelectLayer` | `state.pendingOffensiveChoice && useInputUnlocked()` | 50 | **Active player picks which ability to fire.** Lists each match with tier chip, base damage, short text, damage type. Pass option at bottom. AI auto-picks `matches[0]`. See [Engine §11 attack flow](./ENGINE_AND_MECHANICS.md#11-events--the-choreographer). |
| `DefenseSelectLayer` | `state.pendingAttack && useInputUnlocked()` | 50 | **Defender picks which defense to attempt.** Shows incoming damage + type + tier; lists each defense with combo, dice count, effect. "Take it" option for no defense. AI picks highest-tier defense. |
| `InstantPromptLayer` | Choreographer detects a playable Instant after a qualifying event | 50 | 1.5s TTL countdown bar + Instant card buttons + Skip. Auto-closes on TTL. |
| `Banner` | `bannerText` set in choreoStore | 40 | Centered title overlay used for `match-started`, `turn-started`, `match-won`, `attack-intended` (as "X → AbilityName"), `offensive-pick-prompt` (as "PICK YOUR ATTACK"). Auto-fades. |
| `ActionLog` | Always rendered | 5 | Right-side feed of recent events (or bottom-corner on mobile). Every event maps to an optional one-line entry via `formatEvent` in `ActionLog.tsx`. |

### Why "input unlocked" gating

Both `AttackSelectLayer` and `DefenseSelectLayer` only render when `useInputUnlocked()` returns true (queue empty + nothing playing + no cinematic running). This guarantees the lead-up choreography (e.g. the ability-triggered attack-effect, or the attack-intended banner) plays out before the picker overlay takes the floor. Gating happens in the layer itself, not in the choreographer pump — the queue still drains normally.

---

## 6. Choreography layers

The choreographer is mounted at the route root in `App.tsx` via `<Choreographer>`. It renders a stack of effect layers and runs a module-level pump that drains `choreoStore.queue` one event at a time.

### Layers (rendered inside `<Choreographer>`)

| Layer | Owns |
|---|---|
| `ScreenShake` | Wraps children. Applies `transform: translate(...)` based on `choreoStore.shake`. Magnitudes from tokens: 2px / 6px / 10px (tiny / med / large). |
| `HitStop` | Pauses CSS animations briefly via `animation-play-state: paused` when `choreoStore.hitStopUntil > now`. 100–200ms typical. |
| `DamageNumberLayer` | Spawns floating numbers from `choreoStore.damageNumbers`. Variants: `dmg` (red), `heal` (green), `pure` (purple), `crit` (gold-large), `white` (undefendable), `cp` (ember-gold). Sizes `sm / md / lg` based on amount. Auto-cull after 1.4s. |
| `AttackEffectLayer` | Per-ability hit FX (radial accent burst, slash streaks, etc.). Currently a generic `<DefaultFx />` since heroes are unregistered; per-hero effects register here when content lands. |
| `AbilityCinematicLayer` | Full-screen Tier-4 Ultimate cinematic: letterbox bars, slow-mo, hero name + bark line, accent glow. Reads from `choreoStore.cinematic`. |
| `Banner` | Centered title overlay (see [§5](#5-overlays)). |
| `ActionLog` | Live event feed. |
| `InstantPromptLayer`, `AttackSelectLayer`, `DefenseSelectLayer` | The three player-input overlays. |

### Beat durations

`Choreographer.tsx playEvent` switches over each `GameEvent.t` and returns the beat duration in ms. Selected values:

| Event | Default (ms) | Notes |
|---|---|---|
| `dice-rolled` | 1100 | Wait for tray tumble + settle. |
| `defense-dice-rolled` | 1100 | Same. |
| `ability-triggered` | 1000 (1200 if crit) | Plays AttackEffect. |
| `ultimate-fired` | 2200 (3000 if crit) | Cinematic owns the hold. |
| `damage-dealt` | 900 (1300 for big hits ≥15) | Hit-stop + shake + damage number. |
| `attack-intended` | 900 | Banner setup before AttackSelect overlay. |
| `offensive-pick-prompt` | 700 | Banner setup before AttackSelect overlay. |
| `defense-resolved` | 1100 if reduction>0 else 500 | |
| `phase-changed` | 200 | Small breath. |
| `card-played` | 700 | + haptic. |
| `turn-started` | 1100 | Banner. |

In **reduced-motion** mode every duration caps at 220ms — cinematics still play (the player needs to see what happened) but at 0.3× duration.

### Why module-level subscription

The pump subscribes to `choreoStore` at module load, **not** in a React `useEffect`. React 18 StrictMode double-invokes effects, which would cancel the in-flight `setTimeout` mid-beat and deadlock the queue. The module-level subscription survives across re-renders and StrictMode. See the comment block in `Choreographer.tsx`.

---

## 7. State & input gating

Three Zustand stores. Each owns a narrow slice.

| Store | File | Owns |
|---|---|---|
| `gameStore` | `src/store/gameStore.ts` | `GameState`, mode (vs-ai / hot-seat), `aiPlayer`, `matchLog`. `dispatch(action)` calls `applyAction` then enqueues events. |
| `choreoStore` | `src/store/choreoStore.ts` | Event queue, currently-playing event, screen shake, hit-stop deadline, damage numbers, cinematic, attack effect, banner text, instant prompt. |
| `uiStore` | `src/store/uiStore.ts` | `currentViewer` (hot-seat hand-off), `curtainOpen`, `liftedCardId` (which hand card is lifted), settings flags. |

### `useInputUnlocked()`

```ts
export function useInputUnlocked(): boolean {
  const queueLen   = useChoreoStore(s => s.queue.length);
  const playing    = useChoreoStore(s => !!s.playing);
  const cinematic  = useChoreoStore(s => !!s.cinematic);
  return queueLen === 0 && !playing && !cinematic;
}
```

Every interactive component reads this and disables itself while false. It's the single rule that keeps inputs locked while the choreographer is busy.

### What's gated where

| Surface | Gate |
|---|---|
| Hand cards | `enabled = canInput && (phase ∈ {main-pre, main-post, offensive-roll})` |
| Dice tray lock toggle | `state.activePlayer === viewer && state.phase === "offensive-roll"` |
| Action bar primary CTA | `enabled = myTurn && useInputUnlocked() && !winner` |
| AttackSelectLayer | renders only when `pendingOffensiveChoice && useInputUnlocked()` |
| DefenseSelectLayer | renders only when `pendingAttack && useInputUnlocked()` |
| InstantPromptLayer | rendered by the pump after qualifying events; auto-closes on 1.5s TTL |
| Roll action | engine refuses while `pendingOffensiveChoice` is set |
| Card play | `canPlay` refuses non-instants while `pendingOffensiveChoice` is set |

### AI driver

In `MatchScreen.tsx`, an effect watches `state.activePlayer === aiPlayer && useInputUnlocked()` and dispatches `nextAiAction(state, ai)` after a 900ms cooldown. The cooldown is intentional — gives the human player time to read what just happened before the AI's next move starts.

---

## 8. Design tokens

Single source of truth: `src/styles/tokens.css`. Tailwind reads it via `tailwind.config.ts`; raw CSS reads `var(--c-*)` directly.

### Color

| Token | Hex | Use |
|---|---|---|
| `--c-arena-0` | `#0E0814` | Deepest background (never pure black — warm-purple dark). |
| `--c-arena-1` | `#1B1228` | Mid panel surfaces. |
| `--c-arena-2` | `#2A1740` | Highlight surfaces. |
| `--c-brand` | `#A855F7` | Magenta-purple. Default accent. |
| `--c-ember` | `#F59E0B` | CP, crit numbers, gold flourishes. |
| `--c-cyan` | `#06B6D4` | Magic effects, CP gain. |
| `--c-dmg` | `#EF4444` | Normal damage numbers + Burn glyph. |
| `--c-heal` | `#10B981` | Heal numbers + Regen glyph. |
| `--c-ink` | `#F5F1FA` | Primary text on dark. |
| `--c-muted` | `#9C8FB0` | Secondary text. |

Hero accent colors are not in this file — each hero defines its own `accentColor` hex on `HeroDefinition`. Components that need to theme-color a panel set `--side-glow` or `--hero-accent` as inline style and let CSS fall through.

### Typography

| Token | Stack | Use |
|---|---|---|
| `--t-display` | `Cinzel, Georgia, serif` | Hero names, big CTAs, banners. Uppercase + wide tracking. |
| `--t-body` | `Inter, system-ui, sans-serif` | Body text, card rules. |
| `--t-num` | `Rubik, ui-monospace, monospace` | HP, CP, damage numbers, dice values. |

Tailwind classes: `font-display`, `font-body`, `font-num`. Sizes use the d-1/2/3 scale (display) plus standard Tailwind `text-*`.

### Spacing

`--s-1` through `--s-7` map to 4 / 8 / 12 / 16 / 24 / 32 / 48 px. Used in raw CSS; Tailwind components use `gap-2 p-3` etc. directly.

### Motion

| Token | Duration | Use |
|---|---|---|
| `--d-hitstop` | 100ms | Pause window on damage hits. |
| `--d-ladder` | 200ms | Ladder row state transitions. |
| `--d-tumble` / `--d-tumble-d` | 900 / 1200ms | Dice tumble (mobile / desktop). |
| `--d-cinematic` / `--d-cinematic-d` | 1800 / 2500ms | Ult cinematic. |
| `--d-overshoot` | 220ms | Die land bounce. |

Easing curves:

| Token | Curve | Use |
|---|---|---|
| `--e-snap` | `cubic-bezier(.34,1.56,.64,1)` | Overshoot bounce — die land, lifted card. |
| `--e-snap-soft` | `cubic-bezier(.22,1,.36,1)` | Subtler bounce — hand fan. |
| `--e-in-quart` | `cubic-bezier(.5,0,.75,0)` | Acceleration into a beat. |
| `--e-out-quart` | `cubic-bezier(.25,1,.5,1)` | Deceleration out of a beat. |

Reduced-motion override (in tokens.css `@media (prefers-reduced-motion: reduce)`): durations cut to ≤540ms, dice tumble to 260ms.

### Shake magnitudes

`--shake-tiny` 2px, `--shake-med` 6px, `--shake-large` 10px. Used by `ScreenShake` based on damage size.

### Surface treatment

`.surface` utility applies `bg-arena-1` + a 1px top stroke at 8% white + a bottom stroke at 50% black + a soft purple shadow. Gives every panel the same "raised tablet" feel. Defined in `globals.css`.

---

## 9. Hero theming pipeline

A hero's UI footprint comes from four registries plus its `HeroDefinition` accent color:

| Registry | File | What it themes |
|---|---|---|
| `HEROES` (the registry) | `src/content/index.ts` | Source of truth — every other registry is keyed by `HeroId`. |
| `registerSigil(heroId, render)` | `src/components/game/HeroPortrait.tsx` | Portrait sigil renderer. State-aware (idle / hit / defended / low-hp / victorious / defeated). Falls back to a generic concentric-circle placeholder when not registered. |
| `registerAtmosphere(heroId, config)` | `src/components/effects/HeroBackground.tsx` | Background motif + particle direction / density / hue. Falls back to a purple ember bed using the hero's accent color. |
| `FACE_GLYPHS` / `FACE_TINT` | `src/components/game/dieFaces.tsx` | Per-symbol SVG glyph + tint hex. Currently empty — heroes register here when added. |
| (status icons) | `src/components/game/StatusIcon.tsx` | Universal pool icons (burn, stun, protect, shield, regen) are baked in; signature tokens add their icon via the status `visualTreatment` field. |

The `accentColor` hex is the single overriding theme value. Components that themed off the hero (CTAs, panel side-glow, ladder firing-row glow, attack-effect bursts, banner color) read it via the snapshot or directly from `HeroDefinition.accentColor` and inject it as a CSS custom property or inline style.

When **no heroes are registered**, every screen renders an explicit empty state ("No heroes registered" with a pointer to `src/content/heroes/`). The dev showcase still renders for the hero-agnostic primitives (status registry, choreographer test bench, dice playground stub).

---

## 10. Touch, accessibility, motion

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

`src/hooks/useHaptics.ts` wraps the Vibration API with a feature-detect + a localStorage toggle (`diceborn:haptics`). iOS Safari ignores the API and silently no-ops; Android Chrome honours it. Patterns:

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
2. **Choreographer-level.** `Choreographer.tsx readReduced()` returns `true` if the localStorage flag (`diceborn:reduced-motion`) is set or the OS media query matches. When `true`, `playEvent` clamps each beat to ≤220ms so the timing still resolves but everything plays fast. Cinematics still run — the player must see what happened — just briefly.

Players can override the OS preference in `/settings`.

### Keyboard

Every interactive button is a real `<button>`. Tab order follows DOM order. There's no global keyboard shortcut layer beyond standard browser focus management — Diceborn is touch-first.

---

## 11. Audio

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

## 12. PWA & offline

`vite-plugin-pwa` config in `vite.config.ts`:

- **Service worker:** generated automatically; precaches the core JS / CSS / index.html.
- **Manifest:** `public/manifest.webmanifest` with name, short_name, icons (192, 512, maskable), theme_color = `#A855F7` (brand purple), background_color = `#0E0814` (arena-0).
- **iOS standalone:** `index.html` carries `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style="black-translucent"`, and a 180px Apple touch icon so the app installs cleanly to the iOS home screen with no Safari chrome.
- **Install prompt:** the browser fires `beforeinstallprompt`; we don't show a custom prompt UI in MVP — relies on the browser's native suggestion.

**Bundle budget** (from `npm run build`): JS ~140 KB gzipped, CSS ~7 KB gzipped, total precache ~480 KiB. Comfortably under the 1.2 MB precache budget.

---

## 13. Known gaps

Things that are **stale or placeholder** and should be addressed before ship:

- **`/how-to-play` is out of date.** Mentions "5 phases" (8), "2 attempts" (3), "Defensive Roll (auto)" (interactive), and the auto-fire ability resolver. Needs a rewrite to match the current rules. See `src/components/screens/HowToPlay.tsx`.
- **No heroes are registered.** Every screen handles this gracefully (empty states, registry checks), but the match flow is uninteresting until a hero ships. See `src/content/heroes/` (currently empty).
- **`AttackEffectLayer` renders a generic burst** because no per-hero effects are registered. Per-ability hit FX register here as content lands.
- **AbilityCinematic falls back to generic name + accent** when the firing hero isn't registered.
- **Status detonation event is emitted but the configured `effect` isn't auto-resolved** at the call site yet — see ENGINE_AND_MECHANICS.md known-follow-ups for the queue mechanism.
- **Bankable spend prompts** (`pendingBankSpend`) — engine support + UI overlay are wired and dispatchable, but the auto-open from `applyAttackEffects` / `resolveDefenseChoice` based on hero `spendOptions` isn't yet auto-triggered.
- **`Settings` does not expose** an "audio volume" slider (just mute) or a "spectator hand-off" toggle for hot-seat (always shows curtain).
- **Custom drag-to-play** for cards on desktop is intentionally not built — tap-to-lift only on both platforms. May add an opt-in drag mode later.
- **No keyboard shortcut layer.** Touch-first by design.

---

## See also

- [`ENGINE_AND_MECHANICS.md`](./ENGINE_AND_MECHANICS.md) — game rules, engine architecture, event flow
- [`HERO_REQUIREMENTS.md`](./HERO_REQUIREMENTS.md) — hero authoring brief
- `README.md` — project overview, commands, routes, bundle stats
