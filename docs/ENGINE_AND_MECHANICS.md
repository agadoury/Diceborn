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

Diceborn is a 1v1 dice-and-card duel. Each player picks a hero, draws a starting hand, and takes alternating turns. On the active player's turn they roll five hero-specific dice (up to 3 attempts, locking dice between rolls). When the roll ends, every ability whose combo currently matches is offered to the player, who **picks one to fire** (or passes). For defendable damage, the defender then **picks one defense** from their ladder, rolls that defense's dice once (no rerolls, no locking), and the combo lands or fizzles. Both players play cards from their hand throughout to bend dice, modify abilities, apply tokens, or trigger reactive effects.

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
| `offensive-roll` | Active player rolls dice (up to 3 attempts; can lock/unlock between rolls; can play `roll-phase` cards). When the player ends their roll, engine emits `offensive-pick-prompt` listing every matched ability and halts via `state.pendingOffensiveChoice`. The player **picks** which ability to fire (or passes) via `select-offensive-ability`. | **Yes — lock dice, play cards, then pick which attack to fire** |
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

### Picker rules (Correction 7 — interactive)

When the active player ends their offensive roll, the engine **does not auto-pick**. Instead it:

1. Evaluates every ability in the ladder against the current dice (with active symbol bends applied).
2. Emits `offensive-pick-prompt` carrying the full list of matches, sorted highest-tier-first then highest-base-damage-first.
3. Halts via `state.pendingOffensiveChoice`. The active player sees the **AttackSelectLayer** overlay and dispatches `select-offensive-ability { abilityIndex }` (or `null` to pass).

If zero abilities match, the engine skips the prompt entirely — the turn fizzles, and any `offensiveFallback` defense is consulted before transitioning to `main-post`.

The prompt-list ordering matches the legacy auto-pick (highest-tier highest-damage first), so confirming the top entry reproduces the old behaviour. The picker exists so the player can deliberately choose a lower-tier or alternate damage-type ability when that's the better play (e.g. a high-damage normal attack vs. a lower-damage undefendable).

### Tier semantics

| Tier | Role | Target landing rate | Damage envelope |
|---|---|---|---|
| 1 — Basic | "I always do something" | 75–95% | 3–9 dmg (extended ceiling for Minor Crit on T1 scaling abilities) |
| 2 — Strong | "I'm playing well" | 45–70% | 5–9 dmg |
| 3 — Signature | Big swing — earned | 20–45% | 9–13 dmg |
| 4 — Ultimate (standard) | Once or twice per match | 8–25% | 13–15 dmg |
| 4 — Ultimate (career-moment) | Once-per-career screenshot | 1–5% | 15–18 dmg |

Tier 4 triggers a full-screen cinematic moment via the choreographer (`ultimate-fired` event). Career-moment is opted-in by setting `ultimateBand: "career-moment"` on the AbilityDef — the simulator validates against the matching landing band.

### Critical Ultimate (Correction 6 §12)

A Tier 4 ability can declare a more-restrictive variant — `criticalCondition: DiceCombo` — that, when matched on top of the base combo, fires the ability with an enhanced cinematic + optional mechanical bonus (`criticalEffect: { cosmeticOnly | damageMultiplier | damageOverride | effectAdditions | consumeModifierBonus }`). The crit class is escalated to `"major"` so the choreographer plays the harder-hitting cinematic. See `phases.ts beginAttack` for the matcher and `applyAttackEffects` for the consumer.

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

**Offensive fallback (Correction 6 §7):** any defense in the ladder may declare an `offensiveFallback: { diceCount?, combo?, effect }`. When the caster's *own* offensive turn ends without producing a firing ability, the engine rolls the fallback's dice once and resolves the fallback effect if its combo lands — useful for "consolation prize" mechanics like Bloodoath (heal + a passive stack on offensive whiff). See `phases.ts tryOffensiveFallback`.

---

## 6. Damage pipeline

Damage is computed in two layers:

1. **`phases.ts resolveAbilityEffect`** — composes the *amount and type* by walking the ability's effect tree, applying ability modifiers (masteries / persistent buffs) per scope, passive token modifiers (e.g. Frost-bite -1 dmg / stack), conditional bonuses, conditional type overrides, the bankable-passive bonus (e.g. Radiance +2 dmg / token spent), and crit modulation.
2. **`damage.ts dealDamage`** — applies *mitigation* against the resulting amount: Shield → Protect → defensive-roll reduction → HP. Self-cost damage on the caster runs through this same pipeline as `pure` (bypasses everything).

