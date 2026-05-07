/**
 * Diceborn — bot-vs-bot simulator + landing-rate validator.
 *
 * Usage:
 *   npm run simulate              # default: 1 verbose match + landing-rate audit
 *   npm run simulate -- --n 100   # bulk: 100 matches, summary only
 *   npm run simulate -- --rates   # only the landing-rate audit
 */

import { applyAction, makeEmptyState } from "../src/game/engine";
import { nextAiAction } from "../src/game/ai";
import { simulateLandingRate } from "../src/game/dice";
import { BARBARIAN } from "../src/content/heroes/barbarian";
import "../src/content/cards/barbarian";   // side-effect: registers custom handlers
import type { Action, GameEvent, GameState, PlayerId } from "../src/game/types";

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

function runMatch(seed: number, verbose: boolean): { winner: PlayerId | "draw"; turns: number } {
  let state: GameState = makeEmptyState();
  ({ state } = applyAction(state, {
    kind: "start-match", seed, p1: "barbarian", p2: "barbarian", coinFlipWinner: "p1",
  }));
  if (verbose) console.log(`\n— match start (seed ${seed}) —`);

  const allEvents: GameEvent[] = [];
  let safety = 0;
  while (!state.winner && safety++ < 4000) {
    const ai = state.activePlayer;
    const action: Action = nextAiAction(state, ai);
    const r = applyAction(state, action);
    state = r.state;
    if (verbose) for (const ev of r.events) logEvent(ev);
    allEvents.push(...r.events);
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
    case "phase-changed":      /* too noisy */ break;
    case "dice-rolled":        console.log(`     🎲 ${ev.player} rolled [${ev.dice.map(d => d.symbol.split(":")[1]).join(", ")}]`); break;
    case "ability-triggered":  console.log(`     ✨ ${ev.player} → ${ev.abilityName} (T${ev.tier})${ev.isCritical ? `  CRIT(${ev.isCritical})` : ""}`); break;
    case "ultimate-fired":     console.log(`     💥 ULTIMATE: ${ev.abilityName}${ev.isCritical ? "  CRIT!" : ""}`); break;
    case "damage-dealt":       console.log(`     ${ev.from === ev.to ? "🩸 self" : "💢"} ${ev.amount} ${ev.type} → ${ev.to} (mit ${ev.mitigated})`); break;
    case "heal-applied":       console.log(`     💚 ${ev.player} heals ${ev.amount}`); break;
    case "status-applied":     console.log(`     🟣 ${ev.holder} +${ev.stacks} ${ev.status} (total ${ev.total})`); break;
    case "status-ticked":      if (ev.effect === "damage") console.log(`     🔥 ${ev.holder} takes ${ev.amount} from ${ev.status}`); break;
    case "status-removed":     console.log(`     ✖  ${ev.holder} loses ${ev.status} (${ev.reason})`); break;
    case "card-played":        console.log(`     🃏 ${ev.player} plays ${ev.cardId}`); break;
    case "card-sold":          console.log(`     💰 ${ev.player} sells ${ev.cardId} → +${ev.cpGained} CP`); break;
    case "rage-changed":       console.log(`     😡 ${ev.player} Rage = ${ev.stacks}`); break;
    case "match-won":          console.log(`\n  🏆 winner: ${ev.winner}`); break;
    default: break;
  }
}

function landingRateAudit(): void {
  console.log("\n— Landing-rate audit (10,000 trials per tier, 2 attempts) —");
  const results = simulateLandingRate(BARBARIAN, 2, 10_000, 7);
  for (const r of results) {
    const inBand = r.rate >= r.target[0] && r.rate <= r.target[1];
    const flag = inBand ? " ✓" : " ✗";
    console.log(
      `  T${r.tier} ${r.abilityName.padEnd(20)}  ${(r.rate * 100).toFixed(1)}% ` +
      `(target ${(r.target[0] * 100).toFixed(0)}–${(r.target[1] * 100).toFixed(0)}%)${flag}`,
    );
  }
  console.log("");
}

function main(): void {
  const args = parseArgs();
  if (args.ratesOnly) {
    landingRateAudit();
    return;
  }

  if (args.n === 1) {
    landingRateAudit();
    runMatch(args.seed, args.verbose);
    return;
  }

  // Bulk mode
  let p1Wins = 0, p2Wins = 0, draws = 0;
  let totalTurns = 0;
  const startedAt = Date.now();
  for (let i = 0; i < args.n; i++) {
    const r = runMatch(args.seed + i, false);
    if (r.winner === "p1") p1Wins++;
    else if (r.winner === "p2") p2Wins++;
    else draws++;
    totalTurns += r.turns;
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`\n— ${args.n} matches in ${elapsed}s —`);
  console.log(`  p1 wins: ${p1Wins}  (${(100 * p1Wins / args.n).toFixed(1)}%)`);
  console.log(`  p2 wins: ${p2Wins}  (${(100 * p2Wins / args.n).toFixed(1)}%)`);
  console.log(`  draws:   ${draws}`);
  console.log(`  avg turns: ${(totalTurns / args.n).toFixed(1)}`);
  console.log("");
  landingRateAudit();
}

main();
