# The Lightbearer

| Field | Value |
|---|---|
| **ID** | `lightbearer` |
| **Archetype** | survival |
| **Complexity** | 2 |
| **Accent color** | `#FBBF24` |
| **Signature quote** | "Dawn breaks always." |
| **Source** | [`src/content/heroes/lightbearer.ts`](../../src/content/heroes/lightbearer.ts) |
| **Cards** | [`src/content/cards/lightbearer.ts`](../../src/content/cards/lightbearer.ts) |

The Lightbearer is the Survival archetype — a sun-priest who treats prayer
and warfare as the same discipline. He banks **Radiance** by being hit
(starts at 2, caps at 6) and spends it for offensive damage, self-healing,
or defensive mitigation. His signature debuff **Verdict** chips at the
opponent's offense (-2 dmg/stack, max 4) and locks their main-phase /
instant card plays at 3+ stacks. Closes matches with Judgment of the Sun
spending the entire bank for 14 + 2/Radiance ultimate damage.

---

## 1. Lore

| Beat | |
|---|---|
| **Origin** | Sun-priest of the Cathedral of First Light. Trained from childhood in both prayer and warfare, he treats them as the same discipline. When the Cathedral was sacked by the Conclave, he survived because he was kneeling alone in the inner sanctum. The light spared him; now he carries it. |
| **Personality** | Speaks deliberately, always after a pause. Warm voice, warmer eyes that close in meditation between exchanges. Never raises his voice — when he speaks, the words land. |
| **Motivation** | He intends to walk into the Conclave's halls the way they walked into his Cathedral. With less ceremony, but no less light. |
| **Voice** | formal — warm baritone with cathedral acoustics, slight reverb as if from a vaulted chamber |

---

## 2. Visual identity

| Layer | Note |
|---|---|
| **Secondary palette** | `#F59E0B`, `#FFFBEB` |
| **Background motif** | observatory (cathedral sunburst window with gold-light beams) |
| **Particle behaviour** | dust motes drifting upward in shafts of golden light; on Radiance gain, motes briefly intensify and swirl |
| **Silhouette posture** | poised |
| **Signature motif** | radiating light beams + a small balance-scale glyph on Verdict-related elements |

### Portrait reactive states

| State | What changes |
|---|---|
| **Full HP (>20)** | Subtle breathing loop. Eyes closed in meditation, soft golden glow visible behind eyelids. Light beams from upper left fall across him in a slow cycle. |
| **Mid HP (10–20)** | Eyes occasionally crack open, golden glow brighter, blade hand subtly tightens. |
| **Low HP (≤7)** | Persistent overlay — eyes fully open and blazing gold (no longer meditating), blade raised in a defensive guard, golden aura intensifies. He looks *more* present at low HP, not weaker. The atmospheric light beams brighten as if sunrise is happening around him. |
| **Ultimate charging** | Screen darkens to 25% opacity; portrait scales 1.4× and centers. Aura explodes outward in a dawn-burst pattern. The cathedral background's sunburst window radiates pure dawn-gold filling the screen. |
| **Victory pose** | Triumphant — head lifted, eyes gold-blazing, blade raised in salute. Cathedral sunburst behind him radiates pure light. Long satisfied prayer plays. |
| **Defeat pose** | Kneels slowly, blade planted, head bowed. Light dims gradually rather than snapping out. *"…the dawn waits."* |

---

## 3. Dice

Distribution: **2 sword / 2 sun / 1 dawn / 1 zenith**.

| Face | Symbol | Label | Glyph idea | Tint |
|---|---|---|---|---|
| 1 | `lightbearer:sword` | Sword | upright longsword with sun-glint along the blade | `#F59E0B` |
| 2 | `lightbearer:sword` | Sword | (same as face 1) | `#F59E0B` |
| 3 | `lightbearer:sun` | Sun | radiating sun disc, three rays prominent | `#FBBF24` |
| 4 | `lightbearer:sun` | Sun | (same as face 3) | `#FBBF24` |
| 5 | `lightbearer:dawn` | Dawn | rising sun cresting a horizon line, soft warm halo | `#FFFBEB` |
| 6 | `lightbearer:zenith` | Zenith | full sun at apex with twelve radiating rays, gold-on-white | `#FFFBEB` |

