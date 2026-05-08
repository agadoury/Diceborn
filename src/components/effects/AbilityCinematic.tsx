/**
 * AbilityCinematic — full-screen overlay that takes over the screen when an
 * Ultimate fires. Per §1/§9:
 *   - Background dims to 40% opacity over 200ms
 *   - Active hero portrait scales up 1.15× and gains a glow
 *   - Hero name flies in from offscreen with overshoot
 *   - Ability name appears below
 *   - Hero "vocalizes" via text bubble (placeholder for VO)
 *   - Hold 800ms, then resolve.
 *   - Whole sequence ~1.8s mobile / 2.5s desktop. Tap or SPACE skips.
 *
 * Critical Ultimate adds 800ms + screen wash + "CRITICAL!" overlay.
 *
 * Step 4 ships the framework. Per-hero portrait illustrations + voice barks
 * arrive in Step 9.
 */
import { useEffect } from "react";
import { useChoreoStore } from "@/store/choreoStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { HEROES } from "@/content";
import { cn } from "@/lib/cn";

/** Voice-bark registry. Heroes plug in their own when registered. */
const HERO_BARK: Record<string, string> = {};

export function AbilityCinematicLayer() {
  const cinematic = useChoreoStore(s => s.cinematic);
  const skip      = useChoreoStore(s => s.skipCinematic);
  const reduced   = useReducedMotion();

  // Skip on click/SPACE.
  useEffect(() => {
    if (!cinematic) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space" || e.code === "Enter") skip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cinematic, skip]);

  if (!cinematic) return null;
  const hero = HEROES[cinematic.hero];
  const accent = hero?.accentColor ?? "#A855F7";
  const heroName = hero?.name ?? cinematic.hero.toUpperCase();
  const bark = HERO_BARK[cinematic.hero] ?? "...";

  return (
    <div
      role="dialog"
      aria-label={`${heroName} fires ${cinematic.abilityName}`}
      onClick={skip}
      className="fixed inset-0 z-50 pointer-events-auto cursor-pointer"
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(15,8,20,0.65) 0%, rgba(15,8,20,0.92) 80%)",
        animation: reduced ? "none" : "cinematic-fade 220ms ease-out forwards",
      }}
    >
      {/* Critical wash */}
      {cinematic.isCritical && (
        <div
          className="absolute inset-0 mix-blend-overlay"
          style={{ background: accent, opacity: 0.18, animation: reduced ? undefined : "crit-flash 800ms ease-out" }}
        />
      )}

      {/* Sigil — radial accent burst behind the hero */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width:  "min(70vw, 520px)",
          height: "min(70vw, 520px)",
          background: `radial-gradient(circle, ${accent}66 0%, ${accent}00 70%)`,
          filter: "blur(2px)",
          animation: reduced ? undefined : "sigil-pulse 1.4s ease-in-out infinite",
        }}
      />

      {/* Hero name — flies in from offscreen left */}
      <div
        className={cn(
          "absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-center select-none",
        )}
        style={{ animation: reduced ? undefined : "hero-name-in 360ms cubic-bezier(.34,1.56,.64,1) both" }}
      >
        <div className="font-display tracking-[0.18em] text-4xl sm:text-6xl"
             style={{ color: accent, textShadow: `0 0 24px ${accent}aa, 0 4px 0 rgba(0,0,0,0.5)` }}>
          {heroName}
        </div>
        <div className="mt-2 font-display tracking-widest text-xl sm:text-3xl text-ink"
             style={{ animation: reduced ? undefined : "ability-name-in 280ms 220ms cubic-bezier(.22,1,.36,1) both" }}>
          {cinematic.abilityName}
        </div>
      </div>

      {/* Voice bark bubble (placeholder — Step 9 brings real VO) */}
      <div
        className="absolute left-1/2 top-[58%] -translate-x-1/2 px-4 py-2 rounded-card surface
                   text-ink text-base sm:text-lg font-medium"
        style={{
          boxShadow: `0 0 24px ${accent}66`,
          animation: reduced ? undefined : "bark-pop 240ms 480ms cubic-bezier(.34,1.56,.64,1) both",
        }}
      >
        “{bark}”
      </div>

      {/* CRITICAL banner */}
      {cinematic.isCritical && (
        <div className="absolute left-1/2 top-[24%] -translate-x-1/2 font-display tracking-[0.3em]
                        text-2xl sm:text-4xl"
             style={{
               color: "#fde68a",
               textShadow: "0 0 24px #fde68aaa, 0 3px 0 rgba(0,0,0,0.6)",
               animation: reduced ? undefined : "crit-banner 700ms cubic-bezier(.34,1.56,.64,1) both",
             }}>
          CRITICAL!
        </div>
      )}

      {/* Skip hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-muted/70 tracking-widest">
        TAP TO SKIP
      </div>

      <style>{`
        @keyframes cinematic-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sigil-pulse {
          0%, 100% { transform: translate(-50%,-50%) scale(0.94); opacity: 0.7; }
          50%      { transform: translate(-50%,-50%) scale(1.04); opacity: 1; }
        }
        @keyframes hero-name-in {
          from { transform: translate(calc(-50% - 80vw), -50%) skewX(-12deg); opacity: 0; }
          to   { transform: translate(-50%, -50%) skewX(0); opacity: 1; }
        }
        @keyframes ability-name-in {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes bark-pop {
          from { transform: translate(-50%, -10px) scale(0.6); opacity: 0; }
          to   { transform: translate(-50%, 0)     scale(1);   opacity: 1; }
        }
        @keyframes crit-flash { 0% { opacity: 0.55 } 100% { opacity: 0 } }
        @keyframes crit-banner {
          from { transform: translate(-50%, -20px) scale(0.5); opacity: 0; }
          to   { transform: translate(-50%, 0)     scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}
