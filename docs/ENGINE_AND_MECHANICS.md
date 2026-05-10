# Pact of Heroes — Engine & Game Mechanics

This is the canonical reference for how Pact of Heroes works under the
hood: the rules a player sees on screen, the engine that resolves them,
and the layers around it (choreographer, stores, AI, simulator).

The detailed content is split across four sub-pages so each topic stays
findable as the game grows. Start with whichever matches your task:

| If you're… | Read | Covers |
|---|---|---|
| Designing a hero or learning the rules | [`engine/rules.md`](./engine/rules.md) | Game overview, match loop, phase progression, dice + combo grammar, ability ladders, damage pipeline, status system. |
| Authoring a card or following an effect tree | [`engine/cards.md`](./engine/cards.md) | CP economy, hand mechanics, card kinds, deck-composition validator, instant-trigger taxonomy, effect resolver, modifier evaluation pipeline. |
| Wiring a new engine feature | [`engine/runtime.md`](./engine/runtime.md) | `HeroDefinition` contract, the `applyAction` reducer, store layout, event taxonomy + Choreographer, AI driver, simulator + tests, engine-wide constants. |
| Looking up a term | [`engine/glossary.md`](./engine/glossary.md) | Vocabulary used across engine + content code. |

## Quick orientation

Pact of Heroes is a 1v1 dice-and-card duel. Each player picks a hero,
draws a starting hand, and takes alternating turns. On the active
player's turn they roll five hero-specific dice (up to 3 attempts,
locking dice between rolls). When the roll ends, every ability whose
combo currently matches is offered to the player, who **picks one to
fire** (or passes). For defendable damage, the defender then **picks
one defense** from their ladder, the engine rolls that defense's dice
once (no rerolls, no locking), and the combo lands or fizzles. Both
players play cards from their hand throughout to bend dice, modify
abilities, apply tokens, or trigger reactive effects.

A match ends when one hero's HP reaches 0, or when a player concedes.
The target match length is **5–8 minutes / 6–8 turns**; damage tuning
is calibrated to that envelope.

For deeper detail on any of these mechanics, follow the table above.

## See also

- [`INDEX.md`](./INDEX.md) — doc tree routed by intent.
- [`DECK_BUILDING.md`](./DECK_BUILDING.md) — deck composition, the builder UI, persistence, and the validator.
- [`cards/`](./cards/) — per-hero card listings + the universal generic pool.
- [`HERO_REQUIREMENTS.md`](./HERO_REQUIREMENTS.md) — hero-authoring brief; what a hero submission must contain to land cleanly.
- [`UI.md`](./UI.md) — match-screen layout, overlays, the choreographer, design tokens.
- [`../CHANGELOG.md`](../CHANGELOG.md) — design + architecture decisions log.
- `../README.md` — project overview, commands, routes, bundle stats.
- `../src/game/types.ts` — the type contract; the canonical source of truth for action / event / state shapes.
- `../src/game/engine.ts` — `applyAction` reducer.
- `../src/game/phases.ts` — phase transition table and per-phase handlers.
