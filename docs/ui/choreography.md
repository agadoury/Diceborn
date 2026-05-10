# UI: Choreography & state

How the choreographer pump turns the engine's `GameEvent[]` into a timed presentation, where the Zustand stores live, and how `useInputUnlocked()` gates every interactive surface.

For the screen layout + components see [`match-screen.md`](./match-screen.md). For tokens see [`tokens-and-theming.md`](./tokens-and-theming.md).

---

## Choreography layers

The choreographer is mounted at the route root in `App.tsx` via `<Choreographer>`. It renders a stack of effect layers and runs a module-level pump that drains `choreoStore.queue` one event at a time.

### Layers (rendered inside `<Choreographer>`)

| Layer | Owns |
|---|---|
| `ScreenShake` | Wraps children. Applies `transform: translate(...)` based on `choreoStore.shake`. Magnitudes from tokens: 2px / 6px / 10px (tiny / med / large). |
| `HitStop` | Pauses CSS animations briefly via `animation-play-state: paused` when `choreoStore.hitStopUntil > now`. 100–200ms typical. |
| `DamageNumberLayer` | Spawns floating numbers from `choreoStore.damageNumbers`. Variants: `dmg` (red), `heal` (green), `pure` (purple), `crit` (gold-large), `white` (undefendable), `cp` (ember-gold). Sizes `sm / md / lg` based on amount. Auto-cull after 1.4s. |
| `AttackEffectLayer` | Per-ability hit FX (radial accent burst, slash streaks, etc.). |
| `AbilityCinematicLayer` | Full-screen Tier-4 Ultimate cinematic: letterbox bars, slow-mo, hero name + bark line, accent glow. Reads from `choreoStore.cinematic`. |
| `Banner` | Centered title overlay (see [`match-screen.md` Overlays](./match-screen.md#overlays)). |
| `ActionLog` | Live event feed. |
| `InstantPromptLayer`, `AttackSelectLayer`, `DefenseSelectLayer`, `DefenseStatusPanel` | The four overlays driving / contextualising player input. |

### Beat durations

`Choreographer.tsx playEvent` switches over each `GameEvent.t` and returns the beat duration in ms. Selected values:

| Event | Default (ms) | Notes |
|---|---|---|
| `dice-rolled` | 1100 | Wait for tray tumble + settle. |
| `defense-dice-rolled` | 1300 | Tray tumble + settle, slightly longer to leave the rolled faces on screen. |
| `ability-triggered` | 1000 (1200 if crit) | Plays AttackEffect. |
| `ultimate-fired` | 2200 (3000 if crit) | Cinematic owns the hold. |
| `damage-dealt` | 900 (1300 for big hits ≥15) | Hit-stop + shake + damage number. |
| `attack-intended` | 900 | Banner setup before DefenseSelect overlay. |
| `offensive-pick-prompt` | 700 | Banner setup before AttackSelect overlay. |
| `defense-intended` | 500 (no roll) / 1300 (with roll) | When a real defense is picked, shows banner like `P2 → WOLFHIDE (3D)` for 1300ms. |
| `defense-resolved` | 500 / 1100 / 1300 | When the defender rolled, shows a `<ABILITY> — DEFENDED` (green) or `<ABILITY> — MISSED` (red) banner for 1100ms. |
| `phase-changed` | 200 | Small breath. |
| `card-played` | 700 | + haptic. |
| `turn-started` | 1100 | Banner. |

In **reduced-motion** mode every duration caps at 220ms — cinematics still play (the player needs to see what happened) but at 0.3× duration.

### Why module-level subscription

The pump subscribes to `choreoStore` at module load, **not** in a React `useEffect`. React 18 StrictMode double-invokes effects, which would cancel the in-flight `setTimeout` mid-beat and deadlock the queue. The module-level subscription survives across re-renders and StrictMode. See the comment block in `Choreographer.tsx`.

---

## State stores

Three Zustand stores. Each owns a narrow slice.

| Store | File | Owns |
|---|---|---|
| `gameStore` | `src/store/gameStore.ts` | `GameState`, mode (vs-ai / hot-seat), `aiPlayer`, `matchLog`. `dispatch(action)` calls `applyAction` then enqueues events. |
| `choreoStore` | `src/store/choreoStore.ts` | Event queue, currently-playing event, screen shake, hit-stop deadline, damage numbers, cinematic, attack effect, banner text, instant prompt. |
| `uiStore` | `src/store/uiStore.ts` | `currentViewer` (hot-seat hand-off), `curtainOpen`, `liftedCardId` (which hand card is lifted), settings flags. |

---

## Input gating

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

---

## AI driver

In `MatchScreen.tsx` the AI driver is installed once per match-screen mount as a Zustand-subscribe pattern (mirroring the Choreographer pump): it subscribes directly to `useGameStore` and `useChoreoStore`, schedules a 600ms tick on any store change, and runs a 500ms safety-net `setInterval` so a transition that races the subscribe registration is still caught. The tick reads fresh state from the stores, checks `inputReady` (queue empty + nothing playing + no cinematic), and fires `nextAiAction(state, aiPlayer)` when the AI has an action to take. Eligibility covers three off-turn cases beyond the obvious "AI's own turn":

- `state.pendingAttack.defender === aiPlayer` — the human attacked the AI; the AI auto-picks + auto-rolls a defense.
- `state.pendingCounter.holder === aiPlayer` — the AI is responding to a counter prompt.
- The "AI is the attacker waiting for the human's defense" case is explicitly skipped so `nextAiAction` doesn't fall through to advance-phase / end-turn and blow past the engine's pause.

The 600ms tick gives the player a beat to read what just happened; the 500ms safety-net poller is the second line of defense.

---

## See also

- [`match-screen.md`](./match-screen.md) — layout, components, overlays
- [`tokens-and-theming.md`](./tokens-and-theming.md) — motion tokens, easing curves
- [`../engine/runtime.md`](../engine/runtime.md) — events, choreographer, AI driver from the engine side