### Order of operations on incoming damage

`dealDamage(source, target, amount, type, defensiveReduction)`:

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

### `reduce-damage` resolution modes (§15.1)

`reduce-damage` exposes three mutually exclusive resolution modes — exactly one must be set:

- `amount: N` — flat reduction. Original behaviour.
- `negate_attack: true` — reduce incoming to 0 (per Pyromancer §14.2).
- `multiplier: f` — fractional reduction. `final damage = round(incoming × f)`; the reduction itself is `incoming − final`. Round mode controlled by `rounding`: `"ceil"` (default — rounds in the attacker's favour, i.e. more damage gets through) or `"floor"` (rounds in the defender's favour). Pairs cleanly with Aegis-of-Dawn-style ultimate counters: a 14-dmg ultimate becomes 7, an 18-dmg career-moment becomes 9.

Card-context resolution (Instants firing into a `pendingAttack`) and defensive-ladder resolution share the same branching logic — see `cards.ts resolveEffect: case "reduce-damage"` and `phases.ts resolveDefensiveEffect: case "reduce-damage"`. **Clarification B:** when an Instant resolves `reduce-damage` mid-attack, the engine reads `pendingAttack.incomingAmount` and queues the computed reduction on `pendingAttack.injectedReduction`; the defensive resolver picks it up in `resolveDefenseChoice`. Aegis of Dawn (`opponent-fires-ability tier:4`) therefore modifies the queued in-flight damage before HP is touched.

### Card-applied pipeline modifiers (§15.3)

`persistent-buff.pipelineModifier` lets cards inject a continuous adjustment into the damage pipeline without backing it with a phantom signature token. Sanctuary's "until your next turn, all incoming damage reduced by 2" registers on the caster's `pipelineBuffs[]`; `phases.ts aggregatePipelineModifiers(holder, target, base)` walks those buffs at defensive resolution and folds the adjusted delta into the final reduction. `target` selects the pipeline stage: `incoming-damage`, `outgoing-damage`, or `status-tick-damage`. `operation` is `add` (sum) or `multiply` (compose), with optional `cap: { min?, max? }` per-buff clamping.

### Card-applied trigger modifiers (§15.4)

`persistent-buff.triggerModifier` lets cards rewrite a `cpGainTriggers[]` entry's `gain` or `perStack` field on a per-fire basis. Vow of Service's "Tier 2+ defenses gain +2 Radiance instead of +1" registers as `triggerEvent: "successfulDefense"`, `operation: "set"`, `value: 2`, `targetField: "gain"`, `condition: { kind: "defense-tier-min", tier: 2 }`. The dispatcher (`phases.ts applyTriggerModifiersToTrigger`) consults `triggerBuffs[]` whenever the matching trigger fires; the gating `condition` (a `StateCheck`) is evaluated at fire time with the firing-ability tier passed through.

### Healing

`heal(target, amount)` clamps to `hpCap` (start + 10). Emits `heal-applied` + `hp-changed` + low-HP-exit if applicable. The `heal` effect itself accepts an optional `conditional_bonus` (same shape as the damage-side version) so heals can scale with banked passives, opponent state, or stripped stacks.

### Conditional bonus (cross-effect primitive)

`conditional_bonus` is the canonical "this amount scales per unit of game state, when this state check holds" primitive. It lives on five effect kinds:

| Effect | Field that scales |
|---|---|
| `damage` | `amount` |
| `scaling-damage` | base amount (added on top of dice-extras scaling) |
| `heal` | `amount` |
| `reduce-damage` | `amount` (defensive mitigation) |
| `apply-status` | `stacks` |

`gain-cp`, `draw`, and `remove-status` deliberately do **not** accept `conditional_bonus` — `gain-cp` would create resource-scaling exploits (express CP scaling at the resource-trigger layer instead), `draw` is rarely a healthy design pattern, and `remove-status` already takes an explicit stack count.

