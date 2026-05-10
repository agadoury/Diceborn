# Worked examples — applying the engine primitives

> Companion to [`./hero-spec.md`](./hero-spec.md).
> Reference patterns for each effect primitive, lifted from real
> abilities and cards. Use these as starting points when designing a
> new hero — most fresh ideas slot into one of these shapes.

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

