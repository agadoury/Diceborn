# The Berserker

| Field | Value |
|---|---|
| **ID** | `berserker` |
| **Archetype** | rush |
| **Complexity** | 1 |
| **Accent color** | `#9CC8E0` |
| **Signature quote** | "The wound is the door." |
| **Source** | [`src/content/heroes/berserker.ts`](../../src/content/heroes/berserker.ts) |

The Berserker is Diceborn's first registered hero and the canonical example
of the Rush archetype. Reliable bread-and-butter Cleave at ~98% landing,
rare burst spikes via 4-of-a-kind / straight / 5-of-a-kind, and a wound-fed
Frenzy passive that turns every hit he takes into +1 damage on every
offensive ability he throws.

---

## 1. Lore

| Beat | |
|---|---|
| **Origin** | A son of the northern clans, he walked into a glacier as a child and emerged with frost in his veins. His people called him Hael the Unbroken; in the Threshold he goes by no name. He fights with twin axes and a dire-wolf pelt his mother stitched — the pelt has saved his life seven times. |
| **Personality** | Speaks rarely, never taunts. Howls instead of shouts. Frost-touched: doesn't feel cold, doesn't feel fear, only the rising drumbeat of battle. |
| **Motivation** | A fragment of the shattered crown — and the answers it would bring him about the night his village burned. |
| **Voice** | weary baritone with a heavy rasp from years of cold air |

---

## 2. Visual identity

| Field | Value |
|---|---|
| Secondary palette | `#4A6680`, `#FCDFA0` |
| Background motif | tundra |
| Particle behaviour | snow drifting horizontally, sparse — at low HP, snow intensifies and blows toward him as if the storm is feeding his frenzy |
| Silhouette posture | looming |
| Signature motif | frost cracks branching across surfaces (dice trim, card backs, UI elements); aurora gradient on portrait edges |

### Portrait reactive states

| State | Description |
|---|---|
| Full HP (>20) | Three-quarter view, axes lowered but ready, breath visible in cold air. Pelt cloak rests on shoulders. Eyes glow faintly frost-blue. |
| Mid HP (10–20) | Stance shifts — axes raised slightly, breath sharper and more visible. Frost-blue aura begins to pulse with each Frenzy stack gained. |
| Low HP (≤7) | He looks **more** dangerous, not weaker. Predator lean forward. Aura at maximum intensity, snow particles thickening around his shoulders, eyes blazing frost-blue. (Inverse of typical hero distress — fits Frenzy archetype.) |
| Ultimate charging | Screen darkens, portrait scales 1.4× and centers. Frost-blue aura explodes outward. For Wolf's Howl: 4 spectral ice-wolves materialize and circle the screen perimeter. |
| Victory pose | Head lifted, axes raised, aurora intensifies behind him. Long satisfied wolf-howl plays. |
| Defeat pose | He falls without a sound. The aurora dims. No bark line — defiant silence. |

---

## 3. Dice

3 axe / 2 fur / 1 howl. Three axe faces give Cleave ~98% landing; the
single howl face makes 5-of-a-kind howl genuinely once-per-career rare.

| Face | Symbol | Label | Glyph | Tint |
|---|---|---|---|---|
| 1 | `berserker:axe` | Axe | crossed twin axes with slight icicle drips | `#4A6680` |
| 2 | `berserker:axe` | Axe | (same as face 1) | `#4A6680` |
| 3 | `berserker:axe` | Axe | (same as face 1) | `#4A6680` |
| 4 | `berserker:fur` | Fur | wolf-pelt mantle in pure white with grey-blue shadow | `#4A6680` |
| 5 | `berserker:fur` | Fur | (same as face 4) | `#4A6680` |
| 6 | `berserker:howl` | Howl | stylized wolf head mid-howl with rays of light | `#FCDFA0` |

---

## 4. Signature passive — FRENZY

| Field | Value |
|---|---|
| Passive key | `frenzy` |
| Bank starts at | 0 |
| Bank cap | 6 |
| Implementation kind | `frenzy` (engine-dispatched at Upkeep) |

**Trigger.** When the Berserker takes 1+ HP damage from an opponent's
offensive ability, he gains 1 Frenzy stack at the **start of his next
turn** (capped at +1 stack per turn even if hit multiple times).

