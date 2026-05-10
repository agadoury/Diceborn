# UI: Design tokens & hero theming

Where the colors, typography, spacing, motion, and per-hero theme come from. Single source of truth for tokens is `src/styles/tokens.css`; the per-hero theme is composed from four registries plus the hero's `accentColor`.

For screen layout see [`match-screen.md`](./match-screen.md). For choreography see [`choreography.md`](./choreography.md).

---

## Design tokens

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

## Hero theming pipeline

A hero's UI footprint comes from four registries plus its `HeroDefinition` accent color:

| Registry | File | What it themes |
|---|---|---|
| `HEROES` (the registry) | `src/content/index.ts` | Source of truth — every other registry is keyed by `HeroId`. |
| `registerSigil(heroId, render)` | `src/components/game/HeroPortrait.tsx` | Portrait sigil renderer. State-aware (idle / hit / defended / low-hp / victorious / defeated). Falls back to a generic concentric-circle placeholder when not registered. |
| `registerAtmosphere(heroId, config)` | `src/components/effects/HeroBackground.tsx` | Background motif + particle direction / density / hue. Falls back to a purple ember bed using the hero's accent color. |
| `FACE_GLYPHS` / `FACE_TINT` | `src/components/game/dieFaces.tsx` | Per-symbol SVG glyph + tint hex. Populated for all three shipping heroes (Berserker axe/fur/howl, Pyromancer ash/ember/magma/ruin, Lightbearer sword/sun/dawn/zenith). New heroes register their glyphs by extending these maps. |
| (status icons) | `src/components/game/StatusIcon.tsx` | Universal pool icons (burn, stun, protect, shield, regen) are baked in; signature tokens add their icon via the status `visualTreatment` field. |

The `accentColor` hex is the single overriding theme value. Components that themed off the hero (CTAs, panel side-glow, ladder firing-row glow, attack-effect bursts, banner color) read it via the snapshot or directly from `HeroDefinition.accentColor` and inject it as a CSS custom property or inline style.

If a build ever ships with **no heroes registered**, every screen renders an explicit empty state ("No heroes registered" with a pointer to `src/content/heroes/`). The current build ships three heroes, so this empty-state path is only reachable in a stripped-down build or an in-progress hero refactor.

---

## See also

- [`match-screen.md`](./match-screen.md) — components that consume these tokens
- [`choreography.md`](./choreography.md) — beat durations layered on top of motion tokens
- [`README.md`](./README.md) — UI overview, accessibility, audio, PWA
