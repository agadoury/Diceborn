# Engine: Architecture & runtime

> Companion to [`./README.md`](./README.md). Covers
> the `HeroDefinition` contract, the `applyAction` reducer, store layout,
> the event taxonomy + Choreographer, the AI driver, the bot-vs-bot
> simulator, and engine-wide constants. For player-facing rules see
> [`rules.md`](./rules.md); for the cards layer see [`cards.md`](./cards.md).

## 9. Hero definition contract

Every hero is one `HeroDefinition` object:

```ts
interface HeroDefinition {
  id: HeroId;
  name: string;
  complexity: 1..6;
  accentColor: string;
  signatureQuote: string;
  archetype: "rush" | "control" | "burn" | "combo" | "survival";
  diceIdentity: { faces: DieFace[]; fluffDescription: string };  // 6 faces
  resourceIdentity: { cpGainTriggers: PassiveTrigger[]; fluffDescription: string };
  signatureMechanic: { name; description; implementation: PassiveBehavior };
  abilityCatalog: AbilityDef[];         // full authored pool, any count across tiers 1-4
  defensiveCatalog?: AbilityDef[];      // full authored pool, optional
  recommendedLoadout: LoadoutSelection; // default 4-offense / 2-defense draft
  onHitApplyStatus?: { status; stacks };  // shorthand for "every landed ability also applies X"
}
```

`PassiveBehavior` is open-shaped but the engine reads four well-known optional fields:

- `passiveKey` — slot in `signatureState[]` where the bankable counter lives (`"frenzy"`, `"radiance"`, etc.)
- `bankStartsAt` — seed value at match start (engine writes it during `start-match`)
- `bankCap` — optional cap on the counter
- `spendOptions: PassiveSpendOption[]` — declared spend modes; engine opens a `pendingBankSpend` prompt at the matching context (offensive / defensive resolution / main-phase-on-demand)

Anything outside these well-known fields is hero-specific and dispatched via `phases.ts` per the `kind` discriminator.

`HeroSnapshot` carries transient state for the new primitives:

- `abilityModifiers: ActiveAbilityModifier[]` — masteries + persistent buffs in flight (`creatorPlayer` + `creatorTurnsElapsed` drive the §15.5 turn-bounded discards)
- `pipelineBuffs: ActivePipelineBuff[]` (§15.3) — card-applied damage-pipeline modifiers
- `triggerBuffs: ActiveTriggerBuff[]` (§15.4) — card-applied resource-trigger modifiers
- `comboOverrides: ActiveComboOverride[]` (§15.6) — active combo-relaxation overrides
- `symbolBends: ActiveSymbolBend[]` — active face-symbol bends
- `lastStripped: Record<StatusId, number>` — count of stacks stripped in the most-recent strip event (consumed by conditional bonuses)
- `masterySlots: { 1?, 2?, 3?, defensive? }` — locks the per-tier mastery slot once played

Heroes register themselves in `src/content/index.ts` (`HEROES: Partial<Record<HeroId, HeroDefinition>>`). The HeroSelect screen, simulator, and dev showcase all read this registry live.

### Card files (separate from hero data)

Cards are NOT carried on `HeroDefinition` — they live in their own per-hero module under `src/content/cards/<heroId>.ts` and are resolved into decks at runtime via `getCardCatalog(heroId)` + `getDeckCards(heroId, savedIds?)`. Generic universal cards live in `src/content/cards/generic.ts`. **Deck composition rules, the deck-builder UI, persistence, and per-hero card listings live in [`../design/deck-building.md`](../design/deck-building.md) and [`../content/`](../content/)** — the engine doc just notes the structural split.

Adding a hero is therefore two file drops, not one:

1. `src/content/heroes/<heroId>.ts` — `HeroDefinition` (dice, abilities, signature passive, defensive ladder). No `cards` field.
2. `src/content/cards/<heroId>.ts` — `export const <HERO>_CARDS: Card[] = [...]` (the 12-card deck per `validateDeckComposition`).

