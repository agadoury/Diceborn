/**
 * HeroPortrait — placeholder hero illustration as an SVG sigil.
 *
 * Heroes register their own SVG sigil via registerSigil(heroId, render).
 * When no sigil is registered, a generic concentric-circle placeholder
 * in the hero's accent color is rendered.
 *
 * Reactive states per §9: idle / hit / defended / low-hp / victorious /
 * defeated. Driven by the parent reading `hero-state` GameEvents.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { HeroId } from "@/game/types";

export type HeroPortraitState =
  | "idle" | "hit" | "defended" | "low-hp" | "victorious" | "defeated";

interface HeroPortraitProps {
  hero: HeroId;
  state?: HeroPortraitState;
  size?: number;
  accent: string;
  className?: string;
  /** Active-side flag — non-active opponent is rendered slightly dimmer. */
  active?: boolean;
}

export function HeroPortrait({
  hero, state = "idle", size = 64, accent, className, active = true,
}: HeroPortraitProps) {
  // Hit flinch: brief jerk then settle.
  const [flinch, setFlinch] = useState(false);
  useEffect(() => {
    if (state === "hit") {
      setFlinch(true);
      const t = window.setTimeout(() => setFlinch(false), 350);
      return () => window.clearTimeout(t);
    }
  }, [state]);

  const transform =
    flinch                  ? "translateX(-3px) rotate(-2deg)" :
    state === "defended"    ? "scale(1.04)" :
    state === "victorious"  ? "scale(1.06)" :
    state === "defeated"    ? "scale(0.95)" :
    "";

  const filter =
    state === "defeated" ? "grayscale(0.8) brightness(0.7)" :
    !active              ? "brightness(0.85)" :
    undefined;

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full ring-2 grid place-items-center",
        "transition-all duration-200 ease-out-quart",
        state === "low-hp" && "animate-pulse",
        state === "victorious" && "animate-pulse-glow",
        className,
      )}
      style={{
        width: size, height: size,
        background: `radial-gradient(circle at 50% 35%, ${accent}55 0%, var(--c-arena-1) 75%)`,
        boxShadow: `0 0 ${active ? 16 : 6}px ${accent}66`,
        ["--glow" as never]: accent,
        transform,
        filter,
        borderColor: accent,
      }}
      aria-label={`${hero} portrait, state ${state}`}
    >
      <SigilFor hero={hero} accent={accent} size={Math.floor(size * 0.7)} />
      {state === "low-hp" && (
        <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded text-[8px] font-bold bg-dmg text-arena-0">
          LOW HP
        </span>
      )}
    </div>
  );
}

/** Generic placeholder sigil — circle in hero accent. Heroes register
 *  their own SVG sigils via the SIGIL_REGISTRY map. */
const SIGIL_REGISTRY: Record<string, (p: { accent: string; size: number }) => React.JSX.Element> = {};

export function registerSigil(heroId: string, render: (p: { accent: string; size: number }) => React.JSX.Element): void {
  SIGIL_REGISTRY[heroId] = render;
}

function SigilFor({ hero, accent, size }: { hero: HeroId; accent: string; size: number }) {
  const custom = SIGIL_REGISTRY[hero];
  if (custom) return custom({ accent, size });
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <circle cx="32" cy="32" r="20" fill="none" stroke={accent} strokeWidth="3" strokeOpacity="0.7" />
      <circle cx="32" cy="32" r="6"  fill={accent} />
    </svg>
  );
}
