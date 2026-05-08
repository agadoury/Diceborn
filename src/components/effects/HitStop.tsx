/**
 * HitStop — fullscreen darken overlay for ~100ms when damage lands. The
 * "punch" before the damage number flies up. Pure CSS, transform/opacity
 * only. Respects reduced-motion (skipped entirely).
 */
import { useEffect, useState } from "react";
import { useChoreoStore } from "@/store/choreoStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export function HitStop() {
  const hitStopUntil = useChoreoStore(s => s.hitStopUntil);
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const remaining = hitStopUntil - performance.now();
    if (remaining <= 0) { setActive(false); return; }
    setActive(true);
    const id = window.setTimeout(() => setActive(false), remaining);
    return () => window.clearTimeout(id);
  }, [hitStopUntil, reduced]);

  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none z-40 transition-[background] duration-75"
      style={{ background: active ? "rgba(0,0,0,0.45)" : "transparent" }}
    />
  );
}
