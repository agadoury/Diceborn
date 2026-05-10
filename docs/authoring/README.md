# Authoring

How to add or change content in Pact of Heroes — heroes, cards, tuning passes.

| Page | Covers |
|---|---|
| [`workflow.md`](./workflow.md) | **Start here.** Operational guide: which files to drop / edit, validation steps, doc updates, branch / commit / PR rules. Four scenarios — new hero, add cards, tune hero, update / remove cards. |
| [`hero-spec.md`](./hero-spec.md) | The *design contract* — uniqueness pillars, dice identity, ladder shape, signature mechanic, tuning bands, originality guideline, required output template, self-check. Read end-to-end when designing a brand-new hero. |
| [`cheatsheet.md`](./cheatsheet.md) | Field-by-field reference — what each `HeroDefinition` field becomes in the engine and which site reads it. |
| [`examples.md`](./examples.md) | Worked patterns for every effect primitive (mastery cards, persistent buffs, conditional bonuses, bankable spends, wildcard removes, custom triggers, etc.). |

The `.ts` files in `src/content/` are the source of truth for mechanical data. The `.md` pages in `docs/content/<hero>/` are *design intent*. See [`workflow.md` §1](./workflow.md#1-source-of-truth-in-one-rule).
