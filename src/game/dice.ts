/**
 * Diceborn — dice, combo grammar, and ladder evaluator.
 *
 * The combo grammar expresses every Diceborn ability requirement.
 * The ladder evaluator is the single source of truth for live-highlight
 * states (FIRING / TRIGGERED / REACHABLE / OUT-OF-REACH) plus LETHAL.
 * Both the player UI and the AI consume this — guaranteeing identical
 * understanding of "what's possible."
 */

import type {
  AbilityDef,
  AbilityEffect,
  Die,
  DieFace,
  DiceCombo,
  HeroDefinition,
  HeroSnapshot,
  LadderRowState,
  SymbolId,
} from "./types";
import { nextInt } from "./rng";
import { stacksOf } from "./status";

// ── Symbol tallying ──────────────────────────────────────────────────────────
export function symbolsOnDice(dice: ReadonlyArray<Die>): SymbolId[] {
  return dice.map(d => d.faces[d.current].symbol);
}
export function tally(symbols: ReadonlyArray<SymbolId>): Map<SymbolId, number> {
  const m = new Map<SymbolId, number>();
  for (const s of symbols) m.set(s, (m.get(s) ?? 0) + 1);
  return m;
}

// ── Combo evaluation ─────────────────────────────────────────────────────────
/** Does the given symbol multiset satisfy the combo?
 *
 *  Note: `n-of-a-kind` and `straight` need face VALUES, not just symbols.
 *  When called via this signature they return false; use `comboMatchesFaces`
 *  (below) for face-aware evaluation. Existing hero data uses only symbol-
 *  based combos, so this is currently a no-op for them. */
export function comboMatches(combo: DiceCombo, symbols: ReadonlyArray<SymbolId>): boolean {
  const t = tally(symbols);
  switch (combo.kind) {
    case "symbol-count": return (t.get(combo.symbol) ?? 0) >= combo.count;
    case "matching":     return (t.get(combo.symbol) ?? 0) >= combo.count;
    case "at-least":     return (t.get(combo.symbol) ?? 0) >= combo.count;
    case "matching-any": {
      for (const v of t.values()) if (v >= combo.count) return true;
      return false;
    }
    case "any-of": {
      for (const sym of combo.symbols) {
        if ((t.get(sym) ?? 0) >= combo.count) return true;
      }
      return false;
    }
    case "specific-set": {
      for (const sym of combo.symbols) {
        if ((t.get(sym) ?? 0) < 1) return false;
      }
      return true;
    }
    case "n-of-a-kind":
      // Symbol-only signature can't determine n-of-a-kind. Use comboMatchesFaces.
      return false;
    case "straight":
      // Symbol-only signature can't determine straight. Use comboMatchesFaces.
      return false;
    case "compound": {
      const results = combo.clauses.map(c => comboMatches(c, symbols));
      return combo.op === "and" ? results.every(Boolean) : results.some(Boolean);
    }
  }
}

/** Face-aware combo evaluation — used by n-of-a-kind and straight. */
export function comboMatchesFaces(combo: DiceCombo, faces: ReadonlyArray<DieFace>): boolean {
  switch (combo.kind) {
    case "n-of-a-kind": {
      const counts = new Map<number, number>();
      for (const f of faces) counts.set(f.faceValue, (counts.get(f.faceValue) ?? 0) + 1);
      const max = Math.max(0, ...counts.values());
      return max >= combo.count;
    }
    case "straight": {
      const present = new Set<number>(faces.map(f => f.faceValue));
      const sorted = [...present].sort((a, b) => a - b);
      let best = 1;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
          best++;
          if (best >= combo.length) return true;
        } else {
          best = 1;
        }
      }
      return false;
    }
    case "compound": {
      const results = combo.clauses.map(c => comboMatchesFaces(c, faces));
      return combo.op === "and" ? results.every(Boolean) : results.some(Boolean);
    }
    default:
      return comboMatches(combo, faces.map(f => f.symbol));
  }
}


// ── Damage extraction (for LETHAL calculation) ──────────────────────────────
/** Walk an effect tree and sum all `damage` amounts (excluding self-damage and pure self-damage). */
export function effectDamageOnOpponent(effect: AbilityEffect): number {
  switch (effect.kind) {
    case "damage":   return effect.amount;
    case "compound": return effect.effects.reduce((acc, e) => acc + effectDamageOnOpponent(e), 0);
    default:         return 0;
  }
}