Both files are then registered in `src/content/index.ts` (hero) and `src/content/cards/index.ts` (cards).

For the full hero-authoring brief — what fields each hero must provide, what the simulator validates, what the renderer/choreographer can consume — see `../authoring/hero-spec.md`.

---

## 10. Engine architecture

### One mutation point

Every state change goes through `applyAction(state, action) => { state, events }` in `src/game/engine.ts`. The store calls it; tests call it; the AI calls it. There is no other path that mutates `GameState`.

### Action types

```ts
type Action =
  | { kind: "start-match"; seed; p1; p2; coinFlipWinner }
  | { kind: "advance-phase" }
  | { kind: "toggle-die-lock"; die }
  | { kind: "roll-dice" }
  | { kind: "play-card"; card; targetDie?; targetPlayer? }
  | { kind: "sell-card"; card }
  | { kind: "end-turn" }
  | { kind: "respond-to-counter"; accept }
  | { kind: "select-offensive-ability"; abilityIndex: number | null }   // attacker picks during pendingOffensiveChoice
  | { kind: "select-defense"; abilityIndex: number | null }             // defender picks during pendingAttack
  | { kind: "spend-bank"; amount }                            // resolve pendingBankSpend (Radiance, etc.)
  | { kind: "decline-bank-spend" }
  | { kind: "status-holder-action"; status; actionIndex? }   // §15.2 — pay cost to strip status stacks
  | { kind: "concede"; player };
```

### Determinism

The engine is fully deterministic given the RNG seed. `src/game/rng.ts` is a Mulberry32 PRNG with a stored cursor on `GameState`. Every dice roll, shuffle, or random pick reads from this stream; replaying the same `(seed, action[])` produces identical `GameState` and `GameEvent[]`.

This is what makes the simulator (`scripts/simulate.ts`) and tests work — the engine has no clock, no fetch, no globals.

### Module map

```
src/game/
├── types.ts          Type contract — Action, GameEvent, GameState, HeroDefinition shapes
├── rng.ts            Mulberry32 deterministic RNG
├── engine.ts         applyAction reducer (single mutation point)
├── phases.ts         Phase progression + per-phase handlers
├── dice.ts           Combo grammar + ladder evaluator + landing-rate Monte Carlo
├── damage.ts         Damage pipeline (Shield → Protect → defense → HP)
├── status.ts         Status registry + apply/tick/strip + 5 universals
├── cards.ts          Effect dispatcher + custom-card registry + deck/hand plumbing
├── ai.ts             Heuristic AI (uses evaluateLadder for shared reach)
└── match-summary.ts  Reduces a GameEvent[] into a stats object for end-of-match panel
```

---

## 11. Events & the choreographer

### The contract

Every `applyAction` returns a new `state` and a `GameEvent[]`. Events are declarative — they describe *what happened*, not *how to render it*. Sample event types:

