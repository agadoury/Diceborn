# Engine: Rules

> Companion to [`./README.md`](./README.md). Covers
> the player-facing game rules + the engine layer that resolves them: match
> loop, phase progression, dice + combo grammar, ability ladders, damage
> pipeline, status system. For the cards/effects layer see
> [`cards.md`](./cards.md); for engine architecture (reducer, events,
> choreographer, AI, simulator) see [`runtime.md`](./runtime.md).

## 1. Game overview

Pact of Heroes is a 1v1 dice-and-card duel. Each player picks a hero, draws a starting hand, and takes alternating turns. On the active player's turn they roll five hero-specific dice (up to 3 attempts, locking dice between rolls). When the roll ends, every ability whose combo currently matches is offered to the player, who **picks one to fire** (or passes). For defendable damage, the defender then **picks one defense** from their ladder, rolls that defense's dice once (no rerolls, no locking), and the combo lands or fizzles. Both players play cards from their hand throughout to bend dice, modify abilities, apply tokens, or trigger reactive effects.

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
│   Upkeep → Income → Main-pre → Offensive Roll → (defender's      │
│         pause: pendingAttack → defender picks defense → engine   │
│         auto-rolls + applies damage) → Main-post → Discard       │
│                                                                  │
│ The phase named `defensive-roll` is the *defender's* pause       │
│ window during the attacker's turn — not a symmetric phase the    │
│ active player goes through. The active player's turn never       │
│ stops in `defensive-roll` on its own behalf.                     │
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
| `defensive-roll` | **Interactive (defender's pause window).** Engine emits `attack-intended` and halts via `state.pendingAttack`. The defender picks one defense from their drafted defensive loadout (`activeDefense`) (or "take it"); the engine rolls the chosen defense's dice count once **inside the same dispatch** (no rerolls, no separate roll action, no `pendingDefenseRoll`), evaluates, applies any reduction, then resolves the original ability's damage. Both players may play `roll-phase` and `instant` cards during this window. The phase is a *defender* state during the attacker's turn — the active player never enters it on their own behalf. | **Yes — defender picks a defense via `select-defense`** (or the AI driver does so off-turn) |
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

`evaluateLadder(hero, snapshot)` returns `LadderRowState[]` — one row per ability in the snapshot's `activeOffense` (the player's drafted 4-ability loadout). Each row is one of:

- `{ kind: "firing", tier, lethal }` — this is the ability that will actually fire (highest tier matched, then highest base damage among ties)
- `{ kind: "triggered", tier, lethal }` — this combo is matched, but a higher-tier match is also matched, so it won't fire
- `{ kind: "reachable", tier, probability, lethal }` — not currently matched, but reachable within remaining roll attempts (probability is from a tiny per-row Monte Carlo)
- `{ kind: "out-of-reach", tier }` — not reachable from current locked dice + remaining attempts

The same evaluator backs the player's live ladder UI and the AI's planning — guaranteeing identical understanding of what's possible.

`lethal: true` means the ability would kill the opponent if it fires.

---

## 5. Ability ladders

### Catalog vs. live ladder (loadout drafted pre-match)

Each hero declares two ladders' worth of authored content:

- `abilityCatalog: AbilityDef[]` — every offensive ability the hero
  can field. Typically ≥4 (at least one per tier), often more so the
  player has a draft choice at most tiers.
- `defensiveCatalog?: AbilityDef[]` — every defensive ability the
  hero can field. Typically ≥2.

Pre-match the player drafts a 4-ability offensive **loadout** (one per
tier T1–T4) and a 2-ability defensive loadout from these catalogs. The
in-match live ladder is the drafted loadout, materialised onto:

- `HeroSnapshot.activeOffense: AbilityDef[]` (length 4)
- `HeroSnapshot.activeDefense: AbilityDef[]` (length 2)

The engine's reads — picker, ability resolution, defensive flow,
ladder evaluator — all index into these snapshot arrays. The catalog
is only consulted at `start-match` (to materialise the loadout) and
by the simulator's landing-rate audit (which keeps every authored
ability in tuning band even when not drafted).

See [`../design/loadouts.md`](../design/loadouts.md) for the full
loadout system — composition rules, builder UI, validation,
persistence, and engine touchpoints.

### Offensive ladder (live, post-draft)

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

