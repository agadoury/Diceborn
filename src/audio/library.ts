/**
 * Event → SFX mapping. The Choreographer reads from here so the audio
 * mapping is data, not buried in switch statements.
 */
import type { GameEvent } from "@/game/types";
import type { Sfx } from "./sfx";

/** Returns the SFX (if any) that should play when this event leads its beat. */
export function sfxForEvent(ev: GameEvent): Sfx | null {
  switch (ev.t) {
    case "match-started":      return "ui-tap";
    case "match-won":          return ev.winner === "draw" ? "defeat-toll" : "victory-fanfare";
    case "turn-started":       return "ui-tap";
    case "phase-changed":      return null;
    case "card-drawn":         return "card-shuffle";
    case "card-played":        return "card-thud";
    case "card-sold":          return "ui-tap";
    case "card-discarded":     return "card-shuffle";
    case "cp-changed":         return ev.delta > 0 ? "ui-tap" : null;
    case "hp-changed":         return null;             // covered by damage/heal events
    case "dice-rolled":        return null;             // DiceTray plays its own 3-stage audio
    case "die-locked":         return "die-lock";
    case "die-face-changed":   return "heal-shimmer";   // sparkle-style cue
    case "ladder-state-changed": return null;           // ladder plays its own ladder-firing sting
    case "ability-triggered":  return ev.tier === 4 ? null : "ability-sting";
    case "ultimate-fired":     return "ult-sting";
    case "damage-dealt":       return ev.amount > 0 ? "damage-thud" : null;
    case "heal-applied":       return "heal-shimmer";
    case "defense-resolved":   return ev.reduction > 0 ? "shield-block" : null;
    case "status-applied":     return "status-apply";
    case "status-ticked":      return "status-tick";
    case "status-removed":     return "status-shatter";
    case "status-triggered":   return "status-tick";
    case "hero-state":         return null;
    case "rage-changed":       return "rage-pulse";
    case "counter-prompt":     return "ui-tap";
    case "counter-resolved":   return ev.accepted ? "card-thud" : "ui-back";
  }
}
