/**
 * Pact of Heroes — loadout validator + resolver.
 *
 * A `LoadoutSelection` is what the player drafts pre-match: the 4 offensive
 * abilities they bring (one per tier T1-T4) and the 2 defensive abilities
 * they bring (any two distinct entries from the defensive catalog). The
 * engine consumes the selection at `start-match` and materialises it onto
 * `HeroSnapshot.activeOffense` / `activeDefense`.
 *
 * Two concerns live here:
 *  - `validateLoadout(hero, sel)` returns the human-readable issues if any
 *    (empty array means conformant). Used by the LoadoutBuilder UI's
 *    "save" gate and by tests.
 *  - `resolveLoadout(hero, sel)` returns the concrete ability defs the
 *    engine should materialise. When `sel` is missing OR fails validation,
 *    the resolver falls back wholesale to the hero's `recommendedLoadout`
 *    rather than playing a partial / invalid loadout (mirrors
 *    `getDeckCards`'s wholesale-fallback policy).
 */

import type { AbilityDef, AbilityTier, HeroDefinition, LoadoutSelection } from "./types";

const OFFENSE_SIZE = 4;
const DEFENSE_SIZE = 2;
const TIERS: ReadonlyArray<AbilityTier> = [1, 2, 3, 4];

/** Find an ability by case-insensitive name match. */
function findByName(catalog: ReadonlyArray<AbilityDef>, name: string): AbilityDef | undefined {
  const needle = name.toLowerCase();
  return catalog.find(a => a.name.toLowerCase() === needle);
}

/** Return `[]` when the selection is conformant; otherwise a list of
 *  issues for the UI to surface. */
export function validateLoadout(hero: HeroDefinition, sel: LoadoutSelection): string[] {
  const issues: string[] = [];
  const catalog = hero.abilityCatalog;
  const defCatalog = hero.defensiveCatalog ?? [];

  if (sel.offense.length !== OFFENSE_SIZE) {
    issues.push(`offense has ${sel.offense.length} entries, expected exactly ${OFFENSE_SIZE} (one per tier)`);
  }
  if (sel.defense.length !== DEFENSE_SIZE) {
    issues.push(`defense has ${sel.defense.length} entries, expected exactly ${DEFENSE_SIZE}`);
  }

  // Resolve offense names → ability defs. Missing names + tier coverage.
  const offenseDefs: AbilityDef[] = [];
  for (const name of sel.offense) {
    const def = findByName(catalog, name);
    if (!def) {
      issues.push(`offense ability "${name}" is not in this hero's catalog`);
      continue;
    }
    offenseDefs.push(def);
  }
  // Exactly one per tier — count tier coverage on the resolved defs.
  const offenseByTier = new Map<AbilityTier, number>();
  for (const a of offenseDefs) {
    offenseByTier.set(a.tier, (offenseByTier.get(a.tier) ?? 0) + 1);
  }
  for (const t of TIERS) {
    const n = offenseByTier.get(t) ?? 0;
    if (n === 0) issues.push(`offense is missing a Tier ${t} ability`);
    if (n > 1) issues.push(`offense has ${n} Tier ${t} abilities, only one is allowed`);
  }

  // Defense: distinct names from the defensive catalog.
  const seenDef = new Set<string>();
  for (const name of sel.defense) {
    const def = findByName(defCatalog, name);
    if (!def) {
      issues.push(`defense ability "${name}" is not in this hero's defensive catalog`);
      continue;
    }
    const key = def.name.toLowerCase();
    if (seenDef.has(key)) {
      issues.push(`defense ability "${name}" is selected twice — entries must be distinct`);
    }
    seenDef.add(key);
  }

  return issues;
}

/** Materialise a loadout to concrete `AbilityDef`s the engine can drop on a
 *  snapshot. Returns the offense + defense ability arrays in canonical
 *  order (offense T1→T4; defense in the player's draft order). Falls back
 *  wholesale to `hero.recommendedLoadout` when `sel` is missing or fails
 *  validation. */
export function resolveLoadout(
  hero: HeroDefinition,
  sel?: LoadoutSelection,
): { offense: AbilityDef[]; defense: AbilityDef[] } {
  const fallback = hero.recommendedLoadout;
  const candidate = sel && validateLoadout(hero, sel).length === 0 ? sel : fallback;

  const catalog = hero.abilityCatalog;
  const defCatalog = hero.defensiveCatalog ?? [];

  const offense: AbilityDef[] = [];
  for (const name of candidate.offense) {
    const def = findByName(catalog, name);
    if (def) offense.push(def);
  }
  // Order T1 → T4 so the snapshot ladder reads consistently. Within a tier
  // (shouldn't happen given validation, but defensive) preserve draft order.
  offense.sort((a, b) => a.tier - b.tier);

  const defense: AbilityDef[] = [];
  for (const name of candidate.defense) {
    const def = findByName(defCatalog, name);
    if (def) defense.push(def);
  }

  // Last-resort safety: if either array came back empty (e.g. a hero
  // defined a recommendedLoadout referencing a renamed ability), fall back
  // to the first `OFFENSE_SIZE` / `DEFENSE_SIZE` catalog entries. This
  // keeps the engine bootable even when content drifts.
  if (offense.length < OFFENSE_SIZE) {
    const filler: AbilityDef[] = [];
    const usedTiers = new Set(offense.map(a => a.tier));
    for (const t of TIERS) {
      if (usedTiers.has(t)) continue;
      const pick = catalog.find(a => a.tier === t);
      if (pick) filler.push(pick);
    }
    offense.push(...filler);
    offense.sort((a, b) => a.tier - b.tier);
  }
  if (defense.length < DEFENSE_SIZE && defCatalog.length >= DEFENSE_SIZE) {
    const used = new Set(defense.map(a => a.name.toLowerCase()));
    for (const a of defCatalog) {
      if (defense.length >= DEFENSE_SIZE) break;
      if (used.has(a.name.toLowerCase())) continue;
      defense.push(a);
    }
  }

  return { offense, defense };
}

export const LOADOUT_OFFENSE_SIZE = OFFENSE_SIZE;
export const LOADOUT_DEFENSE_SIZE = DEFENSE_SIZE;
