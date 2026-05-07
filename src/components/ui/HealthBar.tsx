/**
 * Two-layer HealthBar with the slam-and-lag treatment from §9.
 *
 * Foreground bar: tweens to new HP over 200ms with a snap-overshoot ease.
 * Backing bar:    tweens to new HP over 800ms with a 100ms delay — exposing
 *                 a red-orange "wound" stripe that shows the recent loss.
 * On heal: the backing snaps instantly to the new HP, the foreground tweens
 *          up over 400ms.
 * Below 25%: bar pulses red and the surrounding container picks up a
 *            heartbeat overlay (driver elsewhere).
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface HealthBarProps {
  hp: number;
  hpMax: number;
  /** Hero accent color used for the foreground fill. */
  accent?: string;
  className?: string;
  /** Show the numeric HP/HPMAX label inside the bar. */
  showLabel?: boolean;
}

export function HealthBar({ hp, hpMax, accent = "var(--c-dmg)", className, showLabel = true }: HealthBarProps) {
  const safeMax = Math.max(1, hpMax);
  const target = Math.max(0, Math.min(safeMax, hp));
  const pct = (target / safeMax) * 100;

  // Backing layer animates with delay so the wound is visible.
  const [backingPct, setBackingPct] = useState(pct);
  const lastHpRef = useRef(target);

  useEffect(() => {
    const prev = lastHpRef.current;
    lastHpRef.current = target;
    if (target >= prev) {
      // Heal: snap backing immediately.
      setBackingPct(pct);
    } else {
      // Damage: delay the backing.
      const id = window.setTimeout(() => setBackingPct(pct), 100);
      return () => window.clearTimeout(id);
    }
  }, [pct, target]);

  const lowHp = target / safeMax <= 0.25 && target > 0;

  return (
    <div
      className={cn(
        "relative h-3 sm:h-4 w-full rounded-full overflow-hidden",
        "bg-arena-0 ring-1 ring-white/5",
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={target}
      aria-label="Health"
    >
      {/* Backing layer (wound — slow tween, red-orange). */}
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-rose-700"
        style={{ width: `${backingPct}%`, transition: "width 800ms cubic-bezier(.25,1,.5,1)" }}
      />
      {/* Foreground bar — slams to new value with overshoot. */}
      <div
        className={cn("absolute inset-y-0 left-0", lowHp && "animate-pulse")}
        style={{
          width: `${pct}%`,
          background: accent,
          transition: "width 200ms cubic-bezier(.34,1.56,.64,1)",
        }}
      />
      {showLabel && (
        <div className="absolute inset-0 grid place-items-center text-[10px] sm:text-xs font-num font-bold text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.7)] pointer-events-none">
          {Math.ceil(target)} / {safeMax}
        </div>
      )}
    </div>
  );
}
