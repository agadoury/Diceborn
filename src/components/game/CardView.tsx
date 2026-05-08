/**
 * CardView — preview of a single card. Step 3 ships the static visual
 * treatment. Step 5 wires up tap-to-lift + tap-target play interactions.
 */
import { cn } from "@/lib/cn";
import type { Card } from "@/game/types";

interface CardViewProps {
  card: Card;
  accent?: string;        // hero accent for hero-specific cards
  className?: string;
  /** Lifted appearance — used when a card is "ready" to be played. */
  lifted?: boolean;
}

const KIND_LABEL: Record<Card["kind"], string> = {
  upgrade:       "UPGRADE",
  "main-action": "ACTION",
  "roll-action": "ROLL",
  status:        "STATUS",
  "main-phase":  "ACTION",
  "roll-phase":  "ROLL",
  instant:       "INSTANT",
};

export function CardView({ card, accent = "var(--c-brand)", className, lifted }: CardViewProps) {
  const isHeroSpecific = card.hero !== "generic";
  return (
    <div
      className={cn(
        "relative w-[140px] sm:w-[168px] aspect-[2/3] rounded-card surface overflow-hidden",
        "flex flex-col text-left transition-transform duration-200 ease-snap-soft",
        lifted && "scale-105 -translate-y-1",
        className,
      )}
      style={isHeroSpecific ? { boxShadow: `0 0 0 1px ${accent}55, 0 12px 24px rgba(20,8,32,0.45)` } : undefined}
    >
      {/* Cost */}
      <div className="absolute top-2 left-2 grid place-items-center w-7 h-7 rounded-full
                      bg-ember text-arena-0 font-num font-bold text-sm shadow-ember">
        {card.cost}
      </div>
      {/* Kind */}
      <div className="absolute top-2 right-2 text-[10px] tracking-widest font-display text-muted">
        {KIND_LABEL[card.kind]}
      </div>

      {/* Name */}
      <div className="mt-10 px-3">
        <div className="font-display tracking-wider text-d-3 leading-tight" style={{ color: accent }}>
          {card.name}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-3 pt-2 text-[11px] sm:text-xs text-ink/85 leading-snug">
        {card.text}
      </div>

      {/* Hero ribbon */}
      {isHeroSpecific && (
        <div className="px-3 pb-2 text-[10px] tracking-widest text-muted">
          {card.hero.toUpperCase()}
        </div>
      )}

      {/* Faint hex pattern (subtle decoration) */}
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full opacity-[0.05] pointer-events-none"
        viewBox="0 0 100 150" preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id={`hex-${card.id}`} width="14" height="12" patternUnits="userSpaceOnUse">
            <polygon points="7,0 14,3.5 14,8.5 7,12 0,8.5 0,3.5" fill="none" stroke="currentColor" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100" height="150" fill={`url(#hex-${card.id})`} />
      </svg>
    </div>
  );
}
