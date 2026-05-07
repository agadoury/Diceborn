import { useEffect, useState } from "react";

const LS_KEY = "diceborn:reduced-motion";

/**
 * Live-updating reduced-motion subscription. Honors:
 *   - localStorage override ("on" | "off" | absent → fall through to OS)
 *   - prefers-reduced-motion OS media query
 *
 * Polls the override key periodically (every 2s) to reflect Settings UI
 * toggles without requiring a custom event channel; on Step 9+ scale this
 * is fine and avoids a pubsub layer.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => compute());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(compute());
    mq.addEventListener?.("change", handler);
    // Cheap poll for localStorage override changes from Settings.
    const id = window.setInterval(handler, 2000);
    return () => {
      mq.removeEventListener?.("change", handler);
      window.clearInterval(id);
    };
  }, []);
  return reduced;
}

function compute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const o = localStorage.getItem(LS_KEY);
    if (o === "on")  return true;
    if (o === "off") return false;
  } catch { /* */ }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
