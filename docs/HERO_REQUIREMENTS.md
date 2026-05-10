# PACT OF HEROES — Hero Creation Requirements

> **You are designing a hero for Pact of Heroes — a 1v1 dice-and-card combat game.** This document is your full brief: the game's constraints, the engine's mechanical primitives, a light originality guideline, the output format, and a self-check list. Read all of it before you start designing. Output the filled-in template at the end.

---

## 1. Project context (what Pact of Heroes is)

Pact of Heroes is a digital, mobile-first 1v1 game built around custom dice and cards. Each hero rolls 5 hero-specific dice (each with 6 faces) on their offensive turn, locks any combination between rolls (up to 3 roll attempts total), and the highest-tier dice combo their hero recognises fires that ability. Cards manipulate dice, modify abilities, or play standalone effects. Match length target: 5–8 minutes, roughly 6–8 turns.

The engine, choreographer, audio, UI, and screens are already built. Heroes are pure data — your spec gets converted into a `HeroDefinition` TypeScript module and dropped into the codebase.

---

## 2. Hard game constants (you cannot change these)

| Constant | Value |
|---|---|
| Starting HP | 30 |
| Max HP | 40 (start + 10 heal cap) |
| Starting CP | 2 |
| Max CP | 15 |
| Starting hand | 4 cards |
| Hand cap | 6 (over-cap auto-sells for +1 CP each at end of turn) |
| Dice per hero | 5 (all identical) |
| Faces per die | 6 (numbered 1 through 6) |
| Roll attempts per offensive turn | 3 |
| Ability tiers | 4 (Tier 1 Basic, Tier 2 Strong, Tier 3 Signature, Tier 4 Ultimate) |
| Cards in hero deck | **exactly 12** (3 dice manipulation + 4 Masteries + 5 signature plays) |
| Masteries per hero | **exactly 4** (1 each for T1 / T2 / T3 / Defensive). T4 ultimates intentionally have **no** Mastery. |

**Selling cards:** any card in hand can be sold for +1 CP at any phase the player has the floor.

---

## 3. Originality guideline

Game mechanics — dice + cards, tier-based abilities, combo grammar, status tokens, hero archetypes (Barbarian, Pyromancer, Paladin, Wizard, Rogue, etc.) — are all common to the genre and free to use. Mainstream fantasy archetypes are welcome.

**The one rule: don't copy creative content word-for-word from another IP.** Specifically, don't reuse another game's exact ability names, card names, or token names verbatim. Pick your own phrasing — even when the underlying mechanic is similar, give it a name that's yours.

That's it. Pick the archetype that excites you, design the kit you want, and just make sure the names on the surface are your own writing rather than lifted strings.

---

## 4. Engine primitives — what mechanics are available

These are the building blocks the engine recognises. Design within these unless you know you need a custom escape hatch (see "Custom logic" at the end).

### 4.1 Combo grammar (dice requirements)

A combo specifies what dice configuration triggers an ability.

| Kind | Meaning | Notes |
|---|---|---|
| `symbol-count` | "N or more dice showing this symbol" | Counts dice whose face has the given symbol — useful when multiple faces share a symbol category |
| `n-of-a-kind` | "N dice all showing the same face value" | Strict face-value match (e.g. 4 sixes). N is 2–5 |
| `straight` | "A run of consecutive face values" | `length: 4` = small straight, `length: 5` = large straight |
| `compound and` | "All of these conditions hold" | Pass an array of sub-combos |
| `compound or` | "Any of these conditions hold" | Same |

**Examples:**
- *"3 dice showing the **slate** symbol"* → `symbol-count: slate, count: 3`
- *"4 dice all showing the same face value"* → `n-of-a-kind, count: 4`
- *"A small straight (4 consecutive values)"* → `straight, length: 4`
- *"3 of the **shell** symbol AND a small straight"* → `compound and: [{symbol-count shell, 3}, {straight 4}]`

### 4.2 Effects (what abilities/cards do)

The complete first-class effect set — designed to express every recurring pattern across heroes without `[custom]` flags.

#### Core effects