**Exclusions.**
- Damage from status ticks (Frost-bite, Burn) does **not** trigger Frenzy.
- Self-damage from a hero's own abilities (via `self_cost`) does **not**
  trigger Frenzy. (No live Berserker ability currently uses `self_cost`,
  but the engine still respects this rule if one is added.)

**Effect per stack.** +1 damage to all offensive abilities. Applied at
resolution time via the engine's passive-counter aggregation
(`aggregatePassiveModifiers` in `phases.ts`). Stacks persist for the
entire match — never expire, never removed by status-strip effects.

**Spend modes.** None. Frenzy is a trigger-only counter, not bankable in
the same sense as Lightbearer's Radiance.

**HUD.** Ring of 6 small frost-blue pips around the portrait, lit
progressively as stacks accumulate. The portrait aura also intensifies
with stack count.

### Engine wiring

- `phases.ts`'s `applyAttackEffects` scans the `damage-dealt` events it
  emits; if any landed on the Berserker, it tags
  `signatureState.__frenzyTickPending = 1` via `noteOffensiveDamageTaken`.
- `runUpkeep` calls `resolveUpkeepSignaturePassive` on the active player.
  When the implementation kind is `"frenzy"` and the pending flag is set,
  the engine bumps `signatureState.frenzy` by 1 (clamped to `bankCap`)
  and clears the flag — irrespective of how many hits landed last turn.

---

## 5. Signature token — Frost-bite

| Field | Value |
|---|---|
| ID | `berserker:frostbite` |
| Display name | Frost-bite |
| Type | debuff |
| Stack limit | 4 |
| Tick phase | `ownUpkeep` |
| Effect per tick | 1 damage (undefendable), then decrement 1 stack |
| On-removal | none |
| Detonation | none |
| State threshold effects | none |

### Passive modifier

| | |
|---|---|
| Scope | holder |
| Trigger | `on-offensive-ability` |
| Field | `damage` |
| Value per stack | -1 |
| Cap | `min: 0` |

While Frost-bite is on the holder, their offensive abilities deal -1
damage per stack (clamped to 0). The penalty thaws as the stacks
decrement.

**Visual.** Ice-shard cluster icon, frost-blue with a faint glow. Slams
in from the Berserker's accent area with a sharp crystal-formation sound
plus a brief screen-edge frost vignette. Each tick bursts shards outward
from the icon. On natural tick-to-zero, the cluster shatters and
dissipates as frost-mist.

---

## 6. Resource trigger

| Trigger | Gain |
|---|---|
| `abilityLanded` | +1 CP |

Berserker rewards aggression — every successful offensive hit grants +1
CP. "Lands successfully" means the ability fired AND dealt at least 1
actual damage to the opponent.

---

## 7. Offensive ladder

Canonical shape: 1× T1 + 3× T2 + 2× T3 + 1× T4. The T4 is always gated
on `5× face-6` (here: 5 howl), making it a career-moment ultimate.
Tier-band bands (target landing rate) per the engine's tuning bands —
T1 75–95%, T2 45–80%, T3 20–45%, T4 career-moment 0.5–2%. Ranges below
come from the original spec; the simulator's `simulateLandingRate` uses
a simpler lock model and reports different numbers in some cases.

### T1 · Cleave

| Field | Value |
|---|---|
| Combo | `symbol-count: berserker:axe, count 3` |
| Damage type | normal |
| Effect | scaling-damage 4 / +2 per extra / max 2 extras → **4 / 6 / 8** dmg, then apply 1 Frost-bite |
| Target landing | 75–95% (validated 98.4% — intentionally above band; identity-defining basic) |
| ShortText | "4/6/8 dmg + Frost-bite" |

**Cinematic.** Wind-up: portrait sweeps forward, axes pulled back, brief
frost vignette on screen edges. Strike: twin axe-arc particles slash
diagonal across opponent's panel from upper-left to lower-right with
sharp ice-shard particles. Impact: 4px screen-shake, opponent flinches.
Audio: axe-whoosh + impact-thud + frost-crystal chime layered, ~1.4s
total.

### T2 · Glacier Strike

| Field | Value |
|---|---|
| Combo | `compound and [symbol-count axe×2, symbol-count howl×2]` |
| Damage type | undefendable |
| Effect | 5 dmg unblockable, apply 1 Frost-bite, heal 1 |
| Target landing | 45–70% (validated 49.3%) |
| ShortText | "5 dmg ub + heal 1 + Frost-bite" |

