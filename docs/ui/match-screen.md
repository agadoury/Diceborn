# UI: Match screen

How `MatchScreen.tsx` is composed — the layout grid, every component that lives inside it, and the overlays that render on top.

For the choreographer, beat durations, state stores, and input gating see [`choreography.md`](./choreography.md). For tokens + theming see [`tokens-and-theming.md`](./tokens-and-theming.md).

---

## Layout

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

Both ladders sit in 340px sticky side rails (`lg:sticky lg:top-6`) — wide enough that ability names + short-text don't truncate at typical desktop widths. The center column is capped at `max-w-2xl` for symmetry between the opponent and active panels. The action bar stays fixed-bottom on both layouts.

### Atmospheric background

`HeroBackground` renders a full-bleed atmospheric layer behind everything. It cross-fades when the active player changes — particles drift in the active hero's accent color. Intensity is `"ambient"` during a match, `"full"` on the HeroSelect screen.

### Hot-seat curtain

`HotSeatCurtain` is a full-screen overlay that raises when `state.activePlayer` changes mid-match in hot-seat mode. The viewer (whose perspective the screen renders from) doesn't change automatically — the curtain forces an explicit hand-off so player 2 doesn't see player 1's hand.

### Result screen

`ResultScreen` is a full-screen overlay rendered when `state.winner` is set. It runs `buildMatchSummary(matchLog, ...)` to produce a stats panel — turn count, total damage, biggest hit, ability landings — plus rematch / menu CTAs.

---

