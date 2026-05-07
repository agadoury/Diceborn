/**
 * ScreenShake — wraps app content and applies a transform-only shake based
 * on the current `shake` state in the Choreographer store.
 *
 * Magnitudes per §1:
 *   tiny:  2px / 100ms — normal hit
 *   med:   6px / 250ms — big hit (≥15 dmg)
 *   large: 10px / 600ms (sine wave) — Ultimate
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useChoreoStore } from "@/store/choreoStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface Props { children: ReactNode }

export function ScreenShake({ children }: Props) {
  const shake = useChoreoStore(s => s.shake);
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!shake || !ref.current) return;
    const el = ref.current;
    let raf = 0;
    const start = performance.now();
    const mag = reduced ? Math.min(shake.magnitude, 2) : shake.magnitude;
    const dur = reduced ? Math.min(shake.duration, 120) : shake.duration;

    function step(now: number) {
      const t = (now - start) / dur;
      if (t >= 1) {
        el.style.transform = "translate3d(0,0,0)";
        return;
      }
      // Damped sine wave on both axes, slightly out of phase.
      const damping = 1 - t;
      const dx = Math.sin(t * Math.PI * 6) * mag * damping;
      const dy = Math.cos(t * Math.PI * 7) * mag * damping * 0.6;
      el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [shake, reduced]);

  return (
    <div ref={ref} className="will-change-transform">
      {children}
    </div>
  );
}