**Cinematic.** Berserker dashes forward, strikes with both axes
simultaneously in an X-pattern. The X leaves a frost-blue scar on the
opponent's panel briefly. Self-heal visualized as a small frost-mist
puff at his feet. Audio: dual axe-strike + frost-crystal chime + soft
heal-shimmer, ~1.6s total.

### T2 · Winter Storm

| Field | Value |
|---|---|
| Combo | `straight: length 4` |
| Damage type | normal |
| Effect | 9 dmg + 2 Frost-bite |
| Target landing | 45–70% (validated 55.8%) |
| ShortText | "9 dmg + 2 Frost-bite" |

**Cinematic.** Sweeping ice-storm imagery — wind whips around the
opponent's panel, multiple small frost-shards rain in from upper screen,
then a heavy slash crosses the panel as the impact lands. Audio:
wind-whoosh layered with multiple frost impacts and final heavy hit,
~1.8s total.

### T2 · Avalanche

| Field | Value |
|---|---|
| Combo | `straight: length 3` |
| Damage type | normal |
| Effect | 6 dmg + 1 Frost-bite |
| Target landing | 55–80% |
| ShortText | "6 dmg + 1 Frost-bite" |

**Cinematic.** Smaller-scale snow imagery — a short cascade of snow and
ice tumbles across the upper portion of the opponent's panel and lands
as a single heavy thud. Audio: brief avalanche-rumble + heavy impact,
~1.6s total. (Demoted from a former T4 career-moment; the smaller
straight-3 gate keeps it on-tier with the other T2s.)

### T3 · Blood Harvest

| Field | Value |
|---|---|
| Combo | `compound and [symbol-count axe×3, symbol-count howl×2]` |
| Damage type | normal |
| Effect | bonus-dice-damage (3 dice, sum-of-faces); threshold 14 → +2 Frost-bite; always +1 Frost-bite; heal 0 + 2 per Frenzy stack |
| Target landing | 20–45% (validated 31.2%) |
| ShortText | "sum dmg + Frost-bite + heal/Frenzy" |

The heal uses the cross-effect `conditional_bonus` primitive sourced
from `self-passive-counter` (`frenzy`) — at 6 stacks, Blood Harvest
heals 12.

**Cinematic.** Berserker's axes glow frost-blue. He strikes the opponent.
Spectral wolves materialize and drag energy back to him (visualizing the
heal). Bonus dice tumble into a separate small dice tray below the
opponent's panel as a "harvest reveal," then sum into a single damage
number. Audio: axe-strike + spectral-wolf snarl + dice-tumble + final
damage chime, ~2.5s total.

### T3 · Frostfang

| Field | Value |
|---|---|
| Combo | `symbol-count: berserker:howl, count 4` |
| Damage type | undefendable |
| Effect | apply Stun, 6 dmg unblockable, apply 2 Frost-bite |
| Target landing | 20–45% (validated 10.4% — intentionally below band; Stun justifies the rarity) |
| ShortText | "Stun + 6 dmg ub + 2 Frost-bite" |

**Cinematic.** Berserker dashes forward, strikes with both axes
simultaneously in an X-pattern. The X leaves a frost-blue scar on the
opponent's panel that pulses for the duration of the Stun (visible Stun
token slam-in). Audio: sharp exhale (no words) + dual axe-strike + Stun
chime, ~2.0s total.

### T4 · Wolf's Howl (career-moment)

| Field | Value |
|---|---|
| Combo | `symbol-count: berserker:howl, count 5` (all 5 dice on face 6) |
| Damage type | ultimate |
| Effect | apply Stun, 14 ultimate damage, apply 4 Frost-bite, +2 Frenzy (respects cap) |
| Target landing | 0.5–2% (rare-roll career-moment ultimate) |
| ShortText | "Stun + 14 ult + 4 Frost-bite + 2 Frenzy" |
| Bark | "FOR THE PACK!" (his voice, layered with subtle wolf-pack chorus) |

**Extended ultimate cinematic** (4.5s total).
1. Anticipation (600ms): screen darkens to 30% opacity, portrait scales
   1.4× and takes center stage, frost-blue aura intensifies and explodes
   outward.
2. Howl (1200ms): portrait throws head back and howls — concentric rings
   of frost-blue energy emanate from him with deep drawn-out wolf-howl
   audio. Voice bark fires here.
