# Pyromancer — cards

Source: [`src/content/cards/pyromancer.ts`](../../src/content/cards/pyromancer.ts).
Hero data: [`src/content/heroes/pyromancer.ts`](../../src/content/heroes/pyromancer.ts).

The Pyromancer ships **13 cards** in her catalog. The deck-builder
picks 3 dice-manip + 3 ladder-upgrade + 2 signature from this pool,
plus 4 of the 7 universal [`generic` cards](./generic.md), for a
12-card deck.

Multiple T1 Masteries give the deck-builder a real fork — Ember
Strike Mastery (sustain Cinder pressure) vs. Phoenix Form (replaces
Ember Strike with Phoenix Flame for self-heal value).

## Recommended starter deck

From `PYROMANCER.recommendedDeck`:

```
4 generic         quick-draw / focus / cleanse / bandage
3 dice-manip      ember-channel / pyromantic-surge / forge
3 ladder-upgrade  ember-strike-mastery (T1) / volcanic-awakening (T2) / crater-heart (T3)
2 signature       char / phoenix-veil
```

The Defensive Mastery slot (Mountain's Patience) is left open in the
starter — the deck-builder can swap it in.

## Catalog

### Dice manipulation (3)

| ID | Cost | Kind | Once | Text |
|---|---|---|---|---|
| `pyromancer/ember-channel` | 1 | roll-phase | — | Convert 1 of your dice from an ash face to an ember face. |
| `pyromancer/pyromantic-surge` | 1 | roll-phase | — | Reroll all your dice not currently showing ruin or ash. |
| `pyromancer/forge` | 2 | roll-phase | — | Set 1 of your dice to a ruin face. |

### Ladder upgrades (Masteries × 5)

| ID | Cost | Slot | Text |
|---|---|---|---|
| `pyromancer/ember-strike-mastery` | 2 | T1 | Permanent. Ember Strike damage becomes 4/6/8. Cinder applied increases to 2. |
| `pyromancer/phoenix-form` | 3 | T1 | Permanent. Replace Ember Strike with Phoenix Flame: 4+ ember; 3 dmg + heal 3 self. |
| `pyromancer/volcanic-awakening` | 4 | T2 | Permanent. Buffs all 3 T2 abilities — Firestorm 6 dmg + 3 Cinder, Obsidian Burst 9 dmg, Ember Wall 6 dmg + Shield 2 (4+ ember). |
| `pyromancer/crater-heart` | 3 | T3 | Permanent. Magma Heart 10 dmg + 3 Cinder. Pyro Lance 11 dmg + 2/Cinder when opponent has 3+ Cinder. |
| `pyromancer/mountains-patience` | 3 | Defensive | Permanent. Magma Shield: −4 dmg + 2 Cinder. Disperse: 2 Cinder on negation. Ash Mirror: −7 dmg + strip 2. |

(One Mastery per slot per match — the player picks one of the two T1 options.)

### Signature plays (5)

| ID | Cost | Kind | Once | Text |
|---|---|---|---|---|
| `pyromancer/char` | 2 | main-phase | — | Apply 3 Cinder to opponent directly. |
| `pyromancer/crater-wind` | 3 | main-phase | — | Until end of match, Cinder detonations deal 12 instead of 8. |
| `pyromancer/phoenix-veil` | 4 | instant | ✓ | Once per match. Negate the next attack and reflect it as Cinder per damage prevented. Not vs Ultimate. |
| `pyromancer/final-heat` | 3 | instant | — | When opponent removes Cinder, deal 2 pure damage per stack stripped. |
| `pyromancer/phoenix-stir` | 3 | main-phase | ✓ | Heal 5. If opponent has 3+ Cinder, heal 8 instead. |

## See also

- [`../heroes/pyromancer.md`](../heroes/pyromancer.md) — full hero design notes.
- [`../DECK_BUILDING.md`](../DECK_BUILDING.md) — composition rules.
