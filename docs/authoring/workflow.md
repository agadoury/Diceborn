# Authoring workflow

How to take a hero or card change from idea to merged code. Four
scenarios are covered: (1) adding a new hero, (2) adding cards to an
existing hero, (3) updating an existing hero (tuning, role changes),
(4) updating or removing cards. Each scenario lists the files to
touch, the validation steps, and the doc updates required.

> **Companion docs** — read these before/during your change:
>
> - [`./hero-spec.md`](./hero-spec.md) — the *design brief*. What a hero spec must contain (uniqueness pillars, dice identity, ladders, signature mechanic, originality guideline). Read first when designing a brand-new hero.
> - [`cheatsheet.md`](./cheatsheet.md) — field-by-field reference for the hero template.
> - [`examples.md`](./examples.md) — worked patterns for every effect primitive (mastery cards, persistent buffs, conditional bonuses, bankable spends, wildcard removes…). Use as starting points.
> - [`../engine/rules.md`](../engine/rules.md), [`../engine/cards.md`](../engine/cards.md) — when you need to understand a primitive or its constraints.
> - [`../design/deck-building.md`](../design/deck-building.md) — the deck composition rules your card pool must support.

## Table of contents

1. [Source of truth, in one rule](#1-source-of-truth-in-one-rule)
2. [Scenario 1 — Add a new hero](#2-scenario-1--add-a-new-hero)
3. [Scenario 2 — Add cards to an existing hero](#3-scenario-2--add-cards-to-an-existing-hero)
4. [Scenario 3 — Update an existing hero (ability tuning)](#4-scenario-3--update-an-existing-hero-ability-tuning)
5. [Scenario 4 — Update or remove cards](#5-scenario-4--update-or-remove-cards)
6. [Validation checklist](#6-validation-checklist)
7. [Documentation rules](#7-documentation-rules)
8. [Submission — branch, commit, PR](#8-submission--branch-commit-pr)
9. [Decision log — when to write a CHANGELOG entry](#9-decision-log--when-to-write-a-changelog-entry)

---

## 1. Source of truth, in one rule

> **The `.ts` files in `src/content/` are the source of truth for
> mechanical data.** The `.md` files in `docs/content/<hero>/` are
> *design intent* — lore, ability roles, cinematics, tuning
> rationale.

Practical consequence: **tuning passes only touch `.ts` files.** Don't
mirror combo tweaks or damage tweaks into the docs. The doc says
"live data lives in the `.ts`" — readers click through for current
numbers.

When the role of an ability shifts (e.g. a sustain T2 becomes a burst
T2), update the role description in the doc. When only the *numbers*
shift, the doc stays put.

---

## 2. Scenario 1 — Add a new hero

The biggest change. Plan on a multi-PR rollout if it's complex
(content first, polish in follow-ups).

### 2.1 Design the hero

1. Read [`./hero-spec.md`](./hero-spec.md) end to end. It defines the design contract — uniqueness pillars, ladder shape (1·T1 + 3·T2 + 2·T3 + 1·T4 with `5× face-6` ultimate), tuning bands, originality guideline.
2. Fill in the [`§7 Required output template`](./hero-spec.md#7-required-output-template) — paper or scratch markdown is fine. Run the [`§8 Self-check`](./hero-spec.md#8-self-check-before-submitting). Don't skip the self-check; it catches authoring drift.
3. If you're adopting a brand-new mechanical primitive (i.e. one not in [`engine/cards.md`](../engine/cards.md) or [`examples.md`](./examples.md)), open a discussion *before* writing data. New primitives may need engine-level changes.

### 2.2 Drop the data files

Two new files, three registrations:

```
src/content/heroes/<heroId>.ts        # NEW — HeroDefinition
src/content/cards/<heroId>.ts         # NEW — Card[] catalog
src/content/index.ts                  # EDIT — register the hero in HEROES
src/content/cards/index.ts            # EDIT — register the cards in HERO_CARDS
```

Hero data file (`heroes/<id>.ts`) contents — straight from your filled-in template:

- `id`, `name`, `complexity`, `accentColor`, `signatureQuote`, `archetype`
- `diceIdentity` — six face entries
- `resourceIdentity.cpGainTriggers` — structured triggers, no freeform prose
- `signatureMechanic` — `kind`, `passiveKey`, optional `bankStartsAt` / `bankCap` / `spendOptions`
- `abilityLadder` — exactly **1 T1 + 3 T2 + 2 T3 + 1 T4** = 7 entries. The T4 is gated on `5× face-6` (your hero's unique face-6 symbol) and uses `ultimateBand: "career-moment"`.
- `defensiveLadder` — three entries (D1, D2, D3) with `defenseDiceCount` and an optional `offensiveFallback` on D2 or D3.
- `recommendedDeck` — exactly 12 valid card IDs in the order generic / dice-manip / ladder-upgrade / signature.
- `onHitApplyStatus` (optional) — shorthand for "every offensive hit also applies X".

Card catalog file (`cards/<id>.ts`) contents:

- ≥ 3 dice-manip cards (the player puts ALL 3 in their deck)
- ≥ 4 ladder-upgrade Masteries (one per slot {T1, T2, T3, Defensive}; ship more options for build variety)
- ≥ 5 signature cards (player picks 2 in their deck)
- **Never** ship `cardCategory: "generic"` cards — that pool is universal and lives in `src/content/cards/generic.ts`.
- **Never** ship a `ladder-upgrade` with `masteryTier: 4` — T4 Ultimates have no Mastery (the validator rejects it).

### 2.3 Optional engine extensions

If your hero introduces a new face symbol or a new signature status token:

```
src/components/game/dieFaces.tsx      # EDIT — add FACE_GLYPHS + FACE_TINT entries for new symbols
src/game/status.ts                    # EDIT — registerStatus() for new signature tokens
```

If your hero needs a brand-new effect primitive or modifier shape — that's a separate, larger PR. Don't bury engine changes inside a hero PR; they need their own review.

### 2.4 Drop the doc files

Two new files, one registry edit:

```
docs/content/<heroId>/design.md       # NEW — hero design page (lore, ability roles, cinematics, tuning rationale)
docs/content/<heroId>/cards.md        # NEW — card catalog listing
docs/content/README.md                # EDIT — add a roster row
```

For the **hero design page**, follow the existing structure in
[`berserker/design.md`](../content/berserker/design.md) /
[`pyromancer/design.md`](../content/pyromancer/design.md) /
[`lightbearer/design.md`](../content/lightbearer/design.md). Same numbered sections (Lore →
Visual identity → Dice → Signature passive → Signature token →
Resource trigger → Offensive ladder → Defensive ladder → Cards →
Audio identity → Tuning notes → Quick reference → Engine touchpoints).

**Required at the top**: the `📦 Source of truth` callout pointing at
the `.ts` file. The §7 / §8 ladder sections should be **role-summary
prose, not mechanical tables** — combo / damage / effect numbers all
live in the `.ts`. Ability cinematics + tuning rationale stay in the
doc.

For the **card listing page**, follow [`berserker/cards.md`](../content/berserker/cards.md). Tables of cost / kind / rules-text are fine here (they're a snapshot for browsing); just include the snapshot-disclaimer callout at the top.

### 2.5 Validate

See [Validation checklist](#6-validation-checklist) below for the full
flow. At minimum: typecheck, tests, simulate (multiple seeds),
in-browser manual playtest with the new hero on both sides.

### 2.6 CHANGELOG entry

Add a new entry at the top of [`/CHANGELOG.md`](../../CHANGELOG.md):

```markdown
## YYYY-MM-DD — New hero: <Name> (<Archetype>)

One-paragraph description of the hero's identity and what design
space they fill (gap they cover, what makes them mechanically
distinct from the existing roster). Reference the ladder shape if
notable.
```

---

## 3. Scenario 2 — Add cards to an existing hero

Smaller change; can usually ship in one PR.

### 3.1 Files to edit

```
src/content/cards/<heroId>.ts         # EDIT — append Card entries to the array
docs/content/<heroId>/cards.md                # EDIT — add row(s) to the matching table(s)
```

### 3.2 Card design constraints

- Pick a `cardCategory`: `dice-manip`, `ladder-upgrade`, or `signature`.
- Pick a `kind`: `main-phase`, `roll-phase`, `instant`, or `mastery`.
- For `ladder-upgrade` Masteries, declare `masteryTier: 1 | 2 | 3 | "defensive"`. **Never `4`** (engine rejects it).
- For `instant`, declare a structured `trigger` from the taxonomy in [`engine/cards.md`](../engine/cards.md) (`self-takes-damage`, `self-attacked`, `opponent-fires-ability`, `opponent-removes-status`, `opponent-applies-status`, `self-ability-resolved`, `match-state-threshold`).
- Cost in `0..5` CP. Larger costs are a smell — consider a `oncePerMatch: true` cap instead.

### 3.3 Effect tree

Pick from the canonical primitives — see [`examples.md`](./examples.md) for worked patterns of each. If you need a one-off no-primitive-fits effect, the `custom` escape hatch exists, but flag it in the PR description so reviewers can decide whether to promote it to a real primitive.

### 3.4 Validate + ship

- `npm run typecheck` — catches type-mismatches in the card definition.
- `npm test` — runs deck-validation and ability-upgrade tests.
- Manual: load `/decks` → pick the hero → confirm the new card appears in the catalog with the expected category badge / cost / text. Add it to a deck if the category has room; play a match.
- CHANGELOG entry only if the addition is balance-impacting (a new persistent buff, a new instant trigger, a `oncePerMatch` payload). Pure flavor cards usually don't need an entry.

---

## 4. Scenario 3 — Update an existing hero (ability tuning)

The most common change. **Mostly a one-file edit**.

### 4.1 What's "tuning"?

Numeric or value-only changes that don't change an ability's *role*:

- Damage values
- Status stack counts
- Combo gates (within reason — changing `count: 3` → `count: 4` on a T2 ash combo is tuning)
- Heal amounts
- `targetLandingRate` ranges
- Adding / removing `conditional_bonus` clauses
- Tightening or loosening combos

### 4.2 Files to edit

```
src/content/heroes/<heroId>.ts        # EDIT — the data file is the source of truth
```

**That's usually all.** No doc edits required — `docs/content/<heroId>/design.md` describes ability *roles*, not specific numbers, and roles don't change when you bump damage from 4 to 5.

### 4.3 When *do* I update the doc?

Only when the change shifts a *role*:

- A T2 sustain ability becomes a T2 burst ability (e.g. you remove the heal and add damage). Update the §7 role row.
- An ability gets demoted or promoted between tiers. Update §7 + §12 quick-ref.
- An ability is removed entirely. Remove its entry from §7 + §10 audio direction + §12 quick-ref.
- The hero's overall play pattern changes (e.g. a tank archetype becomes a control archetype). Update §1 lore + §11 tuning notes.

### 4.4 Validate

- `npm run typecheck`
- `npm test`
- `npm run simulate` — runs a bot-vs-bot match. Run multiple seeds (`npm run simulate -- --seed 1 && --seed 2 ...`) to sanity-check landing-rate balance.
- `npm run simulate -- --rates` — full landing-rate audit. Compare against the hero's `targetLandingRate` bands.
- Manual playtest if balance-impacting.

### 4.5 CHANGELOG entry

Add an entry for any change that meaningfully alters the hero's
matchup or rotation. Pure micro-tweaks (e.g. T1 damage 4 → 4.5)
don't need one; a Mastery rewrite does.

---

## 5. Scenario 4 — Update or remove cards

Similar to Scenario 3 but on the card layer.

### 5.1 Files to edit

```
src/content/cards/<heroId>.ts         # EDIT — the data file
docs/content/<heroId>/cards.md                # EDIT IF text/cost changed — table is a snapshot
```

The card-page tables are explicitly framed as a snapshot of the data file; the data file wins. Update the table when you can; don't block a PR on it.

### 5.2 Removing a card

If the card appears in any `recommendedDeck` (in the hero's `heroes/<id>.ts`), update the `recommendedDeck` list to swap in a replacement of the same category. Otherwise existing player decks may fail to resolve the card and fall back to `recommendedDeck` wholesale (per `getDeckCards` behavior).

If the card was in the `validateDeckComposition` test fixtures, update those.

Players may have the removed card saved in their localStorage decks. The engine handles this gracefully — see [`../design/deck-building.md` §8](../design/deck-building.md#8-in-match-deck-behaviour). No migration needed.

### 5.3 Validate

- `npm run typecheck`
- `npm test`
- Manual: `/decks` → pick the hero → confirm the card no longer appears (or shows the new text/cost) → save the recommendedDeck → start a match.

### 5.4 CHANGELOG entry

Required for removals (players may have decks referencing the card). Optional for cost / text tweaks.

---

## 6. Validation checklist

Run these in order. Each step gates the next.

1. **`npm run typecheck`** — catches type errors. Card / hero data is heavily typed; a missing field or wrong primitive will fail here.
2. **`npm test`** — Vitest runs the existing 45-test suite (engine smoke, deck validation, ability upgrades, match summary, deck storage). All must pass.
3. **`npm run simulate`** — runs a bot-vs-bot match end-to-end. Confirms the hero's data resolves and a match completes without a safety-stop.
4. **`npm run simulate -- --rates`** — landing-rate audit. Reports per-ability landing % against `targetLandingRate` bands. Out-of-band rates are a balance smell, not always a bug.
5. **`npm run build`** — production bundle. Catches issues that show up only at build time (unused imports, lazy-import boundaries).
6. **`npm run dev` + manual play** — load the app, navigate hero-select, deck-builder, and match. For a new hero: play both sides. For tuning: play the affected ability through.

If any step fails, fix and re-run from step 1.

---

## 7. Documentation rules

These keep the per-hero edit cost low as the roster grows.

1. **Data is the source of truth.** Hero combos / damage / effects live in `.ts`. The `.md` page describes intent — lore, role, cinematic, audio direction, tuning rationale. When data and doc disagree, data wins.
2. **No mechanical tables in `docs/content/<id>/design.md` ladder sections.** Use prose role descriptions. The cinematic + tuning rationale belongs in the doc; the specific numbers belong in the `.ts`.
3. **Card-page tables ARE allowed**, but framed as snapshots of the data file. Include the snapshot-disclaimer callout at the top.
4. **Source-of-truth callouts** at the top of every per-hero / per-card page. Existing pages have the format; copy it.
5. **Cinematic prose stays.** Cinematics are design intent — they describe what the screen does, not what numbers come out. Don't strip them when you tune.

---

## 8. Submission — branch, commit, PR

### Branch naming

```
feature/<short-slug>          # new hero, new mechanic
hero/<id>/<short-change>      # tuning a specific hero
fix/<short-slug>              # engine or UI bug fix
docs/<short-slug>             # doc-only change
```

### Commit messages

One change per commit when possible. The first line is the summary
(< 70 chars); the body explains *why* and references any GitHub
issue. Use the imperative present tense ("add", "fix", "tune", not
"added", "fixed", "tuned").

### PR description

Cover, at minimum:

- **Summary** — what changed and why, in 1–3 paragraphs.
- **Files touched** — group by data files / engine files / doc files.
- **Test plan** — checkboxes for each validation step you ran.
- **CHANGELOG entry** — paste the entry you added, if any.
- For **balance changes**, paste the relevant `npm run simulate -- --rates` output before/after.

GitHub auto-renders a checkbox UI from `- [ ]` / `- [x]` lines. Use it.

---

## 9. Decision log — when to write a CHANGELOG entry

[`/CHANGELOG.md`](../../CHANGELOG.md) tracks design + architecture decisions over time. Use these rules:

| Change type | Entry needed? |
|---|---|
| New hero | **Yes.** Identity + design space filled. |
| New mechanic primitive (engine extension) | **Yes.** Why it was needed, which heroes consume it. |
| Removing a card / ability | **Yes.** Players may have decks or muscle memory tied to it. |
| Mastery rewrite that changes the build path | **Yes.** Affects deck-building strategy. |
| Damage / cost / status-stack tuning that meaningfully shifts matchups | Yes. |
| Damage / cost / status-stack tuning within ±1 of the original | Optional — depends on whether it changes the hero's win rate envelope. |
| Doc-only changes | No. |
| Bug fixes that don't alter intended behavior | No. |
| New cards (pure flavor — no new primitive) | No. |

Format reminder (from `CHANGELOG.md` itself):

```markdown
## YYYY-MM-DD — Headline

What changed and why. Links to the PR / commit if helpful. One short
paragraph per entry; no bullet-point sprawl.
```

New entries go at the top.