Resolution is uniform: when the `condition` (a `StateCheck`) holds, the engine adds `bonusPerUnit × source-units` to the relevant numeric field. Sources: `opponent-status-stacks` / `self-status-stacks` / `stripped-stack-count` / `self-passive-counter` / `opponent-passive-counter` / `damage-prevented-amount` / `fixed-one`. Implemented by `computeConditionalBonus` in `cards.ts`, called from both card-context (`resolveEffect`) and ability-context (`resolveAbilityEffect`, `resolveDefensiveEffect`).

`damage-prevented-amount` is set by `reduce-damage` at resolve time on the caster's `signatureState["__damagePrevented"]`. Reflective effects (Phoenix-Veil-style "1 stack of status per damage prevented") read from this source on a sibling `apply-status` in the same compound effect.

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

Heroes can register their own status definitions on top of the universal pool. The hero's content module calls `registerStatus(...)` once at module load. Signature tokens get the same machinery as universals — apply, tick, strip, on-removal — plus three richer hooks added in Correction 6:

| Field | Behaviour |
|---|---|
| `passiveModifier` | Continuous, non-tick effect while stacks > 0. `scope: "holder" \| "applier"`, `trigger: "on-offensive-ability" \| "on-defensive-roll" \| "on-card-played" \| "always"`, `field: "damage" \| "defensive-dice-count" \| "card-cost"`, `valuePerStack`, optional `cap: { min?, max? }`. Aggregated by `phases.ts aggregatePassiveModifiers` when computing damage. |
| `detonation` | Threshold trigger. `threshold`, `triggerTiming: "on-application-overflow" \| "on-holder-upkeep-at-threshold" \| "on-event"`, `effect: AbilityEffect`, `resetsStacksTo` (default 0). Wired in `status.ts applyStatus` — emits `status-detonated`, marks `signatureState["__pendingDetonation:<id>"]` so the engine can chain the detonation effect. |
| `stateThresholdEffects[]` | Array of `{ threshold, effect, duration }`. `effect` is one of `block-card-kind`, `block-ability-tier`, or `modify-roll-dice-count`. Read by `cards.ts canPlay` to gate plays while the holder is at threshold. |
| `holderRemovalActions[]` (§15.2) | Array of `{ phase, cost, effect, oncePerTurn?, ui }`. Player-initiated paid removal — the holder spends `cost.resource` (`cp` / `hp` / `discard-card`) during the named `phase` (`main-pre`, `main-post`, or `main-phase` shorthand) to strip stacks. `effect.stacksRemoved` is `"all"` or a numeric count; `effect.additionalEffect` rides along (e.g. atone heals 1 HP per stripped stack). Engine resolves via `Action: { kind: "status-holder-action"; status; actionIndex? }` and emits `status-removal-by-holder-action`. The classic example is Verdict's atonement ("spend 2 CP during your Main Phase to remove all Verdict stacks"). |

`stripStatus` records the stacks-removed count on `holder.lastStripped[status]` so downstream conditional bonuses (e.g. "+1 dmg per stack stripped") can read it in the same resolution.

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
| `roll-phase` | Active player's `offensive-roll` OR defender's `defensive-roll` | Manual |
| `instant` | Any time (auto-prompts the holder on qualifying events) | Structured trigger |
| `mastery` | Active player's main phase | Manual; locks `masterySlots[masteryTier]` for the rest of the match |

Legacy kinds `upgrade`, `main-action`, `roll-action`, `status` are still in the type union for backward compatibility but new content uses the canonical four.

### Deck composition validator

`cards.ts validateDeckComposition` enforces Correction 6 §9: exactly 12 cards, exactly 4 Masteries (one each for T1 / T2 / T3 / Defensive). T4 ultimates intentionally have no Mastery — power lives at the curve peak. The validator returns a list of issues; an empty list means the deck is conformant.

### Instant trigger taxonomy (Correction 6 §5)

`CardTrigger` is a structured union. The choreographer's instant-prompt path inspects each playable Instant's trigger to decide whether the just-played event qualifies:

