/**
 * Choreographer — root-level component that renders the visual effect
 * layers and listens for queue activity.
 *
 * Queue draining is driven by a module-level Zustand subscription (NOT a
 * React useEffect) to avoid React 18 StrictMode + dep-array churn racing
 * with the in-flight setTimeout — a previous implementation cancelled its
 * own timer on every re-render mid-event, deadlocking the queue.
 *
 * The store's `playing` field gates the next event: while non-null, no new
 * event starts. When the beat's duration elapses, `finishCurrent` clears
 * `playing` and the next event in queue takes the floor.
 *
 * The match store calls `enqueueEvents(events)` after every applyAction
 * call, and UI components gate interactivity behind `useInputUnlocked()`
 * (queue.length === 0 && !playing && !cinematic).
 */
import { type ReactNode } from "react";
import { useChoreoStore } from "@/store/choreoStore";
import type { GameEvent } from "@/game/types";
import { sfxForEvent } from "@/audio/library";
import { audio } from "@/audio/manager";
import { vibrate } from "@/hooks/useHaptics";

import { ScreenShake } from "./ScreenShake";
import { HitStop } from "./HitStop";
import { DamageNumberLayer } from "./DamageNumber";
import { AbilityCinematicLayer } from "./AbilityCinematic";
import { Banner } from "./Banner";

interface Props { children: ReactNode }

export function Choreographer({ children }: Props) {
  return (
    <ScreenShake>
      {children}
      <HitStop />
      <DamageNumberLayer />
      <AbilityCinematicLayer />
      <Banner />
    </ScreenShake>
  );
}

// ── Module-level queue driver — runs once per page load ─────────────────────

let pumpTimer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

function readReduced(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const o = localStorage.getItem("diceborn:reduced-motion");
    if (o === "on")  return true;
    if (o === "off") return false;
  } catch { /* */ }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pump(): void {
  const s = useChoreoStore.getState();
  if (pumpTimer) return;          // a beat is already in flight
  if (s.playing) return;
  if (s.queue.length === 0) return;

  const ev = s.queue[0];
  s.startNext(ev);

  // Audio
  const fx = sfxForEvent(ev);
  if (fx) audio.play(fx);

  // Side-effects + duration
  const reduced = readReduced();
  const baseDuration = playEvent(ev, {
    reduced,
    setShake:       s.setShake,
    triggerHitStop: s.triggerHitStop,
    spawnDmg:       s.spawnDamageNumber,
    startCinematic: s.startCinematic,
    endCinematic:   s.endCinematic,
    setBanner:      s.setBanner,
  });
  const duration = reduced ? Math.min(baseDuration, 220) : baseDuration;

  pumpTimer = setTimeout(() => {
    pumpTimer = null;
    useChoreoStore.getState().finishCurrent();
    // Try to advance immediately to the next event in the queue.
    pump();
  }, duration);
}

if (typeof window !== "undefined" && !subscribed) {
  subscribed = true;
  // Drain on every store change. Cheap — bails immediately if not ready.
  useChoreoStore.subscribe(() => pump());
  // Kick once at install time in case events were enqueued before subscribe.
  pump();
}

interface PlayCtx {
  reduced: boolean;
  setShake:       (s: { magnitude: number; duration: number; startedAt: number } | null) => void;
  triggerHitStop: (ms: number) => void;
  spawnDmg:       (n: { amount: number; variant: "dmg"|"heal"|"pure"|"crit"|"white"; x: number; y: number; size: "sm"|"md"|"lg" }) => void;
  startCinematic: (c: { hero: import("@/game/types").HeroId; abilityName: string; isUlt: boolean; isCritical: boolean; durationMs: number }) => void;
  endCinematic:   () => void;
  setBanner:      (text: string | null) => void;
}

/** Run side-effects for an event, return its beat duration in ms. */
function playEvent(ev: GameEvent, ctx: PlayCtx): number {
  switch (ev.t) {
    case "match-started":
      ctx.setBanner(`${ev.players.p1.toUpperCase()} vs ${ev.players.p2.toUpperCase()}`);
      setTimeout(() => ctx.setBanner(null), 1400);
      return 1400;

    case "match-won": {
      ctx.setBanner(ev.winner === "draw" ? "DRAW" : `${ev.winner.toUpperCase()} WINS`);
      vibrate("victory");
      setTimeout(() => ctx.setBanner(null), 2000);
      return 2200;
    }

    case "turn-started": {
      ctx.setBanner(`Turn ${ev.turn} — ${ev.player.toUpperCase()}`);
      setTimeout(() => ctx.setBanner(null), 700);
      return 700;
    }

    case "phase-changed":      return 0;

    case "card-drawn":         return 200;
    case "card-played":        vibrate("card-play"); return 320;
    case "card-sold":          return 220;
    case "card-discarded":     return 180;

    case "cp-changed":         return 200;
    case "hp-changed":         return 0;       // rendered by HealthBar via prop change

    case "dice-rolled":        return 0;       // DiceTray drives its own choreography
    case "die-locked":         vibrate("die-lock"); return 200;
    case "die-face-changed":   return 360;

    case "ladder-state-changed": return 200;

    case "ability-triggered": {
      if (ev.tier === 4) return 280;
      return ev.isCritical ? 600 : 380;
    }

    case "ultimate-fired": {
      const dur = ev.isCritical ? (ctx.reduced ? 540 : 2600) : (ctx.reduced ? 540 : 1800);
      ctx.startCinematic({
        hero: heroIdFromPlayer(ev.player),
        abilityName: ev.abilityName,
        isUlt: true,
        isCritical: ev.isCritical,
        durationMs: dur,
      });
      vibrate("ability");
      setTimeout(() => ctx.endCinematic(), dur);
      return dur;
    }

    case "damage-dealt": {
      if (ev.amount <= 0) return 0;
      ctx.triggerHitStop(ev.type === "ultimate" ? 150 : 100);
      const mag = ev.type === "ultimate" ? 10 : ev.amount >= 15 ? 6 : 2;
      const dur = ev.type === "ultimate" ? 600 : ev.amount >= 15 ? 250 : 100;
      ctx.setShake({ magnitude: mag, duration: dur, startedAt: performance.now() });
      setTimeout(() => ctx.setShake(null), dur);

      const variant: "dmg" | "pure" | "white" | "crit" =
        ev.type === "pure" ? "pure" :
        ev.type === "undefendable" ? "white" :
        ev.amount >= 15 ? "crit" : "dmg";
      const size: "sm" | "md" | "lg" =
        ev.amount >= 20 ? "lg" : ev.amount >= 10 ? "md" : "sm";
      ctx.spawnDmg({ amount: ev.amount, variant, x: 0.5, y: 0.42, size });

      vibrate("damage-taken");
      return Math.max(dur, ev.amount >= 15 ? 350 : 200);
    }

    case "heal-applied": {
      ctx.spawnDmg({ amount: ev.amount, variant: "heal", x: 0.5, y: 0.42, size: "sm" });
      return 320;
    }

    case "defense-resolved":   return ev.reduction > 0 ? 600 : 220;

    case "status-applied":
      vibrate("card-play"); return 360;
    case "status-ticked":      return 280;
    case "status-removed":     return 240;
    case "status-triggered":   return 240;

    case "hero-state":         return 200;
    case "rage-changed":       return 280;

    case "counter-prompt":     return 0;
    case "counter-resolved":   return 200;
  }
}

function heroIdFromPlayer(_p: string): import("@/game/types").HeroId {
  return "barbarian";
}