- `match-started`, `match-won`, `turn-started`, `phase-changed`
- `card-drawn`, `card-played`, `card-sold`, `card-discarded`
- `dice-rolled`, `die-locked`, `die-face-changed`
- `ladder-state-changed`, `ability-triggered`, `ultimate-fired`
- `offensive-pick-prompt`, `offensive-choice-made` — the offensive picker pause + resume
- `attack-intended`, `defense-intended`, `defense-dice-rolled`, `defense-resolved` — the four-event defensive flow ([§5](#5-ability-ladders))
- `damage-dealt`, `hp-changed`, `heal-applied`
- `status-applied`, `status-ticked`, `status-removed`, `status-triggered`
- `status-detonated` — Cinder-style threshold explosion (Correction 6 §1b)
- `passive-counter-changed` — bankable / non-bankable counter ticked up or spent (Frenzy, Radiance)
- `ability-modifier-added`, `ability-modifier-removed` — Mastery / persistent-buff lifecycle
- `symbol-bend-applied`, `symbol-bend-expired` — face-symbol-bend lifecycle
- `bank-spend-prompt`, `bank-spent` — bankable-passive spend flow
- `status-removal-by-holder-action` — holder paid the cost on a token's `holderRemovalActions[]` entry to strip stacks (§15.2)
- `hero-state` (idle/hit/defended/low-hp-enter/low-hp-exit/victorious/defeated)
- `cp-changed`, `counter-prompt`, `counter-resolved`

### The choreographer

`src/components/effects/Choreographer.tsx`. Consumes the event queue from `choreoStore`, plays each event as a timed beat, and gates UI input via `useInputUnlocked()`. The store enqueues events but does not block — UI components disable themselves while the queue drains.

This separation is what gives the game its juice: the engine resolves a turn instantly (a few ms), and the presentation layer takes 2–6 seconds to *show* it — dice tumble, hit-stops, screen shake, status-token slam-ins, ability cinematics.

### The attack flow as events

A full attack walks through two interactive picks — the attacker chooses which ability to fire, then (for defendable damage) the defender chooses which defense to attempt.

```
[player ends offensive roll]
  ↓
offensive-pick-prompt                 ← engine sets state.pendingOffensiveChoice and halts
                                          ─┐
                                           │ AttackSelectLayer renders.
                                           │ Active player picks one match (or passes).
                                           │ AI driver auto-picks for AI attackers.
                                           │
                                           ▼
                                        select-offensive-ability action
                                        (engine resumes:)
offensive-choice-made                 ← which ability was chosen (or null = passed)
  ↓
ability-triggered                     ← attacker's ability locks in
  ↓
[ultimate-fired]                      ← only if Tier 4
  ↓
attack-intended                       ← engine sets state.pendingAttack and halts
                                          ─┐
                                           │ DefenseSelectLayer renders, defender
                                           │ picks one defense (or "take it").
                                           │ AI driver dispatches off-turn for AI defenders.
                                           │
                                           ▼
                                        select-defense action
                                        (engine resumes, emits the rest:)
defense-intended                      ← which defense was chosen + dice count
  ↓
defense-dice-rolled                   ← single roll, no rerolls / no locking
  ↓
defense-resolved                      ← combo landed (with reduction) or fizzled
  ↓
damage-dealt + hp-changed             ← attack damage applied with reduction
```

For `undefendable` / `pure` / `ultimate` damage, the flow short-circuits — `attack-intended` carries `defendable: false` and `damage-dealt` follows immediately with no defense events between.

### Why a module-level subscriber, not useEffect

The choreographer queue drainer (`pump`) subscribes to `choreoStore` at module level (`useChoreoStore.subscribe(() => pump())`), not inside a React `useEffect`. React 18 StrictMode double-invokes effects, which would cancel the pump's own timer mid-flight and deadlock the queue. The module-level subscription survives across re-renders and StrictMode invocations.

The **AI driver** (`MatchScreen.tsx`) follows the same pattern in spirit — it installs a one-shot `useEffect` per match-screen mount that registers store subscriptions on `useGameStore` and `useChoreoStore`, runs a 600ms-tick scheduler, and a 500ms safety-net `setInterval`. The store subscriptions themselves are the live wires; the surrounding `useEffect` exists only to clean them up on unmount. Either way, the actual reactivity is store-subscription-driven, not React-dep-array-driven.

### Beat durations

Each event type has a hand-tuned duration in the choreographer. `dice-rolled` waits 1100ms for the tumble animation; `ability-triggered` holds for the cinematic; `damage-dealt` adds hit-stop weight proportional to the damage. These are all in `Choreographer.tsx`.

---

## 12. Stores (Zustand)

Three stores, kept narrowly scoped:

| Store | Owns | Reads | File |
|---|---|---|---|
| `gameStore` | `GameState`, the action dispatcher | applyAction, then enqueues the resulting events into `choreoStore` | `src/store/gameStore.ts` |
| `choreoStore` | The presentation event queue, current playing event, instant prompt state, damage-number floaters | Drained by the choreographer | `src/store/choreoStore.ts` |
| `uiStore` | Settings (audio mute, reduced motion, haptics), open dialogs | Components | `src/store/uiStore.ts` |

The split exists so that the engine reducer never touches presentation state, and presentation animations never directly mutate the game.

---

## 13. AI

`src/game/ai.ts`. A heuristic, not a learned model. Calls `evaluateLadder` (the same evaluator the player's UI uses) for "what's reachable", then scores actions on:

- Damage delta vs. opponent (favoring lethal)
- Token swing (applying high-value debuffs / clearing high-value buffs)
- CP economy (don't dump CP if next turn could use it)
- Lock decisions (monotonic: lock dice the keep mask wants locked, never unlock mid-attempt — prevents `pickTargetTier` lock-toggle oscillation)
- Card play timing (main-phase vs. roll-phase windows): plays affordable masteries first (defensive → T3 → T2 → T1), then atonement (§15.2), then hero-specific signature plays via a per-card priority table
- Bankable signature spend (`pendingBankSpend`): spends up to 4 tokens on offensive resolution; spends `ceil(incoming/2)` defensively
- Instants: while a `pendingAttack` targets the AI, plays any matching Instant whose trigger qualifies before responding with `select-defense` (sets `casterPlayer` explicitly so off-turn copies don't get confused with the attacker's own copy in mirror matches)
- Holder-paid status removal: when the AI carries a status with `holderRemovalActions[]` and the cost is affordable AND stacks meet the smallest threshold, dispatches the action (e.g. atones Verdict for 2 CP)

Three difficulty bands are exposed but only Medium is currently calibrated. Easy is intentionally noisy; Hard is unfinished. The AI runs on the same engine as the player — no shortcuts, no privileged information, same `applyAction` calls.

### AI on defense

When a `pendingAttack` targets the AI player, the AI driver dispatches `select-defense` from off-turn. The current heuristic picks the highest-tier defense available; future iterations should weigh it on the incoming damage value, the defense's landing rate at its declared dice count, and remaining HP.

---

## 14. Simulator & tests

### Simulator

`scripts/simulate.ts` — bot-vs-bot match runner.

```sh
npm run simulate                         # one match, full event log
npm run simulate -- --rates              # landing-rate audit only
npm run simulate -- --n 100 --quiet      # 100 matches, summary stats only
```

What it produces:

- **Per-ability landing rate** — measured % over N rolls vs. each ability's `targetLandingRate` band. Out-of-band abilities are flagged.
- **Match length distribution** — turn count + duration histogram
- **Win-rate matrix** — for the hero pairings registered

Iterates `Object.keys(HEROES)` live; prints "no heroes registered" + exits cleanly when the registry is empty.

### Tests

`vitest run`. Two suites currently:

- `tests/engine-loads.test.ts` — combo grammar primitives + status registry universals (hero-agnostic smoke tests)
- `tests/match-summary.test.ts` — match-summary reducer over synthetic event logs

Hero-specific tests (dice / damage / engine / status interactions per hero) land alongside new hero content.

The engine being pure TypeScript with deterministic RNG means tests construct a `GameState`, dispatch a sequence of `Action`s, and assert against `state` + `events`. No DOM, no time, no setup beyond importing.

---

## 15. Constants reference

From `src/game/types.ts`:

| Constant | Value | Where used |
|---|---|---|
| `STARTING_HP` | 30 | Initial HP both players |
| `HP_CAP_BONUS` | 10 | Max HP = `hpStart + HP_CAP_BONUS` |
| `STARTING_CP` | 2 | Initial CP both players |
| `CP_CAP` | 15 | Max CP both players |
| `STARTING_HAND` | 4 | Cards drawn at match start |
| `HAND_CAP` | 6 | Cards over this auto-sell at Discard |
| `ROLL_ATTEMPTS` | 3 | 1 initial roll + 2 rerolls per offensive turn |
| Low-HP threshold | 25% of `hpStart` | `damage.ts` low-HP transition |
| Counter prompt TTL | 1500 ms | `instant`-card auto-prompt window |

---