1. Evaluates every ability in the **drafted offensive loadout** (`activeOffense`) against the current dice (with active symbol bends applied).
2. Emits `offensive-pick-prompt` carrying the full list of matches, sorted highest-tier-first then highest-base-damage-first.
3. Halts via `state.pendingOffensiveChoice`. The active player sees the **AttackSelectLayer** overlay and dispatches `select-offensive-ability { abilityIndex }` (or `null` to pass).

If zero abilities match, the engine skips the prompt entirely — the turn fizzles, and any `offensiveFallback` defense is consulted before transitioning to `main-post`.

Because the loadout enforces one ability per offensive tier, the picker surfaces at most one match per tier. The choice between same-tier alternatives in the catalog happens pre-match in the LoadoutBuilder, not on the dice tray. (Multi-match scenarios are still possible when, say, a T2 and a T3 both match — that's the normal "do I commit to the bigger swing?" question the picker is designed for.)

### Tier semantics

| Tier | Role | Target landing rate | Damage envelope |
|---|---|---|---|
| 1 — Basic | "I always do something" | 75–95% | 3–9 dmg (extended ceiling for Minor Crit on T1 scaling abilities) |
| 2 — Strong | "I'm playing well" | 45–80% | 5–9 dmg |
| 3 — Signature | Big swing — earned | 20–45% | 9–13 dmg |
| 4 — Ultimate | Once-per-career screenshot — gated on `5× face-6` | 0.5–2% | 13–18 dmg |

Each hero ships **exactly one T4 Ultimate**, gated on rolling all five dice on its face-6 symbol. The Ultimate triggers a full-screen cinematic moment via the choreographer (`ultimate-fired` event). The AbilityDef tags `ultimateBand: "career-moment"`; the simulator validates against the matching landing band. (The type union still permits a legacy `"standard"` value for backward compatibility, but no shipping hero uses it — all three live T4s are `"career-moment"`.)

### Critical Ultimate (Correction 6 §12)

A Tier 4 ability can declare a more-restrictive variant — `criticalCondition: DiceCombo` — that, when matched on top of the base combo, fires the ability with an enhanced cinematic + optional mechanical bonus (`criticalEffect: { cosmeticOnly | damageMultiplier | damageOverride | effectAdditions | consumeModifierBonus }`). The crit class is escalated to `"major"` so the choreographer plays the harder-hitting cinematic. See `phases.ts beginAttack` for the matcher and `applyAttackEffects` for the consumer.

### Defensive ladder (interactive — Correction 5)

The hero's `defensiveCatalog` is the pool; the defender's drafted 2-ability loadout (`HeroSnapshot.activeDefense`) is what surfaces in the picker at match time. Unlike the offensive ladder, the defender **picks** which defense to attempt — there is no auto-picker. After the active player's offensive ability is locked in, the engine emits `attack-intended` and halts on `state.pendingAttack`. The defender then dispatches `select-defense { abilityIndex }` (index into `activeDefense`):

1. **Pick** one defense from their ladder (or `null` = take the hit undefended).
2. The engine — in the **same dispatch** — rolls the chosen defense's `defenseDiceCount` dice **once** (no rerolls, no locking, no separate roll action).
3. `comboMatchesFaces(combo, rolledFaces)` checks whether the combo lands on the rolled dice.
4. If it lands, the defense's effect resolves (`reduce-damage` reduces the incoming hit; `heal` self-heals; `apply-status` applies a token to the attacker).
5. The original offensive ability's damage applies with the computed reduction.

**Event trace.** A single `select-defense` dispatch produces this event sequence (plus any sub-effects from the defensive ability):

```
defense-intended       ← which defense was chosen + diceCount + abilityName
defense-dice-rolled    ← descriptors for the rolled dice
defense-resolved       ← landed/missed + final reduction + matched ability name
damage-dealt           ← residual damage applies through `applyAttackEffects`
hp-changed             ← defender's HP delta
```

The choreographer plays them out as a paced sequence (banner → tumble → match/miss banner → damage). `state.pendingAttack` is cleared at the end of the dispatch, *before* the choreographer plays anything — so any UI logic that needs to know "a defense is in flight" must also inspect the queued/playing event types, not just `pendingAttack` (see `MatchScreen.DefenseTray` + `DefenseStatusPanel`).

**There is no manual ROLL action for defense.** An earlier iteration split `select-defense` and `roll-defense-dice` into two dispatches with a `pendingDefenseRoll` halt; that has been collapsed back into a single inline resolve.

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

