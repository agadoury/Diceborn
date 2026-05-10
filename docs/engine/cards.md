# Engine: Cards, CP, and the hand

> Companion to [`./README.md`](./README.md). Covers
> CP economy, hand mechanics, card kinds, deck composition validator,
> instant trigger taxonomy, the effect resolver, the modifier evaluation
> pipeline, and the card-file split. For deck-building rules from a
> player perspective see [`../design/deck-building.md`](../design/deck-building.md);
> for combat rules see [`rules.md`](./rules.md).

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

`cards.ts validateDeckComposition` enforces Correction 6 §9 — exactly 12 cards, with category counts and Mastery-slot rules described in detail in [`../design/deck-building.md` §7](../design/deck-building.md#7-validation-validatedeckcomposition). T4 Ultimates intentionally have no Mastery — power lives at the curve peak.

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

