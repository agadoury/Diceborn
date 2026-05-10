# Field-by-field cheat sheet

> Companion to [`./hero-spec.md`](./hero-spec.md). For
> each field a hero author fills in on the template, this page lists
> what the field becomes when the hero is implemented and which engine
> site reads it.

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

