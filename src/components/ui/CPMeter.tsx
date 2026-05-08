/**
 * CPMeter — chunky ember-gold pip row showing combat-points spent vs. cap.
 * MVP cap is 15 (CP_CAP); we show pips up to a softer "comfortable" 8 with
 * a numeric overflow label when the player has >8 CP.
 */
import { cn } from "@/lib/cn";

interface CPMeterProps {
  cp: number;
  cap?: number;
  className?: string;
}

export function CPMeter({ cp, cap = 15, className }: CPMeterProps) {
  const visiblePips = 8;
  const filled = Math.min(visiblePips, cp);
  const overflow = cp - visiblePips;
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label={`CP ${cp} of ${cap}`}>
      <span className="text-xs uppercase tracking-widest font-display text-muted">CP</span>
      <div className="flex items-center gap-1">
        {Array.from({ length: visiblePips }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "block w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ring-1",
              i < filled
                ? "bg-ember ring-amber-200/60 shadow-[0_0_8px_rgba(245,158,11,0.7)]"
                : "bg-arena-0 ring-white/10",
            )}
          />
        ))}
      </div>
      {overflow > 0 && (
        <span className="ml-1 text-xs font-num text-ember">+{overflow}</span>
      )}
      <span className="text-xs font-num text-muted">/ {cap}</span>
    </div>
  );
}
