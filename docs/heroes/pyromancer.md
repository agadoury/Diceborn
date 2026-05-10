# The Pyromancer

| Field | Value |
|---|---|
| **ID** | `pyromancer` |
| **Archetype** | burn |
| **Complexity** | 3 |
| **Accent color** | `#F97316` |
| **Signature quote** | "The mountain remembers everything I burn." |
| **Source** | [`src/content/heroes/pyromancer.ts`](../../src/content/heroes/pyromancer.ts) |

The Pyromancer is the Burn archetype — a glass-cannon builder whose entire
identity is Cinder pressure. Every offensive ability she lands ticks +1
Cinder onto the opponent (+1 more if the firing roll has 3+ ember). At 5
stacks, Cinder detonates for 8 undefendable damage (12 with Crater Wind).
Her CP economy is built on the opponent's choice — defuse Cinder (paying
her +1 CP per stack stripped) or race the detonation.

---

## 1. Lore

| Beat | |
|---|---|
| **Origin** | Trained at a peaceful temple of fire-keepers, learning to nurture flames in stone hearths. When the Conclave came and put her temple to the torch, she walked alone into the crater of Mt. Yeshren. She emerged three days later with her eyes glowing magma-orange and her shadow burning faintly even in darkness. |
| **Personality** | Speaks rarely, in fragments. Her voice has a faint hiss to it — like ember on stone. Withdrawn but not broken; the cinders she leaves behind do most of the talking. |
| **Motivation** | The Conclave. She wants the names of those who gave the order, and the means to walk into their halls the way they walked into hers. |
| **Voice** | weary contralto with an ember-hiss undertone |

---

## 2. Visual identity

| Field | Value |
|---|---|
| Secondary palette | `#7C2D12`, `#FBBF24` |
| Background motif | volcanic crater interior |
| Particle behaviour | rising embers, dense — when opponent's Cinder reaches 4+, embers darken and drift toward them; at 5 (critical mass), embers race en masse to telegraph the detonation |
| Silhouette posture | poised |
| Signature motif | glowing crack patterns on UI elements, ash-drift on cards/dice, subtle heat-distortion around the portrait |

### Portrait reactive states

| State | Description |
|---|---|
| Full HP (>20) | Three-quarter view, arms crossed, robes hanging in long folds. Eyes glow amber. A faint shadow burns at her feet. Right hand holds a small ember between two fingers. |
| Mid HP (10–20) | First sign of strain — heat distortion intensifies, eyes narrow, the ember in her hand burns brighter (compensation). |
| Low HP (≤7) | Persistent worry overlay — eyes dim noticeably, hands shake slightly, breath becomes shallow and visible. The ember flickers as if struggling. The contrast with her Tier-4 cataclysmic damage is the design point. |
| Ultimate charging | Screen darkens to 25%, portrait scales 1.4× and centers. Heat distortion intensifies. For God's Crater: ash-clouds visibly thicken; lava in the distance erupts in a single massive plume. |
| Victory pose | Triumphant — head lifted, eyes blazing, the ember in her hand becomes a roaring flame. |
| Defeat pose | Single ember-puff fading to silence. Flame in her hand goes out. No words. |

---

## 3. Dice

2 ash / 2 ember / 1 magma / 1 ruin. Steady stream of low-tier hits with
rare big swings on the magma + ruin faces.

| Face | Symbol | Label | Glyph | Tint |
|---|---|---|---|---|
| 1 | `pyromancer:ash`   | Ash    | falling ash specks                | `#7C2D12` |
| 2 | `pyromancer:ash`   | Ash    | (same as face 1)                  | `#7C2D12` |
| 3 | `pyromancer:ember` | Ember  | glowing ember with halo           | `#7C2D12` |
| 4 | `pyromancer:ember` | Ember  | (same as face 3)                  | `#7C2D12` |
| 5 | `pyromancer:magma` | Magma  | cracked stone with magma veins    | `#F97316` |
| 6 | `pyromancer:ruin`  | Ruin   | volcanic pillar with rays         | `#FBBF24` |

---

## 4. Signature passive — ASHFALL

| Field | Value |
|---|---|
| Implementation kind | `ashfall` |
| Bankable | No (event-driven, not stack-driven) |

**Mechanic.** Every offensive ability the Pyromancer lands applies +1
Cinder to the opponent. If the firing roll has 3+ ember faces, the
sparks bonus adds +1 more Cinder.

**Implementation.** Folded into each offensive ability's effect tree —
every offensive ability includes an `apply-status` of Cinder with a
`conditional_bonus` adding +1 stack when `combo-symbol-count ember ≥ 3`.
No engine-side dispatcher; the pattern is data only.

