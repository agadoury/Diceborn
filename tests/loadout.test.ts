/**
 * loadout.test.ts — coverage for the loadout draft layer:
 *
 *  - `validateLoadout` accepts conformant selections and surfaces issues
 *    for empty / wrong-tier / duplicate / unknown-ability inputs.
 *  - `resolveLoadout` materialises offense + defense ability defs from a
 *    selection, and falls back to `recommendedLoadout` on missing /
 *    invalid input.
 *  - Engine integration: a `start-match` action accepting `p1Loadout`
 *    produces snapshots whose `activeOffense` / `activeDefense` reflect
 *    the draft. The pendingAttack.abilityIndex aligns with `activeOffense`.
 */
import { describe, it, expect } from "vitest";
import { resolveLoadout, validateLoadout } from "../src/game/loadout";
import { applyAction, makeEmptyState } from "../src/game/engine";
import { getHero, getRegisteredHeroIds } from "../src/content";
import type { LoadoutSelection } from "../src/game/types";

describe("validateLoadout", () => {
  it("accepts every hero's recommendedLoadout", () => {
    for (const id of getRegisteredHeroIds()) {
      const hero = getHero(id);
      const issues = validateLoadout(hero, hero.recommendedLoadout);
      expect(issues, `${id} recommendedLoadout issues`).toEqual([]);
    }
  });

  it("rejects empty offense", () => {
    const hero = getHero(getRegisteredHeroIds()[0]);
    const issues = validateLoadout(hero, { offense: [], defense: hero.recommendedLoadout.defense });
    expect(issues.length).toBeGreaterThan(0);
  });

  it("rejects a missing tier (zero T2 abilities)", () => {
    const hero = getHero(getRegisteredHeroIds()[0]);
    const rec = hero.recommendedLoadout;
    // Drop the T2 ability — the offense array shrinks to 3.
    const broken: LoadoutSelection = {
      offense: rec.offense.filter(name => {
        const def = hero.abilityCatalog.find(a => a.name === name);
        return def && def.tier !== 2;
      }),
      defense: rec.defense,
    };
    const issues = validateLoadout(hero, broken);
    expect(issues.some(i => i.includes("Tier 2"))).toBe(true);
  });

  it("rejects two of the same tier", () => {
    const hero = getHero(getRegisteredHeroIds()[0]);
    const t2s = hero.abilityCatalog.filter(a => a.tier === 2);
    if (t2s.length < 2) return; // hero with single T2 — skip
    const rec = hero.recommendedLoadout;
    const broken: LoadoutSelection = {
      offense: [
        ...rec.offense.filter(name => {
          const def = hero.abilityCatalog.find(a => a.name === name);
          return def && def.tier !== 2;
        }),
        t2s[0].name,
        t2s[1].name,
      ],
      defense: rec.defense,
    };
    const issues = validateLoadout(hero, broken);
    expect(issues.some(i => i.includes("2 Tier 2") || i.includes("Tier 2 abilities"))).toBe(true);
  });

  it("rejects defense entries not in the catalog", () => {
    const hero = getHero(getRegisteredHeroIds()[0]);
    const issues = validateLoadout(hero, {
      offense: hero.recommendedLoadout.offense,
      defense: ["Nonexistent Wall", hero.recommendedLoadout.defense[0]],
    });
    expect(issues.some(i => i.includes("Nonexistent Wall"))).toBe(true);
  });

  it("rejects duplicate defenses", () => {
    const hero = getHero(getRegisteredHeroIds()[0]);
    const d = hero.recommendedLoadout.defense[0];
    const issues = validateLoadout(hero, {
      offense: hero.recommendedLoadout.offense,
      defense: [d, d],
    });
    expect(issues.some(i => i.includes("twice"))).toBe(true);
  });
});

describe("resolveLoadout", () => {
  it("materialises offense ordered T1 → T4 from a valid selection", () => {
    const hero = getHero(getRegisteredHeroIds()[0]);
    const r = resolveLoadout(hero, hero.recommendedLoadout);
    expect(r.offense.length).toBe(4);
    expect(r.offense.map(a => a.tier)).toEqual([1, 2, 3, 4]);
    expect(r.defense.length).toBe(2);
  });

  it("falls back to recommendedLoadout when given an invalid selection", () => {
    const hero = getHero(getRegisteredHeroIds()[0]);
    const r = resolveLoadout(hero, { offense: [], defense: [] });
    expect(r.offense.length).toBe(4);
    expect(r.defense.length).toBe(2);
  });

  it("falls back to recommendedLoadout when given undefined", () => {
    const hero = getHero(getRegisteredHeroIds()[0]);
    const r = resolveLoadout(hero, undefined);
    expect(r.offense.length).toBe(4);
    expect(r.defense.length).toBe(2);
  });
});

