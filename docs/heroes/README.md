# Heroes

Reference docs for every hero registered in `src/content/heroes/`. Each
hero has its own page that mirrors the structure used in the original
hero submission (lore + visual identity + dice + signature passive +
signature token + ability ladder + defensive ladder + cards + audio +
tuning notes + quick reference).

These pages are descriptive, not prescriptive — the source of truth for
mechanics is the hero data file. When the data and these docs disagree,
the data wins; this folder is updated to match.

## Roster

| Hero | Archetype | Complexity | File |
|---|---|---|---|
| The Berserker | Rush | 1 | [berserker.md](./berserker.md) |
| The Pyromancer | Burn | 3 | [pyromancer.md](./pyromancer.md) |

When adding a hero:
1. Create `src/content/heroes/<id>.ts` and register it in `src/content/index.ts`.
2. Add a doc page here named `<id>.md` following the Berserker template.
3. Add the row to the roster table above.
