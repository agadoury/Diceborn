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
import type { CardId, GameEvent } from "@/game/types";
import { sfxForEvent } from "@/audio/library";
import { audio } from "@/audio/manager";
import { vibrate } from "@/hooks/useHaptics";

import { ScreenShake } from "./ScreenShake";
import { HitStop } from "./HitStop";
import { DamageNumberLayer } from "./DamageNumber";
import { AbilityCinematicLayer } from "./AbilityCinematic";
import { AttackEffectLayer } from "./AttackEffect";
import { Banner } from "./Banner";
import { ActionLog } from "./ActionLog";
import { InstantPromptLayer } from "./InstantPrompt";
import { DefenseSelectLayer } from "./DefenseSelect";
import { AttackSelectLayer } from "./AttackSelect";
import { useGameStore } from "@/store/gameStore";
import { getHero } from "@/content";
import type { HeroId, PlayerId } from "@/game/types";

interface Props { children: ReactNode }

export function Choreographer({ children }: Props) {
  return (
    <ScreenShake>
      {children}
      <HitStop />
      <DamageNumberLayer />
      <AttackEffectLayer />
      <AbilityCinematicLayer />
      <Banner />
      <ActionLog />
      <InstantPromptLayer />
      <AttackSelectLayer />
      <DefenseSelectLayer />
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
  if (s.instantPrompt) return;    // paused while waiting for player to respond
  if (s.playing) return;
  if (s.queue.length === 0) return;
  // Note: when `pendingAttack` is set on the game store, the engine has
  // already enqueued `attack-intended` and stopped — once that beat plays
  // the queue empties on its own and the DefenseSelectLayer (gated on
  // input-unlocked) takes the floor.

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
    startAttackEffect: s.startAttackEffect,
    endAttackEffect:   s.endAttackEffect,
    setBanner:      s.setBanner,
  });
  const duration = reduced ? Math.min(baseDuration, 220) : baseDuration;

  pumpTimer = setTimeout(() => {
    pumpTimer = null;
    useChoreoStore.getState().finishCurrent();
    // After the beat resolves, check if the just-played event qualifies for
    // an Instant prompt — and if either player has playable Instants, open
    // the prompt before advancing the queue.
    if (eventQualifiesForInstantPrompt(ev)) {
      maybeOpenInstantPrompt(ev);
    }
    // Try to advance — pump will bail early if a prompt was just opened.
    pump();
  }, duration);
}

/** Events that allow an Instant interrupt window per spec correction 4. */
function eventQualifiesForInstantPrompt(ev: GameEvent): boolean {
  switch (ev.t) {
    case "damage-dealt":
    case "ability-triggered":
    case "ultimate-fired":
    case "defense-resolved":
    case "status-applied":
      return true;
    default:
      return false;
  }
}

/** Inspect both players' hands for cards whose kind is "instant" and open
 *  the prompt for whichever holder has at least one. Active player gets
 *  priority over opponent if both have candidates (UI policy). */
function maybeOpenInstantPrompt(ev: GameEvent): void {
  // Lazy import to avoid circular dep with gameStore at module load.
  const gs = useGameStore.getState();
  if (!gs.state || gs.state.winner) return;

  const candidates: { holder: PlayerId; ids: CardId[] }[] = [];
  for (const pid of ["p1", "p2"] as const) {
    const hand = gs.state.players[pid].hand;
    const ids = hand.filter(c => c.kind === "instant").map(c => c.id);
    if (ids.length > 0) candidates.push({ holder: pid, ids });
  }
  if (candidates.length === 0) return;

  // Prefer the active player; otherwise fall through to the first holder.
  const active = gs.state.activePlayer;
  const chosen = candidates.find(c => c.holder === active) ?? candidates[0];

  useChoreoStore.getState().startInstantPrompt({
    holder: chosen.holder,
    candidateCardIds: chosen.ids,
    triggeringEventName: ev.t,
    ttlMs: 1500,
  });

  // Auto-close on TTL.
  window.setTimeout(() => {
    const live = useChoreoStore.getState().instantPrompt;
    if (live && live.expiresAt <= performance.now() + 5) {
      useChoreoStore.getState().endInstantPrompt();
      pump();
    }
  }, 1500);
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
  spawnDmg:       (n: { amount: number; variant: "dmg"|"heal"|"pure"|"crit"|"white"|"cp"; x: number; y: number; size: "sm"|"md"|"lg" }) => void;
  startCinematic: (c: { hero: HeroId; abilityName: string; isUlt: boolean; isCritical: boolean; durationMs: number }) => void;
  endCinematic:   () => void;
  startAttackEffect: (e: { hero: HeroId; abilityId: string; abilityName: string; tier: 1 | 2 | 3; accent: string; isCritical: boolean; durationMs: number }) => void;
  endAttackEffect:   () => void;
  setBanner:      (text: string | null) => void;
}

/** Run side-effects for an event, return its beat duration in ms.
 *
 * Pacing philosophy: every important event needs to "land" before the next
 * one starts, or the player can't follow the action. Defaults are tuned so
 * a typical AI turn (card → roll → ability → damage → status) takes ~5-7s
 * to play out. Reduced-motion shortcuts everything to ≤220ms.
 */
