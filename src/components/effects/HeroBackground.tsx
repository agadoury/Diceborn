/**
 * HeroBackground — full-bleed atmospheric layer for a hero.
 *
 * Reads the hero's accentColor + optional atmosphere config from the
 * content registry. Heroes register their atmosphere by extending the
 * ATMOSPHERE_REGISTRY map with a `direction` ("up" | "down" | "drift")
 * and an optional `particleColor` override.
 *
 * Particle counts are device-aware: 40 on coarse pointers (mobile), 120
 * on fine pointers (desktop). DOM-only — no Pixi.
 *
 * intensity:
 *   "full"     used in HeroSelect (full-screen presentation)
 *   "ambient"  used as the active player's side of the match arena
 */
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import type { HeroId } from "@/game/types";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { HEROES } from "@/content";

interface Props {
  hero: HeroId;
  intensity?: "full" | "ambient";
  className?: string;
}

interface AtmosphereConfig {
  direction: "up" | "down" | "drift";
  particleColor?: string;
}

const ATMOSPHERE_REGISTRY: Record<string, AtmosphereConfig> = {};

export function registerAtmosphere(heroId: string, config: AtmosphereConfig): void {
  ATMOSPHERE_REGISTRY[heroId] = config;
}

const DEFAULT_ACCENT = "#A855F7";
const DEFAULT_ATMOSPHERE: AtmosphereConfig = { direction: "drift" };

export function HeroBackground({ hero, intensity = "ambient", className }: Props) {
  const accent = HEROES[hero]?.accentColor ?? DEFAULT_ACCENT;
  const atmosphere = ATMOSPHERE_REGISTRY[hero] ?? DEFAULT_ATMOSPHERE;
  const reduced = useReducedMotion();

  const particleCount = useMemo(() => {
    if (reduced) return 0;
    const isCoarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    const cap = isCoarse ? 40 : 120;
    return intensity === "full" ? cap : Math.floor(cap * 0.5);
  }, [intensity, reduced]);

  const particles = useMemo(() => {
    return Array.from({ length: particleCount }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 6 + Math.random() * 6,
      size: 2 + Math.random() * 4,
    }));
  }, [particleCount]);

  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 overflow-hidden pointer-events-none",
        className,
      )}
    >
      {/* Radial color wash */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background: `radial-gradient(ellipse at 50% 38%, ${accent}55 0%, transparent 65%)`,
          opacity: intensity === "full" ? 1 : 0.6,
        }}
      />
      {/* Edge vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(15,8,20,0.4) 100%)",
        }}
      />
      {particles.map(p => (
        <Particle
          key={p.id}
          left={p.left}
          top={p.top}
          size={p.size}
          delay={p.delay}
          duration={p.duration}
          accent={accent}
          atmosphere={atmosphere}
        />
      ))}
      <style>{`
        @keyframes p-up {
          0%   { transform: translateY(0) translateX(0);    opacity: 0; }
          15%  {                                              opacity: 0.85; }
          100% { transform: translateY(-120%) translateX(8px); opacity: 0; }
        }
        @keyframes p-down {
          0%   { transform: translateY(-100%) translateX(0); opacity: 0; }
          15%  {                                              opacity: 0.7; }
          100% { transform: translateY(120%) translateX(-6px);opacity: 0; }
        }
        @keyframes p-drift {
          0%   { transform: translateX(0)      translateY(0);  opacity: 0; }
          15%  {                                                 opacity: 0.6; }
          100% { transform: translateX(60px)   translateY(-18px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function Particle({
  left, top, size, delay, duration, accent, atmosphere,
}: { left: number; top: number; size: number; delay: number; duration: number; accent: string; atmosphere: AtmosphereConfig }) {
  const animation =
    atmosphere.direction === "up"   ? `p-up ${duration}s ease-in ${delay}s infinite` :
    atmosphere.direction === "down" ? `p-down ${duration}s linear ${delay}s infinite` :
                                      `p-drift ${duration * 0.7}s ease-out ${delay}s infinite`;
  return (
    <span
      className="absolute rounded-full blur-[1px]"
      style={{
        left:  `${left}%`,
        top:   `${top}%`,
        width: size,
        height: size,
        background: atmosphere.particleColor ?? accent,
        boxShadow: `0 0 ${size * 2}px ${accent}77`,
        animation,
        willChange: "transform, opacity",
      }}
    />
  );
}