| Trigger kind | When it qualifies |
|---|---|
| `self-takes-damage` | Any `damage-dealt` to the holder. Optional `from`: `"offensive-ability"` / `"status-tick"` / `"self-cost"` / `"any"`. |
| `self-attacked` | An `attack-intended` targeting the holder. Optional `tier`. |
| `opponent-fires-ability` | Any `ability-triggered` by the opponent. Optional `tier`. |
| `opponent-removes-status` | A `status-removed` (reason `"stripped"`) targeting the holder for the named status. |
| `opponent-applies-status` | A `status-applied` to the holder for the named status. |
| `self-ability-resolved` | A `damage-dealt` from the holder's ability. Optional `tier`. |
| `match-state-threshold` | HP crosses a threshold. `metric: "self-hp" \| "opponent-hp"`, `op: "<=" \| ">="`, `value`. |

### Effect resolver

`resolveEffect(effect, ctx)` in `cards.ts` is the single dispatcher. The same function resolves both card effects and ability effects (they share the `AbilityEffect` shape). Supported kinds:

**Core**
- `damage` / `scaling-damage` — carry optional `self_cost`, `conditional_bonus`, `conditional_type_override` sub-fields ([§6](#6-damage-pipeline))
- `reduce-damage` — defensive ladder only; carries optional `conditional_bonus` (per-unit bonus reduction)
- `heal` (target self or opponent) — carries optional `conditional_bonus` (per-unit bonus heal)
- `apply-status` — carries optional `conditional_bonus` (per-unit bonus stacks)
- `remove-status` — `status` accepts a specific StatusId or one of the wildcard categories `any-debuff` / `any-buff` / `any-status` (legacy `any-positive` aliases `any-buff`); `stacks` accepts `"all"` for full strips; optional `selection: "player-choice" | "highest-stack" | "lowest-stack" | "longest-active"` resolves multi-status wildcards (§15.7).
- `gain-cp` / `draw` (intentionally not eligible for `conditional_bonus`)
- `compound` (sequence of sub-effects)

**Dice manipulation (Correction 6 §3)**
- `set-die-face` — set N dice to a specific face, with filter + target shapes
- `reroll-dice` — reroll a filtered subset once; optional `ignoresLock`
- `face-symbol-bend` — temporarily count one symbol as another (this-roll / this-turn / until-status)

**Persistence**
- `ability-upgrade` — push an `ActiveAbilityModifier` onto the caster; applied during `phases.ts resolveAbilityEffect` whenever the firing ability matches the modifier's scope
- `persistent-buff` — pick exactly one of three modifier shapes:
  - `modifier` (existing) — `AbilityUpgradeMod` applied to abilities matching `scope` (or to the named token's mechanical fields when `target` is a StatusId).
  - `pipelineModifier` (§15.3) — adjusts the damage pipeline directly (`incoming-damage` / `outgoing-damage` / `status-tick-damage`).
  - `triggerModifier` (§15.4) — rewrites a `cpGainTriggers[]` entry's `gain` / `perStack` when it fires, optionally gated by a `StateCheck`.
  - All three honour `discardOn`. The `discardOn` taxonomy is `damage-taken-from-tier` / `status-removed` / `match-ends` / `end-of-self-turn` / `next-turn-of-self` / `end-of-any-turn` (§15.5). The turn-bounded variants are evaluated by `cards.ts tickTurnBuffs` from `engine.ts passTurn`.
- `passive-counter-modifier` — direct `signatureState[passiveKey]` manipulation. Optional `conditional` `StateCheck` gates whether the modifier fires (§15.8) — used by combo-gated Mastery effects like Cathedral Light's "+1 Radiance on 4+ sun." **Clarification A:** `operation: "add"` accepts negative values for spend-style conversions (Dawnsong burns 2 Radiance for +4 CP). The result clamps to ≥ 0; there is no separate `"subtract"` operation.
- `combo-override` (§15.6) — relax the combo requirement on selected abilities for `this-turn` / `this-roll` / until a status applies/removes. Distinct from `face-symbol-bend` (which rewrites symbols on dice); this rewrites the *combo* the engine matches against. Sunburst's "Dawnblade and Sun Strike auto-fire on any sword this turn" expresses with `scope: ability-ids ["Dawnblade", "Sun Strike"]`, `override: { kind: "symbol-count", symbol: "lightbearer:sword", count: 1 }`, `duration: "this-turn"`. The picker (`beginOffensivePick`), the ladder evaluator (`evaluateLadder`), and reachability all consult `dice.ts effectiveCombo` so the override is honoured everywhere a combo is checked.

**Bonus dice**
- `bonus-dice-damage` — roll N extra hero faces; deal damage by `sum-of-faces` / `highest-face` / `count-symbol`; optional `thresholdBonus` chains a follow-up effect

**Last resort**
- `custom` (escape hatch — dispatched through a `registerCustomCard(id, handler)` registry; a well-formed hero submission has zero of these)

### Modifier evaluation pipeline

When an ability fires, `phases.ts resolveAbilityEffect` walks the effect tree and for each `damage` / `scaling-damage` leaf (heal / reduce-damage / apply-status leaves run a slimmer bonus-only pass — no crit / token / type modifiers):

1. Read the base amount.
2. Apply `ability-upgrade` modifiers whose scope matches the firing ability (`base-damage`, `damage-type`, `defenseDiceCount`, etc.); evaluate any `conditional` StateCheck.
3. Apply `passive-token-modifier` aggregation (Frost-bite -1 dmg / stack on `on-offensive-ability + damage`).
4. Apply the leaf's `conditional_bonus` (per-unit damage; `source` ∈ `opponent-status-stacks` / `self-status-stacks` / `stripped-stack-count` / `self-passive-counter` / `opponent-passive-counter` / `fixed-one`).
5. Apply the leaf's `conditional_type_override` (e.g. normal → undefendable when 4+ axes).
6. Apply crit modulation (`critFlat` + `critMul`) and the firing ability's Critical Ultimate `damageMultiplier` / `damageOverride` if `critTriggered`.
7. Pass the resulting amount + type into `damage.ts dealDamage` for mitigation.
8. If the leaf carries `self_cost`, deal that amount as `pure` damage to the caster (no on-hit / passive triggers).

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

- **Ability modifier** — entry in `HeroSnapshot.abilityModifiers[]` from a Mastery, persistent buff, or `ability-upgrade` effect. Applied during damage resolution when its scope matches the firing ability.
- **Active player** — whose turn it currently is (`state.activePlayer`).
- **Attack-intended** — engine event marking the start of the defensive flow; `state.pendingAttack` is set, the engine halts until `select-defense` arrives.
- **Bankable passive** — signature passive with a `signatureState` counter that the player can spend at named contexts (offensive/defensive resolution / main-phase-on-demand) per the hero's `spendOptions`.
- **Combo** — a dice condition that fires an ability. See [§4](#4-dice--the-combo-grammar).
- **Conditional bonus** — `damage` / `scaling-damage` sub-field that adds per-unit bonus damage when a `StateCheck` holds.
- **Critical Ultimate** — a Tier 4 ability's `criticalCondition` matched on top of the base combo; escalates the cinematic and applies `criticalEffect` modifiers.
- **CP** — Combat Points. Shared spendable resource. Cap 15.
- **Defendable damage** — `normal` and `collateral` types; runs through the defensive ladder picker. `undefendable` / `pure` / `ultimate` skip the picker entirely.
- **Defense dice count** — `AbilityDef.defenseDiceCount` (2–5, default 3); how many dice the defender rolls when this defense is picked. Single roll, no rerolls.
- **Defensive ladder** — per-hero set of defensive abilities the defender picks from when attacked. Single-roll resolution per the chosen defense's dice count.
- **Detonation** — token-level "explode at threshold" hook. Triggered on `applyStatus` overflow.
- **Mastery** — persistent ability upgrade card. Each hero ships exactly 4 (T1 / T2 / T3 / Defensive). Locks the corresponding slot in `HeroSnapshot.masterySlots`.
- **Offensive fallback** — a defense's optional consolation effect that fires when the caster's offensive turn produces no ability.
- **Offensive picker** — the player-driven choice of which matched ability to fire, gated by `state.pendingOffensiveChoice`. Replaces the legacy auto-pick (Correction 7).
- **Passive modifier** — token-level continuous adjustment applied while stacks > 0 (e.g. Frost-bite -1 dmg / stack on holder's offensive abilities).
- **State threshold effect** — token-level gating that blocks card kinds / ability tiers / dice count when the holder is at or above a stack threshold.
- **Symbol bend** — temporary `from_symbol → to_symbol` aliasing applied during combo evaluation. Active for one of: this-roll, this-turn, until-status.
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
