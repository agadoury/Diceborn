/**
 * DiceTray — owns the 5 dice and runs the §9 tumble choreography.
 *
 * Tumble timeline (mobile / desktop):
 *   anticipation  100/120ms   pulse-scale 1.1 + lift 8px
 *   launch         60/ 80ms   arc up + scale 1.3, staggered by 40ms per die
 *   tumble        550/700ms   2D Z-spin + face cycle every 60ms
 *   resolve   (last 80ms)     face-cycle locks to actual rolled face
 *   land          180/220ms   snap flat, overshoot bounce, dust + thud + haptic
 *   settle        100/120ms   2px bob, locked dice glow
 * Total: 990 / 1240ms  (mobile budget = 0.9s / desktop = 1.2s per §9).
 *
 * The tray is a pure-presentation component: the parent supplies the final
 * face for each die (which the engine produced via seeded RNG) plus a
 * `rollKey` — every change to rollKey triggers a fresh tumble sequence.
 *
 * Reduced-motion: the tumble is replaced with a 200ms cross-fade (face
 * snap) — audio + haptics still play.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Die, type DieState } from "./Die";
import type { Die as DieData } from "@/game/types";
import { sfx } from "@/audio/sfx";
import { vibrate } from "@/hooks/useHaptics";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface DiceTrayProps {
  dice: DieData[];                     // length 5
  accent: string;
  /** Bumps when a new roll has been performed; tray plays the tumble sequence. */
  rollKey: number;
  onToggleLock?: (die: number) => void;
  /** Roll Phase center-stage emphasis: caller toggles this when in offensive-roll. */
  centerStage?: boolean;
  className?: string;
  /** Desktop = 88pt dice; mobile = 64pt. Defaults to viewport-aware. */
  dieSize?: number;
}

type TrayPhase = "idle" | "anticipating" | "launching" | "tumbling" | "landing" | "settled";

export function DiceTray({
  dice, accent, rollKey, onToggleLock, centerStage = false, className, dieSize,
}: DiceTrayProps) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<TrayPhase>("idle");
  const [resolvedFaces, setResolvedFaces] = useState<number[]>(dice.map(d => d.current));
  const [showDust, setShowDust] = useState(false);
  const timersRef = useRef<number[]>([]);
  const isMobile = typeof window !== "undefined" ? window.matchMedia("(pointer: coarse)").matches : false;
  const size = dieSize ?? (isMobile ? 64 : 88);

  function clearTimers() {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }
  function later(ms: number, fn: () => void) {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }

  // Run the tumble timeline whenever rollKey changes.
  useEffect(() => {
    if (rollKey === 0) return;     // initial mount, no tumble
    clearTimers();

    if (reduced) {
      // Reduced motion: instant resolve with audio + haptic.
      setPhase("settled");
      setResolvedFaces(dice.map(d => d.current));
      sfx("die-land");
      vibrate("die-settle");
      return;
    }

    // Anticipation
    setPhase("anticipating");
    sfx("die-throw");
    later(isMobile ? 100 : 120, () => {
      // Launch
      setPhase("launching");
      later(isMobile ? 60 : 80, () => {
        // Tumble
        setPhase("tumbling");
        sfx("die-tumble");
        // Schedule resolve mid-tumble to update each die's "true" face right
        // before landing — this is what "the face-cycle locks to rolled face"
        // means in §9. We pass dice.current at landing.
        const tumbleMs = isMobile ? 550 : 700;
        later(tumbleMs - 80, () => {
          // Mark tumble's resolve point — the next render uses these resolved faces.
          setResolvedFaces(dice.map(d => d.current));
        });
        later(tumbleMs, () => {
          // Land
          setPhase("landing");
          sfx("die-land");
          vibrate("die-settle");
          setShowDust(true);
          later(220, () => setShowDust(false));
          later(isMobile ? 180 : 220, () => {
            // Settle
            setPhase("settled");
            later(isMobile ? 100 : 120, () => {
              setPhase("idle");
            });
          });
        });
      });
    });
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey, reduced, isMobile]);

  function dieStateFor(_idx: number, locked: boolean): DieState {
    if (locked) return "settled";       // locked dice never tumble
    switch (phase) {
      case "anticipating": return "idle";
      case "launching":    return "tumbling";
      case "tumbling":     return "tumbling";
      case "landing":      return "landing";
      case "settled":      return "settled";
      case "idle":         return "settled";
    }
  }

  // Container transform for center-stage emphasis (§9 Roll Phase).
  const trayTransform = centerStage
    ? "scale(1.06) translateY(-8px)"
    : "scale(1) translateY(0px)";

  // Anticipation pulse (lift the whole tray a hair).
  const antTransform =
    phase === "anticipating" ? "translateY(-4px)" :
    phase === "launching"    ? "translateY(-12px)" :
    "translateY(0)";

  return (
    <div
      className={cn(
        "relative w-full grid place-items-center py-3 sm:py-5",
        "transition-transform duration-200 ease-out-quart",
        className,
      )}
      style={{ transform: trayTransform, willChange: "transform" }}
      aria-live="polite"
      aria-label="Dice tray"
    >
      <div
        className="flex items-end justify-center gap-2 sm:gap-3 transition-transform duration-200 ease-out-quart"
        style={{ transform: antTransform, willChange: "transform" }}
      >
        {dice.map((d, i) => (
          <span
            key={d.index}
            className="relative"
            style={{
              transitionDelay: `${i * 40}ms`,
            }}
          >
            <Die
              faces={d.faces}
              current={resolvedFaces[i] ?? d.current}
              state={dieStateFor(i, d.locked)}
              locked={d.locked}
              accent={accent}
              size={size}
              onToggleLock={() => {
                if (phase !== "idle" && phase !== "settled") return;
                sfx("die-lock");
                vibrate("die-lock");
                onToggleLock?.(i);
              }}
            />
            {/* Dust puff (land only) */}
            {showDust && !d.locked && (
              <span
                className="absolute left-1/2 bottom-0 -translate-x-1/2 pointer-events-none"
                aria-hidden
              >
                <span
                  className="block w-10 h-2 rounded-full bg-white/30 blur-[2px] animate-[dust_220ms_ease-out_forwards]"
                />
              </span>
            )}
          </span>
        ))}
      </div>

      <style>{`
        @keyframes dust {
          0%   { transform: scale(0.4) translateY(0);  opacity: 0.7; }
          50%  { transform: scale(1.6) translateY(2px); opacity: 0.6; }
          100% { transform: scale(2.4) translateY(6px); opacity: 0;  }
        }
      `}</style>
    </div>
  );
}
