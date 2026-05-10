/**
 * Pact of Heroes — haptics.
 *
 * Wraps the Vibration API with a feature-detect and a small enable toggle.
 * iOS Safari ignores Vibration API entirely; Android Chrome honours it.
 * No-op gracefully when unavailable so call sites don't need to guard.
 */

import { useCallback, useEffect, useState } from "react";

const KEY = "pact-of-heroes:haptics";

export type HapticPattern =
  | "die-lock"      // 10ms tick
  | "die-settle"    // 12ms tick
  | "card-play"     // 15ms
  | "damage-taken"  // 25ms
  | "ability"       // 40ms
  | "victory";      // long pattern

const PATTERNS: Record<HapticPattern, number | number[]> = {
  "die-lock":     10,
  "die-settle":   12,
  "card-play":    15,
  "damage-taken": 25,
  "ability":      40,
  "victory":      [60, 40, 60, 40, 120],
};

export function vibrate(pattern: HapticPattern): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const enabled = localStorage.getItem(KEY) !== "0";
  if (!enabled) return;
  try { navigator.vibrate(PATTERNS[pattern]); } catch { /* no-op */ }
}

/** React hook for the settings UI. Returns [enabled, setEnabled, supported]. */
export function useHaptics(): [boolean, (v: boolean) => void, boolean] {
  const supported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  const [enabled, _setEnabled] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return supported;
    return localStorage.getItem(KEY) !== "0";
  });
  const setEnabled = useCallback((v: boolean) => {
    _setEnabled(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* no-op */ }
  }, []);
  useEffect(() => { void supported; }, [supported]);
  return [enabled, setEnabled, supported];
}