Two sword faces give Dawnblade its ~84% landing rate. The single zenith face is the tuning lever for the Judgment-of-the-Sun career-moment combo (~26% landing as the design centerpiece).

---

## 4. Signature passive — RADIANCE

| Field | Value |
|---|---|
| **Kind** | `lightbearer-radiance` (bankable) |
| **PassiveKey** | `radiance` |
| **BankStartsAt** | 2 |
| **BankCap** | 6 |

**How it fires.** The bank seeds at 2 at match start. Every offensive ability and several defensive abilities grant Radiance via inline `passive-counter-modifier` effects (Sun Strike +1, Dawn Prayer +1, Divine Ray +1, Apostasy +1 on resolution; Prayer of Shielding +1 on successful defense). Cathedral Light Mastery and Vow of Service amplify those gains.

**Spend modes.**

| Context | Cost | Effect |
|---|---|---|
| `offensive-resolution` | 1 token / unit | `damage-bonus +2 per unit` |
| `offensive-resolution` (paired) | 1 token / unit | `heal-self +1 per unit` |
| `defensive-resolution` | 1 token / unit | `reduce-incoming +2 per unit` |

> **Implementer note.** The spec calls for the offensive spend to deal +2 damage AND heal +1 HP per token in a single transaction. The current `PassiveSpendOption.effect` schema doesn't model compound spends; we surface the heal as a second `offensive-resolution` option so both effects are present in the data. A future engine pass should collapse them into a single compound spend and collapse the prompt to one decision.

**HUD readout.** Row of small gold sun-tokens below the portrait. 1–2 stacks: faint motes. 3–4: tokens form a horizontal arc, glow intensifies. 5–6: full halo around the portrait, atmospheric motes swirl visibly.

---

## 5. Signature token — Verdict

| Field | Value |
|---|---|
| **ID** | `lightbearer:verdict` |
| **Type** | debuff |
| **Stack limit** | 4 |
| **Tick phase** | `neverTicks` (no DoT) |

### Passive modifier

While Verdict sits on the holder, **the holder's offensive abilities deal -2 damage per stack** (clamped to 0). At 4 stacks the holder's offense is fully neutralised against most T1–T2 abilities.

```ts
passiveModifier: {
  scope: "holder",
  trigger: "on-offensive-ability",
  field: "damage",
  valuePerStack: -2,
  cap: { min: 0 },
}
```

### State threshold — judgment-bind

At **3+ stacks**, Verdict locks the holder's `main-phase` and `instant` card plays for the duration of their next Main Phase. `roll-phase` cards remain playable so the holder can still attempt their offensive turn.

```ts
stateThresholdEffects: [
  { threshold: 3, effect: { kind: "block-card-kind", cardKind: "main-phase" }, duration: "next-turn" },
  { threshold: 3, effect: { kind: "block-card-kind", cardKind: "instant"    }, duration: "next-turn" },
]
```

### Holder removal action — Atone (§15.2)

```ts
holderRemovalActions: [
  { phase: "main-phase",
    cost: { resource: "cp", amount: 2 },
    effect: { stacksRemoved: "all" },
    ui: { actionName: "Atone",
          confirmationPrompt: "Spend 2 CP to remove all Verdict stacks?" } }
]
```

The HUD chip surfaces an **Atone** button during the holder's Main Phase. Tapping it dispatches `Action: { kind: "status-holder-action", status: "lightbearer:verdict" }` — engine emits `status-removal-by-holder-action` plus the standard `status-removed`. Cost is fixed at 2 CP regardless of stack count: strategically wasteful at 1–2 stacks, essential at 3–4 stacks.

---

## 6. Resource triggers

| Trigger | Status | Gain |
|---|---|---|
| `opponentAttackedWithStatusActive` | `lightbearer:verdict` | +1 CP |

Lightbearer gains +1 CP every time the opponent fires an offensive ability while Verdict is active on them — even if Verdict's damage debuff zeroes the hit. Rewards defensive control: the more Verdict pressure he maintains, the more CP he banks. Capped at the global 15 CP ceiling.

