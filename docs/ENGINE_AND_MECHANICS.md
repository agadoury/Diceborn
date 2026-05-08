# Diceborn — Engine & Game Mechanics

This document is the canonical reference for how Diceborn works under the hood: the rules a player sees on screen, the engine that resolves them, and the layers around it (choreographer, stores, AI, simulator). It is meant for someone reading the codebase for the first time who wants to understand both the *what* (game design) and the *how* (architecture).

For the player-facing rules walkthrough, see the `/how-to-play` route. For the hero-authoring brief, see `docs/HERO_REQUIREMENTS.md`. This doc sits between those two.

---

## Table of contents

1. [Game overview](#1-game-overview)
2. [The match loop](#2-the-match-loop)
3. [Phase progression](#3-phase-progression)
4. [Dice & the combo grammar](#4-dice--the-combo-grammar)
5. [Ability ladders](#5-ability-ladders)
6. [Damage pipeline](#6-damage-pipeline)
7. [Status system](#7-status-system)
8. [Cards, CP, and the hand](#8-cards-cp-and-the-hand)
9. [Hero definition contract](#9-hero-definition-contract)
10. [Engine architecture](#10-engine-architecture)
11. [Events & the choreographer](#11-events--the-choreographer)
12. [Stores (Zustand)](#12-stores-zustand)
13. [AI](#13-ai)
14. [Simulator & tests](#14-simulator--tests)
15. [Constants reference](#15-constants-reference)
16. [Glossary](#16-glossary)

---

## 1. Game overview

Diceborn is a 1v1 dice-and-card duel. Each player picks a hero, draws a starting hand, and takes alternating turns. On the active player's turn they roll five hero-specific dice (up to 3 attempts, locking dice between rolls), and the highest-tier ability the resulting dice combo unlocks fires automatically. The opponent then auto-rolls a defensive set; their hero's defensive ladder (or a fallback) reduces the incoming damage. Both players play cards from their hand throughout to bend dice, modify abilities, apply tokens, or trigger reactive effects.

A match ends when one hero's HP reaches 0, or when a player concedes. The target match length is **5–8 minutes / 6–8 turns**; damage tuning is calibrated to that envelope.

### Win condition

Reduce the opponent's HP to 0. Heroes start at 30 HP, can be healed up to 40 HP (`hpStart + 10`), and lose at 0.

### Two key separations the codebase enforces

- **Rules ≠ presentation.** The engine is pure TypeScript with zero React/DOM. Every state mutation flows through one function and emits a typed event log. The presentation layer reacts to that log.
- **Heroes are data.** No engine code changes when a new hero is added — only new content modules. The engine knows about combos, effects, statuses, and phases; it does not know about specific heroes.

---

## 2. The match loop

```
┌─────────────────────────────────────────────────────────────────┐
│ Match start: coin flip picks who acts first                      │
│   - Both heroes draw 4 cards, 30 HP, 2 CP, 5 dice ready          │
│   - The first player skips their first Income (catch-up rule)    │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Active player's turn (one full pass through all 8 phases)        │
│                                                                  │
│   Upkeep → Income → Main-pre → Offensive Roll → Defensive Roll   │
│         → Main-post → Discard                                    │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
                  Switch active player
                  (Repeat until winner declared)
```

Both players' state lives in a single `GameState` object. `state.activePlayer` is whose turn it is; the other player ("opponent") still owns statuses, cards, HP that the active player's actions can target.

---

## 3. Phase progression

Each turn moves through 8 phases in fixed order. The transitions happen in `src/game/phases.ts`.

| Phase | What happens | Player input? |
|---|---|---|
| `pre-match` | One-off setup. Coin flip, draw starting hands, open with both players' hero IDs registered. | No |
| `upkeep` | Tick statuses (per the status's `tickPhase`), apply any signature passive `on-upkeep` hooks. | No |
| `income` | Active player draws 1 card and gains 1 CP (clamped to cap of 15). The first player skips their first income. | No |
| `main-pre` | Pre-roll window. Player can play `main-phase` cards, sell cards, or hit ROLL to advance. | **Yes — must tap ROLL** |
| `offensive-roll` | Active player rolls dice. Up to 3 attempts total. Between rolls, can lock/unlock dice and play `roll-phase` cards. | **Yes — lock dice, optionally play cards, advance when satisfied** |
| `defensive-roll` | **Interactive.** Engine emits `attack-intended` and halts via `state.pendingAttack`. The defender picks one defense from their `defensiveLadder` (or "take it"); engine rolls the chosen defense's dice count once (no rerolls), evaluates, applies any reduction, then resolves the original ability's damage. Both players may play `roll-phase` and `instant` cards during this window. | **Yes — defender picks a defense via `select-defense`** (or the AI driver does so off-turn) |
| `main-post` | Post-resolution window. Player can play `main-phase` cards, sell cards. Ends turn manually. | **Yes — must tap END TURN** |
| `discard` | Auto-sell every card over hand cap (6) for +1 CP each, swap active player, transition into the new active player's `upkeep`. | No |

### Phase enter handlers

`enterPhase(state, phase)` is the single point that transitions state and runs auto-pieces. The handlers (in `phases.ts`) for `upkeep`, `income`, and `discard` run their auto-logic on enter. The other phases just enter and wait for player input.

### Instant prompts (cross-phase)

`instant`-kind cards are not bound to a single phase — they auto-prompt the holding player after a qualifying event (damage dealt, ability landed, ultimate fired, defense resolved, status applied). The prompt has a 1.5-second TTL countdown bar; if the holder doesn't respond, it auto-passes. See `src/components/effects/InstantPrompt.tsx` and `src/store/choreoStore.ts` (`startInstantPrompt` / `endInstantPrompt`).

---

## 4. Dice & the combo grammar

Each hero has their own die shape — 6 faces, each with:

- `faceValue: 1 | 2 | 3 | 4 | 5 | 6` — used by `n-of-a-kind` and `straight` matching
- `symbol: SymbolId` — hero-scoped string like `"myhero:axe"`. Multiple faces can share the same symbol (e.g. faces 1, 2, 3 all have `symbol: "myhero:axe"` so the hero rolls "axe" 50% of the time per die). Used by `symbol-count` matching.
- `label: string` — short display word

The hero rolls 5 of these dice. The roll result is the symbol multiset on those 5 dice + their face-value distribution.

### Combo grammar

A combo is the dice condition that fires an ability. Five primitive shapes:

| Kind | Match condition | Notes |
|---|---|---|
| `symbol-count` | `count` or more dice show the given `symbol`. | Cleanest primitive; works regardless of face values. |
| `n-of-a-kind` | `count` dice all show the same `faceValue`. | Strict face-value match (e.g. four sixes). |
| `straight` | `length` consecutive face values are present. | `length: 4` = small, `5` = large straight. |
| `compound and` | Every clause matches. | Clauses are themselves combos. |
| `compound or` | Any clause matches. | Same. |

Older heroes used legacy kinds (`matching`, `matching-any`, `at-least`, `any-of`, `specific-set`) — they're functionally equivalent to the canonical kinds and still supported by the matcher in `dice.ts`, but new content uses the canonical set.

### Combo evaluation entry points

In `src/game/dice.ts`:

- `comboMatchesFaces(combo, faces)` — full evaluation, handles every kind including face-aware ones.
- `comboMatches(combo, symbols)` — symbol-only fallback; returns `false` for `n-of-a-kind` and `straight`. Kept for paths that only have a symbol multiset.
- `computeComboExtras(combo, faces)` — for scaling-damage abilities, returns how many dice contribute beyond the combo's minimum.

### Ladder evaluator

`evaluateLadder(hero, dice)` returns `LadderRowState[]` — one row per ability declared in the hero's `abilityLadder`. Each row is one of:

- `{ kind: "firing", tier, lethal }` — this is the ability that will actually fire (highest tier matched, then highest base damage among ties)
- `{ kind: "triggered", tier, lethal }` — this combo is matched, but a higher-tier match is also matched, so it won't fire
- `{ kind: "reachable", tier, probability, lethal }` — not currently matched, but reachable within remaining roll attempts (probability is from a tiny per-row Monte Carlo)
- `{ kind: "out-of-reach", tier }` — not reachable from current locked dice + remaining attempts

The same evaluator backs the player's live ladder UI and the AI's planning — guaranteeing identical understanding of what's possible.

`lethal: true` means the ability would kill the opponent if it fires.

---

## 5. Ability ladders

### Offensive ladder

Each hero declares `abilityLadder: AbilityDef[]`. Variable count — old heroes shipped with exactly 4 (one per tier); newer heroes can have multiple abilities at the same tier (a hero can have two T2 abilities with different combos; the picker fires whichever matches, with the higher-damage one winning ties).

Each `AbilityDef` carries:

```ts
{
  tier: 1 | 2 | 3 | 4,
  name: string,
  combo: DiceCombo,
  effect: AbilityEffect,
  shortText: string,         // ladder one-liner: "5 dmg + 1 token"
  longText: string,          // tooltip combo description
  damageType: DamageType,
  targetLandingRate: [lo, hi]   // for the simulator's tuning audit
}
```

### Picker rules

When the active player ends their offensive roll:

1. Evaluate every ability in the ladder against current dice
2. Of the matched abilities, pick the highest tier
3. Of those, pick the highest base damage
4. Fire that one (the others marked `triggered` in the ladder UI become inert)

### Tier semantics

| Tier | Role | Target landing rate | Damage envelope |
|---|---|---|---|
| 1 — Basic | "I always do something" | 75–95% | 3–7 dmg |
| 2 — Strong | "I'm playing well" | 45–70% | 5–9 dmg |
| 3 — Signature | Big swing — earned | 20–45% | 9–13 dmg |
| 4 — Ultimate | Once or twice per match | 8–25% | 13–18 dmg |

Tier 4 triggers a full-screen cinematic moment via the choreographer (`ultimate-fired` event).

### Defensive ladder (interactive — Correction 5)

Optional `defensiveLadder?: AbilityDef[]`. Unlike the offensive ladder, the defender **picks** which defense to attempt — there is no auto-picker. After the active player's offensive ability is locked in, the engine emits `attack-intended` and halts on `state.pendingAttack`. The defender then dispatches `select-defense { abilityIndex }`:

1. **Pick** one defense from their ladder (or `null` = take the hit undefended).
2. The engine rolls the chosen defense's `defenseDiceCount` dice **once** — no rerolls, no locking.
3. `evaluateDefense(combo, dice)` checks whether the combo lands on the rolled dice.
4. If it lands, the defense's effect resolves (`reduce-damage` reduces the incoming hit; `heal` self-heals; `apply-status` applies a token to the attacker).
5. The original offensive ability's damage applies with the computed reduction.

Each `AbilityDef` in the defensive ladder may declare `defenseDiceCount: 2 | 3 | 4 | 5` (default 3) — fewer dice = quick parry, more dice = full brace.

**What skips the defense flow entirely:** `undefendable`, `pure`, and `ultimate` damage. The engine emits `attack-intended` with `defendable: false` and resolves damage immediately, no `select-defense` needed. (Shield + Protect tokens still apply on undefendable / ultimate per [§6](#6-damage-pipeline).)

**Cards during the defensive roll:** `roll-phase` and `instant` cards are playable during the defensive roll window — including dice-manipulation cards that can flip a failed roll into a success.

**Fallback if no defensive ladder is declared:** the engine falls back to "1 dmg reduced per shield-symbol face the defender rolls (5 dice, no choice)" — mechanically valid but much less interesting than a real ladder.

---

## 6. Damage pipeline

`src/game/damage.ts`. One function `dealDamage(source, target, amount, type, defensiveReduction)` handles every incoming damage source. The order of operations:

```
incoming amount
   │
   ├─ if type === "pure" → skip everything below, hit HP directly
   │
   ├─ Shield (passive flat reduction; 1 per stack; never below 0)
   │     working    -= min(working, shieldStacks)
   │     mitigated  += that reduction
   │
   ├─ Protect (consumed; 1 token prevents 2 dmg; consumed lazily)
   │     tokensToSpend = min(protectStacks, ceil(working / 2))
   │     working    -= tokensToSpend * 2  (clamped)
   │     mitigated  += that reduction
   │     protect.stacks -= tokensToSpend  (status removed if it hits 0)
   │
   ├─ Defensive-roll reduction (only for normal/ultimate/collateral; passed in by phases.ts)
   │     working    -= min(working, defensiveReduction)
   │     mitigated  += that reduction
   │
   └─ HP -= max(0, floor(working))
       emit "damage-dealt" + "hp-changed" + "hero-state: hit"
       if low-HP threshold crossed → emit "low-hp-enter"/"low-hp-exit"
```

### Damage types

| Type | Defensive roll? | Shield/Protect? | Notes |
|---|---|---|---|
| `normal` | Yes | Yes | Standard ability damage. |
| `undefendable` | **No** | Yes | Bypasses defensive ladder; tokens still apply. |
| `pure` | **No** | **No** | Hits HP directly. |
| `collateral` | Yes | Yes | Same as normal but flagged as side-effect (e.g. Burn-tick chained damage). |
| `ultimate` | Yes | Yes | Same as normal but reserved for Tier 4; reactive cards may be locked out. |

### Healing

`heal(target, amount)` clamps to `hpCap` (start + 10). Emits `heal-applied` + `hp-changed` + low-HP-exit if applicable.

### Low-HP threshold

`isLowHp` flips true when HP drops to ≤25% of `hpStart` (default ≤7 of 30) and the hero is still alive. Events `low-hp-enter` / `low-hp-exit` fire on transitions. Heroes' signature passives can hook this for "below threshold" mechanics.

---

## 7. Status system

`src/game/status.ts`. A registry-based system: each `StatusDefinition` declares its tick behaviour, on-tick effect, on-removal effect, stack limit, and visual treatment. Apply/strip/tick functions are generic and dispatch by ID.

### Built-in universal pool

| Token | Type | Stack limit | Tick at | Behaviour |
|---|---|---|---|---|
| `burn` | debuff | 5 | holder's upkeep | 1 dmg per stack, decrement 1 |
| `stun` | debuff | 1 | never (consumed) | Holder skips next offensive roll |
| `protect` | buff | 5 | never (consumed) | Each token absorbs 2 dmg on incoming hit |
| `shield` | buff | 3 | never | Flat -1 dmg per stack on every incoming hit |
| `regen` | buff | 5 | holder's upkeep | 1 heal per stack, decrement 1 |

### Tick phases

A status's `tickPhase` controls when its `onTick` runs:

- `ownUpkeep` — at the holder's Upkeep (Burn, Regen)
- `applierUpkeep` — at the upkeep of whoever applied the token (useful for "the attacker keeps applying pressure" tokens)
- `neverTicks` — consumed/expired by other rules (Stun, Protect, Shield)
- `onTrigger` — fires when a specific game event happens (e.g. "this token resolves on the holder's next ability landing")

### Applying & stripping

- `applyStatus(holder, applier, statusId, stacks)` — stacks up to the registered limit, emits `status-applied`
- `stripStatus(holder, statusId, stacks)` — strips up to N stacks, emits `status-removed: stripped`
- `removeStatus(holder, statusId, _, reason)` — internal full removal (for `expired` / `ignited`)
- `stacksOf(holder, statusId)` — convenience read
- `tickStatusesAt(state, phase)` — run by `phases.ts` at upkeep

### Signature tokens

Heroes can register their own status definitions on top of the universal pool. The hero's content module calls `registerStatus(...)` once at module load. Signature tokens get the same machinery as universals — apply, tick, strip, on-removal hooks all work the same way.

---

## 8. Cards, CP, and the hand

### CP (Combat Points)

The shared spendable resource. All cards have a CP cost (typically 0–5).

- Start: 2 CP
- Cap: 15 CP
- Income: +1 CP per turn during the Income phase (first player skips their first income)
- Bonus sources: hero's `resourceIdentity.cpGainTriggers` — declarative triggers like "+1 CP when an offensive ability lands" / "+1 CP when one of your tokens ticks on opponent" / "+1 CP on a successful defense"
- Sell-card: any card in hand can be sold for +1 CP at any phase the player has the floor

### Hand

- Starting hand: 4 cards
- Hand cap: 6 — over-cap cards auto-sell at end of turn (Discard phase) for +1 CP each
- Deck reshuffle: when the deck is exhausted, the discard pile is shuffled back in

### Card kinds

| Kind | Playable when | Trigger |
|---|---|---|
| `main-phase` | Active player's `main-pre` or `main-post` | Manual |
| `roll-phase` | Active player's `offensive-roll` (between rolls) | Manual |
| `instant` | Any time (auto-prompts both players on qualifying events) | Reactive |

Legacy kinds `upgrade`, `main-action`, `roll-action`, `status` are still in the type union for backward compatibility but new content uses the canonical 3.

### Effect resolver

`resolveEffect(effect, ctx)` in `cards.ts` is the single dispatcher. The same function resolves both card effects and ability effects (they share the `AbilityEffect` shape). Supported kinds:

- `damage` / `scaling-damage` / `reduce-damage`
- `heal` (target self or opponent)
- `apply-status` / `remove-status`
- `gain-cp` / `draw`
- `compound` (sequence of sub-effects)
- `custom` (escape hatch — dispatched through a `registerCustomCard(id, handler)` registry for cards that need bespoke logic)

---

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
  abilityLadder: AbilityDef[];          // any number, across tiers 1-4
  defensiveLadder?: AbilityDef[];       // optional
  cards: Card[];                        // ~12
  onHitApplyStatus?: { status; stacks };  // shorthand for "every landed ability also applies X"
}
```

`PassiveBehavior` is open-shaped: `{ kind: string, [key: string]: unknown }`. The hero declares its kind, the `phases.ts` dispatcher matches on `kind` at the relevant phase boundary, and a custom handler does the work. This lets new heroes introduce new mechanic categories without engine changes.

Heroes register themselves in `src/content/index.ts` (`HEROES: Partial<Record<HeroId, HeroDefinition>>`). The HeroSelect screen, simulator, and dev showcase all read this registry live.

For the full hero-authoring brief — what fields each hero must provide, what the simulator validates, what the renderer/choreographer can consume — see `docs/HERO_REQUIREMENTS.md`.

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
  | { kind: "select-defense"; abilityIndex: number | null }   // defender picks during pendingAttack
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
- `attack-intended`, `defense-intended`, `defense-dice-rolled`, `defense-resolved` — the four-event defensive flow ([§5](#5-ability-ladders))
- `damage-dealt`, `hp-changed`, `heal-applied`
- `status-applied`, `status-ticked`, `status-removed`, `status-triggered`
- `hero-state` (idle/hit/defended/low-hp-enter/low-hp-exit/victorious/defeated)
- `cp-changed`, `counter-prompt`, `counter-resolved`

### The choreographer

`src/components/effects/Choreographer.tsx`. Consumes the event queue from `choreoStore`, plays each event as a timed beat, and gates UI input via `useInputUnlocked()`. The store enqueues events but does not block — UI components disable themselves while the queue drains.

This separation is what gives the game its juice: the engine resolves a turn instantly (a few ms), and the presentation layer takes 2–6 seconds to *show* it — dice tumble, hit-stops, screen shake, status-token slam-ins, ability cinematics.

### The defensive flow as events

When an attack lands, the engine emits a small sequence of events that walk both players through the decision-and-resolution loop:

```
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

The queue drainer subscribes to `choreoStore` at module level (`useChoreoStore.subscribe(() => pump())`), not inside a React `useEffect`. React 18 StrictMode double-invokes effects, which would cancel the pump's own timer mid-flight and deadlock the queue. The module-level subscription survives across re-renders and StrictMode invocations.

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
- Lock decisions (which dice to lock between rolls; weighted by combo proximity)
- Card play timing (main-phase vs. roll-phase windows)

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

## 16. Glossary

- **Active player** — whose turn it currently is (`state.activePlayer`).
- **Attack-intended** — engine event marking the start of the defensive flow; `state.pendingAttack` is set, the engine halts until `select-defense` arrives.
- **Combo** — a dice condition that fires an ability. See [§4](#4-dice--the-combo-grammar).
- **CP** — Combat Points. Shared spendable resource. Cap 15.
- **Defendable damage** — `normal` and `collateral` types; runs through the defensive ladder picker. `undefendable` / `pure` / `ultimate` skip the picker entirely.
- **Defense dice count** — `AbilityDef.defenseDiceCount` (2–5, default 3); how many dice the defender rolls when this defense is picked. Single roll, no rerolls.
- **Defensive ladder** — per-hero set of defensive abilities the defender picks from when attacked. Single-roll resolution per the chosen defense's dice count.
- **Effect** — `AbilityEffect` — what an ability or card does (damage, heal, status, etc.).
- **Event** — `GameEvent` — typed record of one thing that happened during action resolution.
- **Hero snapshot** — `HeroSnapshot` — a player's full live state (HP, CP, dice, hand, deck, statuses, ladder state).
- **Instant** — card kind that auto-prompts after qualifying events; 1.5s response window.
- **Ladder state** — `LadderRowState[]` — UI state for each ability row (firing/triggered/reachable/out-of-reach + lethal flag).
- **Landing rate** — measured % of turns a given ability fires; used by the simulator to validate tuning.
- **Lethal** — a `LadderRowState` flag; `true` when the ability would kill the opponent if it fires.
- **Picker** — the rule that selects which matched ability fires (highest tier matched, then highest base damage among ties).
- **Signature mechanic** — the one mechanically distinct hook a hero owns; data field on `HeroDefinition`.
- **Signature token** — a per-hero status registered on top of the universal pool.
- **Status / token** — interchangeably used for `StatusInstance`. Buff or debuff with stacks + tick behaviour.
- **Tier** — ability tier 1–4; controls placement on the ladder, expected landing rate, and damage envelope.
- **Universal pool** — Burn, Stun, Protect, Shield, Regen — the 5 statuses every hero can apply without registering anything.

---

## See also

- `docs/HERO_REQUIREMENTS.md` — hero-authoring brief; what a hero submission must contain to land cleanly.
- `README.md` — project overview, commands, routes, bundle stats.
- `src/game/types.ts` — the type contract; the canonical source of truth for action / event / state shapes.
- `src/game/engine.ts` — `applyAction` reducer.
- `src/game/phases.ts` — phase transition table and per-phase handlers.