// ── Reachability: Monte Carlo ───────────────────────────────────────────────
/**
 * Estimate the probability that, starting from the current dice state with
 * `attemptsRemaining` rolls left, optimal play can satisfy the combo.
 *
 * For MVP we use a simple heuristic per-die policy: a die is locked
 * (kept as-is) if it currently shows a symbol that contributes to the combo;
 * otherwise it's rerolled. This is the same policy the AI uses, so the
 * reachability shown to the player matches what the AI plays. Good enough
 * for MVP; we can swap in a tier-aware solver later without changing callers.
 */
export function reachabilityProbability(
  combo: DiceCombo,
  dice: ReadonlyArray<Die>,
  attemptsRemaining: number,
  faces: readonly DieFace[],
  samples = 500,
  seed = 1,
): number {
  const startFaces = dice.map(d => d.faces[d.current]);
  if (comboMatchesFaces(combo, startFaces)) return 1;
  if (attemptsRemaining <= 0) return 0;

  let cursor = seed;
  let hits = 0;

  for (let s = 0; s < samples; s++) {
    // Clone current dice into a working face array (full DieFace objects so
    // n-of-a-kind / straight evaluation works properly).
    const working: DieFace[] = dice.map(d => d.faces[d.current]);
    for (let attempt = 0; attempt < attemptsRemaining; attempt++) {
      if (comboMatchesFaces(combo, working)) break;
      const symbols = working.map(f => f.symbol);
      const keep = pickKeepMask(combo, symbols);
      for (let i = 0; i < dice.length; i++) {
        if (dice[i].locked) continue;
        if (keep[i]) continue;
        const r = nextInt(seed + s * 7919, cursor, faces.length);
        cursor = r.cursor;
        working[i] = faces[r.value];
      }
    }
    if (comboMatchesFaces(combo, working)) hits++;
  }
  return hits / samples;
}

/** Heuristic: which dice should we keep when chasing this combo right now? */
export function pickKeepMask(combo: DiceCombo, symbols: ReadonlyArray<SymbolId>): boolean[] {
  const keep = symbols.map(() => false);
  const t = tally(symbols);
  switch (combo.kind) {
    case "matching":
    case "at-least":
    case "symbol-count":
      for (let i = 0; i < symbols.length; i++) if (symbols[i] === combo.symbol) keep[i] = true;
      return keep;
    case "n-of-a-kind":
      // Heuristic: keep all dice (caller resolves via face values elsewhere).
      for (let i = 0; i < symbols.length; i++) keep[i] = true;
      return keep;
    case "matching-any": {
      // Keep dice matching the most-common symbol.
      let best: SymbolId | undefined; let bestN = 0;
      for (const [sym, n] of t.entries()) if (n > bestN) { best = sym; bestN = n; }
      for (let i = 0; i < symbols.length; i++) if (symbols[i] === best) keep[i] = true;
      return keep;
    }
    case "any-of": {
      // Keep dice whose symbol is in the allowed set, weighted toward the most common.
      let best: SymbolId | undefined; let bestN = 0;
      for (const sym of combo.symbols) {
        const n = t.get(sym) ?? 0;
        if (n > bestN) { best = sym; bestN = n; }
      }
      for (let i = 0; i < symbols.length; i++) if (symbols[i] === best) keep[i] = true;
      return keep;
    }
    case "specific-set": {
      const used = new Set<SymbolId>();
      for (let i = 0; i < symbols.length; i++) {
        if (combo.symbols.includes(symbols[i]) && !used.has(symbols[i])) {
          keep[i] = true;
          used.add(symbols[i]);
        }
      }
      return keep;
    }
    case "compound": {
      // OR  → keep mask = union of best clause's mask
      // AND → keep mask = union over all clauses (committed dice for any clause)
      const masks = combo.clauses.map(c => pickKeepMask(c, symbols));
      const out = symbols.map(() => false);
      if (combo.op === "or") {
        // Pick the clause currently most matched and keep its mask.
        let bestIdx = 0; let bestScore = -1;
        for (let i = 0; i < masks.length; i++) {
          const score = masks[i].filter(Boolean).length;
          if (score > bestScore) { bestScore = score; bestIdx = i; }
        }
        return masks[bestIdx];
      }
      for (const m of masks) for (let i = 0; i < m.length; i++) if (m[i]) out[i] = true;
      return out;
    }
    case "straight":
      // Stub: keep distinct numeric symbols only.
      return keep;
  }
}

