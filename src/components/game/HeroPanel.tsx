/**
 * HeroPanel — portrait + name + HP + CP + status track + (optional) ladder.
 *
 * Two layouts:
 *   variant="opponent" (top of screen on mobile)  — compact, ladder collapsed
 *   variant="active"   (bottom)                   — full
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { HeroDefinition, HeroSnapshot } from "@/game/types";
import { HealthBar } from "@/components/ui/HealthBar";
import { CPMeter } from "@/components/ui/CPMeter";
import { StatusTrack } from "./StatusTrack";
import { AbilityLadder } from "./AbilityLadder";
import { HeroPortrait, type HeroPortraitState } from "./HeroPortrait";
import { useChoreoStore } from "@/store/choreoStore";

interface HeroPanelProps {
  hero: HeroDefinition;
  snapshot: HeroSnapshot;
  variant: "opponent" | "active";
  active: boolean;        // is this the side whose turn it is?
  isOpponentView?: boolean;
  className?: string;
}

export function HeroPanel({ hero, snapshot, variant, active, isOpponentView = false, className }: HeroPanelProps) {
  // Subscribe to most-recent hero-state events for portrait reactivity.
  const lastEvent = useChoreoStore(s => s.playing);
  const [portraitState, setPortraitState] = useState<HeroPortraitState>("idle");

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.t === "hero-state" && lastEvent.player === snapshot.player) {
      switch (lastEvent.state) {
        case "hit":            setPortraitState("hit"); break;
        case "defended":       setPortraitState("defended"); break;
        case "low-hp-enter":   setPortraitState("low-hp"); break;
        case "low-hp-exit":    setPortraitState("idle"); break;
        case "victorious":     setPortraitState("victorious"); break;
        case "defeated":       setPortraitState("defeated"); break;
        case "idle":           setPortraitState("idle"); break;
      }
    }
  }, [lastEvent, snapshot.player]);

  // Treat persistent low-HP regardless of latest event.
  const effectiveState =
    portraitState === "victorious" || portraitState === "defeated" ? portraitState :
    snapshot.isLowHp ? "low-hp" :
    portraitState;

  const isCompact = variant === "opponent";

  return (
    <div className={cn(
      "relative w-full px-2 py-2 sm:py-3 rounded-card",
      "transition-[box-shadow,opacity] duration-200",
      active && "shadow-[0_0_18px_var(--side-glow)]",
      !active && "opacity-90",
      className,
    )} style={{ ["--side-glow" as never]: `${hero.accentColor}66` }}>
      <div className={cn(
        "flex items-center gap-3",
        isCompact ? "flex-row" : "flex-row",
      )}>
        <HeroPortrait
          hero={hero.id}
          state={effectiveState}
          size={isCompact ? 48 : 64}
          accent={hero.accentColor}
          active={active}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-display tracking-wider truncate text-sm sm:text-base"
                  style={{ color: hero.accentColor }}>
              {hero.name}
            </span>
            <span className="text-[10px] text-muted ml-auto font-num">{snapshot.hand.length} cards</span>
          </div>
          <HealthBar hp={snapshot.hp} hpMax={snapshot.hpStart} accent={hero.accentColor} showLabel={!isCompact} />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <CPMeter cp={snapshot.cp} />
            {snapshot.signatureState["rage"] != null && snapshot.signatureState["rage"] > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
                    style={{ background: hero.accentColor, color: "#1B1228" }}>
                RAGE {snapshot.signatureState["rage"]}
              </span>
            )}
          </div>
          <StatusTrack
            statuses={snapshot.statuses}
            className="mt-1"
            emptyHint={isCompact ? undefined : "no statuses"}
          />
        </div>
      </div>

      {/* Inner ladder — mobile only. Desktop has its own side rail. */}
      {!isCompact && (
        <div className="lg:hidden">
          <CollapsibleLadder hero={hero} rows={snapshot.ladderState} isOpponentView={isOpponentView} snapshot={snapshot} />
        </div>
      )}
    </div>
  );
}

function CollapsibleLadder({
  hero, rows, isOpponentView, snapshot,
}: { hero: HeroDefinition; rows: HeroSnapshot["ladderState"]; isOpponentView: boolean; snapshot?: HeroSnapshot }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-[11px] uppercase tracking-widest text-muted py-1"
      >
        <span>Ability ladder</span>
        <span className="font-num">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-1">
          <AbilityLadder hero={hero} rows={rows} isOpponentView={isOpponentView} snapshot={snapshot} />
        </div>
      )}
    </div>
  );
}