3. Wolf manifestation (800ms): 4 spectral ice-wolves appear
   semi-transparent around him, glowing frost-blue, circle the screen
   perimeter then converge on opponent.
4. Convergence strike (600ms): all 4 wolves leap onto opponent
   simultaneously, massive 12px screen-shake, full-screen flash of
   frost-white, deep impact sfx.
5. Resolution (900ms): Stun token slams in, 14 damage number floats up at
   3× normal type size, Frost-bite stack count visibly +4.
6. Settle (400ms): Berserker returns to panel position with +2 Frenzy
   stacks visible on his aura.

Audio: layered howl + ice-crash + spectral-wolf snarls + deep bass
impact, with the voice bark as audio peak. **Critical failsafe:** if
first time in player's session, append 800ms slow-motion zoom on the
convergence strike.

---

## 8. Defensive ladder

### D1 · Wolfhide

| Field | Value |
|---|---|
| Combo | `symbol-count: berserker:fur, count 1` |
| Defense dice | 3 |
| Effect | reduce-damage 4 |
| Target landing | 60–80% (validated 70.3%) |

### D2 · Bloodoath

| Field | Value |
|---|---|
| Combo | `symbol-count: berserker:fur, count 2` |
| Defense dice | 4 |
| Effect | heal 4 (full attack damage applies first, then heal) |
| Target landing | 35–55% (validated 40.7%) |
| Offensive fallback | 4 dice, same combo; on land: heal 4 + 1 Frenzy (capped) |

The offensive fallback fires when the Berserker's offensive turn ends
without any ability landing — consolation prize for whiff turns.

### D3 · Glacial Counter

| Field | Value |
|---|---|
| Combo | `compound and [symbol-count howl×1, symbol-count axe×1]` |
| Defense dice | 3 |
| Effect | reduce-damage 5, apply 1 Frost-bite to attacker |
| Target landing | 20–40% (validated 33.3%) |

In defensive context `target: "opponent"` resolves to the original
attacker, so Glacial Counter's Frost-bite lands on whoever just hit him.

---

## 9. Cards

The full per-card listing for the Berserker — IDs, costs, kinds,
categories, slots, once-per-match flags, and rules text — lives in
**[`../cards/berserker.md`](../cards/berserker.md)**.

For the deck-building system as a whole (composition rules, the
builder UI, persistence, the validator), see
[`../DECK_BUILDING.md`](../DECK_BUILDING.md).

The Berserker ships 14 cards total: 3 dice-manip, 6 ladder-upgrade
Masteries (3 T1 + 1 T2 + 1 T3 + 1 Defensive — multiple options at T1
gives the deck-builder a real fork), and 5 signature plays.

---

## 10. Audio identity

