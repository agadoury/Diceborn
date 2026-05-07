/**
 * Choreographer — root-level component that consumes the GameEvent queue
 * from the choreo store and plays each event as a timed beat.
 *
 * The store's `playing` field gates the next event: while non-null, no new
 * event starts. When the beat's duration elapses, `finishCurrent` clears
 * `playing` and the next event in queue takes the floor.
 *
 * View components observe individual slices (shake, hitStopUntil,
 * damageNumbers, cinematic, bannerText) and animate accordingly.
 *
 * The match store (Step 5) calls `enqueueEvents(events)` after every
 * applyAction call, and a future "wait for choreographer drain" hook gates
 * the next AI / player action behind `playing == null && queue.length === 0`.
 */
import { useEffect, type ReactNode } from "react";
import { useChoreoStore } from "@/store/choreoStore";
import type { GameEvent } from "@/game/types";
import { sfxForEvent } from "@/audio/library";
import { audio } from "@/audio/manager";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { vibrate } from "@/hooks/useHaptics";

import { ScreenShake } from "./ScreenShake";
import { HitStop } from "./HitStop";
import { DamageNumberLayer } from "./DamageNumber";
import { AbilityCinematicLayer } from "./AbilityCinematic";
import { Banner } from "./Banner";

interface Props { children: ReactNode }

export function Choreographer({ children }: Props) {
  const queue          = useChoreoStore(s => s.queue);
  const playing        = useChoreoStore(s => s.playing);
  const startNext      = useChoreoStore(s => s.startNext);
  const finishCurrent  = useChoreoStore(s => s.finishCurrent);
  const setShake       = useChoreoStore(s => s.setShake);
  const triggerHitStop = useChoreoStore(s => s.triggerHitStop);
  const spawnDmg       = useChoreoStore(s => s.spawnDamageNumber);
  const startCinematic = useChoreoStore(s => s.startCinematic);
  const endCinematic   = useChoreoStore(s => s.endCinematic);
  const setBanner      = useChoreoStore(s => s.setBanner);

  const reduced = useReducedMotion();

  // Drain the queue one event at a time.
  useEffect(() => {
    if (playing) return;                    // already in a beat
    if (queue.length === 0) return;
    const ev = queue[0];
    startNext(ev);

    // Fire SFX
    const sfx = sfxForEvent(ev);
    if (sfx) audio.play(sfx);

    // Side-effects + duration
    const baseDuration = playEvent(ev, {
      reduced, setShake, triggerHitStop, spawnDmg, startCinematic, endCinematic, setBanner,
    });
    const duration = reduced ? Math.min(baseDuration, 220) : baseDuration;

    const id = window.setTimeout(() => finishCurrent(), duration);
    return () => window.clearTimeout(id);
  }, [
    queue, playing, startNext, finishCurrent, reduced,
    setShake, triggerHitStop, spawnDmg, startCinematic, endCinematic, setBanner,
  ]);

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
      window.setTimeout(() => ctx.setBanner(null), 1400);
      return 1400;

    case "match-won": {
      ctx.setBanner(ev.winner === "draw" ? "DRAW" : `${ev.winner.toUpperCase()} WINS`);
      vibrate("victory");
      window.setTimeout(() => ctx.setBanner(null), 2000);
      return 2200;
    }

    case "turn-started": {
      ctx.setBanner(`Turn ${ev.turn} — ${ev.player.toUpperCase()}`);
      window.setTimeout(() => ctx.setBanner(null), 700);
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
      if (ev.tier === 4) {
        // Ultimate cinematic is handled separately via "ultimate-fired".
        return 280;
      }
      // Minor crit gets an extra accent flash; main visual is on the ladder.
      return ev.isCritical ? 600 : 380;
    }

    case "ultimate-fired": {
      const dur = ev.isCritical ? (ctx.reduced ? 540 : 2600) : (ctx.reduced ? 540 : 1800);
      ctx.startCinematic({
        hero: heroIdFromPlayer(ev.player),    // see helper below
        abilityName: ev.abilityName,
        isUlt: true,
        isCritical: ev.isCritical,
        durationMs: dur,
      });
      vibrate("ability");
      window.setTimeout(() => ctx.endCinematic(), dur);
      return dur;
    }

    case "damage-dealt": {
      if (ev.amount <= 0) return 0;
      ctx.triggerHitStop(ev.type === "ultimate" ? 150 : 100);
      const mag = ev.type === "ultimate" ? 10 : ev.amount >= 15 ? 6 : 2;
      const dur = ev.type === "ultimate" ? 600 : ev.amount >= 15 ? 250 : 100;
      ctx.setShake({ magnitude: mag, duration: dur, startedAt: performance.now() });
      window.setTimeout(() => ctx.setShake(null), dur);

      // Spawn a damage number near the receiver's panel — Step 4 placeholder
      // location is screen-center; Step 5 wires real coordinates.
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

    case "counter-prompt":     return 0;       // interactive — user resolves
    case "counter-resolved":   return 200;
  }
}

/** Map PlayerId → HeroId for cinematics. Step 4 placeholder; Step 5 reads real game store. */
function heroIdFromPlayer(_p: string): import("@/game/types").HeroId {
  return "barbarian";
}
