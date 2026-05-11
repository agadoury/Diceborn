/**
 * Pact of Heroes — bot-vs-bot simulator + landing-rate validator.
 *
 * Iterates over all heroes registered in src/content/index.ts. With an
 * empty registry it prints a friendly notice and exits.
 *
 * Usage:
 *   npm run simulate                        # 1 verbose match per hero pair (if available)
 *   npm run simulate -- --rates             # only the landing-rate audit
 *   npm run simulate -- --n 100 --quiet     # bulk: 100 matches, summary only
 */

import { applyAction, makeEmptyState } from "../src/game/engine";
import { nextAiAction } from "../src/game/ai";
import { simulateLandingRate } from "../src/game/dice";
import { HEROES } from "../src/content";
import type { Action, GameEvent, GameState, HeroId, PlayerId } from "../src/game/types";

interface Args {
  n: number;
  ratesOnly: boolean;
  verbose: boolean;
  seed: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let n = 1;
  let ratesOnly = false;
  let verbose = true;
  let seed = 42;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--n")     { n = Number(args[++i]); verbose = n === 1; }
    if (args[i] === "--rates") { ratesOnly = true; }
    if (args[i] === "--seed")  { seed = Number(args[++i]); }
    if (args[i] === "--quiet") { verbose = false; }
  }
  return { n, ratesOnly, verbose, seed };
}

function runMatch(seed: number, verbose: boolean, p1: HeroId, p2: HeroId): { winner: PlayerId | "draw"; turns: number } {
  let state: GameState = makeEmptyState();
  ({ state } = applyAction(state, {
    kind: "start-match", seed, p1, p2, coinFlipWinner: "p1",
  }));
  if (verbose) console.log(`\n— match start (seed ${seed}, ${p1} vs ${p2}) —`);

  let safety = 0;
  while (!state.winner && safety++ < 4000) {
    const action: Action = nextAiAction(state, state.activePlayer);
    const r = applyAction(state, action);
    state = r.state;
    if (verbose) for (const ev of r.events) logEvent(ev);
  }
  if (safety >= 4000) {
    console.error("[simulate] safety stop hit — possible infinite loop in AI");
  }
  return { winner: state.winner ?? "draw", turns: state.turn };
}

function logEvent(ev: GameEvent): void {
  switch (ev.t) {
    case "match-started":      console.log(`  ⚔  ${ev.players.p1} vs ${ev.players.p2}, ${ev.startPlayer} starts`); break;
    case "turn-started":       console.log(`\n  ▶ T${ev.turn} — ${ev.player}`); break;
    case "phase-changed":      break;
    case "dice-rolled":        console.log(`     🎲 ${ev.player} rolled [${ev.dice.map(d => d.symbol).join(", ")}]`); break;
    case "ability-triggered":  console.log(`     ✨ ${ev.player} → ${ev.abilityName} (T${ev.tier})${ev.isCritical ? `  CRIT(${ev.isCritical})` : ""}`); break;
    case "ultimate-fired":     console.log(`     💥 ULTIMATE: ${ev.abilityName}${ev.isCritical ? "  CRIT!" : ""}`); break;
    case "damage-dealt":       console.log(`     ${ev.from === ev.to ? "🩸 self" : "💢"} ${ev.amount} ${ev.type} → ${ev.to} (mit ${ev.mitigated})`); break;
    case "heal-applied":       console.log(`     💚 ${ev.player} heals ${ev.amount}`); break;
    case "status-applied":     console.log(`     🟣 ${ev.holder} +${ev.stacks} ${ev.status} (total ${ev.total})`); break;
    case "status-ticked":      if (ev.effect === "damage") console.log(`     🔥 ${ev.holder} takes ${ev.amount} from ${ev.status}`); break;
    case "status-removed":     console.log(`     ✖  ${ev.holder} loses ${ev.status} (${ev.reason})`); break;
    case "card-played":        console.log(`     🃏 ${ev.player} plays ${ev.cardId}`); break;
    case "card-sold":          console.log(`     💰 ${ev.player} sells ${ev.cardId} → +${ev.cpGained} CP`); break;
    case "match-won":          console.log(`\n  🏆 winner: ${ev.winner}`); break;
    default: break;
  }
}

function landingRateAudit(heroIds: HeroId[]): void {
  console.log("\n— Landing-rate audit (10,000 trials per ability, 3 attempts) —");
  if (heroIds.length === 0) {
    console.log("  (no heroes registered; nothing to audit)");
    return;
  }
  for (const id of heroIds) {
    const hero = HEROES[id];
    if (!hero) continue;
    console.log(`\n  ${hero.name} — ${hero.abilityCatalog.length} catalog abilities`);
    const results = simulateLandingRate(hero, 3, 10_000, 7);
    for (const r of results) {
      const inBand = r.rate >= r.target[0] && r.rate <= r.target[1];
      const flag = inBand ? " ✓" : " ✗";
      console.log(
        `    T${r.tier} ${r.abilityName.padEnd(20)}  ${(r.rate * 100).toFixed(1)}% ` +
        `(target ${(r.target[0] * 100).toFixed(0)}–${(r.target[1] * 100).toFixed(0)}%)${flag}`,
      );
    }
  }
  console.log("");
}

function main(): void {
  const args = parseArgs();
  const heroIds = Object.keys(HEROES) as HeroId[];

  if (heroIds.length === 0) {
    console.log("\n— Pact of Heroes simulator —");
    console.log("\n  No heroes registered in src/content/index.ts.");
    console.log("  Add a hero file and register it before running matches.\n");
    return;
  }

  if (args.ratesOnly) {
    landingRateAudit(heroIds);
    return;
  }

  // Pick the first hero as both p1 and p2 by default for verbose runs.
  const p1: HeroId = heroIds[0];
  const p2: HeroId = heroIds[1] ?? heroIds[0];

  if (args.n === 1) {
    landingRateAudit(heroIds);
    runMatch(args.seed, args.verbose, p1, p2);
    return;
  }

  // Bulk mode
  let p1Wins = 0, p2Wins = 0, draws = 0;
  let totalTurns = 0;
  const startedAt = Date.now();
  for (let i = 0; i < args.n; i++) {
    const r = runMatch(args.seed + i, false, p1, p2);
    if (r.winner === "p1") p1Wins++;
    else if (r.winner === "p2") p2Wins++;
    else draws++;
    totalTurns += r.turns;
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`\n— ${args.n} matches in ${elapsed}s (${p1} vs ${p2}) —`);
  console.log(`  p1 wins: ${p1Wins}  (${(100 * p1Wins / args.n).toFixed(1)}%)`);
  console.log(`  p2 wins: ${p2Wins}  (${(100 * p2Wins / args.n).toFixed(1)}%)`);
  console.log(`  draws:   ${draws}`);
  console.log(`  avg turns: ${(totalTurns / args.n).toFixed(1)}`);
  console.log("");
  landingRateAudit(heroIds);
}

main();