> **Engine note.** This trigger was added during the Lightbearer ingestion — `phases.ts commitOffensiveAbility` now dispatches it on the defender after `ability-triggered` fires. See [§13](#13-engine-touchpoints).

---

## 7. Offensive ladder

Canonical shape: 1× T1 + 3× T2 + 2× T3 + 1× T4. The T4 is gated on
`5× face-6` (here: 5 zenith), making it a career-moment ultimate.
Apostasy was demoted from a previous T4 defensive ultimate to a T2
utility / cleanse during the unification.

### T1 · Dawnblade

```ts
combo: { kind: "symbol-count", symbol: "lightbearer:sword", count: 3 }
effect: compound:
  - scaling-damage  baseAmount: 3, perExtra: 2, maxExtra: 2  (3 / 5 / 6 dmg)
  - apply-status    lightbearer:verdict ×1 → opponent
```

Bread-and-butter T1 at ~84% landing. With Dawnblade Mastery the curve shifts to 4 / 6 / 8.

### T2 · Sun Strike

```ts
combo: 2 swords + 1 sun + 1 dawn   (compound and)
effect: compound:
  - damage 5 undefendable
  - passive-counter-modifier  radiance +1
  - apply-status              verdict ×1 → opponent
```

Undefendable mid-game pressure that also banks a Radiance and keeps Verdict ticking.

### T2 · Dawn Prayer

```ts
combo: 1 sword + 1 sun + 2 dawn   (compound and)
effect: compound:
  - damage 4 normal
  - heal 2 → self
  - passive-counter-modifier  radiance +1
  - apply-status              verdict ×1 → opponent
```

The sustain T2 — pairs the small hit with a heal on the same combo.

### T2 · Apostasy

```ts
combo: { kind: "symbol-count", symbol: "lightbearer:dawn", count: 3 }
effect: compound:
  - heal 6 → self
  - remove-status   any-debuff, stacks: 1 → self    // §15.7 wildcard, single stack
  - passive-counter-modifier  radiance +1
```

Utility / cleanse T2 — no direct damage. Demoted from a former T4
defensive ultimate during the ladder unification (was heal 12 +
cleanse-all + Stun + 3 Radiance). The smaller heal-6 + cleanse-1 keeps
it on-tier with the other T2s while preserving the recovery-on-rare-roll
flavor. Wildcard remove-status (§15.7) still works the same way — it
just only clears one stack of one debuff per fire now.

### T3 · Solar Blade

```ts
combo: { kind: "symbol-count", symbol: "lightbearer:sword", count: 4 }
effect: compound:
  - remove-status  verdict, stacks: "all" → opponent
  - damage 7 undefendable
      conditional_bonus: +1 dmg per Verdict stack stripped
  - apply-status   verdict ×1 → opponent  (re-application)
```

Strip-and-rebuild design: at 4 stacks stripped, deals 7 + 4 = 11 ub. Re-applies a single Verdict so pressure resumes immediately. With Sunblade Mastery: 9 ub base + 2/stripped (max 17 ub at 4-strip).

### T3 · Divine Ray

```ts
combo: 1 zenith + 2 swords + 2 suns   (compound and)
effect: compound:
  - damage 9 normal
  - apply-status              verdict ×2 → opponent
  - passive-counter-modifier  radiance +1
```

The zenith-gated burst T3. With Sunblade Mastery: 11 dmg + 3 Verdict.

### T4 · Judgment of the Sun (career-moment)

```ts
combo: { kind: "symbol-count", symbol: "lightbearer:zenith", count: 5 }
effect: compound:
  - damage 14 ultimate
      conditional_bonus: +2 dmg per banked Radiance (passive-counter-min ≥1)
  - heal 0 → self
      conditional_bonus: +1 HP per banked Radiance (passive-counter-min ≥1)
  - apply-status              stun ×1 → opponent
  - passive-counter-modifier  radiance set 0   // drains the bank
```

The career closer — gated on `5× face-6` (all 5 dice rolling zenith)
following the same career-moment pattern as Wolf's Howl and God's
Crater. **Order matters in the compound** — the damage and heal both
read `radiance` BEFORE the `set 0` drain wipes the bank. At 6 Radiance:
14 + 12 = 26 damage, +6 HP heal. Target landing 0.5–2%.

There is no separate `criticalCondition` / `criticalEffect` block — the
5-zenith gate is already the apex roll. The cinematic stinger (extended
slow-mo, pure-white screen flash, layered choir + brass) plays every
time it fires (see `criticalCinematic` in the live data file).

---

## 8. Defensive ladder

### D1 · Dawn-Ward

```ts
combo: 1+ dawn   (3 dice rolled)
effect: compound:
  - heal 4 → self
  - passive-counter-modifier radiance +0
      conditional: combo-symbol-count dawn 3   // inert until Cathedral Light upgrade
offensiveFallback: heal 4 on 1+ dawn (3 dice rolled)
```

Heal-after-the-hit defense. The inert `passive-counter-modifier value: 0` is activated by Cathedral Light Mastery's `passive-counter-gain-amount` modifier (sets to 2). Doubles as an offensive-fallback when the offensive turn whiffs.

### D2 · Prayer of Shielding

```ts
combo: 1 sun + 1 zenith   (4 dice rolled)
effect: compound:
  - reduce-damage 5
  - passive-counter-modifier radiance +1
```

The Radiance-banker defense — always grants +1 Radiance on success. Vow of Service signature play upgrades to +2 (via the `passive-counter-gain-amount` ability-modifier scoped to Tier 2+ defenses).

### D3 · Wall of Dawn

```ts
combo: 2+ sun   (4 dice rolled)
effect: compound:
  - reduce-damage 8
  - passive-counter-modifier radiance +0
      conditional: combo-symbol-count sun 4   // inert until Cathedral Light upgrade
```

The "really committed" defense — biggest single-defense reduction in the kit. Cathedral Light activates a +1 Radiance gain when all four rolled dice show sun.

---

## 9. Cards

The full per-card listing for the Lightbearer — IDs, costs, kinds,
categories, slots, once-per-match flags, and rules text — lives in
**[`../cards/lightbearer.md`](../cards/lightbearer.md)**.

For the deck-building system as a whole (composition rules, the
builder UI, persistence, the validator), see
[`../DECK_BUILDING.md`](../DECK_BUILDING.md).

The Lightbearer ships 12 cards total: 3 dice-manip, 4 ladder-upgrade
Masteries (one per slot — T1 / T2 / T3 / Defensive), and 5 signature
plays. The masteries lean on the `passive-counter-gain-amount`
ability-upgrade field so they can rewrite the `value` on
`passive-counter-modifier` leaves nested inside an ability's compound
effect — see the engine-touchpoints section below for the full
plumbing.

---

## 10. Audio identity

| Layer | Cue |
|---|---|
| **Signature motif** | Soft pipe-organ chord progression (3 ascending notes) + a single high bell-tone on resolution. Plays on hero-select highlight + Judgment of the Sun. |
| **Ambient bed** | Distant choir at low volume + organ undertone barely audible + cathedral acoustics on every footstep / die-clatter. Choir intensifies at 4+ Radiance as a readiness telegraph. |
| **Bark — on roll** | (silent — soft inhale, blade-unsheath chime) |
| **Bark — T3 lands** | "Judgment." (Solar Blade) / silent on Divine Ray (replaced by descending beam-tone) |
| **Bark — T4 fires** | "BY THE LIGHT." (Judgment of the Sun) — audio peak of his entire kit. |
| **Bark — T2 Apostasy lands** | "DAWN BREAKS." (delivered as a quiet exhale, not a shout) |
| **Bark — taking lethal hit** | (silent — slow exhale as he kneels) |
| **Bark — victory** | "Dawn… breaks always." (quiet, satisfied prayer) |
| **Bark — defeat** | "…the dawn waits." (soft, accepting) |

Voice direction: warm baritone, deliberate pacing, never rushed. Slight cathedral reverb to suggest vaulted-chamber acoustics.

---

## 11. Tuning / playtest notes

**Expected play pattern.** 8–10 turn matches (longer than Berserker / Pyromancer — sustain archetype).

- **Early (turns 1–3):** Dawnblade fires reliably, applying Verdict and chipping. He soaks damage, accumulates Radiance from being hit.
- **Mid (turns 4–6):** Verdict pressure (3+ stacks) starts binding opponent's main-phase + instant cards; defensive picks bank Radiance via Prayer of Shielding. Sanctuary or Vow of Service usually played around turn 5.
- **Late (turn 7+):** Win condition is **Judgment of the Sun** spending 5–6 Radiance for a kill that also heals (14 + 12 = 26 dmg + 6 HP) — but it's gated on the rare 5-zenith roll, so most matches close on the Verdict-bind + Solar Blade / Divine Ray pressure path. T2 **Apostasy** plays a sustain role mid-game (3-dawn → heal 6 + cleanse 1 + 1 Rad), not a closer.

**Strong matchups.** Punishes burst archetypes that rely on T1–T2 abilities — Verdict's −2/stack neutralises most basic damage. Out-trades any hero without efficient buff-strip.

**Weak matchups.** Heroes with cheap buff-strip can defuse Verdict cheaply. Burst-rush heroes (Berserker with Frenzy + War Cry) can outpace his sustain if Wall of Dawn doesn't land at key moments.

**Anti-pattern warning.** At 6 Radiance with **Vow of Service + Cathedral Light** both played, the Radiance economy becomes self-sustaining — every successful T2+ defense gives +2 Radiance. The 5-zenith Judgment of the Sun gate is rare enough that the bank rarely matters at the moment of cast, but if matches reliably reach the 5–6 Radiance threshold and a Judgment lands, expect a 26+ damage close. Watch the bank-fill rate; if it routinely caps before turn 6, the bank cap may need to drop to 5.

### Simulator landing rates (10k trials, 3 attempts)

| Tier · Ability | Measured | Spec target | Notes |
|---|---|---|---|
| T1 · Dawnblade | 84.1% | 75–95% | matches spec exactly |
| T2 · Sun Strike | 33.1% | 45–70% | below band — sim heuristic doesn't optimize compound combos (same pattern on Berserker T2 / Pyromancer T2) |
| T2 · Dawn Prayer | 17.5% | 45–70% | same compound-combo limitation |
| T3 · Solar Blade | 53.5% | 20–55% | within band (top edge) |
| T3 · Divine Ray | 14.7% | 20–45% | zenith-gated; sim under-counts |
| T2 · Apostasy | (re-run after demotion) | 40–65% | tier-band check pending — old entry was for the T4 form |
| T4 · Judgment of the Sun | (re-run after combo change) | 0.5–2% | tier-band check pending — old entry was for the 2-zenith compound |

The under-band landings on the compound-combo abilities are a pre-existing simulator limitation (`pickKeepMask` heuristic). Sun Strike's landing was hand-validated at ~70% during ingestion. T1 Dawnblade is the most reliable comparison point — it matches the spec to two decimals.

---

## 12. Quick reference

```
THE LIGHTBEARER · SURVIVAL · COMPLEXITY 2
Dice: 2 sword / 2 sun / 1 dawn / 1 zenith
Win condition: Bank Radiance via taking damage + Tier 2+ defense gains.
               Close on Verdict-bind pressure; rare 5-zenith Judgment lands the screenshot.
Signature: Radiance — start with 2, gain via abilities (max 6);
           spend on offense (+2 dmg, +1 heal) or defense (-2 dmg).
Token: Verdict (debuff, max 4 — -2 holder offense/stack;
       binds main-phase + instant cards at 3+; 2 CP atone to clear)
Ladder shape (canonical): 1× T1 + 3× T2 + 2× T3 + 1× T4.
Tier 1: Dawnblade        (3 swords, 3/5/6 + Verdict, ~84%)
Tier 2: Sun Strike       (2 sw + 1 sun + 1 dawn, 5 ub + Rad + V)
        Dawn Prayer      (1 sw + 1 sun + 2 dawn, 4 + heal 2 + Rad + V)
        Apostasy         (3 dawn, heal 6 + cleanse 1 + 1 Rad)
Tier 3: Solar Blade      (4 swords, strip Verdict, 7 ub +1/strip)
        Divine Ray       (1 zen + 2 sw + 2 sun, 9 + 2V + Rad)
Tier 4: Judgment of the Sun (5 zenith = all 5 dice on face 6, 14 ult + 2/Rad, drain) — 0.5–2%
Standout cards: Sanctuary, Aegis of Dawn, Sunburst
"Dawn breaks always."
```

---

## 13. Engine touchpoints

| Mechanic | Where it lives |
|---|---|
| Radiance bank (start, cap, spend modes) | `signatureMechanic.implementation.{passiveKey, bankStartsAt, bankCap, spendOptions}` — seeded by `engine.ts:startMatch`, capped by `cards.ts:bankCapFor` |
| Verdict damage debuff | `passiveModifier` on the Verdict status def — aggregated in `phases.ts aggregatePassiveModifiers` |
| Verdict judgment-bind (3+ stacks) | `stateThresholdEffects` on the status def — read by `cards.ts canPlay` to gate card kinds |
| Atonement (player-initiated removal) | `holderRemovalActions` on the status def — resolved by `engine.ts resolveStatusHolderAction` (§15.2) |
| `opponentAttackedWithStatusActive` CP gain | dispatched in `phases.ts commitOffensiveAbility` after `ability-triggered` fires |
| `passive-counter-gain-amount` mastery field | resolved in `cards.ts applyPassiveCounterGainModifier` when `passive-counter-modifier` runs in ability context |
| Defensive `passive-counter-modifier` resolution | new case in `phases.ts resolveDefensiveEffect` forwards to `resolveEffect` with ability context |
| Sanctuary pipeline reduction | `pipelineBuffs[]` aggregated in `phases.ts aggregatePipelineModifiers` (§15.3) |
| Sunburst combo relaxation | `comboOverrides[]` consulted by `dice.ts effectiveCombo` on every combo evaluation (§15.6) |
| Aegis of Dawn fractional reduce-damage | `reduce-damage.multiplier` branch in `cards.ts resolveEffect` injects onto `pendingAttack.injectedReduction` (§15.1) |
| Vow of Service / Sanctuary / Sunburst lifecycle | `creatorTurnsElapsed` ticker in `cards.ts tickTurnBuffs` (§15.5) |
| Apostasy cleanse | wildcard `remove-status: "any-debuff"` branch in `cards.ts resolveEffect` (§15.7) — Apostasy passes `stacks: 1` so only one debuff stack is cleared per fire |

---

## 14. Known gaps / follow-ups

- **Compound spend option** for Radiance offensive resolution (the `+2 dmg AND +1 heal` is currently surfaced as two separate spend options; should collapse into one prompt).
- **Apostasy** no longer has a critical condition (it is now T2). The previous note about its base combo trivially satisfying its cosmetic crit no longer applies.
- **Verdict stack-stripping CP economy.** Lightbearer doesn't define an `opponentRemovedSelfStatus` trigger today — opponents who clear Verdict cheaply pay nothing for the privilege. Watch this in playtests; Pyromancer-style "+1 CP per stack stripped" may be appropriate.
- **Vow of Service durability.** No discard-on trigger beyond `match-ends`. The anti-pattern note (§11) flags this — if Vow + Cathedral Light snowball too consistently, add `{ kind: "damage-taken-from-tier", tier: 4 }`.

---

## 15. See also

- [`docs/cards/lightbearer.md`](../cards/lightbearer.md) — full card listing.
- [`docs/DECK_BUILDING.md`](../DECK_BUILDING.md) — deck composition rules + builder UI.
- [`docs/ENGINE_AND_MECHANICS.md`](../ENGINE_AND_MECHANICS.md) — engine architecture, especially [§7 Status system](../ENGINE_AND_MECHANICS.md#7-status-system) and the §15 extensions block in the docs section.
- [`docs/HERO_REQUIREMENTS.md`](../HERO_REQUIREMENTS.md) — hero-authoring brief that produced this submission.
- [`src/content/heroes/lightbearer.ts`](../../src/content/heroes/lightbearer.ts) — hero definition.
- [`src/content/cards/lightbearer.ts`](../../src/content/cards/lightbearer.ts) — card source.
