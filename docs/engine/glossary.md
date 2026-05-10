# Engine: Glossary

> Companion to [`./README.md`](./README.md). Terms
> used across engine + content code with stable definitions.

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