**Exclusions.**
- Failed offensive turns (no ability landing) do not apply Cinder.
- Card-applied Cinder (Char) does **not** trigger the sparks bonus —
  it's offensive-ability-only.
- Defensive Cinder application (Magma Shield's reflect) doesn't trigger
  the sparks bonus either.

---

## 5. Signature token — Cinder

| Field | Value |
|---|---|
| ID | `pyromancer:cinder` |
| Type | debuff |
| Stack limit | 5 |
| Tick phase | `neverTicks` |
| On-removal | none |

### Detonation

| | |
|---|---|
| Threshold | 5 |
| Trigger timing | `on-application-overflow` |
| Effect | 8 undefendable damage to holder |
| Resets stacks to | 0 |

When applying Cinder would push the holder past 5 stacks, the engine
fires the detonation inline (`status.ts → resolveDetonationEffect`):
8 undefendable damage to the holder, stacks reset to 0. **Crater Wind**
(signature play) bumps detonation amount from 8 to 12 by adding a
`tokenOverride` for `detonation-amount` on the Pyromancer's snapshot.

When detonation fires, the engine dispatches the `selfStatusDetonated`
resource trigger on the applier (the Pyromancer): +2 CP, capped to the
global 15 CP ceiling.

---

## 6. Resource triggers

| Trigger | Status | Gain | Notes |
|---|---|---|---|
| `selfStatusDetonated` | `pyromancer:cinder` | +2 CP | Fires when her Cinder detonates on the opponent. |
| `opponentRemovedSelfStatus` | `pyromancer:cinder` | +1 CP per stack | Fires when an opponent strips her Cinder (perStack: true). |

The dual triggers form a "win-win" economy: detonation grants a
big CP burst (her defining moment, doubled), while strip-cleanse pays
her per stack stripped. Opponents pay either way.

---

## 7. Offensive ladder

Canonical shape: 1× T1 + 3× T2 + 2× T3 + 1× T4. The T4 is gated on
`5× face-6` (here: 5 ruin), making it a career-moment ultimate. Volcanic
Rain (a previously-listed second T4) was removed during the unification.

### T1 · Ember Strike

| Field | Value |
|---|---|
| Combo | `symbol-count: pyromancer:ash, count 3` |
| Damage type | normal |
| Effect | scaling-damage 3 / +2 per extra / max 2 extras → **3 / 5 / 7**, then ASHFALL Cinder |
| Target landing | 75–95% (validated 84.1%) |
| ShortText | "3/5/7 dmg + Cinder" |

### T2 · Firestorm

| Field | Value |
|---|---|
| Combo | `compound and [ash×2, ember×1, magma×1]` |
| Damage type | normal |
| Effect | 5 dmg + ASHFALL Cinder (base +1 = 2 stacks; +1 if 3+ ember) |
| Target landing | 45–70% |

### T2 · Obsidian Burst

| Field | Value |
|---|---|
| Combo | `compound and [magma×1, ash×2, ember×1]` |
| Damage type | undefendable |
| Effect | 7 unblockable + ASHFALL Cinder + apply `pyromancer:defense-handicap-1` (opponent's next defense rolls 1 fewer die) |
| Target landing | 45–70% |

`defense-handicap-1` is registered with `consumesOnDefensiveRoll: true`
— the engine ticks one stack off when the opponent's next defense
fires, so the penalty is single-use.

### T2 · Ember Wall

| Field | Value |
|---|---|
| Combo | `symbol-count: pyromancer:ember, count 3` |
| Damage type | normal |
| Effect | 4 dmg + 2 Cinder (+1 if 4+ ember) + 1 Shield to self |
| Target landing | 45–70% |

### T3 · Magma Heart

| Field | Value |
|---|---|
| Combo | `symbol-count: pyromancer:ash, count 4` |
| Damage type | normal |
| Effect | 8 dmg + ASHFALL Cinder (base +1 = 2 stacks) |
| Target landing | 20–45% |

### T3 · Pyro Lance

| Field | Value |
|---|---|
| Combo | `compound and [ruin×1, magma×2]` |
| Damage type | undefendable |
| Effect | 9 unblockable + ASHFALL Cinder. Crater Heart adds +2 dmg per Cinder when opponent has 3+. |
| Target landing | 20–45% |

The Crater Heart upgrade uses the new structural Mastery field
`damage-conditional-bonus` to *create* a `conditional_bonus` on Pyro
Lance's damage leaf — the base ability ships without one.

### T4 · God's Crater (career-moment)

| Field | Value |
|---|---|
| Combo | `symbol-count: pyromancer:ruin, count 5` (all 5 dice on face 6) |
| Damage type | ultimate |
| Effect | Stun + 11 ultimate + push Cinder to 5 (fires detonation for 8, or 12 with Crater Wind) |
| Target landing | 0.5–2% (rare-roll career-moment ultimate) |

There is no separate `criticalCondition` / `criticalEffect` block — the
5-ruin gate is already the apex roll. The cinematic stinger plays every
time it fires (see `criticalCinematic` in the live data file).

The "force detonation" at the end of the effect tree leans on the
detonation dispatch wiring — applying 5 Cinder pushes the opponent to
the threshold and the engine fires the inline detonation effect on
the same resolution.

---

## 8. Defensive ladder

### D1 · Magma Shield

| Field | Value |
|---|---|
| Combo | `symbol-count: pyromancer:ember, count 1` |
| Defense dice | 3 |
| Effect | reduce-damage 3 + apply 1 Cinder to attacker |
| Target landing | 60–80% (validated 70.3%) |

Uses the new `apply_to_attacker` sub-field on `reduce-damage` (a single
primitive instead of a compound).

### D2 · Disperse

| Field | Value |
|---|---|
| Combo | `compound and [magma×1, ember×1]` |
| Defense dice | 4 |
| Effect | `reduce-damage` with `negate_attack: true` (full negation) |
| Target landing | 35–55% (validated 38.1%) |

The Mountain's Patience Mastery patches the baseline 0-stack apply-status
inside Disperse via `applied-status-stacks-on-success` to land 2 Cinder
on the attacker on a successful negation.

### D3 · Ash Mirror

| Field | Value |
|---|---|
| Combo | `compound and [ruin×1, ash×1]` |
| Defense dice | 3 |
| Effect | reduce-damage 5 + remove-status `any-positive` 1 stack from attacker |
| Target landing | 20–40% (validated 25.0%) |

`any-positive` is a wildcard the engine resolves to the attacker's
first buff-type status (deterministic for now; multi-status player
choice is a UI follow-up).

---

## 9. Cards

The full per-card listing for the Pyromancer — IDs, costs, kinds,
categories, slots, once-per-match flags, and rules text — lives in
**[`../cards/pyromancer.md`](../cards/pyromancer.md)**.

For the deck-building system as a whole (composition rules, the
builder UI, persistence, the validator), see
[`../DECK_BUILDING.md`](../DECK_BUILDING.md).

The Pyromancer ships 13 cards total: 3 dice-manip, 5 ladder-upgrade
Masteries (2 T1 / 1 T2 / 1 T3 / 1 Defensive — the two T1 options
fork the build between sustain Cinder pressure and Phoenix-Form
self-heal), and 5 signature plays.

---

## 10. Audio identity

| Slot | Description |
|---|---|
| Signature motif | Low cello drone + 3 hissed/ember notes. Volcanic-rumble undercurrent on the third note. |
| Ambient bed | Crackling hearth + slow heart-rhythm thump + occasional distant volcanic rumble. Thump intensifies if opponent has Cinder at 4+. |
| Bark — on roll | (silent — soft hiss as she ignites a fresh ember) |
| Bark — T3 lands | "Burn." (Pyro Lance) / "Ash and ember." (Magma Heart) |
| Bark — T4 fires | "BURN ALL OF IT." (God's Crater) — audio peak of her entire kit. |
| Bark — taking lethal hit | (single ember-puff fading to silence — no words) |
| Bark — victory | "The mountain remembers." (quiet, almost prayerful) |
| Bark — defeat | (silent — flame in her hand goes out) |

**Voice direction.** Contralto, slightly lower than expected for the
archetype. Faint hiss + slight crackle. She speaks in fragments. The
contrast between silence and rare full lines makes those moments feel
weighty. Should sound like someone who has nothing left to say to anyone.

---

## 11. Tuning / playtest notes

**Expected play pattern.** 7–9 turn matches (longer than Berserker due
to her setup-heavy economy). Early game (turns 1–3): Ember Strike applies
1–2 Cinder per turn, building toward critical mass. Mid-game (turns
4–6): the opponent must decide — defuse (feeding her CP) or race.
Crater Wind played around turn 4–5 turns every detonation into 12 damage.
Late game (turns 7+): rely on sustained Cinder-pressure with Phoenix
Veil + steady detonations whittling the opponent down. The 5-ruin
career-moment God's Crater is rare enough that it should be treated as
a screenshot moment, not a scheduled close — most matches end via the
detonation economy alone.

**Strong matchups.** Punishes attrition tanks (Berserker — Cinder
ignores Frenzy; Lightbearer — strip Radiance via Ash Mirror).

**Weak matchups.** Cheap Cinder strip or burst rush before Crater Wind
sets up. Glass-cannon HP pool means burst can finish her before her
Cinder economy comes online.

**Anti-pattern warning.** At 6 CP with Crater Wind + 4 Cinder, a single
Ember Strike + ASHFALL push to 5 → detonation = 12 dmg end-of-match
swing. Watch for "Final Heat lock" — if opponents stop trying to remove
Cinder because of Final Heat's punishment, the card becomes worthless
($3 deterrent). Consider upgrading Final Heat's trigger to
`opponent-attempts-remove-status` (the engine now supports it) so the
attempt itself is taxed even when the opponent decides to abort.

---

## 12. Quick reference

```
THE PYROMANCER · BURN · COMPLEXITY 3
Dice: 2 ash / 2 ember / 1 magma / 1 ruin
Win condition: Build Cinder to critical mass (5) → 8/12 dmg detonation. Closes via attrition.
Signature: Ashfall — every offensive hit applies +1 Cinder (+1 if 3+ ember).
Ladder shape (canonical): 1× T1 + 3× T2 + 2× T3 + 1× T4.
Tier 1: Ember Strike (3+ ash, 3/5/7 + Cinder, ~84%)
Tier 2: Firestorm / Obsidian Burst / Ember Wall (45–70%)
Tier 3: Magma Heart / Pyro Lance (20–45%)
Tier 4: God's Crater (5 ruin = all 5 dice on face 6, 0.5–2%)
Token: Cinder (debuff, max 5 — never ticks; detonates at 5 for 8 ub, 12 with Crater Wind)
Standout cards: Char, Crater Wind, Phoenix Veil
"The mountain remembers everything I burn."
```

---

## 13. Engine touchpoints

| Concern | Engine site |
|---|---|
| Cinder detonation effect dispatch | `status.ts → resolveDetonationEffect` (inline damage to holder, with `detonation-amount` token override) |
| `selfStatusDetonated` resource trigger | `status.ts → applyStatus` after detonation block, dispatches via the wired `setHeroLookup` |
| `opponentRemovedSelfStatus` (perStack) resource trigger | `cards.ts → dispatchOpponentRemovedSelfStatusTrigger` (synchronous strip path) and `engine.ts → respondToStatusRemoval` (deferred-interception finalisation) |
| ASHFALL Cinder + sparks bonus | data only — `apply-status` with `conditional_bonus { combo-symbol-count ember ≥ 3, source: fixed-one }` |
| Crater Wind's detonation override | `tokenOverrides` on the Pyromancer's snapshot, read by `applyTokenOverrideNumeric` |
| Crater Heart's structural conditional_bonus on Pyro Lance | `phases.ts → applyConditionalBonusStructuralMod` (new `damage-conditional-bonus` Mastery field) |
| Mountain's Patience adding Cinder on Disperse success | `applied-status-stacks-on-success` synonym in defensive resolver |
| Magma Shield's reflect-status pattern | `reduce-damage.apply_to_attacker` sub-field |
| Disperse / Phoenix Veil full negation | `reduce-damage.negate_attack` |
| Phoenix Veil's "1 Cinder per damage prevented" | `damage-prevented-amount` ConditionalSource, set on `caster.signatureState.__damagePrevented` by `reduce-damage` |
| Phoenix Veil's "no Ultimates" gate | `playCondition.kind: "incoming-attack-damage-type"` in `canPlay` |
| Ash Mirror's `any-positive` wildcard | `cards.ts → findFirstBuffStatusId` resolves to the first buff on the target |
| Obsidian Burst's defense-handicap-1 token | `consumesOnDefensiveRoll` flag on `StatusDefinition`; defensive resolver consumes via `aggregatePassiveModifiers("on-defensive-roll", "defensive-dice-count")` |

---

## 14. Known gaps / follow-ups

- **Final Heat punishment style.** Current data uses `opponent-removes-status` (post-strip damage). The engine now also supports `opponent-attempts-remove-status` + `prevent-pending-status-removal`, which would allow Final Heat to literally preserve the Cinder while still punishing the attempt — closer to the original spec. Switching is a one-line trigger change in the card data.
- **`any-positive` UI choice.** The wildcard currently strips deterministically (the first buff in iteration order). If multiple buffs are present, a player-choice UI would be a quality-of-life follow-up.
- **Detonation dispatch supports `damage` only.** Other detonation effect kinds (apply-status / heal / compound) fall through silently. Cinder is `damage` so it works; future tokens with non-damage detonations need an extension.
- **Volcanic Awakening overlap.** Per the spec author, Firestorm's `combo-symbol-count magma 1` gate also matches Obsidian Burst — both T2 abilities pick up the +6/+3-Cinder buff. If strict per-ability disambiguation is wanted later, split into two `ability-upgrade` mods scoped per ability id.