| Effect | Meaning |
|---|---|
| `damage` | Fixed damage. Specify `amount` + damage `type`. Optional sub-fields: `self_cost`, `conditional_bonus`, `conditional_type_override` (see below). |
| `scaling-damage` | Damage that scales with how many extra dice contribute beyond the combo's minimum. Specify `baseAmount`, `perExtra`, `maxExtra`, `type`. Same optional sub-fields as `damage`. |
| `reduce-damage` | Defensive — reduce incoming damage. Pick exactly one resolution mode: `amount` (flat reduction), `negate_attack: true` (reduce to 0), or `multiplier: f` with `rounding?: "ceil"\|"floor"` (fractional — `final = round(incoming × f)`; default `ceil` rounds in the attacker's favour, §15.1). Optional `conditional_bonus` (added to `amount`). Card-context Instants firing into a `pendingAttack` queue the reduction onto `pendingAttack.injectedReduction` so it modifies the queued in-flight damage (Aegis of Dawn — Clarification B). |
| `heal` | Heal a target (self or opponent) by `amount`. Optional `conditional_bonus` (added to `amount`). |
| `apply-status` | Apply `stacks` of a status token to target (self or opponent). Optional `conditional_bonus` (added to `stacks`). |
| `remove-status` | Strip stacks from target. `status` accepts a specific StatusId or one of the wildcards `any-debuff` / `any-buff` / `any-status` (legacy `any-positive` aliases `any-buff`). `stacks` accepts `"all"` for full strips. Optional `selection: "player-choice" \| "highest-stack" \| "lowest-stack" \| "longest-active"` resolves multi-status wildcards (§15.7). |
| `gain-cp` | Add `amount` CP to caster (clamped to 15). (No `conditional_bonus` — see note below.) |
| `draw` | Draw `amount` cards. (No `conditional_bonus` — see note below.) |
| `compound` | Multiple effects in sequence — `effects: [...]`. |

#### Dice-manipulation primitives

| Effect | Meaning |
|---|---|
| `set-die-face` | Set `count` dice to a specific face. `filter` selects eligible dice (`"any"`, `{kind:"specific-symbol",symbol}`, `{kind:"specific-face",faceValue}`). `target` is the new face (`{kind:"symbol"}` or `{kind:"face"}`). Covers Iron Focus / Forge / Steady Light. |
| `reroll-dice` | Reroll a filtered subset of the caster's dice once. `filter`: `"all"`, `"not-locked"`, or `{kind:"not-showing-symbols",symbols:[]}`. `ignoresLock?: true` for "Berserker Rage"-style overrides. |
| `face-symbol-bend` | Temporarily count one symbol as another. `from_symbol`, `to_symbol`, `duration: "this-roll" | "this-turn" | {kind:"until-status",status,on:"applied"|"removed"}`. Covers Pelt of the Wolf / Resolve. |

#### Persistent / mastery primitives

| Effect | Meaning |
|---|---|
| `ability-upgrade` | Modify ability properties for the rest of the match (or until end of turn). `scope` selects which abilities (`{kind:"ability-ids"}`, `{kind:"all-tier",tier:N}`, `{kind:"all-defenses"}`). `modifications: [...]` is an array of `{field, operation, value, conditional?}`. `permanent: true` occupies a Hero Upgrade slot. **Used by every Mastery card.** |
| `persistent-buff` | Match-long buff. `id` (unique within snapshot), exactly one of three modifier shapes:<br>• `modifier: AbilityUpgradeMod` + `scope` (or `target: StatusId` for token-field overrides) — modifies ability output. Covers Ancestral Spirits / Crater Wind.<br>• `pipelineModifier: { target: "incoming-damage" \| "outgoing-damage" \| "status-tick-damage", operation: "add" \| "multiply", value, cap? }` — adjusts the damage pipeline directly (§15.3). Covers Sanctuary's "until your next turn, all incoming damage reduced by 2."<br>• `triggerModifier: { triggerEvent, operation: "add" \| "set" \| "multiply", value, targetField: "gain" \| "perStack", condition? }` — rewrites a `cpGainTriggers[]` entry's `gain` / `perStack` when it fires (§15.4). Covers Vow of Service's "Tier 2+ defenses gain +2 Radiance instead of +1."<br>Optional `discardOn` (any shape): `{kind:"damage-taken-from-tier",tier:4}` / `{kind:"status-removed",status}` / `{kind:"match-ends"}` / `{kind:"end-of-self-turn"}` / `{kind:"next-turn-of-self"}` / `{kind:"end-of-any-turn"}` (§15.5). |
| `combo-override` | Temporarily replace selected abilities' combo with a looser one (§15.6). `scope: { kind: "ability-ids", ids: [...] } \| { kind: "all-tier", tier: N }`, `override: DiceCombo`, `duration: "this-turn" \| "this-roll" \| { kind: "until-status", status, on }`. Covers Sunburst's "this turn only, Dawnblade and Sun Strike auto-fire on any sword." |
| `passive-counter-modifier` | Direct manipulation of a signature passive counter (e.g. War Cry adds +3 Frenzy without the "must take damage" trigger). `passiveKey`, `operation: "add"\|"set"`, `value`, optional `respectsCap`. Optional `conditional: StateCheck` gates whether the modifier fires (§15.8 — covers Cathedral Light's "+1 Radiance on 4+ sun"). `value` may be negative for spend-style conversions (Dawnsong burns 2 Radiance for +4 CP — Clarification A); the result clamps to ≥ 0. |

#### Bonus dice primitives

| Effect | Meaning |
|---|---|
| `bonus-dice-damage` | Roll N additional dice (using the caster's hero faces) and deal damage derived from them. `bonusDice`, `damageFormula: "sum-of-faces"|"highest-face"|{kind:"count-symbol",symbol}`, `type`, optional `thresholdBonus: { threshold, bonus }` for "and if sum ≥ N, also do …" patterns. Covers Blood Harvest. |

#### Last resort

| Effect | Meaning |
|---|---|
| `custom` | Escape hatch — describe in plain English, will be hand-written. **Only used when no other primitive fits.** A well-designed hero submission has zero `custom` effects. |

#### Damage sub-fields (apply to `damage` and `scaling-damage` only)

| Sub-field | Meaning |
|---|---|
| `self_cost: N` | Unblockable HP loss to the caster on resolution. Does NOT trigger on-hit signatures or Frenzy/Radiance gains. Used by abilities that bake recoil into the cost (e.g. a hypothetical "13 to opponent + 3 self"). No live shipping ability currently uses `self_cost`; the primitive is supported. |
| `conditional_type_override: { condition, overrideTo }` | Promote damage type (e.g. `"normal"` → `"undefendable"`) when the condition holds. Covers Cleave Mastery's "undefendable when 4+ axes". |

#### Conditional bonus (apply to `damage`, `scaling-damage`, `heal`, `reduce-damage`, `apply-status`)

`conditional_bonus` is the canonical "this amount scales per unit of game state, when this state check holds" primitive. Same schema across all five effects; the bonus is added to the effect's primary numeric field (damage `amount` / scaling base / heal `amount` / reduce `amount` / apply-status `stacks`).

```
conditional_bonus: {
  condition:        <StateCheck>,
  bonusPerUnit:     <number>,
  source:           "opponent-status-stacks" | "self-status-stacks" |
                    "stripped-stack-count" | "self-passive-counter" |
                    "opponent-passive-counter" | "damage-prevented-amount" |
                    "fixed-one",
  sourceStatus?:    StatusId,        // required when source counts a status
  sourcePassiveKey?: string          // required when source counts a passive counter
}
```

Covers Pyro Lance "+2 dmg per Cinder when 3+", Solar Blade "+1 dmg per Verdict stack stripped", Lightbearer's "heal +2 per Radiance token banked", Stoneward's "+1 mitigation per Cinder on opponent", Reaper's "apply 1 base + 2 stacks of Mark when at low HP".

**Not eligible:** `gain-cp` (resource-scaling on cards creates exploit risk — express CP scaling at the resource-trigger layer instead), `draw` (drawing N cards based on game state is rarely a healthy design pattern), `remove-status` (already has an explicit `stacks` count).

#### State-check predicates (used by conditionals + critical conditions)

```
{ kind: "opponent-has-status-min"; status; count }
{ kind: "self-has-status-min";     status; count }
{ kind: "self-stripped-status";    status }     // true when self.lastStripped[status] > 0
{ kind: "self-low-hp" }                          // self.hp <= 25% of hpStart
{ kind: "passive-counter-min";     passiveKey; count }
{ kind: "combo-symbol-count";      symbol; count }   // counts on the firing dice
{ kind: "combo-n-of-a-kind";       count }
{ kind: "combo-straight";          length }
{ kind: "defense-tier-min";        tier }              // §15.4 — true when the firing defensive ability's tier ≥ N
```

#### Damage type semantics

- `normal` — defender picks one defense from their ladder; defense fires if its combo lands on the rolled dice.
- `collateral` — same as normal; flagged as side-effect (e.g. status-tick chained damage).
- `undefendable` — bypasses the defender's pick entirely (defender takes the full hit). Shield / Protect tokens still apply. **Key offensive design lever.**
- `pure` — bypasses everything: defenses, Shield, Protect. Hits HP directly.
- `ultimate` — bypasses the defender's pick AND status-based prevention cards (e.g. Phoenix-Veil-style "halt the hit" effects). Only Shield + Protect tokens and abilities/cards that explicitly target ultimate damage (e.g. Aegis of Dawn) modify it. Reserved for T4. Triggers the full-screen cinematic.

### 4.3 Status tokens (built-in universal pool)

These are pre-registered in the engine. Any hero can apply them.

| Token | Type | Behaviour |
|---|---|---|
| `burn` | debuff | Ticks 1 dmg/stack at holder's upkeep, decrements 1. Stack limit 5. |
| `stun` | debuff | Holder skips their next offensive roll. Single-use, stack limit 1. |
| `protect` | buff | Each token prevents 2 damage on incoming hit. Stack limit 5. |
| `shield` | buff | Reduces incoming damage by 1 per stack flat. Stack limit 3. |
| `regen` | buff | Heals 1 HP/stack at holder's upkeep, decrements 1. Stack limit 5. |

You can also design **your own signature token**. The full signature-token schema includes:

| Field | Meaning |
|---|---|
| `id` | `myhero:tokenName` |
| `displayName` | Player-facing label |
| `type` | `buff` or `debuff` |
| `stackLimit` | Cap. Most tokens use 5; tighter for high-value tokens. |
| `tickPhase` | `"ownUpkeep"` / `"applierUpkeep"` / `"neverTicks"` / `"onTrigger"` |
| `onTick` | Effect per stack at tick — damage, heal, decrement (existing). |
| `onRemove` | Effect when fully stripped — ignition-style finishers. |
| `passiveModifier` | **NEW.** Continuous, non-tick effect while stacks > 0. `scope: "holder"|"applier"`, `trigger: "on-offensive-ability"|"on-defensive-roll"|"on-card-played"|"always"`, `field: "damage"|"defensive-dice-count"|"card-cost"`, `valuePerStack: N`, optional `cap: { min?, max? }`. Covers Frost-bite "-1 dmg / stack on holder's offensive abilities" and Verdict's offensive damage debuff. |
| `detonation` | **NEW.** Threshold trigger. `threshold: N`, `triggerTiming: "on-application-overflow"|"on-holder-upkeep-at-threshold"|"on-event"`, `effect: AbilityEffect`, `resetsStacksTo?: N` (default 0). Covers Cinder's "5 stacks → 8 dmg + reset". |
| `stateThresholdEffects` | **NEW.** Array of `{ threshold, effect, duration }`. `effect` is one of: `{kind:"block-card-kind",cardKind}`, `{kind:"block-ability-tier",tier}`, `{kind:"modify-roll-dice-count",delta}`. `duration: "while-at-threshold"|"next-turn"|"this-phase"`. Covers Verdict's "3+ stacks blocks main-phase + instants on the holder's next Main Phase". |
| `holderRemovalActions` | **§15.2.** Array of `{ phase, cost, effect, oncePerTurn?, ui }`. Player-initiated paid removal — the holder pays the cost during the named phase (`main-pre`, `main-post`, or `main-phase`) to strip stacks. `cost: { resource: "cp" \| "hp" \| "discard-card", amount }`; `effect: { stacksRemoved: "all" \| number, additionalEffect? }`; `ui: { actionName, confirmationPrompt? }`. Covers Verdict's atonement (spend 2 CP during your Main Phase to clear all Verdict stacks). |
| `visualTreatment` | Icon, color, pulse, optional particle for the HUD chip. |

Token names should be descriptive and original — pick your own phrasing rather than lifting names verbatim from another game.

### 4.4 Cards

Every hero ships **exactly 12 cards** in a fixed split:

| Slot | Count | Notes |
|---|---|---|
| Dice manipulation | 3 | Use `set-die-face`, `reroll-dice`, `face-symbol-bend` primitives. |
| Tiered Masteries | 4 | One per T1 / T2 / T3 / Defensive. T4 ultimates have no Mastery. |
| Signature plays | 5 | Mix of `main-phase`, `roll-phase`, `instant` — these carry the hero's tactical identity. |

Card kinds:

| Kind | Playable when |
|---|---|
| `main-phase` | Active player's Main phase only. |
| `roll-phase` | During the active player's Offensive Roll phase OR during the defender's Defensive Roll phase. Card-driven dice changes can flip a failed defensive roll into a success. |
| `instant` | Any time — auto-prompts the holder after a qualifying event (see structured trigger taxonomy below). 1.5s window to respond. |
| `mastery` | Played from the Main Phase. Persistent ability upgrade for the rest of the match — occupies the matching `masteryTier` Hero Upgrade slot. |

Cards have: `id` (slug like `myhero/card-name`), `name`, `cost` in CP (0–5 typical), `kind`, `text` (player-facing rules), `effect` (any of the effect primitives above), and:

- For `mastery` kind: `masteryTier: 1 | 2 | 3 | "defensive"`, `upgradesAbilities: <ability ids>` (validator helper), `occupiesSlot?: true` (default true).
- For `instant` kind: `trigger: <one of the structured triggers below>`.
- Optional presentation: `flavor` (italic line), `fx` (one-line FX brief).

#### Structured Instant trigger taxonomy

```
trigger:
  | { kind: "self-takes-damage";        from?: "offensive-ability"|"status-tick"|"self-cost"|"any" }
  | { kind: "self-attacked";            tier?: AbilityTier|"any" }
  | { kind: "opponent-fires-ability";   tier?: AbilityTier|"any" }
  | { kind: "opponent-removes-status";  status: StatusId }
  | { kind: "opponent-applies-status";  status: StatusId }
  | { kind: "self-ability-resolved";    tier?: AbilityTier|"any" }
  | { kind: "match-state-threshold";    metric: "self-hp"|"opponent-hp"; op: "<="|">="; value: N }
```

Covers Counterstrike (`self-takes-damage`), Phoenix Veil (`self-attacked`), Aegis of Dawn (`opponent-fires-ability` with `tier: 4`), Final Heat (`opponent-removes-status` with the relevant token).

### 4.5 Signature passive

Each hero declares a signature mechanic. Mechanics fall into two flavours:

#### a) Trigger-only counter (Frenzy-style)

A counter that grows on triggers but isn't directly spent — it modifies the hero's profile (e.g. +N damage when stacks ≥ X). Declared via:

```
signatureMechanic.implementation = {
  kind: "<your-name>",
  passiveKey: "frenzy",
  bankCap: 5,                  // optional cap on the counter
}
```

#### b) Bankable resource (Radiance-style)

A counter that grows on triggers AND can be spent at specific moments. Declared via the bankable schema:

```
signatureMechanic.implementation = {
  kind: "<your-name>",
  passiveKey: "radiance",
  bankStartsAt: 2,             // counter starts seeded at match start
  bankCap: 10,                 // optional
  spendOptions: [
    { context: "offensive-resolution",
      costPerUnit: 1,
      effect: { kind: "damage-bonus", perUnit: 2 },        // +2 dmg per token spent
      canSpendPartial: true },
    { context: "defensive-resolution",
      costPerUnit: 1,
      effect: { kind: "reduce-incoming", perUnit: 2 },     // -2 incoming dmg per token
      canSpendPartial: true },
  ],
}
```

When the engine hits a moment where a spend is offered (offensive or defensive resolution, or main-phase on-demand), it sets `state.pendingBankSpend` and the UI shows a spend prompt. The player dispatches `spend-bank { amount }` (or `decline-bank-spend`).

#### CP gain triggers (`resourceIdentity.cpGainTriggers`)

Each entry: `{ on, status?, on_target?, gain, perStack?, capAt? }`. Recognised `on` values:

| Trigger | Meaning |
|---|---|
| `"abilityLanded"` | +N CP when one of your offensive abilities lands. |
| `"successfulDefense"` | +N CP when a defense lands ≥1 reduction. |
| `"selfStatusDetonated"` | +N CP when your `status` detonates on the opponent (Pyromancer Cinder). |
| `"opponentRemovedSelfStatus"` | +N CP per stack the opponent strips off you (with `perStack: true`). Covers Pyromancer "Cinder is stripped → +1 per stack". |
| `"opponentAttackedWithStatusActive"` | +N CP when opponent fires an attack while you have `status` on them (Lightbearer Verdict). |
| `"selfTokenTick"` | +N CP every time `status` ticks on the holder. |
| `"statusTicked"` (legacy) | +N CP when `status` ticks on `on_target` (kept for compatibility). |

Pick one or more.

### 4.6 Defensive ladder (optional, but strongly recommended)

When this hero is attacked, the defender **picks one** defense from this ladder, then rolls a small handful of dice once — no rerolls, no locking. If the chosen defense's combo lands on the rolled dice, the defense fires; if not, the full attack damage goes through unmitigated. The picking decision is the strategic depth — reading the incoming damage type and value, weighing each defense's odds and payoff, then committing.

#### Each defense declares:

| Field | Meaning |
|---|---|
| `tier` | 1–4. Higher tiers usually have richer effects (e.g. reduce + counterattack), lower tiers are reliable mitigation. |
| `name` | Defender-facing name shown on the picker overlay. |
| `combo` | Same combo grammar as offensive abilities (`symbol-count`, `n-of-a-kind`, `straight`, `compound`). |
| `effect` | Typically `reduce-damage`, `heal`, `apply-status` (apply a token to the attacker), or a `compound` of those. |
| `defenseDiceCount` | How many dice the defender rolls when this defense is picked. **2** = quick parry, **3** = standard brace, **4** = full bracing, **5** = bet the farm. Defaults to 3 if unspecified. |
| `shortText` / `longText` | Picker overlay copy. |
| `targetLandingRate` | Tuning band the simulator validates against. |

#### Why a single roll, no rerolls:

Offense gets 3 attempts because the offensive decision tree is *what to roll for*. Defense's decision tree is *which defense to pick* — once chosen, the roll is what it is. This keeps defensive resolution fast (under 2 seconds for the dice tumble + resolution) and makes the up-front pick genuinely consequential. The dice count per ability becomes a thematic lever: a 2-dice defense rolls less but lands often on simple combos; a 4-dice defense can match richer combos but is rarer and feels like the hero "really committed."

#### What can be blocked:

Only `normal` and `collateral` damage runs through the defensive ladder. **Undefendable**, **pure**, and **ultimate** damage skip the defense flow entirely — the defender takes the full hit. (Shield + Protect tokens still apply to undefendable / ultimate, per [§7 in `ENGINE_AND_MECHANICS.md`](./ENGINE_AND_MECHANICS.md#6-damage-pipeline).) This is a key offensive design lever — undefendable abilities are valuable because they bypass the defender's choice entirely.

#### Cards during the defensive roll:

Both players can play `roll-phase` cards during the defender's roll (dice manipulation, single-die sets, etc.) and `instant`-kind cards as always. Card-driven dice changes can flip a failed defensive roll into a success — design space for "save your defensive ace" cards.

#### How many defenses:

**3 is the sweet spot.** Two feels too few (the choice collapses). Four or more dilutes each defense's identity. Aim for three with clearly different shapes — e.g. one "always-on" 2-dice quick parry, one "main wall" 3-dice solid block, one "big swing" 4-dice block-with-counterattack.

#### Fallback if you skip the defensive ladder:

The engine falls back to "1 damage reduced per shield-symbol face the defender rolls (5 dice, no choice)." This works mechanically but is much less interesting — strongly prefer declaring a ladder.

#### Offensive fallback (optional)

A defense may declare an `offensiveFallback` block. When the caster's own offensive turn produces no firing ability, the engine rolls the fallback's `diceCount` once and resolves the fallback `effect` if its combo lands. Useful for "consolation prize" mechanics — e.g. Bloodoath grants heal + a passive stack when offense whiffs.

```
offensiveFallback: {
  diceCount?: 2 | 3 | 4 | 5,        // defaults to the parent defense's defenseDiceCount
  combo?: DiceCombo,                 // defaults to the parent defense's combo
  effect: AbilityEffect,             // typically heal + passive-counter-modifier
}
```

### 4.7 Critical Ultimate (Tier 4 only)

A Tier 4 ability can declare a more-restrictive variant — "Critical Ultimate" — that fires on a tighter dice arrangement than the base combo and produces an enhanced cinematic and/or mechanical bonus.

| Field on the AbilityDef | Meaning |
|---|---|
| `criticalCondition: DiceCombo` | Strictly more restrictive than the base `combo`. When BOTH the base combo and this match, the ability fires with the critical effect. Engine validation expects criticalCondition ⇒ combo. |
| `criticalEffect.cosmeticOnly: true` | No mechanical change, enhanced cinematic only. |
| `criticalEffect.damageMultiplier: N` | Multiply base damage. |
| `criticalEffect.damageOverride: N` | Replace base damage. |
| `criticalEffect.effectAdditions: AbilityEffect[]` | Extra effects on top of the base. |
| `criticalEffect.consumeModifierBonus: N` | Override how the bankable passive is consumed (e.g. a Radiance ability could bump its bonus from +2 dmg / +1 heal to +4 dmg / +2 heal at crit). |
| `criticalCinematic: string` | Free-form brief — what changes from the base cinematic. |
| `ultimateBand: "career-moment"` | The Ultimate's tuning band — 0.5–2% landing rate, 13–18 dmg envelope. All three shipping T4 Ultimates (Wolf's Howl, God's Crater, Judgment of the Sun) use this. The type union also accepts `"standard"` for legacy compatibility, but no shipping hero uses it; new heroes should set `"career-moment"` and gate the T4 on `5× face-6`. |

If your T4 ability is itself a once-per-career special (e.g. requires `5× face-6`), you don't need a separate `criticalCondition` — just set `ultimateBand: "career-moment"` and the validator accepts the lower landing rate. The three shipping heroes follow this pattern: their T4s have no `criticalCondition` / `criticalEffect` blocks, only a `criticalCinematic` brief that plays every time the ability fires.

---

## 5. The four uniqueness pillars (use these to differentiate heroes)

Every hero must be distinct on **all four** axes — otherwise heroes feel interchangeable.

| Pillar | Question to answer |
|---|---|
| **Dice identity** | What do this hero's dice DO differently? Not just different symbols — different probability distributions, different "meanings" per face. What does it feel like to roll these dice? |
| **Resource identity** | How does this hero spend and earn CP? What rewards aggressive play vs. setup play vs. defensive play? |
| **Win-condition identity** | How does this hero intend to close out a match? Burst damage? DOT accumulation? Outlasting? Combo setup? Different heroes should play to different match rhythms. |
| **Signature mechanic** | One thing only this hero does. Not a stat tweak — a genuinely distinct mechanical hook. |

If two heroes' games feel similar — *"I roll for damage, opponent rolls for damage, lower HP loses"* — they've failed.

---

## 6. Tuning targets (for landing rates and damage)

The simulator validates landing rates after implementation. Aim for these bands:

#### Canonical offensive ladder shape

The three shipping heroes (Berserker, Pyromancer, Lightbearer) all follow the same shape: **1× T1 + 3× T2 + 2× T3 + 1× T4 = 7 abilities**. The single T4 is a "career-moment" ultimate gated on `5× face-6` (all 5 dice rolling the unique face-6 symbol of that hero). New heroes should follow the same shape unless there's a strong design reason to deviate — uniformity here keeps tuning legible across the roster.

| Tier | Target landing rate | Damage envelope | Role |
|---|---|---|---|
| **Tier 1 (Basic)** | 75–95% | **3–9 dmg** (extended ceiling for Minor Crit on T1 scaling abilities — e.g. Cleave 4/6/8) | "I always do something" |
| **Tier 2 (Strong)** | 45–80% | 5–9 dmg | "I'm playing well" — note the upper end can stretch when one of the three T2 slots is a low-difficulty `straight-3`-class combo |
| **Tier 3 (Signature)** | 20–45% | 9–13 dmg | Big swing — earned, not expected |
| **Tier 4 (Ultimate)** | 0.5–2% | 13–18 dmg | The single Ultimate — a once-per-career screenshot moment. Set `ultimateBand: "career-moment"`. The canonical pattern is `5× face-6`; the three shipping T4s use it (Wolf's Howl 5×howl, God's Crater 5×ruin, Judgment of the Sun 5×zenith). |

#### Defensive ladder (player-pick model)

These bands assume the defender PICKS one defense — the player has agency to choose the defense whose combo their dice can actually hit.

| Tier | Target landing rate | Role |
|---|---|---|
| **Defensive T1** (safe / common) | 60–80% | Reliable mitigation |
| **Defensive T2** (medium risk-reward) | 35–55% | Bigger payoff, narrower combo |
| **Defensive T3** (high reward, lower frequency) | 20–40% | Counter-attack defenses |

**Damage scaling rationale (30 HP):** average damage per turn should land near 5 HP so matches resolve in 6–8 turns. Single hits at the 13–18 dmg ceiling are reserved for the T4 Ultimate.

**Multi-ability per tier is fine** — heroes can have 2 abilities at the same tier with different combos, or two abilities sharing a combo with different effect profiles. The player picks which matched ability to fire from an overlay (sorted highest-tier-first / highest-damage-first by default). This makes overlapping combos a feature, not a bug — design pairs that frame a real choice.

---

## 6.5 Presentation primitives — what the renderer / choreographer / audio layer can take

The mechanics above (combos, effects, statuses, cards) are the **rules engine** layer. Pact of Heroes also has a **presentation** layer that gives each hero atmospheric weight: a tinted background, a portrait that reacts to game state, glyphs on each die face, per-ability cinematics, and audio cues. None of these are required for a hero to be playable — but a hero that fills them in feels finished.

| Layer | What you can specify |
|---|---|
| **Lore** | Name origin, backstory paragraph, personality, motivation, voice register (gruff / formal / playful / cryptic) |
| **Visual identity** | Accent hex (already in core), secondary palette (1–2 supporting hexes), background motif (tundra / forge / cavern / orchard / observatory / wharf), atmospheric particle behaviour (drift direction, density, hue), silhouette posture (looming / coiled / poised / hunched) |
| **Die-face rendering** | A glyph idea or short SVG description per unique symbol (renderer will produce the actual SVG), a tint hex per symbol |
| **Hero portrait reactive states** | What the portrait does at: full HP / mid HP / low HP (≤10) / when an Ultimate is charging / on victory / on defeat. Can be subtle (eye-glow shift) or dramatic (whole pose change) |
| **Per-ability cinematics** | For each ability: a short camera/FX brief (e.g. "screen tilts left, three vertical slash streaks across centre, opponent flinches right; audio is 3 quick metal-on-bone hits"). Tier 4 should describe a full-screen cinematic moment (1.5–3s) |
| **Audio identity** | A signature one-shot motif (3–6 notes, instrument family), per-event bark line snippets (hero rolls / hero lands T3 / hero lands T4 / hero takes lethal / hero wins), ambient bed under the hero's screen (wind / hearth / dripping / clockwork) |
| **Status visuals** | If you defined a signature token, what it looks like on the HUD (icon idea, animation when applied — slam-in / fade-in / spiral) |

These fields go into the optional **PRESENTATION** block in the template below. Skip any field with `(skip)` if you don't have a strong opinion — defaults will be used.

---

## 7. Required output template

Fill this in for ONE hero. Paste back exactly this format. Sections marked **CORE** are required for a playable hero; sections marked **PRESENTATION** are optional but strongly recommended for a hero that feels finished.

```
=== HERO === [CORE]

ID:           <lowercase-slug>          (e.g. "tide-tracker" — used internally as the hero's key)
NAME:         <DISPLAY NAME>            (all caps)
ARCHETYPE:    <one of: rush | control | burn | combo | survival>
COMPLEXITY:   <1–6>                     (1 = teach-the-game, 6 = expert)
ACCENT:       #xxxxxx                   (primary hex color matching hero's vibe)
QUOTE:        "<one short line>"        (hero's catchphrase)

=== LORE === [PRESENTATION]

Origin:       <one or two sentences — where this hero is from, what shaped them>
Personality:  <one sentence — how they speak, what they value, what cracks them>
Motivation:   <one sentence — why they fight>
Voice:        <gruff | formal | playful | cryptic | weary | feverish | other>

=== VISUAL IDENTITY === [PRESENTATION]

Secondary palette:  #xxxxxx, #xxxxxx           (1–2 hexes that pair with ACCENT)
Background motif:   <tundra | forge | cavern | orchard | observatory | wharf | other>
Particle behaviour: <e.g. "snow drifting down-left, sparse" / "ember sparks rising, dense">
Silhouette posture: <looming | coiled | poised | hunched | sprawled>
Signature motif:    <a recurring visual element — e.g. "frost cracks", "running ink", "candle flames", "tally marks">

=== DICE === [CORE]

Description: <one sentence on the overall feel of this hero's dice>

Face 1: symbol="<id>:<sym-a>"  label="<WordA>"   glyph="<short visual idea>"  tint=#xxxxxx
Face 2: symbol="<id>:<sym-a>"  label="<WordA>"   (faces can share a symbol — same glyph/tint)
Face 3: symbol="<id>:<sym-b>"  label="<WordB>"   glyph="<...>"                tint=#xxxxxx
Face 4: symbol="<id>:<sym-b>"  label="<WordB>"
Face 5: symbol="<id>:<sym-c>"  label="<WordC>"   glyph="<...>"                tint=#xxxxxx
Face 6: symbol="<id>:<sym-d>"  label="<WordD>"   glyph="<...>"                tint=#xxxxxx

(Symbols are hero-scoped strings. Two faces sharing a symbol means
symbol-count treats them interchangeably; n-of-a-kind / straight still
differentiate by faceValue. Glyph + tint are PRESENTATION — skip with
"(skip)" if you don't have a strong idea.)

=== PORTRAIT REACTIVE STATES === [PRESENTATION]

Full HP (>20):       <one line — what does the portrait look like at rest>
Mid HP (10–20):      <one line — first sign of strain>
Low HP (≤10):        <one line — visibly hurt; this is also when "isLowHp" passives may fire>
Ultimate charging:   <one line — what happens when a Tier 4 combo lands and the cinematic is about to play>
Victory pose:        <one line>
Defeat pose:         <one line>

=== SIGNATURE PASSIVE === [CORE]

Name:        <NAME>                    (one or two words)
Description: <one sentence player-facing description>
PassiveKey:  <camelCase key into signatureState — e.g. "frenzy", "radiance">
BankStartsAt: <integer; 0 if the counter starts empty (Frenzy), >0 if seeded (Radiance: 2)>
BankCap:     <integer or "none">
How it fires (plain English): <when does it trigger, what does it do, what state does it manage>

SpendOptions (optional, for bankable resources only):
  - Context:  offensive-resolution | defensive-resolution | main-phase-on-demand
    CostPerUnit: <typically 1>
    Effect: <one of:
              { kind: "damage-bonus", perUnit: N }
              { kind: "heal-self", perUnit: N }
              { kind: "reduce-incoming", perUnit: N }
              <any standard AbilityEffect>>
    CanSpendPartial: true | false

HUD readout: <how is the current state communicated to the player — e.g. "ring of pips around the portrait, 0–5", "small badge under HP showing the threshold", "screen-edge vignette intensifies"> [PRESENTATION]

=== SIGNATURE TOKEN (optional) === [CORE if present]

If your hero has a unique buff/debuff token they apply, describe it here. Otherwise write "(none — uses universal tokens only)".

ID:           <id>:<token-name>
Display name: <NAME>
Type:         buff | debuff
Stack limit:  <number>
Tick behaviour: <one of: holder's upkeep / applier's upkeep / never ticks / on specific trigger>
Effect per stack at tick: <e.g. "1 dmg" / "1 heal" / "n/a — consumed by …">
On-removal effect: <e.g. "+2 final dmg ignition" / "none">

PassiveModifier (optional — continuous effect while stacks > 0):
  Scope:      holder | applier
  Trigger:    on-offensive-ability | on-defensive-roll | on-card-played | always
  Field:      damage | defensive-dice-count | card-cost
  ValuePerStack: <signed integer, e.g. -1>
  Cap:        { min: 0 } | { max: N } | <none>
  // Example (Frost-bite):  scope: holder, trigger: on-offensive-ability,
  //                         field: damage, valuePerStack: -1, cap: { min: 0 }

Detonation (optional — token explodes at threshold):
  Threshold:        <integer stack count>
  TriggerTiming:    on-application-overflow | on-holder-upkeep-at-threshold | on-event
  Effect:           <any standard effect — e.g. { kind:"damage", amount:8, type:"pure" }>
  ResetsStacksTo:   <integer; default 0>
  // Example (Cinder): threshold: 5, on-application-overflow,
  //                    effect: 8 pure dmg, resetsStacksTo: 0

StateThresholdEffects (optional — game-state alterations gated by stacks):
  - Threshold: <integer>
    Effect:    block-card-kind: <main-phase | roll-phase | instant | mastery>
              | block-ability-tier: <T1|T2|T3|T4>
              | modify-roll-dice-count: <delta>
    Duration:  while-at-threshold | next-turn | this-phase
  // Example (Verdict): threshold 3, block-card-kind: main-phase, next-turn.

Visual: <icon idea + slam-in animation — e.g. "dripping red icon, slams in from above with a wet thud"> [PRESENTATION]

=== RESOURCE TRIGGER (optional) ===

How does this hero earn extra CP? Use one or more entries from the structured taxonomy:

  - On: abilityLanded                              Gain: <N>
  - On: successfulDefense                          Gain: <N>
  - On: selfStatusDetonated                        Status: <id>           Gain: <N>
  - On: opponentRemovedSelfStatus                  Status: <id>           Gain: <N>   PerStack: true
  - On: opponentAttackedWithStatusActive           Status: <id>           Gain: <N>
  - On: selfTokenTick                              Status: <id>           Gain: <N>
  - On: statusTicked                               Status: <id>  on_target: opponent|self  Gain: <N>

(PerStack=true multiplies the gain by the number of stacks involved in the
triggering event — e.g. +1 CP per Cinder stack the opponent strips.)

=== OFFENSIVE ABILITY LADDER === [CORE; cinematic field is PRESENTATION]

Specify any number of abilities across tiers 1–4. Each on its own block.

[T1] NAME
  Combo:        <plain English; engine primitive (symbol-count / n-of-a-kind / straight / compound)>
  Effect:       <plain English: damage + statuses + heal etc.>
  Damage type:  <normal | undefendable | pure | ultimate>
  Target land:  <range, e.g. 80–95%>
  ShortText:    <one-line ladder display, e.g. "5 dmg + 1 token">
  LongText:     <plain-language combo description for tooltips>

  Damage sub-fields (optional, on the damage / scaling-damage leaves):
    SelfCost:                  <integer; unblockable HP loss to caster, no on-hit/passive triggers>
    ConditionalBonus:          { condition, bonusPerUnit, source, sourceStatus?, sourcePassiveKey? }
    ConditionalTypeOverride:   { condition, overrideTo: <DamageType> }

  // ConditionalBonus.source examples:
  //    "opponent-status-stacks"   + sourceStatus: "myhero:cinder"
  //    "self-status-stacks"       + sourceStatus: "myhero:resolve"
  //    "stripped-stack-count"     + sourceStatus: "myhero:verdict"
  //    "self-passive-counter"     + sourcePassiveKey: "radiance"
  //    "opponent-passive-counter" + sourcePassiveKey: "frenzy"
  //    "fixed-one"
  // condition is one of the StateCheck shapes (see §4.2).
  // ConditionalBonus also lives on heal / reduce-damage / apply-status —
  // identical schema; bonus is added to amount (heal, reduce-damage) or
  // stacks (apply-status).

  Cinematic:    <2–3 sentences of camera/FX brief — what plays on screen when this fires.
                 Camera move, particle/streak description, hit-stop intensity, opponent reaction.
                 Audio: instrument family + length, e.g. "two short timpani thuds + glass crack">

[T2] NAME
  ... (same fields)

[T3] NAME
  ...

[T4] NAME           (full-screen Ultimate cinematic — make this feel like a moment)
  Cinematic:    <a fuller brief — 1.5–3s of screen time. Letterboxing, slow-mo, signature
                 motif on display, hero bark line, distinct musical sting. This is the
                 highest-budget animation slot for the hero.>
  Bark line:    "<one short line the hero says when this fires>"
  UltimateBand: "career-moment"     (canonical — gates the T4 on `5× face-6` for a 0.5–2% landing rate)
  CriticalCondition: <optional, more-restrictive combo than the base — e.g. "5-of-a-kind ruin">
  CriticalEffect: <optional — pick one or combine:
                   { cosmeticOnly: true } |
                   { damageMultiplier: 2 } |
                   { damageOverride: 22 } |
                   { effectAdditions: [...] } |
                   { consumeModifierBonus: 4 }>
  CriticalCinematic: <optional — what changes from the base cinematic when crit fires>

(Multiple abilities at the same tier are fine — useful for offering
strategic flexibility. After the offensive roll, the **player picks**
which matched ability to fire from a list sorted highest-tier-first /
highest-damage-first. Design the ladder so the player has meaningful
choices: e.g. a high-damage normal attack alongside a lower-damage
undefendable variant, or a single-target T2 alongside a status-applying
T2 that hits the same combo.)

=== DEFENSIVE LADDER (recommended; ~3 defenses) ===

Specify defensive abilities. The defender PICKS one of these when attacked
(it's a real strategic choice, not auto-resolved). They roll the defense's
declared dice count once — no rerolls, no locking. If the combo lands,
the defense fires. Aim for 3 defenses with clearly different shapes.

[D1] NAME
  Combo:           <...>
  Effect:          reduce N dmg + ...
  DiceCount:       <2 | 3 | 4 | 5>      (2=quick parry, 3=standard, 4=full brace, 5=all-in)
  Tier:            <1 | 2 | 3>          (defensive tiers; tier targets land 60–80 / 35–55 / 20–40)
  ShortText:       <one-line picker copy, e.g. "Reduce 4 dmg">
  LongText:        <plain combo + effect description>
  Target landing: <range at the rolled dice count, e.g. 60–75%>

  OffensiveFallback (optional — fires when caster's offensive turn whiffs):
    DiceCount:    <defaults to the parent DiceCount>
    Combo:        <defaults to the parent Combo>
    Effect:       <typically heal + passive-counter-modifier>
    // Example (Bloodoath): heal 4 + add 1 Frenzy stack on offensive whiff.

[D2] NAME      ... (same fields)
[D3] NAME      ... (same fields)

(If skipped entirely, fallback is "1 dmg reduced per shield-symbol face
rolled, 5 dice, no choice." Strongly prefer declaring a ladder.)

Skips defense entirely (defender takes full hit, no roll): undefendable /
pure / ultimate damage. Plan some of your offensive abilities to use these
damage types so the offense has answers to a strong defender.

=== CARDS ===

> **File layout note.** Cards are NOT carried on `HeroDefinition` and are
> NOT defined inside the hero file. They live in their own per-hero card
> module (`src/content/cards/<heroId>.ts`) and are looked up at runtime
> via `getCardCatalog(heroId)`. This separation lets the deck-builder
> swap card lists per match without touching hero data. **Always submit
> cards as a separate block** — the ingestion tool drops them into the
> matching `cards/<heroId>.ts` file, not into the hero module.

The full deck-building system — composition rules (4 / 3 / 3 / 2 by
category), validation, the builder UI, persistence, and how the engine
resolves catalog → deck at match start — is documented in
**[`DECK_BUILDING.md`](./DECK_BUILDING.md)**.

**Hero authoring contract — what to ship in `src/content/cards/<heroId>.ts`.** The deck-builder pulls a 12-card deck from your catalog plus the 4 universal generic cards, so you only ship the *non-generic* portion of the catalog. Minimums:

  3 dice-manip cards         — exact (the player puts ALL 3 in every deck)
  ≥ 4 ladder-upgrade cards   — at least 1 Mastery per slot {T1, T2, T3,
                                Defensive}; ship multiple per slot to
                                give the deck-builder real choice
  ≥ 5 signature cards        — the player picks 2 of these in their deck

(T4 Ultimates intentionally have no Mastery — never ship a
ladder-upgrade with `masteryTier: 4`. The validator rejects it.)

For each card:

CARD: NAME
  ID:     <id>/<card-slug>
  Cost:         <0–5 CP>
  Kind:         main-phase | roll-phase | instant | mastery
  CardCategory: dice-manip | ladder-upgrade | signature
                (Hero cards never use "generic" — that pool lives in
                `src/content/cards/generic.ts` and is mixed in at deck-
                build time, not authored per hero.)
  Text:         <player-facing rules text, one or two sentences>

  Effect: <pick one of the canonical primitives from §4.2:
            damage | scaling-damage | heal | apply-status | remove-status |
            gain-cp | draw | compound |
            set-die-face | reroll-dice | face-symbol-bend |
            ability-upgrade | persistent-buff | passive-counter-modifier |
            bonus-dice-damage |
            custom (last resort — write what you need in plain English)>

  // ── Mastery-only fields (when Kind == "mastery") ────────────────────
  MasteryTier:        1 | 2 | 3 | "defensive"
  UpgradesAbilities:  <ability ids OR "all-tier-N" OR "all-defenses">
  OccupiesSlot:       true                           (default)

  // Mastery effect is always an ability-upgrade. Spell out the modifications:
  // Effect:
  //   ability-upgrade
  //     scope: { kind: "all-tier", tier: 1 } | { kind: "ability-ids", ids: ["Cleave"] }
  //     modifications:
  //       - { field: "base-damage",
  //           operation: "add" | "set" | "multiply",
  //           value: <number or DamageType string>,
  //           conditional?: { kind: "combo-symbol-count", symbol: "...", count: N } }
  //       - { field: "damage-type", operation: "set", value: "undefendable",
  //           conditional: { kind: "combo-symbol-count", symbol: "axe", count: 4 } }
  //     permanent: true
  //
  // (See worked examples in §7.6 below for Cleave Mastery, Northern Storm,
  // Wolfborn etc.)

  // ── Instant-only fields (when Kind == "instant") ───────────────────
  Trigger:  Pick ONE of the structured triggers from §4.4:
              { kind: "self-takes-damage", from?: "..." }
              { kind: "self-attacked", tier?: T4 }
              { kind: "opponent-fires-ability", tier?: T4 }
              { kind: "opponent-removes-status", status: "..." }
              { kind: "opponent-applies-status", status: "..." }
              { kind: "self-ability-resolved", tier?: "..." }
              { kind: "match-state-threshold", metric: "self-hp", op: "<=", value: 8 }

  Flavor: <one short italic line — flavor text shown under the rules text> [PRESENTATION]
  FX:     <one line — what plays when card is played, e.g. "card slides up, glow pulse,
          quick chime"> [PRESENTATION]

(Repeat for each of the 12 cards.)

=== AUDIO IDENTITY === [PRESENTATION]

Signature motif:    <3–6 notes + instrument family — e.g. "low cello drone + 3 ascending
                    plucked notes" / "muted brass triplet falling a fifth">
Ambient bed:        <what plays under this hero's screen when it's their turn — e.g. "low
                    wind + distant bell" / "crackling hearth + slow heartbeat">
Bark — on roll:     "<short line>"
Bark — T3 lands:    "<short line>"
Bark — T4 fires:    "<short line — paired with the cinematic above>"
Bark — taking lethal hit: "<short line>"
Bark — victory:     "<short line>"
Bark — defeat:      "<short line>"

=== TUNING / PLAYTEST NOTES === [PRESENTATION]

Expected play pattern:  <2–3 sentences — what does a typical match with this hero look like?
                        When does the hero feel powerful, when do they feel vulnerable?>
Strong matchups:        <hero archetypes this hero beats — "punishes slow control heroes" / "out-trades burst rush heroes">
Weak matchups:          <hero archetypes this hero struggles into>
Anti-pattern warning:   <one or two ways the hero could feel oppressive or feel-bad if mistuned —
                        flag these for the simulator pass>

=== QUICK REFERENCE CARD === [PRESENTATION]

A one-screen at-a-glance summary of the hero. Used for hero-select and reference sheets.
Format as a tight bulleted list — keep each line short.

NAME · ARCHETYPE · COMPLEXITY
Dice: <one-line summary, e.g. "3 axe / 2 fur / 1 howl">
Win condition: <one line>
Signature: <name + 6-word description>
Tier 1: <name + short>      Tier 2: <name + short>
Tier 3: <name + short>      Tier 4: <name + short>
Standout cards: <2–3 names that define the deck>
"<the hero's catchphrase>"
```

---

## 7.5 Field-by-field cheat sheet — what gets used where

So the writer knows what each field becomes when the hero is implemented:

| Template field | Becomes | Used by |
|---|---|---|
| **HERO** block | `HeroDefinition` in `src/content/heroes/<heroId>.ts` | engine + presentation |
| **CARDS** block | `<HERO>_CARDS: Card[]` in `src/content/cards/<heroId>.ts` (separate file) | `getDeckCards(heroId)` registry |
| ID | `HeroId` slug | routing, save data, debug |
| NAME | `hero.name` | hero-select, banner, action log |
| ACCENT | `hero.accentColor` | UI theming, glows, button accents |
| QUOTE | `hero.signatureQuote` | hero-select info panel |
| Lore.* | render in HeroSelect info panel + How-To-Play hero pages | content pages |
| Visual identity.background motif | drives `registerAtmosphere(heroId, ...)` config | HeroBackground |
| Visual identity.particle behaviour | particle direction / density / hue in atmosphere config | HeroBackground |
| Dice.glyph + tint | drives `FACE_GLYPHS[symbol]` SVG + `FACE_TINT[symbol]` hex | dieFaces.tsx |
| Portrait reactive states | drives `registerSigil(heroId, render)` with state-aware variants | HeroPortrait |
| Signature passive.HUD readout | drives the per-hero status badge near the HP bar | HeroPanel |
| Signature token.Visual | slam-in animation + icon for the token chip | StatusToken component |
| Ability.Cinematic | drives the ability cinematic + AttackEffect for that ability | Choreographer + AbilityCinematic + AttackEffect |
| Ability T4.Bark line | spoken/displayed in the Ultimate cinematic | AbilityCinematic |
| Card.Flavor | italic line under rules text | Card component |
| Card.FX | brief play animation when the card is dropped | choreoStore + Card |
| Audio identity.Signature motif | the hero's musical sting (plays on hero-select highlight + T4) | audio/sfx.ts |
| Audio identity.Ambient bed | looped bed under the match screen for that player's turn | audio/sfx.ts |
| Audio identity.Bark lines | short audio cues at the listed events | sfx + Choreographer |
| Tuning notes | go into the simulator README + PR description | docs |
| Quick reference card | renders as the HeroSelect info panel + how-to-play summary card | HeroSelect |
| SignaturePassive.PassiveKey + BankStartsAt | `signatureState[passiveKey]` is seeded at match start | engine.ts (start-match) |
| SignaturePassive.SpendOptions | engine opens `pendingBankSpend` prompts on offensive/defensive resolution | engine.ts + UI overlay |
| SignatureToken.PassiveModifier | applied to attacker damage / defensive dice count when stacks > 0 | phases.ts (`aggregatePassiveModifiers`) |
| SignatureToken.Detonation | triggers on apply-overflow + emits `status-detonated` | status.ts (`applyStatus`) |
| SignatureToken.StateThresholdEffects | blocks card kinds / ability tiers in `canPlay` | cards.ts |
| ResourceTrigger entries | dispatched at `abilityLanded` / `selfStatusDetonated` / etc. | phases.ts |
| Mastery card | locks `masterySlots[masteryTier]` for the match; `ability-upgrade` effect adds an entry to `abilityModifiers[]` | engine.ts + cards.ts |
| Mastery `ability-upgrade.modifications[].field` | base-damage / damage-type / heal-amount / reduce-damage-amount / defenseDiceCount | phases.ts (`applyModifiersToBaseDamage` etc.) |
| Mastery `modifications[].conditional` | StateCheck evaluated each time the modifier applies | phases.ts (`conditionalMatches`) |
| Damage.SelfCost | unblockable HP loss to caster after the main damage; no on-hit triggers | phases.ts (`resolveAbilityEffect`) |
| ConditionalBonus | per-unit bonus when the StateCheck holds; lives on `damage` / `scaling-damage` / `heal` / `reduce-damage` / `apply-status` | cards.ts (`computeConditionalBonus`) |
| Damage.ConditionalTypeOverride | promotes damage type at resolution time | phases.ts (`resolveAbilityEffect`) |
| Defensive.OffensiveFallback | rolls + resolves when caster's offensive turn produces no ability | phases.ts (`tryOffensiveFallback`) |
| T4.UltimateBand | "career-moment" lets the simulator accept 1–5% landing | scripts/simulate.ts |
| T4.CriticalCondition | additional combo check; when matched, escalates to major crit | phases.ts (`beginAttack`) |
| T4.CriticalEffect | damageMultiplier / damageOverride / effectAdditions / consumeModifierBonus | phases.ts (`applyAttackEffects`) |
| Card.Trigger (instant) | structured taxonomy routes the prompt to the right qualifying event | Choreographer (instant prompt path) |
| `set-die-face` / `reroll-dice` / `face-symbol-bend` | resolved directly by `resolveEffect` | cards.ts |
| `bonus-dice-damage` | resolved by rolling N extra hero faces; threshold bonus chains an effect | cards.ts |

If a field is left as `(skip)`, the renderer falls back to a generic default (concentric-circle portrait, plain dot glyph, default screen-shake hit FX, no bark line, etc.). The hero is still fully playable — just less distinctive.

A well-formed hero submission has **zero `custom` flags** — every mechanic above expresses through one of the listed primitives.

---

## 7.6 Worked examples — applying the new primitives

### Mastery card (single-ability conditional upgrade)

Cleave Mastery — base-damage table change + conditional damage-type promotion:

```
CARD: CLEAVE MASTERY
  ID:     berserker/cleave-mastery
  Cost:   3
  Kind:   mastery
  MasteryTier: 1
  UpgradesAbilities: ["Cleave"]
  Effect: ability-upgrade
    scope: { kind: "ability-ids", ids: ["Cleave"] }
    modifications:
      - { field: "base-damage", operation: "set", value: 5 }                          # 5/7/9 instead of 4/6/8
      - { field: "damage-type", operation: "set", value: "undefendable",
          conditional: { kind: "combo-symbol-count", symbol: "berserker:axe", count: 4 } }
    permanent: true
```

### Mastery card (whole-tier upgrade)

Northern Storm — boost every Tier 2 ability's base damage:

```
Effect: ability-upgrade
  scope: { kind: "all-tier", tier: 2 }
  modifications:
    - { field: "base-damage", operation: "add", value: 2 }
  permanent: true
```

### Mastery card (defensive upgrade with per-defense conditional)

Wolfborn — extra reduction on every defense, plus a stack-bonus on one specific defense:

```
Effect: ability-upgrade
  scope: { kind: "all-defenses" }
  modifications:
    - { field: "reduce-damage-amount", operation: "add", value: 1 }
    - { field: "reduce-damage-amount", operation: "add", value: 2,
        conditional: { kind: "self-has-status-min", status: "berserker:frost-bite", count: 2 } }
  permanent: true
```

### Persistent buff with discard trigger

Ancestral Spirits — +1 dmg on all offensive abilities; cleared by a T4 Ultimate:

```
CARD: ANCESTRAL SPIRITS
  Kind:   main-phase
  Effect: persistent-buff
    id: "ancestral-spirits"
    scope: { kind: "all-tier", tier: 1 }     // also add T2, T3 entries via compound if needed
    modifier: { field: "base-damage", operation: "add", value: 1 }
    discardOn: { kind: "damage-taken-from-tier", tier: 4 }
```

### Conditional damage bonus (per opponent status stack)

Pyro Lance, mastered — +2 dmg per Cinder stack on opponent if opponent has 3+ Cinder:

```
Effect: damage
  amount: 7
  type:   normal
  conditional_bonus:
    condition: { kind: "opponent-has-status-min", status: "pyromancer:cinder", count: 3 }
    bonusPerUnit: 2
    source: "opponent-status-stacks"
    sourceStatus: "pyromancer:cinder"
```

### Conditional bonus (per stripped-stack count)

Solar Blade — +1 dmg per Verdict stack stripped from opponent:

```
Effect: compound
  effects:
    - { kind: "remove-status", status: "lightbearer:verdict", stacks: 99, target: "opponent" }
    - { kind: "damage", amount: 6, type: "normal",
        conditional_bonus: {
          condition: { kind: "self-stripped-status", status: "lightbearer:verdict" },
          bonusPerUnit: 1, source: "stripped-stack-count",
          sourceStatus: "lightbearer:verdict" } }
```

### Self-cost damage

Hypothetical recoil ability — 13 to opponent + 3 unblockable self-damage on the caster:

```
Effect: damage
  amount: 13
  type:   ultimate
  self_cost: 3
```

(No live shipping ability uses `self_cost`; the primitive is illustrated here for hero authors.)

### Conditional heal (scales with banked passive)

Lightbearer's Recovery — heal 0 base + 2 per Radiance token banked, when at least 1 token is held:

```
Effect: heal
  amount: 0
  target: self
  conditional_bonus:
    condition:    { kind: "passive-counter-min", passiveKey: "radiance", count: 1 }
    bonusPerUnit: 2
    source:       "self-passive-counter"
    sourcePassiveKey: "radiance"
```

Reads as "heal 0 base + 2 per stack of Radiance, when stacks ≥ 1." Useful for sustain abilities whose value is gated on the player having committed to the passive's economy.

### Conditional reduce-damage (scales with opponent debuff)

Stoneward — base 2 mitigation + 1 per Cinder on opponent, when opponent has at least 1 Cinder:

```
Effect: reduce-damage
  amount: 2
  conditional_bonus:
    condition:    { kind: "opponent-has-status-min", status: "pyromancer:cinder", count: 1 }
    bonusPerUnit: 1
    source:       "opponent-status-stacks"
    sourceStatus: "pyromancer:cinder"
```

Reads as "reduce 2 base + 1 per stack of Cinder on opponent." Lets defenders punish opponents who have over-stacked debuffs.

### Conditional apply-status (scales with self HP threshold)

Reaper's Mark — apply 1 base stack of Mark + 2 extra when wounded (`self-low-hp`):

```
Effect: apply-status
  status:  reaper:mark
  stacks:  1
  target:  opponent
  conditional_bonus:
    condition:    { kind: "self-low-hp" }
    bonusPerUnit: 2
    source:       "fixed-one"
```

Reads as "apply 1 stack base + 2 stacks if at low HP" — three stacks total when wounded, one when healthy. Ideal for desperation-mode escalations on weaker abilities.

### Critical Ultimate (mechanical, hypothetical)

A hypothetical T4 where rolling an extra restrictive variant doubles damage and escalates a bankable consume — none of the three shipping heroes use this pattern today (their T4s are all "career-moment" with no separate crit), but the engine still supports it for future heroes:

```
[T4] HYPOTHETICAL_BIG_HIT
  Combo:  compound and: [ symbol-count <signature> 2, symbol-count <accent> 1, symbol-count <flex> 2 ]
  Effect: damage 14 ultimate (+ Stun, + spend ALL bank @ 2 dmg / 1 heal each)
  UltimateBand: standard
  CriticalCondition: { kind: "symbol-count", symbol: "<signature>", count: 3 }
  CriticalEffect:
    damageMultiplier: 2
    consumeModifierBonus: 4         # bank bonus becomes +4 dmg / +2 heal each
  CriticalCinematic: extended slow-mo, screen flashes pure white, bark gets layered choir.
```

### Critical Ultimate (cosmetic-only, hypothetical)

Same shape but the crit only changes the cinematic, not the math:

```
[T4] HYPOTHETICAL_COSMETIC_CRIT
  ...
  CriticalCondition: <a strictly more-restrictive variant of the base combo>
  CriticalEffect: { cosmeticOnly: true }
  CriticalCinematic: brighter particle treatment, sharper screen-flash, no damage change.
```

### Career-moment T4 (no separate critical block) — what the three shipping heroes actually do

The canonical pattern: combo gated on `5× face-6` (all 5 dice rolling the unique face-6 symbol). The base combo is already the most-restrictive shape, so no `CriticalCondition` / `CriticalEffect` is needed — only a `CriticalCinematic` brief that plays every time the ability fires.

```
[T4] WOLF'S HOWL                          # Berserker example
  Combo: { kind: "symbol-count", symbol: "berserker:howl", count: 5 }
  UltimateBand: career-moment             # landing ≈0.5–2%
  CriticalCinematic: extended ultimate; anticipation, howl, four spectral
                     ice-wolves manifest, convergence strike, settle.
```

The other two shipping heroes follow the same shape: God's Crater uses `pyromancer:ruin`, Judgment of the Sun uses `lightbearer:zenith`. All three are `ultimateBand: "career-moment"`, none have a separate crit block.

### Bankable spend on offensive resolution

Lightbearer's Radiance, declared in §SIGNATURE PASSIVE:

```
SignatureMechanic.implementation:
  kind: "radiance"
  passiveKey: "radiance"
  bankStartsAt: 2
  spendOptions:
    - { context: "offensive-resolution",  costPerUnit: 1,
        effect: { kind: "damage-bonus",   perUnit: 2 }, canSpendPartial: true }
    - { context: "defensive-resolution",  costPerUnit: 1,
        effect: { kind: "reduce-incoming", perUnit: 2 }, canSpendPartial: true }
```

### Defensive offensive_fallback

Bloodoath — when caster's offense whiffs, heal 4 + add 1 Frenzy stack:

```
[D2] BLOODOATH
  Combo: ...
  Effect: reduce 5 dmg + apply 1 stack berserker:frost-bite to attacker
  DiceCount: 4
  OffensiveFallback:
    DiceCount: 4
    Effect: compound
      effects:
        - { kind: "heal", amount: 4, target: "self" }
        - { kind: "passive-counter-modifier", passiveKey: "frenzy", operation: "add", value: 1 }
```

### Fractional reduce-damage (§15.1)

Aegis of Dawn — Instant, halves an opponent's Tier 4 ultimate (rounds in attacker's favour):

```
CARD: AEGIS OF DAWN
  Kind:    instant
  Trigger: { kind: "opponent-fires-ability", tier: 4 }
  Effect:
    kind:       reduce-damage
    amount:     0                      # required placeholder; mode is set by `multiplier`
    multiplier: 0.5
    rounding:   "ceil"                 # 14 incoming → 7 final, reduction 7
  oncePerMatch: true
```

### Player-initiated paid status removal (§15.2)

Verdict's atonement — declared on the token, no phantom card needed:

```
SIGNATURE TOKEN: lightbearer:verdict
  HolderRemovalActions:
    - Phase: main-phase
      Cost:   { resource: cp, amount: 2 }
      Effect: { stacksRemoved: "all" }
      UI:     { actionName: "Atone",
                confirmationPrompt: "Spend 2 CP to remove all Verdict stacks?" }
```

The HUD chip surfaces an "Atone" button during Main-pre / Main-post; tapping it dispatches `Action: { kind: "status-holder-action", status: "lightbearer:verdict" }`. Engine emits `status-removal-by-holder-action` plus the standard `status-removed`.

### Pipeline modifier (§15.3)

Sanctuary — until next turn, all incoming damage reduced by 2:

```
CARD: SANCTUARY
  Kind:   main-phase
  Effect:
    kind: persistent-buff
    id:   "sanctuary"
    pipelineModifier:
      target:    "incoming-damage"
      operation: "add"
      value:     -2
      cap:       { min: 0 }
    discardOn: { kind: "next-turn-of-self" }
```

### Trigger modifier (§15.4)

Vow of Service — until end of match, Tier 2+ defenses gain +2 Radiance instead of +1:

```
CARD: VOW OF SERVICE
  Kind:   main-phase
  Effect:
    kind: persistent-buff
    id:   "vow-of-service"
    triggerModifier:
      triggerEvent: "successfulDefense"
      operation:    "set"
      value:        2
      targetField:  "gain"
      condition:    { kind: "defense-tier-min", tier: 2 }
    discardOn: { kind: "match-ends" }
```

### Combo-override (§15.6)

Sunburst — this turn only, Dawnblade and Sun Strike each deal +2 damage and auto-fire on any sword:

```
CARD: SUNBURST
  Kind:   main-phase
  Effect:
    kind: compound
    effects:
      - kind:     combo-override
        scope:    { kind: "ability-ids", ids: ["Dawnblade", "Sun Strike"] }
        override: { kind: "symbol-count", symbol: "lightbearer:sword", count: 1 }
        duration: "this-turn"
      - kind:     persistent-buff
        id:       "sunburst-damage"
        scope:    { kind: "ability-ids", ids: ["Dawnblade", "Sun Strike"] }
        modifier: { field: "base-damage", operation: "add", value: 2 }
        discardOn: { kind: "end-of-self-turn" }
```

### Wildcard remove-status (§15.7)

Apostasy — remove 1 negative-status stack from self:

```
Effect:
  kind:   remove-status
  status: "any-debuff"
  stacks: 1
  target: "self"
```

The wildcard branch also accepts `stacks: "all"` for full strips — that's the right call when the ability is meant to be a wholesale cleanse rather than a targeted bleed-off.

Ash Mirror — strip 1 positive status from attacker, player's choice:

```
Effect:
  kind:      remove-status
  status:    "any-buff"
  stacks:    1
  target:    "opponent"
  selection: "player-choice"
```

### Combo-gated passive-counter-modifier (§15.8)

Cathedral Light Mastery — Wall of Dawn's reduction becomes 10, and on 4+ sun the defense also grants +1 Radiance:

```
Effect: ability-upgrade
  scope: { kind: "ability-ids", ids: ["Wall of Dawn"] }
  modifications:
    - { field: "reduce-damage-amount", operation: "set", value: 10 }
  permanent: true

# Wall of Dawn's effect tree (declared on the AbilityDef, modified by the mastery above):
Effect: compound
  effects:
    - { kind: "reduce-damage", amount: 8 }       # bumped to 10 by the mastery
    - kind:        passive-counter-modifier
      passiveKey:  "radiance"
      operation:   "add"
      value:       1
      respectsCap: true
      conditional: { kind: "combo-symbol-count", symbol: "lightbearer:sun", count: 4 }
```

### Spend-style passive-counter-modifier (Clarification A)

Dawnsong — burn 2 Radiance for +4 CP:

```
Effect: compound
  effects:
    - { kind: "passive-counter-modifier", passiveKey: "radiance",
        operation: "add", value: -2, respectsCap: true }
    - { kind: "gain-cp", amount: 4 }
```

`operation: "add"` accepts negative values; the resulting counter clamps to ≥ 0.

### Bonus-dice damage

Blood Harvest — roll 3 bonus dice, deal sum as damage; bonus if sum ≥ 14:

```
Effect: bonus-dice-damage
  bonusDice: 3
  damageFormula: "sum-of-faces"
  type: normal
  thresholdBonus:
    threshold: 14
    bonus: { kind: "heal", amount: 3, target: "self" }
```

---

## 8. Self-check before submitting

Run through this list. If you can't answer "yes" to all of them, redesign.

- [ ] Ability names, card names, and token names are my own phrasing — not lifted verbatim from another game.
- [ ] Deck contains **exactly 12 cards**: 3 dice manipulation, 4 Masteries (one each T1/T2/T3/Defensive — never T4), 5 signature plays.
- [ ] Every Mastery card uses the `ability-upgrade` primitive (no plain-English "modifies X" notes).
- [ ] Every dice-manipulation card uses one of `set-die-face` / `reroll-dice` / `face-symbol-bend` (no plain-English "set this die" notes).
- [ ] Every Instant card declares a structured `trigger` from §4.4's taxonomy.
- [ ] Signature token (if any) uses the structured fields — `passiveModifier`, `detonation`, or `stateThresholdEffects` instead of plain-English Notes.
- [ ] Bankable signature passive (if any) declares `passiveKey`, `bankStartsAt`, and `spendOptions[]`.
- [ ] CP gain triggers use the structured `on:` enumeration (no freeform "+1 CP whenever …" prose).
- [ ] Offensive ladder follows the canonical **1× T1 + 3× T2 + 2× T3 + 1× T4** shape, totaling 7 abilities. T4 is `ultimateBand: "career-moment"` and gated on `5× face-6` (all five dice rolling the hero's unique face-6 symbol). No separate `criticalCondition` — the base combo is already the apex roll.
- [ ] Every defensive ability declares its `defenseDiceCount` (2–5). Ladder has 3 defenses with clearly different shapes.
- [ ] Zero `[custom]` flags except for genuinely one-off mechanics that no primitive captures.
- [ ] The four uniqueness pillars (dice identity, resource identity, win-condition identity, signature mechanic) all answer different questions. The hero would feel mechanically distinct from any other I might design.
- [ ] Damage numbers fit the 30-HP-match envelope. T1 basics 3–7, T4 ultimates 13–18.
- [ ] Each ability's combo uses an engine primitive (symbol-count / n-of-a-kind / straight / compound). Custom logic is flagged with `[custom]` and described in plain English.

---

## 9. Tone note

The hero you design should feel **distinctive**, **mechanically interesting**, and **fun to play repeatedly** — not just a stat block. The dice rolls should *mean something* (not just "more damage"), the cards should reinforce the hero's identity, and the signature mechanic should be the thing players remember about them.

Aim to surprise. The most-played heroes in any game are ones with a memorable hook — a single mechanical signature that's both readable in 30 seconds and fun to play with for 30 hours.

---

## 10. Output format

Paste the filled-in template (section 7) directly back to the user. They'll forward it to a separate tool that turns it into TypeScript hero data, validates landing rates against the simulator, and reports any tuning issues for you to address.

Just one hero per submission. If you want to design multiple heroes, design them one at a time — each gets its own simulator pass before the next one is started.