| Slot | Description |
|---|---|
| Signature motif | Low frost-blue cello drone + 3 ascending plucked horn notes. A distant wolf-howl undercurrent on the second note. (Plays on hero-select highlight + Wolf's Howl ultimate.) |
| Ambient bed | Low wind with snow-rustle + distant intermittent wolf-howl every 30–40s. Subtle and atmospheric. |
| Bark — on roll | (low wordless growl) |
| Bark — T3 lands | "Yes." (single quiet word, satisfied) |
| Bark — T4 fires | "FOR THE PACK!" (Wolf's Howl) — the audio peak of his entire kit. |
| Bark — T2 Avalanche lands | (short primal wordless shout) — paired with the smaller-snow tumble cinematic. |
| Bark — taking lethal hit | (silent — defiant, no words, just the sound of axes hitting snow as he falls) |
| Bark — victory | (long wolf-howl, triumphant — held note) |
| Bark — defeat | (silent — he falls without a sound) |

**Voice direction.** Bass-baritone with heavy rasp from years of cold
air. He should feel like a man who has long since stopped explaining
himself. Doesn't taunt, doesn't gloat, barely speaks. The contrast
between his usual silence and his rare barked words ("Yes",
"FOR THE PACK!") makes those moments hit harder.

---

## 11. Tuning / playtest notes

**Expected play pattern.** 6–9 turn matches. Aggressive opener — Cleave
fires nearly every turn, building Frenzy as the opponent inevitably hits
him. Mid-match (turns 4–6), Frenzy at 3–5 stacks, Cleave does 7–9 dmg
consistently and starts threatening lethal. Closer is either a Tier 3+
kill at low HP (clutch comeback via Frenzy, Last Stand activation,
signature plays) or — rarely — the cinematic moment of Wolf's Howl
(1.4% per attempt, ~10% per match). He feels powerful when soaking
damage and stacking Frenzy; feels vulnerable when the opponent denies
damage entirely (skipping turns, full-mitigation defenses).

**Strong matchups.** Punishes slow control (setup turns feed his
Frenzy). Out-trades burst rush (Frost-bite penalty slows their offense;
he survives long enough to scale).

**Weak matchups.** Heroes that can stall to zero damage (full-mitigation
defense stacks) deny his Frenzy resource and outlast him. Also struggles
vs. burst-control hybrids that combine Stun with reset effects.

**Anti-pattern warning.** At 6 Frenzy stacks with War Cry + Ancestral
Spirits both played, his per-turn damage gets very high (Cleave at
4+6+1 = 11 base, scales to 13/15 on Minor Crits). If matches consistently
end before turn 7, the +1/turn Frenzy cap may need adjustment OR
Ancestral Spirits cost bumped from 2 to 3 CP. Watch for "Frenzy stall
lock" — if he hits 6 stacks and the opponent can't break the snowball,
the match feels predetermined.

---

## 12. Quick reference

```
THE BERSERKER · RUSH · COMPLEXITY 1
Dice: 3 axe / 2 fur / 1 howl
Win condition: Comeback fantasy via Frenzy stacks; close with the rare Wolf's Howl.
Signature: Frenzy — wounds become +1 dmg per stack (max 6).
Ladder shape (canonical): 1× T1 + 3× T2 + 2× T3 + 1× T4.
Tier 1: Cleave (3 axes, 4/6/8 + Frost-bite, ~98%)
Tier 2: Glacier Strike / Winter Storm / Avalanche (45–80%)
Tier 3: Blood Harvest / Frostfang (20–45%)
Tier 4: Wolf's Howl (5 howl = all 5 dice on face 6, 0.5–2%)
Token: Frost-bite (debuff, max 4 — ticks 1 dmg/upkeep + holder's offense −1/stack)
Standout cards: War Cry, Counterstrike, Last Stand
"The wound is the door."
```

---

## 13. Engine touchpoints

The Berserker is the first registered hero, so several engine extensions
landed alongside him. These are the integration points to know about
when reading the data file:

| Concern | Engine site |
|---|---|
| Frenzy passive trigger (set flag on offensive damage taken) | `phases.ts → applyAttackEffects` calls `noteOffensiveDamageTaken` |
| Frenzy passive resolution (+1 at start of turn, capped) | `phases.ts → resolveUpkeepSignaturePassive` (dispatched on `signatureMechanic.implementation.kind === "frenzy"`) |
| Frost-bite per-stack offense penalty | `phases.ts → aggregatePassiveModifiers("on-offensive-ability", "damage")` |
| Frost-bite ticks | `status.ts → tickStatusesAt("ownUpkeep")` |
| Mastery `applied-status-stacks`, `bonus-dice-threshold`, `heal-conditional-bonus` mods | `phases.ts → applyModifiersToAppliedStatusStacks / applyModifiersToBonusDiceDamage / applyModifiersToHeal` |
| Defensive masteries (`all-defenses` scope on Wolfborn) | `phases.ts → applyDefensiveNumericModifier` (called from `resolveDefensiveEffect`) |
| Last Stand turn-long combo override | `phases.ts → effectiveFiringFaces` reads `HeroSnapshot.forcedFaceValue`; cleared in `engine.ts → passTurn` |
| Iron Focus once-per-turn | `cards.ts → canPlay` rejects when cardId is in `consumedOncePerTurnCards`; cleared in `engine.ts → passTurn` |
| Last Stand once-per-match + HP gate | `cards.ts → canPlay` checks `oncePerMatch` and `playCondition.kind === "match-state-threshold"` |
| Iron Focus / Last Stand player-chosen face | `engine.ts → playCard` forwards `Action.targetFaceValue` into `ResolveCtx`; `cards.ts → setDieFace` resolves `target.faceValue` from the action when omitted |
| Bloodoath `offensiveFallback` | `phases.ts → tryOffensiveFallback` |
| `combo-straight` StateCheck (Northern Storm's Winter Storm gate) | `cards.ts → checkState`, `phases.ts → conditionalMatches` |

A complete read-through of the data file (`src/content/heroes/berserker.ts`)
plus this document gives the full picture of his identity and the
engine pieces that make him work.
