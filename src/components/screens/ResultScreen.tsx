/**
 * ResultScreen — overlay that appears at match-end. Reads the lastEvents
 * from the gameStore (and is enriched by the parent MatchScreen which
 * passes the full event log). Currently rendered inline by MatchScreen
 * via the match-end branch — this component is reserved for the dedicated
 * match-end screen that lands when we promote it to its own route in v2.
 *
 * For Step 10 we ship a richer in-place winner panel with descriptor
 * surfacing — used inside MatchScreen instead of the small "VICTORY"
 * pill currently there.
 */
import type { HeroDefinition, PlayerId } from "@/game/types";
import type { MatchSummary } from "@/game/match-summary";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface Props {
  summary: MatchSummary;
  viewer: PlayerId;
  myHero: HeroDefinition;
  oppHero: HeroDefinition;
  onRematch: () => void;
  onMenu: () => void;
}

const DESCRIPTOR_STYLE: Record<MatchSummary["descriptor"], { color: string; gradient: string; icon: string }> = {
  "CRITICAL VICTORY": { color: "#fde68a", gradient: "linear-gradient(180deg,#fbbf24,#dc2626)", icon: "✸" },
  "CLUTCH":           { color: "#f87171", gradient: "linear-gradient(180deg,#fca5a5,#7f1d1d)", icon: "⚡" },
  "COMEBACK":         { color: "#fb923c", gradient: "linear-gradient(180deg,#fdba74,#b45309)", icon: "☀" },
  "FLAWLESS":         { color: "#ffffff", gradient: "linear-gradient(180deg,#fef3c7,#fbbf24)", icon: "✦" },
  "SURGEON":          { color: "#7dd3fc", gradient: "linear-gradient(180deg,#bae6fd,#0369a1)", icon: "✚" },
  "STOMP":            { color: "#fde68a", gradient: "linear-gradient(180deg,#fde68a,#92400e)", icon: "♔" },
  "GRINDER":          { color: "#a8a29e", gradient: "linear-gradient(180deg,#d6d3d1,#57534e)", icon: "⏳" },
  "VICTORY":          { color: "#a855f7", gradient: "linear-gradient(180deg,#c084fc,#6d28d9)", icon: "★" },
};

export function ResultScreen({ summary, viewer, myHero, oppHero, onRematch, onMenu }: Props) {
  const won = summary.winner === viewer;
  const drew = summary.winner === "draw";
  const winnerHero = summary.winner === "p1" ? (viewer === "p1" ? myHero : oppHero) :
                     summary.winner === "p2" ? (viewer === "p2" ? myHero : oppHero) :
                     myHero;
  const style = DESCRIPTOR_STYLE[summary.descriptor];

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-arena-0/85 backdrop-blur-sm">
      <div className="surface rounded-card p-5 sm:p-7 max-w-md w-[92%] text-center"
           style={{ boxShadow: `0 0 60px ${style.color}66`, borderColor: style.color }}>
        {/* Banner */}
        <div className="mb-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-display tracking-widest"
             style={{ background: style.gradient, color: "#1B1228", boxShadow: `0 0 18px ${style.color}aa` }}>
          <span>{style.icon}</span>
          <span>{summary.descriptor}</span>
        </div>

        <h1 className="font-display text-d-1 tracking-widest"
            style={{ color: winnerHero.accentColor, textShadow: `0 0 20px ${winnerHero.accentColor}aa` }}>
          {drew ? "DRAW" : won ? "VICTORY" : "DEFEAT"}
        </h1>
        <p className="text-sm italic text-muted mt-1">{summary.descriptorBlurb}</p>

        {/* Stats grid */}
        <dl className={cn("grid grid-cols-2 gap-3 mt-5 text-left text-xs")}>
          <Stat label="Turns"             value={String(summary.turns)} />
          <Stat label="Total damage"      value={`${summary.totalDamage[viewer]} → ${summary.totalDamage[other(viewer)]}`} />
          <Stat label="Biggest hit"       value={String(summary.biggestHit[viewer])} />
          <Stat label="Ultimates fired"   value={String(summary.ultimatesFired[viewer])} />
          <Stat label="Crits fired"       value={String(summary.criticalsFired[viewer])} />
          <Stat label="Statuses applied"  value={String(summary.statusesApplied[viewer])} />
        </dl>

        <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="ghost" onClick={onMenu} sound="ui-back">Main menu</Button>
          <Button variant="primary" heroAccent={myHero.accentColor} onClick={onRematch} sound="ui-tap">
            Rematch
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-num font-bold text-ink">{value}</dd>
    </div>
  );
}

function other(p: PlayerId): PlayerId { return p === "p1" ? "p2" : "p1"; }
