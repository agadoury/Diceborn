/**
 * Diceborn — match-summary computation.
 *
 * Computes match stats and the §10 descriptor (CRITICAL VICTORY > CLUTCH >
 * COMEBACK > FLAWLESS > SURGEON > STOMP > GRINDER > VICTORY) from the
 * GameEvent log captured during a match.
 */

import type { GameEvent, PlayerId } from "./types";

export type MatchDescriptor =
  | "CRITICAL VICTORY"
  | "CLUTCH"
  | "COMEBACK"
  | "FLAWLESS"
  | "SURGEON"
  | "STOMP"
  | "GRINDER"
  | "VICTORY";

export interface MatchSummary {
  winner: PlayerId | "draw";
  turns: number;
  totalDamage: Record<PlayerId, number>;
  biggestHit: Record<PlayerId, number>;
  ultimatesFired: Record<PlayerId, number>;
  criticalsFired: Record<PlayerId, number>;
  diceRolled: Record<PlayerId, number>;
  statusesApplied: Record<PlayerId, number>;
  loserMinHpFraction: number;
  winnerMinHpFraction: number;
  winnerHeldAbove70Pct: boolean;
  longestUntouchedStreak: number;
  killingBlowOverkill: number;
  endedOnCriticalUlt: boolean;
  descriptor: MatchDescriptor;
  descriptorBlurb: string;
}

const DESCRIPTOR_BLURB: Record<MatchDescriptor, string> = {
  "CRITICAL VICTORY": "They'll be telling that story for a while.",
  "CLUTCH":           "That was close.",
  "COMEBACK":         "They thought they had you.",
  "FLAWLESS":         "Untouchable.",
  "SURGEON":          "Precise.",
  "STOMP":            "You barely broke a sweat.",
  "GRINDER":          "A war of attrition.",
  "VICTORY":          "Well played.",
};

interface BuildOpts {
  winner: PlayerId | "draw";
  turns: number;
  startingHp: number;
}

