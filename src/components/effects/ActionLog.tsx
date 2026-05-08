/**
 * ActionLog — a small toast feed in the corner that writes one human-readable
 * line per game event. Helps the player track what just happened even when
 * the choreographer's beats are short.
 *
 * Mobile: bottom-right floating column above the action bar.
 * Desktop: top-right under the opponent ladder rail.
 */
import { useEffect, useState } from "react";
import { useChoreoStore } from "@/store/choreoStore";
import type { GameEvent, PlayerId } from "@/game/types";

interface LogEntry {
  id: number;
  text: string;
  spawnedAt: number;
  variant: "info" | "damage" | "heal" | "status" | "ability" | "phase";
}

const MAX_VISIBLE = 6;
const TTL_MS      = 6000;

let _id = 1;

export function ActionLog() {
  const playing = useChoreoStore(s => s.playing);
  const [entries, setEntries] = useState<LogEntry[]>([]);

  // Watch each newly-playing event and append a log entry.
  useEffect(() => {
    if (!playing) return;
    const text = formatEvent(playing);
    if (!text) return;
    const variant = variantFor(playing);
    const id = _id++;
    setEntries(prev => [...prev, { id, text, variant, spawnedAt: performance.now() }].slice(-MAX_VISIBLE * 2));
    const t = window.setTimeout(() => {
      setEntries(prev => prev.filter(e => e.id !== id));
    }, TTL_MS);
    return () => window.clearTimeout(t);
  }, [playing]);

  if (entries.length === 0) return null;
  // Show only the last MAX_VISIBLE entries; oldest at top, newest at bottom.
  const visible = entries.slice(-MAX_VISIBLE);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed z-30 pointer-events-none
                 right-3 bottom-[120px] sm:bottom-[140px]
                 lg:right-[280px] lg:top-24 lg:bottom-auto
                 flex flex-col gap-1 max-w-[260px]"
    >
      {visible.map((e, i) => {
        const age = (performance.now() - e.spawnedAt) / TTL_MS;
        const opacity = Math.max(0.35, 1 - age * 0.5);
        return (
          <div
            key={e.id}
            className={`px-2.5 py-1 rounded-card surface text-[11px] font-medium tracking-wide ${COLOR[e.variant]}`}
            style={{
              opacity: i === visible.length - 1 ? 1 : opacity,
              animation: i === visible.length - 1 ? "log-in 220ms ease-out" : undefined,
            }}
          >
            {e.text}
          </div>
        );
      })}
      <style>{`
        @keyframes log-in {
          from { transform: translateX(12px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const COLOR: Record<LogEntry["variant"], string> = {
  info:    "text-muted",
  damage:  "text-rose-300",
  heal:    "text-emerald-300",
  status:  "text-cyan-300",
  ability: "text-amber-300",
  phase:   "text-muted/70",
};

function variantFor(ev: GameEvent): LogEntry["variant"] {
  switch (ev.t) {
    case "damage-dealt":      return "damage";
    case "heal-applied":      return "heal";
    case "status-applied":
    case "status-ticked":
    case "status-removed":    return "status";
    case "ability-triggered":
    case "ultimate-fired":    return "ability";
    case "turn-started":
    case "phase-changed":     return "phase";
    default:                  return "info";
  }
}

function p(id: PlayerId): string { return id.toUpperCase(); }

function formatEvent(ev: GameEvent): string | null {
  switch (ev.t) {
    case "match-started":      return `${ev.players.p1} vs ${ev.players.p2}`;
    case "match-won":          return ev.winner === "draw" ? "Draw" : `${p(ev.winner)} wins`;
    case "turn-started":       return `Turn ${ev.turn} — ${p(ev.player)}`;
    case "phase-changed":      return null;     // too noisy
    case "card-drawn":         return null;     // covered by hand UI
    case "card-played":        return `${p(ev.player)} plays ${humanCard(ev.cardId)}`;
    case "card-sold":          return `${p(ev.player)} sells ${humanCard(ev.cardId)} (+${ev.cpGained} CP)`;
    case "card-discarded":     return null;
    case "cp-changed":         return ev.delta > 0 ? `${p(ev.player)} +${ev.delta} CP` : null;
    case "hp-changed":         return null;     // covered by damage/heal entries
    case "dice-rolled":        return `${p(ev.player)} rolls`;
    case "die-locked":         return null;
    case "die-face-changed":   return `${p(ev.player)} alters die ${ev.die + 1}`;
    case "ladder-state-changed": return null;
    case "ability-triggered":  return `${p(ev.player)} → ${ev.abilityName}${ev.isCritical ? "  CRIT!" : ""}`;
    case "ultimate-fired":     return `ULTIMATE: ${ev.abilityName}${ev.isCritical ? "  CRIT!" : ""}`;
    case "damage-dealt":       return `${ev.amount} ${ev.type} dmg → ${p(ev.to)}${ev.mitigated ? `  (-${ev.mitigated} mit)` : ""}`;
    case "heal-applied":       return `${p(ev.player)} heals ${ev.amount}`;
    case "attack-intended":    return `${p(ev.attacker)} → ${ev.abilityName} (${ev.incomingAmount} ${ev.defendable ? "def?" : "unblockable"})`;
    case "defense-intended":   return ev.abilityIndex == null ? `${p(ev.defender)} takes the hit` : `${p(ev.defender)} braces with ${ev.abilityName} (${ev.diceCount}d)`;
    case "defense-dice-rolled": return `${p(ev.player)} rolls ${ev.dice.length}d`;
    case "defense-resolved":   return ev.landed ? `${p(ev.player)} blocked ${ev.reduction}` : (ev.abilityName ? `${p(ev.player)}'s ${ev.abilityName} fizzled` : null);
    case "status-applied":     return `${p(ev.holder)} +${ev.stacks} ${ev.status}`;
    case "status-ticked":      return ev.effect === "decrement" ? null : `${p(ev.holder)} ${ev.status}: ${ev.effect} ${ev.amount}`;
    case "status-removed":     return `${p(ev.holder)} loses ${ev.status}`;
    case "status-triggered":   return null;
    case "hero-state":         return null;
    case "rage-changed":       return ev.stacks > 0 ? `${p(ev.player)} Rage ${ev.stacks}` : null;
    case "counter-prompt":     return `${p(ev.holder)} counter?`;
    case "counter-resolved":   return ev.accepted ? `${p(ev.holder)} counters!` : null;
  }
}

function humanCard(id: string): string {
  // e.g. "myhero/some-card" → "Some Card"
  const tail = id.split("/").pop() ?? id;
  return tail.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