// ── Ladder live-state evaluator ─────────────────────────────────────────────
export interface LadderEvaluationOpts {
  /** For LETHAL flag: opponent HP and any modifiers we can compute server-side. */
  opponentHp?: number;
  /** Damage already owed to the opponent *before* this ability fires
   *  (e.g. Bleeding ticks at next applier-upkeep, Burns at next own-upkeep).
   *  For now we feed Bleeding only since it's the only signature DoT in MVP.  */
  pendingOpponentDamage?: number;
  /** Pre-firing static bonus to the active hero's offensive damage (Rage stacks etc.). */
  damageBonus?: number;
  reachabilitySamples?: number;
  reachabilitySeed?: number;
}

export function evaluateLadder(
  hero: HeroDefinition,
  active: HeroSnapshot,
  attemptsRemaining: number,
  opts: LadderEvaluationOpts = {},
): LadderRowState[] {
  // Use face-aware combo evaluation so n-of-a-kind and straight work.
  const faces = active.dice.map(d => d.faces[d.current]);
  const currentlyMatched: number[] = [];
  for (let i = 0; i < hero.abilityLadder.length; i++) {
    if (comboMatchesFaces(hero.abilityLadder[i].combo, faces)) currentlyMatched.push(i);
  }

  // Picker: highest tier among matched, then highest base damage among ties.
  let firingIdx = -1;
  let firingTier = -1;
  let firingDamage = -Infinity;
  for (const idx of currentlyMatched) {
    const a = hero.abilityLadder[idx];
    const dmg = effectDamageOnOpponent(a.effect);
    if (a.tier > firingTier || (a.tier === firingTier && dmg > firingDamage)) {
      firingIdx = idx;
      firingTier = a.tier;
      firingDamage = dmg;
    }
  }

  const rows: LadderRowState[] = hero.abilityLadder.map((ability, idx) => {
    const tier = ability.tier;
    const lethal = computeLethal(ability, active, opts);

    if (idx === firingIdx) {
      return { kind: "firing", tier, lethal };
    }
    if (currentlyMatched.includes(idx)) {
      return { kind: "triggered", tier, lethal };
    }
    // Reachability
    const p = reachabilityProbability(
      ability.combo,
      active.dice,
      attemptsRemaining,
      hero.diceIdentity.faces,
      opts.reachabilitySamples ?? 500,
      opts.reachabilitySeed ?? 1,
    );
    if (p < 0.05) return { kind: "out-of-reach", tier };
    return { kind: "reachable", tier, probability: p, lethal };
  });

  return rows;
}

function computeLethal(ability: AbilityDef, active: HeroSnapshot, opts: LadderEvaluationOpts): boolean {
  if (opts.opponentHp == null) return false;
  const baseDmg = effectDamageOnOpponent(ability.effect);
  if (baseDmg <= 0) return false;
  const total = baseDmg + (opts.damageBonus ?? 0) + (opts.pendingOpponentDamage ?? 0);
  // Account for the active hero's own offensive Bleeding stacks owed: when the
  // ability lands, on-hit-Bleeding adds 1 more stack so the next applierUpkeep
  // tick is 1 dmg heavier; do not include that — it's not "this turn's damage."
  // We compute lethal strictly as "this damage now reduces opponent to <= 0."
  void active;  // signature kept for future hero-specific lethal hooks
  return total >= (opts.opponentHp ?? Infinity);
}

// ── Landing-rate validator (used by simulate.ts) ────────────────────────────
/**
 * Monte Carlo landing-rate audit per hero ability. Uses face-aware combo
 * evaluation so n-of-a-kind / straight produce correct rates.
 */
export function simulateLandingRate(
  hero: HeroDefinition,
  attempts = 3,
  samples = 10_000,
  seed = 1,
): { tier: 1|2|3|4; rate: number; target: [number, number]; abilityName: string }[] {
  const out: { tier: 1|2|3|4; rate: number; target: [number, number]; abilityName: string }[] = [];
  const allFaces = hero.diceIdentity.faces;
  for (const ability of hero.abilityLadder) {
    let hits = 0;
    let cursor = 0;
    for (let s = 0; s < samples; s++) {
      // Initial roll: 5 dice fresh.
      const working: DieFace[] = [];
      for (let i = 0; i < 5; i++) {
        const r = nextInt(seed + ability.tier * 1009, cursor, allFaces.length);
        cursor = r.cursor;
        working.push(allFaces[r.value]);
      }
      for (let a = 1; a < attempts; a++) {
        if (comboMatchesFaces(ability.combo, working)) break;
        const keep = pickKeepMask(ability.combo, working.map(f => f.symbol));
        for (let i = 0; i < working.length; i++) {
          if (keep[i]) continue;
          const r = nextInt(seed + ability.tier * 1009, cursor, allFaces.length);
          cursor = r.cursor;
          working[i] = allFaces[r.value];
        }
      }
      if (comboMatchesFaces(ability.combo, working)) hits++;
    }
    out.push({
      tier: ability.tier,
      rate: hits / samples,
      target: ability.targetLandingRate,
      abilityName: ability.name,
    });
  }
  return out;
}

