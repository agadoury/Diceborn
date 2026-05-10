# Changelog

Human-readable design + architecture decisions. Use it for "why is X
the way it is" history. Routine commits live in `git log`; this file
tracks decisions worth remembering.

Format:

```
## YYYY-MM-DD — Headline of the change

What changed and why. Links to the PR / commit if helpful. One short
paragraph per entry; no bullet-point sprawl.
```

New entries go at the top.

---

## 2026-05-10 — Project renamed: Diceborn → Pact of Heroes (PR #20)

Repo, package, manifests, wordmark, docs, localStorage namespace, and
custom-event names all rebranded. A one-shot legacy migration in
`src/lib/migrate-storage.ts` copies `diceborn:*` localStorage keys to
`pact-of-heroes:*` at boot so existing players keep their saved decks
and settings.

## 2026-05-10 — Standalone deck builder via `/decks` (PR #24)

Added a main-menu **Deck Builder** entry pointing at a new `/decks`
hero picker; from there players can edit and save decks without
launching a match. The `DeckBuilder` screen now classifies its URL
into three entry shapes (standalone, pre-pick, match-flow) and adapts
the CTA + post-save navigation per entry.

## 2026-05-10 — Defense flow auto-rolls + persistent status panel (PR #16, #17)

`select-defense` collapses pick + roll + damage into a single
dispatch. While a defense is in flight the dice tray switches to the
defender's dice and a `DefenseStatusPanel` overlay pins top-center
showing the chosen defense's combo + dice count + a live
DEFENDING…/ROLLING…/DEFENDED −X/MISSED status. The earlier "manual
ROLL button after pick" iteration was removed.

## 2026-05-10 — Click-to-fire on the ladder (PR #8, #9)

The active player can tap a FIRING or TRIGGERED row in their own
ladder during `offensive-roll` to open a confirm modal that fires
that ability, skipping the full picker overlay. Out-of-reach rows
stay non-interactive.

## 2026-05-10 — Offensive ladder canonicalized: 1·T1 / 3·T2 / 2·T3 / 1·T4 with `5× face-6` ultimate (PR #13)

Every shipping hero now follows the same offensive shape and the
single T4 Ultimate is gated on rolling all five dice on the hero's
unique face-6 symbol (Howl, Ruin, Zenith). Avalanche and Apostasy
were demoted T4 → T2; Volcanic Rain was removed. The dual
"T4-Standard vs T4-Career-Moment" framing is retired in docs — there
is one Ultimate per hero, and the canonical pattern is `5× face-6`.

## 2026-05-10 — Initial roster: Berserker, Pyromancer, Lightbearer

Three playable heroes across rush / burn / survival archetypes,
each shipping its full `HeroDefinition` + card pool + atmospheric
theming + sigils. See `docs/heroes/` and `docs/cards/`.