function playEvent(ev: GameEvent, ctx: PlayCtx): number {
  switch (ev.t) {
    case "match-started":
      ctx.setBanner(`${ev.players.p1.toUpperCase()} vs ${ev.players.p2.toUpperCase()}`);
      setTimeout(() => ctx.setBanner(null), 1800);
      return 1800;

    case "match-won": {
      ctx.setBanner(ev.winner === "draw" ? "DRAW" : `${ev.winner.toUpperCase()} WINS`);
      vibrate("victory");
      setTimeout(() => ctx.setBanner(null), 2400);
      return 2600;
    }

    case "turn-started": {
      ctx.setBanner(`Turn ${ev.turn} — ${ev.player.toUpperCase()}`);
      setTimeout(() => ctx.setBanner(null), 1100);
      return 1100;
    }

    case "phase-changed":      return 200;       // small breath between phases

    case "card-drawn":         return 350;
    case "card-played":        vibrate("card-play"); return 700;
    case "card-sold": {
      ctx.spawnDmg({ amount: ev.cpGained, variant: "cp", x: 0.5, y: 0.62, size: "sm" });
      return 600;
    }
    case "card-discarded":     return 350;

    case "cp-changed":         return 350;
    case "hp-changed":         return 0;       // rendered by HealthBar via prop change

    case "dice-rolled":        return 1100;    // wait for the DiceTray's full tumble + settle
    case "die-locked":         vibrate("die-lock"); return 350;
    case "die-face-changed":   return 600;

    case "ladder-state-changed": return 400;

    case "ability-triggered": {
      if (ev.tier === 4) return 500;             // ult cinematic handles its own hold
      const hero = heroIdFromPlayer(ev.player);
      const accent = accentFor(hero);
      const dur = ctx.reduced ? 220 : (ev.isCritical ? 1200 : 1000);
      ctx.startAttackEffect({
        hero,
        abilityId: abilityIdOf(ev.abilityName),
        abilityName: ev.abilityName,
        tier: ev.tier as 1 | 2 | 3,
        accent,
        isCritical: !!ev.isCritical,
        durationMs: dur,
      });
      setTimeout(() => ctx.endAttackEffect(), dur);
      vibrate("ability");
      return dur;
    }

    case "ultimate-fired": {
      const dur = ev.isCritical ? (ctx.reduced ? 540 : 3000) : (ctx.reduced ? 540 : 2200);
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
      if (ev.amount <= 0) return 200;
      ctx.triggerHitStop(ev.type === "ultimate" ? 200 : 140);
      const mag = ev.type === "ultimate" ? 10 : ev.amount >= 15 ? 6 : 2;
      const shakeDur = ev.type === "ultimate" ? 600 : ev.amount >= 15 ? 300 : 140;
      ctx.setShake({ magnitude: mag, duration: shakeDur, startedAt: performance.now() });
      setTimeout(() => ctx.setShake(null), shakeDur);

      const variant: "dmg" | "pure" | "white" | "crit" =
        ev.type === "pure" ? "pure" :
        ev.type === "undefendable" ? "white" :
        ev.amount >= 15 ? "crit" : "dmg";
      const size: "sm" | "md" | "lg" =
        ev.amount >= 20 ? "lg" : ev.amount >= 10 ? "md" : "sm";
      ctx.spawnDmg({ amount: ev.amount, variant, x: 0.5, y: 0.42, size });

      vibrate("damage-taken");
      // Hold long enough to read the number floating up + the new HP value.
      return ev.amount >= 15 ? 1300 : 900;
    }

    case "heal-applied": {
      ctx.spawnDmg({ amount: ev.amount, variant: "heal", x: 0.5, y: 0.42, size: "sm" });
      return 800;
    }

    case "offensive-pick-prompt": {
      // Brief setup beat — the AttackSelectLayer renders next once the
      // queue drains. Banner gives the player a moment to read.
      ctx.setBanner("PICK YOUR ATTACK");
      setTimeout(() => ctx.setBanner(null), 700);
      return 700;
    }
    case "offensive-choice-made": return ev.abilityIndex == null ? 350 : 500;

    case "attack-intended": {
      // Pause/anticipation beat — choreographer holds while the defender
      // picks (the DefenseSelectLayer renders next). Short on its own;
      // the real wait is behind the overlay.
      ctx.setBanner(`${ev.attacker.toUpperCase()} → ${ev.abilityName.toUpperCase()}`);
      setTimeout(() => ctx.setBanner(null), 900);
      return 900;
    }
    case "defense-intended":     return ev.abilityIndex == null ? 350 : 600;
    case "defense-dice-rolled":  return 1100;          // tumble + settle, like dice-rolled
    case "defense-resolved":     return ev.reduction > 0 ? 1100 : 500;

    case "status-applied":
      vibrate("card-play"); return 700;
    case "status-ticked":      return 600;
    case "status-removed":     return 500;
    case "status-triggered":   return 500;

    case "hero-state":         return 400;
    case "rage-changed":       return 600;

    case "counter-prompt":     return 0;
    case "counter-resolved":   return 400;
    case "passive-counter-changed": return 600;
    case "status-detonated": {
      ctx.triggerHitStop(160);
      ctx.setShake({ magnitude: 6, duration: 200, startedAt: performance.now() });
      setTimeout(() => ctx.setShake(null), 200);
      return 1100;
    }
    case "ability-modifier-added":   return 600;
    case "ability-modifier-removed": return 400;
    case "symbol-bend-applied":      return 500;
    case "symbol-bend-expired":      return 250;
    case "bank-spend-prompt":        return 0;          // overlay holds its own pacing
    case "bank-spent":               return ev.amount > 0 ? 600 : 200;
  }
}

/** Reads the live game state to map a player slot to its hero. Returns
 *  empty string if no game state — the cinematic layer renders generic
 *  fallbacks (no name, no bark) when the hero isn't registered. */
function heroIdFromPlayer(p: string): HeroId {
  try {
    const live = useGameStore.getState().state;
    if (live && (p === "p1" || p === "p2")) return live.players[p as PlayerId].hero;
  } catch { /* */ }
  return "";
}

function accentFor(hero: HeroId): string {
  return getHero(hero).accentColor;
}

/** Map a display ability name to the AttackEffect registry key. */
function abilityIdOf(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}