describe("start-match materialises active arrays from a loadout", () => {
  it("uses the supplied p1Loadout on the p1 snapshot", () => {
    const ids = getRegisteredHeroIds();
    const p1Hero = getHero(ids[0]);
    const p2Hero = getHero(ids[1] ?? ids[0]);
    // Build an alternate loadout by swapping the T2 entry if catalog allows.
    const altT2 = p1Hero.abilityCatalog.find(a =>
      a.tier === 2 && a.name !== p1Hero.recommendedLoadout.offense.find(n => {
        const def = p1Hero.abilityCatalog.find(b => b.name === n);
        return def?.tier === 2;
      }),
    );
    const p1Loadout: LoadoutSelection = altT2
      ? {
          offense: p1Hero.recommendedLoadout.offense.map(n => {
            const def = p1Hero.abilityCatalog.find(a => a.name === n);
            return def?.tier === 2 ? altT2.name : n;
          }),
          defense: [...p1Hero.recommendedLoadout.defense],
        }
      : { ...p1Hero.recommendedLoadout, offense: [...p1Hero.recommendedLoadout.offense], defense: [...p1Hero.recommendedLoadout.defense] };

    const { state } = applyAction(makeEmptyState(), {
      kind: "start-match", seed: 11,
      p1: p1Hero.id, p2: p2Hero.id, coinFlipWinner: "p1",
      p1Loadout,
    });
    const snap = state.players.p1;
    expect(snap.activeOffense.length).toBe(4);
    expect(snap.activeDefense.length).toBe(2);
    // Tier ordering invariant.
    expect(snap.activeOffense.map(a => a.tier)).toEqual([1, 2, 3, 4]);
    // The drafted ability names show up on the snapshot.
    if (altT2) {
      const t2name = snap.activeOffense.find(a => a.tier === 2)?.name;
      expect(t2name).toBe(altT2.name);
    }
  });

  it("falls back to recommendedLoadout when no loadout is supplied", () => {
    const ids = getRegisteredHeroIds();
    const { state } = applyAction(makeEmptyState(), {
      kind: "start-match", seed: 13,
      p1: ids[0], p2: ids[1] ?? ids[0], coinFlipWinner: "p1",
    });
    const snap = state.players.p1;
    const recOffenseNames = new Set(getHero(ids[0]).recommendedLoadout.offense.map(s => s.toLowerCase()));
    for (const a of snap.activeOffense) {
      expect(recOffenseNames.has(a.name.toLowerCase()), `${a.name} should be in recommended loadout`).toBe(true);
    }
  });

  it("ladderState row count matches activeOffense.length", () => {
    const ids = getRegisteredHeroIds();
    const { state } = applyAction(makeEmptyState(), {
      kind: "start-match", seed: 17,
      p1: ids[0], p2: ids[1] ?? ids[0], coinFlipWinner: "p1",
    });
    expect(state.players.p1.ladderState.length).toBe(state.players.p1.activeOffense.length);
    expect(state.players.p2.ladderState.length).toBe(state.players.p2.activeOffense.length);
  });
});

describe("engine respects activeOffense, not the full catalog", () => {
  /** Force the active player's dice to a specific symbol multiset by writing
   *  directly to `current`. Used to make a specific ability's combo match
   *  deterministically without going through the RNG. */
  function setAllDiceToFace(state: import("../src/game/types").GameState, pid: "p1" | "p2", faceIndex: 0|1|2|3|4|5) {
    for (const d of state.players[pid].dice) d.current = faceIndex;
  }

  it("offensive picker only surfaces abilities from activeOffense — catalog alternates with the same combo do not match", () => {
    // Berserker's Cleave and Pommel Strike share `symbol-count axe count: 3`.
    // Cleave is in the recommended loadout; Pommel Strike is in the catalog
    // but NOT the recommended loadout. With 3 axes showing, the picker must
    // surface Cleave only — not Pommel Strike.
    const ids = getRegisteredHeroIds();
    const berserker = ids.find(id => id === "berserker");
    if (!berserker) return; // skip when berserker isn't in this build
    const { state } = applyAction(makeEmptyState(), {
      kind: "start-match", seed: 41, p1: berserker, p2: ids[1] ?? berserker, coinFlipWinner: "p1",
    });
    // Berserker dice faces 0..2 are axe (faceValue 1/2/3). Set all 5 to axe.
    setAllDiceToFace(state, "p1", 0);
    // Drive into offensive-roll and end the roll so the picker opens.
    let s = state;
    ({ state: s } = applyAction(s, { kind: "roll-dice" }));
    // Engine still has 2 reroll attempts; commit by advancing past offensive-roll.
    while (s.phase === "offensive-roll" && !s.pendingOffensiveChoice) {
      const before = s;
      ({ state: s } = applyAction(s, { kind: "advance-phase" }));
      if (s === before) break;
    }
    expect(s.pendingOffensiveChoice).toBeDefined();
    const matchNames = (s.pendingOffensiveChoice?.matches ?? []).map(m => m.abilityName);
    expect(matchNames).toContain("Cleave");
    // The picker must NOT surface Pommel Strike (it's in the catalog but not
    // the drafted loadout). If it did, the engine is reading from the catalog.
    expect(matchNames).not.toContain("Pommel Strike");
  });

  it("select-defense indexes into activeDefense, not the full catalog", () => {
    const ids = getRegisteredHeroIds();
    const berserker = ids.find(id => id === "berserker");
    if (!berserker) return;
    const { state } = applyAction(makeEmptyState(), {
      kind: "start-match", seed: 43, p1: berserker, p2: berserker, coinFlipWinner: "p1",
    });
    // Both players default to recommendedLoadout — defense is [Wolfhide, Bloodoath].
    expect(state.players.p1.activeDefense.length).toBe(2);
    expect(state.players.p1.activeDefense.map(a => a.name)).toEqual(["Wolfhide", "Bloodoath"]);
    // The catalog alternate "Skin of the Pack" must not be present in activeDefense.
    expect(state.players.p1.activeDefense.find(a => a.name === "Skin of the Pack")).toBeUndefined();
  });
});
