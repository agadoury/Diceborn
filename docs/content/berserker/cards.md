# Berserker — cards

> **📦 Source of truth: [`src/content/cards/berserker.ts`](../../../src/content/cards/berserker.ts).** Costs, kinds, and rules text below are a snapshot of the data file — convenient for browsing, but if a number here disagrees with the `.ts` the `.ts` wins; please patch this page or open an issue.
>
> Hero design: [`./design.md`](./design.md). Hero data: [`src/content/heroes/berserker.ts`](../../../src/content/heroes/berserker.ts).

The Berserker ships **14 cards** in his catalog. The deck-builder picks
3 dice-manip + 3 ladder-upgrade + 2 signature from this pool, plus 4
of the 7 universal [`generic` cards](../generic-cards.md), for a 12-card
deck.

Multiple Masteries per slot give the deck-builder real choice — at T1
the player picks from Cleave Mastery / Iron Will / Twin Strike, and
the Defensive slot has Wolfborn.

## Recommended starter deck

From `BERSERKER.recommendedDeck`:

```
4 generic         quick-draw / focus / cleanse / bandage
3 dice-manip      iron-focus / berserker-rage / pelt-of-the-wolf
3 ladder-upgrade  cleave-mastery (T1) / northern-storm (T2) / bloodbound (T3)
2 signature       hunters-mark / counterstrike
```

Defensive Mastery slot is intentionally left open in the starter so
the deck-builder can swap Wolfborn in. (Live engine fallback: defensive
abilities work without a Mastery; the upgrade just makes them stronger.)

## Catalog

### Dice manipulation (3)

| ID | Cost | Kind | Once | Text |
|---|---|---|---|---|
| `berserker/iron-focus` | 1 | roll-phase | — | Set 1 of your dice to a face value of your choice. Once per turn. |
| `berserker/berserker-rage` | 2 | roll-phase | — | Reroll all your dice once, ignoring lock states. Cannot be used on the final attempt. |
| `berserker/pelt-of-the-wolf` | 1 | main-phase | — | Until end of turn, your fur faces count as axe faces for combo purposes. |

### Ladder upgrades (Masteries × 6)

| ID | Cost | Slot | Text |
|---|---|---|---|
| `berserker/cleave-mastery` | 2 | T1 | Permanent. Cleave damage becomes 5/7/9. Cleave with 4+ axes becomes undefendable. |
| `berserker/iron-will` | 2 | T1 | Permanent. Cleave also heals 1 HP on every hit. |
| `berserker/twin-strike` | 3 | T1 | Permanent. Cleave fires twice in sequence — both hits roll defense, both apply Frost-bite. |
| `berserker/northern-storm` | 3 | T2 | Permanent. Glacier Strike: 7 unblockable, self-heal 2 HP. Winter Storm: 11 dmg. |
| `berserker/bloodbound` | 3 | T3 | Permanent. Blood Harvest: threshold becomes 10, heals 3 HP per Frenzy stack. Frostfang: damage becomes 9, +3 Frost-bite. |
| `berserker/wolfborn` | 3 | Defensive | Permanent. Wolfhide: −5 dmg. Bloodoath: heal scales 4/5/6 with fur count. Glacial Counter: −7 dmg, +2 Frost-bite. |

(One Mastery per slot per match — the player picks which T1 to take into the deck.)

### Signature plays (5)

| ID | Cost | Kind | Once | Text |
|---|---|---|---|---|
| `berserker/war-cry` | 3 | main-phase | — | Add 3 Frenzy stacks immediately, regardless of HP threshold. |
| `berserker/hunters-mark` | 1 | main-phase | — | Apply 2 Frost-bite to opponent directly, no roll required. |
| `berserker/ancestral-spirits` | 2 | main-phase | — | Until end of match, all your offensive abilities deal +1 damage. Discarded if you take damage from a Tier 4 Ultimate. |
| `berserker/last-stand` | 4 | roll-phase | ✓ | Playable only when at ≤10 HP. Choose a face value; until end of turn, all 5 of your dice count as that face. Once per match. |
| `berserker/counterstrike` | 2 | instant | ✓ | Once per match. When an opponent's offensive ability deals you 1+ damage, gain +2 Frenzy AND apply +1 Frost-bite to the attacker. |

## See also

- [`./design.md`](./design.md) — full hero design notes.
- [`../../design/deck-building.md`](../../design/deck-building.md) — composition rules.