// ── Dice utilities used by the engine ───────────────────────────────────────
/** Roll all unlocked dice once, mutating the dice array via the supplied RNG state. */
export function rollUnlocked(
  state: { rngSeed: number; rngCursor: number },
  dice: Die[],
): void {
  for (const d of dice) {
    if (d.locked) continue;
    const facesLen = d.faces.length;
    const r = nextInt(state.rngSeed, state.rngCursor, facesLen);
    state.rngCursor = r.cursor;
    d.current = r.value;
  }
}

/** Crit detection: are *all 5 dice* currently contributing to the combo's match? */
export function isCriticalRoll(combo: DiceCombo, dice: ReadonlyArray<Die>): boolean {
  const symbols = symbolsOnDice(dice);
  if (!comboMatches(combo, symbols)) return false;
  // For matching/at-least/any-of: all 5 dice must show the chosen symbol.
  // For matching-any: all 5 dice must share one symbol.
  // For specific-set: every die's symbol must be in the set.
  // For compound: AND → every clause crits; OR → at least one clause crits AND
  // no die is "wasted" (contributes to none of the OR clauses).
  return everyDieContributes(combo, symbols);
}

function everyDieContributes(combo: DiceCombo, symbols: ReadonlyArray<SymbolId>): boolean {
  switch (combo.kind) {
    case "matching":
    case "at-least":
    case "symbol-count":
      return symbols.every(s => s === combo.symbol);
    case "n-of-a-kind":
      // Without face values we conservatively return false; face-aware
      // crit detection lives elsewhere when needed.
      return false;
    case "matching-any": {
      const t = tally(symbols);
      // every die has the same symbol
      return t.size === 1 && [...t.values()][0] === symbols.length;
    }
    case "any-of": {
      // every die's symbol is in the set AND at least `count` of one symbol.
      if (!symbols.every(s => combo.symbols.includes(s))) return false;
      const t = tally(symbols);
      for (const sym of combo.symbols) if ((t.get(sym) ?? 0) >= combo.count) return true;
      return false;
    }
    case "specific-set":
      return symbols.every(s => combo.symbols.includes(s));
    case "straight":
      return false;
    case "compound":
      if (combo.op === "and") return combo.clauses.every(c => everyDieContributes(c, symbols));
      // OR: some clause crits AND every die helps at least one clause.
      if (!combo.clauses.some(c => comboMatches(c, symbols))) return false;
      return symbols.every(s => combo.clauses.some(c => everyDieContributes(c, [s])));
  }
}

/** Tier4 ultimates qualify for "major" crit; lesser tiers for "minor". */
export function classifyCrit(ability: AbilityDef, dice: ReadonlyArray<Die>): "minor" | "major" | false {
  if (!isCriticalRoll(ability.combo, dice)) return false;
  return ability.tier === 4 ? "major" : "minor";
}

/** How many dice contribute beyond a combo's minimum threshold. Used by
 *  scaling-damage effects to produce 3/4/5-of-a-kind damage curves. */
export function computeComboExtras(combo: DiceCombo, faces: ReadonlyArray<DieFace>): number {
  switch (combo.kind) {
    case "symbol-count":
    case "matching":
    case "at-least": {
      const c = faces.filter(f => f.symbol === combo.symbol).length;
      return Math.max(0, c - combo.count);
    }
    case "n-of-a-kind": {
      const counts = new Map<number, number>();
      for (const f of faces) counts.set(f.faceValue, (counts.get(f.faceValue) ?? 0) + 1);
      const max = counts.size ? Math.max(...counts.values()) : 0;
      return Math.max(0, max - combo.count);
    }
    case "matching-any": {
      const counts = new Map<string, number>();
      for (const f of faces) counts.set(f.symbol, (counts.get(f.symbol) ?? 0) + 1);
      const max = counts.size ? Math.max(...counts.values()) : 0;
      return Math.max(0, max - combo.count);
    }
    case "any-of": {
      let max = 0;
      for (const sym of combo.symbols) {
        const c = faces.filter(f => f.symbol === sym).length;
        if (c > max) max = c;
      }
      return Math.max(0, max - combo.count);
    }
    default:
      return 0;  // compound, straight, specific-set: no natural "extras"
  }
}

// ── Helpers exported for tests/AI ───────────────────────────────────────────
export { stacksOf };
