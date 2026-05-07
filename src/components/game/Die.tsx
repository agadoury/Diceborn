/**
 * <Die /> — the protagonist of the game.
 *
 * 2D cartoony rounded-square SVG. No 3D rotation, no resin texture, no
 * specular. Lands flat with the rolled face dead-on every time.
 *
 * State machine:
 *   "idle"      — resting, may show its current face, may glow if locked.
 *   "tumbling"  — face cycles every 60ms; transform spins around screen-Z
 *                 with subtle X wobble; trail in hero accent. Driven by parent.
 *   "landing"   — face locks to actual rolled value, decel + overshoot bounce.
 *   "settled"   — final resting state with optional 2px bob + sparkle if locked.
 *
 * The component itself doesn't run timelines — the parent (DiceTray) drives
 * the state transitions. The component owns:
 *   - the rapid face-cycle when tumbling
 *   - the visual treatment per state
 *
 * Tap toggles `locked` via `onToggleLock`.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { FACE_GLYPHS, FACE_TINT } from "./dieFaces";
import type { DieFace } from "@/game/types";

export type DieState = "idle" | "tumbling" | "landing" | "settled";

interface DieProps {
  faces: readonly DieFace[];      // length 6
  /** The "true" face index this die is showing right now (settled state). */
  current: number;
  /** Animation state. Parent drives this. */
  state: DieState;
  locked: boolean;
  /** Hero accent color used for the edge trim & locked glow. */
  accent: string;
  /** Size in CSS pixels (square). 64 mobile / 88 desktop. */
  size?: number;
  onToggleLock?: () => void;
  /** Optional aria label override. */
  ariaLabel?: string;
  className?: string;
}

const FACE_CYCLE_MS = 60;

export function Die({
  faces, current, state, locked, accent, size = 64,
  onToggleLock, ariaLabel, className,
}: DieProps) {
  // Face displayed visually — diverges from `current` only while tumbling.
  const [displayed, setDisplayed] = useState(current);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (state === "tumbling") {
      // Cycle a random non-repeating face every FACE_CYCLE_MS.
      let prev = displayed;
      intervalRef.current = window.setInterval(() => {
        let next = Math.floor(Math.random() * faces.length);
        if (next === prev) next = (next + 1) % faces.length;
        prev = next;
        setDisplayed(next);
      }, FACE_CYCLE_MS);
      return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
    }
    // Any non-tumbling state: snap displayed to the true current face.
    setDisplayed(current);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, current, faces.length]);

  const sym = faces[displayed]?.symbol ?? faces[0].symbol;
  const Glyph = FACE_GLYPHS[sym];
  const tint  = FACE_TINT[sym] ?? "#fde68a";

  // Per-state transform.
  let transform = "";
  let extraClass = "";
  switch (state) {
    case "tumbling":
      transform = "translateY(-22px) scale(1.15) rotate(var(--die-spin))";
      extraClass = "animate-[die-spin_1s_linear_infinite]";
      break;
    case "landing":
      transform = "translateY(-3px) scale(1.04)";
      extraClass = "transition-transform duration-[180ms] ease-snap";
      break;
    case "settled":
      transform = "translateY(0px) scale(1)";
      extraClass = "transition-transform duration-[120ms] ease-out-quart";
      break;
    case "idle":
    default:
      extraClass = "transition-transform duration-200 ease-out-quart";
      break;
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? `Die showing ${faces[current].label}${locked ? " (locked)" : ""}`}
      onClick={onToggleLock}
      disabled={state !== "idle" && state !== "settled"}
      className={cn(
        "relative inline-block select-none touch-manipulation",
        "active:scale-95 transition-transform",
        className,
      )}
      style={{ width: size, height: size, willChange: "transform" }}
    >
      <div
        className={cn("relative w-full h-full", extraClass)}
        style={{ transform, willChange: "transform" }}
      >
        {/* Die body */}
        <svg viewBox="0 0 100 100" width="100%" height="100%" className="block">
          <defs>
            <linearGradient id={`die-body-${sym}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#f8eedf" />
              <stop offset="55%"  stopColor="#e9d3a3" />
              <stop offset="100%" stopColor="#bd9d63" />
            </linearGradient>
            <radialGradient id={`die-shine-${sym}`} cx="35%" cy="20%" r="65%">
              <stop offset="0%"  stopColor="rgba(255,255,255,0.65)" />
              <stop offset="55%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>
          {/* Drop shadow */}
          <rect x="6" y="14" width="88" height="84" rx="14" fill="rgba(0,0,0,0.45)" />
          {/* Die body */}
          <rect x="4" y="4"  width="92" height="92" rx="16"
            fill={`url(#die-body-${sym})`} stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
          {/* Hero-accent edge trim */}
          <rect x="6" y="6"  width="88" height="88" rx="14"
            fill="none" stroke={accent} strokeOpacity={locked ? 0.95 : 0.45} strokeWidth={locked ? 3 : 1.5} />
          {/* Top shine */}
          <rect x="4" y="4"  width="92" height="92" rx="16" fill={`url(#die-shine-${sym})`} pointerEvents="none" />
          {/* Symbol glyph */}
          <g transform="translate(8 8) scale(0.84)" style={{ color: tint }}>
            {Glyph ? <Glyph /> : null}
          </g>
        </svg>

        {/* Lock glow halo */}
        {locked && state !== "tumbling" && (
          <span
            className="absolute inset-0 rounded-die pointer-events-none animate-pulse-glow"
            style={{
              boxShadow: `0 0 18px ${accent}cc, inset 0 0 0 2px ${accent}aa`,
              ["--glow" as never]: accent,
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes die-spin {
          0%   { transform: translateY(-22px) scale(1.15) rotate(0deg); }
          50%  { transform: translateY(-26px) scale(1.18) rotate(180deg); }
          100% { transform: translateY(-22px) scale(1.15) rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
