# Lightbearer — cards

Source: [`src/content/cards/lightbearer.ts`](../../src/content/cards/lightbearer.ts).
Hero data: [`src/content/heroes/lightbearer.ts`](../../src/content/heroes/lightbearer.ts).

The Lightbearer ships **12 cards** in his catalog — the floor for the
deck-builder's authoring contract (3 dice-manip + 4 Masteries — one
per slot — + 5 signature). The deck-builder picks 3 dice-manip + 3
ladder-upgrade + 2 signature, plus 4 of the 7 universal
[`generic` cards](./generic.md), for a 12-card deck.

With only one Mastery per slot, the build choice for Lightbearer is
which 3 of 4 slots to claim and which 2 of 5 signature plays to
include.

## Recommended starter deck

From `LIGHTBEARER.recommendedDeck`:

```
4 generic         quick-draw / focus / cleanse / bandage
3 dice-manip      steady-light / faith / resolve
3 ladder-upgrade  dawnblade-mastery (T1) / solar-devotion (T2) / sunblade-mastery (T3)
2 signature       aegis-of-dawn / sanctuary
```

The Defensive Mastery slot (Cathedral Light) is left open in the
starter — the deck-builder can swap it in.

## Catalog

### Dice manipulation (3)

| ID | Cost | Kind | Once | Text |
|---|---|---|---|---|
| `lightbearer/steady-light` | 1 | roll-phase | — | Set 1 of your dice to a sun face. Once per turn. |
| `lightbearer/faith` | 2 | roll-phase | — | Reroll all your dice not currently showing sun or dawn. |
| `lightbearer/resolve` | 1 | main-phase | — | Until end of turn, your dawn faces count as sun faces for combo purposes. |

### Ladder upgrades (Masteries × 4)

| ID | Cost | Slot | Text |
|---|---|---|---|
| `lightbearer/dawnblade-mastery` | 2 | T1 | Permanent. Dawnblade damage becomes 4/6/8. |
| `lightbearer/solar-devotion` | 3 | T2 | Permanent. Sun Strike: 7 ub, +2 Radiance. Dawn Prayer: 5 dmg + heal 3 + 2 Verdict. |
| `lightbearer/sunblade-mastery` | 3 | T3 | Permanent. Solar Blade: 9 ub, +2 dmg per Verdict stripped. Divine Ray: 11 dmg, +3 Verdict. |
| `lightbearer/cathedral-light` | 3 | Defensive | Permanent. Dawn-Ward: heal 6 (+2 Radiance with 3+ dawn). Prayer of Shielding: −7 dmg, +2 Radiance. Wall of Dawn: −10 dmg (+1 Radiance with 4+ sun). |

### Signature plays (5)

| ID | Cost | Kind | Once | Text |
|---|---|---|---|---|
| `lightbearer/sanctuary` | 3 | main-phase | — | Until your next turn, all incoming damage reduced by 2. |
| `lightbearer/dawnsong` | 2 | main-phase | — | Convert 2 Radiance tokens into +4 CP. |
| `lightbearer/aegis-of-dawn` | 4 | instant | ✓ | Once per match. When opponent fires a Tier 4 Ultimate, halve its damage (round up). |
| `lightbearer/vow-of-service` | 3 | main-phase | — | Until end of match, when defending with a Tier 2+ defensive ability, gain +2 Radiance instead of +1. |
| `lightbearer/sunburst` | 2 | roll-phase | ✓ | Once per match. This turn only, your Dawnblade and Sun Strike each deal +2 damage and auto-fire on any sword. |

## See also

- [`../heroes/lightbearer.md`](../heroes/lightbearer.md) — full hero design notes.
- [`../DECK_BUILDING.md`](../DECK_BUILDING.md) — composition rules.
