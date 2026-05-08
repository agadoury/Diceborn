/**
 * PhaseIndicator — small label showing the current phase + active player.
 * Sits in the arena center under the dice tray on mobile.
 */
import { cn } from "@/lib/cn";
import type { Phase, PlayerId } from "@/game/types";

const PHASE_NAME: Record<Phase, string> = {
  "pre-match":      "READY",
  "upkeep":         "UPKEEP",
  "income":         "INCOME",
  "main-pre":       "MAIN — PRE",
  "offensive-roll": "ROLL",
  "defensive-roll": "DEFENSE",
  "main-post":      "MAIN — POST",
  "discard":        "DISCARD",
  "match-end":      "MATCH OVER",
};

interface Props {
  phase: Phase;
  activePlayer: PlayerId;
  /** Set true when the AI is the active player and we want a "thinking..." cue. */
  thinking?: boolean;
  className?: string;
}

export function PhaseIndicator({ phase, activePlayer, thinking, className }: Props) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1 rounded-full surface",
        "text-[10px] sm:text-xs font-display tracking-widest text-ember",
        className,
      )}
    >
      <span>{PHASE_NAME[phase]}</span>
      <span className="text-muted">·</span>
      <span className="text-ink">{activePlayer.toUpperCase()}</span>
      {thinking && (
        <span className="ml-1 text-muted normal-case text-[10px] animate-pulse">thinking…</span>
      )}
    </div>
  );
}