export function buildMatchSummary(events: GameEvent[], opts: BuildOpts): MatchSummary {
  const totalDamage: Record<PlayerId, number> = { p1: 0, p2: 0 };
  const biggestHit: Record<PlayerId, number>  = { p1: 0, p2: 0 };
  const ultimatesFired: Record<PlayerId, number> = { p1: 0, p2: 0 };
  const criticalsFired: Record<PlayerId, number> = { p1: 0, p2: 0 };
  const diceRolled: Record<PlayerId, number>     = { p1: 0, p2: 0 };
  const statusesApplied: Record<PlayerId, number> = { p1: 0, p2: 0 };

  // HP traces
  const hpTrace: Record<PlayerId, number[]> = { p1: [opts.startingHp], p2: [opts.startingHp] };
  let lastHit: { from: PlayerId; to: PlayerId; amount: number; type: string } | null = null;
  let endedOnCriticalUlt = false;
  let lastUltCritical = false;

  // Untouched streak per player by turn (each turn no incoming damage = +1 to current streak).
  let curStreak: Record<PlayerId, number> = { p1: 0, p2: 0 };
  let longestStreak: Record<PlayerId, number> = { p1: 0, p2: 0 };
  let damageTakenThisTurn: Record<PlayerId, boolean> = { p1: false, p2: false };
  let curTurnPlayer: PlayerId | null = null;

  for (const ev of events) {
    if (ev.t === "turn-started") {
      // End-of-turn: if the previous turn's *opponent* took zero damage during
      // that turn, the opponent's untouched streak grows by 1.
      if (curTurnPlayer) {
        const opp: PlayerId = curTurnPlayer === "p1" ? "p2" : "p1";
        if (!damageTakenThisTurn[opp]) {
          curStreak[opp] += 1;
          if (curStreak[opp] > longestStreak[opp]) longestStreak[opp] = curStreak[opp];
        } else {
          curStreak[opp] = 0;
        }
        damageTakenThisTurn = { p1: false, p2: false };
      }
      curTurnPlayer = ev.player;
    }
    if (ev.t === "damage-dealt") {
      if (ev.from !== ev.to) {
        totalDamage[ev.from] += ev.amount;
        if (ev.amount > biggestHit[ev.from]) biggestHit[ev.from] = ev.amount;
      }
      if (ev.amount > 0) damageTakenThisTurn[ev.to] = true;
      lastHit = { from: ev.from, to: ev.to, amount: ev.amount, type: ev.type };
    }
    if (ev.t === "hp-changed") hpTrace[ev.player].push(ev.total);
    if (ev.t === "ability-triggered" && ev.isCritical) criticalsFired[ev.player] += 1;
    if (ev.t === "ultimate-fired")    { ultimatesFired[ev.player] += 1; lastUltCritical = ev.isCritical; }
    if (ev.t === "dice-rolled")       diceRolled[ev.player] += 1;
    if (ev.t === "status-applied")    statusesApplied[ev.applier] += 1;
    if (ev.t === "match-won")         endedOnCriticalUlt = lastUltCritical && lastHit?.type === "ultimate";
  }

  // Final flush of untouched streak for the last turn.
  if (curTurnPlayer) {
    const opp: PlayerId = curTurnPlayer === "p1" ? "p2" : "p1";
    if (!damageTakenThisTurn[opp]) {
      curStreak[opp] += 1;
      if (curStreak[opp] > longestStreak[opp]) longestStreak[opp] = curStreak[opp];
    }
  }

  const minHp = (player: PlayerId): number => {
    const trace = hpTrace[player];
    return Math.min(...trace, opts.startingHp);
  };

  const winner = opts.winner;
  const winnerHp = winner !== "draw" ? minHp(winner) : 0;
  const loser: PlayerId | null = winner === "p1" ? "p2" : winner === "p2" ? "p1" : null;
  const loserHp = loser ? minHp(loser) : 0;

  const winnerMinHpFraction = winnerHp / opts.startingHp;
  const loserMinHpFraction  = loserHp  / opts.startingHp;
  const winnerHeldAbove70Pct = winner !== "draw" && winnerMinHpFraction > 0.7;
  const winnerLongestStreak = winner !== "draw" ? longestStreak[winner] : 0;

  // killingBlowOverkill = how much overkill the final hit dealt.
  const killingBlowOverkill = (() => {
    if (!lastHit) return 0;
    const traceTo = hpTrace[lastHit.to];
    const hpBeforeFinal = traceTo[traceTo.length - 2] ?? opts.startingHp;
    return Math.max(0, lastHit.amount - hpBeforeFinal);
  })();

  // Descriptor priority per §10.
  let descriptor: MatchDescriptor = "VICTORY";
  if (winner === "draw") {
    descriptor = "VICTORY";
  } else if (endedOnCriticalUlt) {
    descriptor = "CRITICAL VICTORY";
  } else if (winnerMinHpFraction < 0.10) {
    descriptor = "CLUTCH";
  } else if (winnerMinHpFraction < 0.25 && winnerHp > 0) {
    descriptor = "COMEBACK";
  } else if (winnerLongestStreak >= 4) {
    descriptor = "FLAWLESS";
  } else if (killingBlowOverkill === 0 && lastHit && lastHit.amount > 0) {
    descriptor = "SURGEON";
  } else if (winnerHeldAbove70Pct) {
    descriptor = "STOMP";
  } else if (opts.turns >= 12) {
    descriptor = "GRINDER";
  }

  return {
    winner: opts.winner,
    turns: opts.turns,
    totalDamage,
    biggestHit,
    ultimatesFired,
    criticalsFired,
    diceRolled,
    statusesApplied,
    loserMinHpFraction,
    winnerMinHpFraction,
    winnerHeldAbove70Pct,
    longestUntouchedStreak: winnerLongestStreak,
    killingBlowOverkill,
    endedOnCriticalUlt,
    descriptor,
    descriptorBlurb: DESCRIPTOR_BLURB[descriptor],
  };
}