## Component catalog

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
| `AbilityLadder` | Vertical stack of ability rows, T4 at top → T1 at bottom, grouped under "Tier N — Basic/Strong/Signature/Ultimate" headers (no per-row tier number — position under the header conveys it). Live-state styling per row: FIRING (bright glow + scale 1.04 + READY flag), TRIGGERED (60% glow + scale 1.02), REACHABLE (default + % badge), OUT-OF-REACH (40% opacity desaturated). LETHAL flag overlays a red-gold border + skull badge + bell sting on first appearance. Combos render as inline face-icons, not text. **Click-to-fire**: during `offensive-roll`, the active player can tap any FIRING or TRIGGERED row in their own ladder to open a confirm modal — confirming dispatches `advance-phase + select-offensive-ability` for that index, skipping the full picker overlay. |
| `DiceTray` | 5 hero dice in a row. Tap to lock/unlock during offensive roll. Tumble animation on `dice-rolled` AND `defense-dice-rolled` events (900ms mobile / 1200ms desktop, 260ms in reduced-motion). Each die plays an overshoot bounce on land + dust + thud SFX + haptic tick. Dimmed at 45% opacity outside roll phases. `centerStage` prop scales it up during offensive-roll for focus. **During a defense flow** (either `pendingAttack` is set or a `defense-*` event is queued/playing), the tray switches to render the defender's dice with the defender's hero accent — the `DefenseTray` wrapper in `MatchScreen.tsx` handles the swap. Locking is disabled while a defense is in flight. |
| `Die` | Single die. Renders a hero-specific glyph for the current face symbol (via `FACE_GLYPHS`), tinted with the symbol's `FACE_TINT` color. Also shows a small numeric face-value corner badge so straights and n-of-a-kind combos remain readable when several die faces share a symbol. Lock overlay = small padlock + dim background. |
| `Hand` | Horizontally scrolling card row. Tap a card → lifts (scale 1.05 + translate-y -3 + accent ring) and opens a CardLiftedOverlay with PLAY / Sell / Cancel. Long-press for inspect tooltip. Cards that aren't currently playable fade to 60% opacity with a "not playable" badge. |
| `CardView` | Single card. Visual treatment differentiates kind label (ACTION / ROLL / INSTANT / MASTERY / etc.), shows cost in an ember-gold disc, name in display font, text in body, optional flavor in italics. Hero-specific cards get the hero accent in the kind chip. |
| `ActionBar` | Bottom-anchored phase-driven CTAs. Most phases show a single primary button (ROLL on `main-pre`, END TURN on `main-post`, OPPONENT'S TURN / MATCH OVER otherwise). On `offensive-roll` the bar splits into TWO equal-width buttons when rerolls remain: CONFIRM (primary) and REROLL (N left) (secondary). Once attempts hit zero, only CONFIRM remains. Includes a left-side menu button. |
| `PhaseIndicator` | Small banner above the dice tray showing phase name + active player + "thinking..." spinner when AI is acting. |
| `StatusTrack` / `StatusBadge` / `StatusIcon` | Status token chip row. Each chip shows the icon + stack count. Pulses if the status's `pulse` flag is set. Hover/long-press for tooltip. |
| `dieFaces.tsx` | `FACE_GLYPHS: Record<symbol, ReactNode>` and `FACE_TINT: Record<symbol, hex>`. Currently populated for all three shipping heroes: Berserker (axe / fur / howl), Pyromancer (ash / ember / magma / ruin), Lightbearer (sword / sun / dawn / zenith). New heroes register their glyphs by extending these maps. |
| `HotSeatCurtain` | Full-screen hand-off overlay between turns in hot-seat mode. Shows the next player's hero portrait + "Pass to PX" + a big TAP TO CONTINUE button. |

### `src/components/screens/` — full screens

`MainMenu`, `HeroSelect`, `MatchScreen`, `HowToPlay`, `Settings`, `ResultScreen`, `DevComponents`, `DevTokens`. See the [route map](./README.md#routes--screens).

### `src/components/effects/` — choreography + overlays

See [Overlays](#overlays) below and [`choreography.md`](./choreography.md).

---

## Overlays

Bottom-anchored or full-screen modal layers gated on the choreographer being idle. Listed roughly in z-order from lowest to highest.

| Overlay | Trigger | Z | Behaviour |
|---|---|---|---|
| `ResultScreen` | `state.winner != null` | full | Match summary + rematch / menu CTAs. Replaces the match UI entirely. |
| `HotSeatCurtain` | `state.activePlayer` flips in hot-seat mode | 60 | Full-screen hand-off. Player must tap to continue. |
| `CardLiftedOverlay` (in `Hand.tsx`) | Active card lifted | 30 | Dimmed backdrop + enlarged card + PLAY / Sell / Cancel buttons. Tap outside dismisses. |
| `AttackSelectLayer` | `state.pendingOffensiveChoice && useInputUnlocked()` | 50 | **Active player picks which ability to fire.** Lists each match with tier chip, base damage, short text, damage type. Pass option at bottom. AI auto-picks `matches[0]`. See [Engine §11 attack flow](../engine/runtime.md#11-events--the-choreographer). |
| `DefenseSelectLayer` | `state.pendingAttack && useInputUnlocked()` | 50 | **Defender picks which defense to attempt.** Shows incoming damage + type + tier; lists each defense with combo, dice count, effect. "Take it" option for no defense. AI picks highest-tier defense. The pick auto-rolls and resolves in a single dispatch — there is no separate ROLL action for defense. |
| `DefenseStatusPanel` | `state.pendingAttack` set OR a `defense-*` event queued/playing | 40 | **Persistent context panel** pinned top-center while a defense is in flight. Shows the defender's accent header, the incoming attack name + damage, the chosen defense's combo strip + name + dice count, and a live status that progresses `DEFENDING…` → `ROLLING…` → `DEFENDED −X` (green) / `MISSED` (red). Lives separately from the picker so the player keeps full context through the entire choreography (picker disappears on click; this panel stays through the dice tumble and damage application). |
| `InstantPromptLayer` | Choreographer detects a playable Instant after a qualifying event | 50 | 1.5s TTL countdown bar + Instant card buttons + Skip. Auto-closes on TTL. |
| `Banner` | `bannerText` set in choreoStore | 40 | Centered title overlay used for `match-started`, `turn-started`, `match-won`, `attack-intended` (as "X → AbilityName"), `offensive-pick-prompt` (as "PICK YOUR ATTACK"). Auto-fades. |
| `ActionLog` | Always rendered | 5 | Right-side feed of recent events (or bottom-corner on mobile). Every event maps to an optional one-line entry via `formatEvent` in `ActionLog.tsx`. |

### Why "input unlocked" gating

Both `AttackSelectLayer` and `DefenseSelectLayer` only render when `useInputUnlocked()` returns true (queue empty + nothing playing + no cinematic running). This guarantees the lead-up choreography (e.g. the ability-triggered attack-effect, or the attack-intended banner) plays out before the picker overlay takes the floor. Gating happens in the layer itself, not in the choreographer pump — the queue still drains normally.

---

## See also

- [`choreography.md`](./choreography.md) — choreographer pump, beat durations, input gating
- [`tokens-and-theming.md`](./tokens-and-theming.md) — design tokens, hero theming pipeline
- [`README.md`](./README.md) — UI overview, routes, accessibility, audio, PWA
- [`../engine/runtime.md`](../engine/runtime.md) — events + choreographer behaviour from the engine side
