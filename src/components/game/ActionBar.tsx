/**
 * ActionBar — bottom-anchored context-sensitive primary CTA.
 *
 * Phase-driven primary action:
 *   main-pre        → ROLL  (advances to offensive-roll, performs first roll)
 *   offensive-roll  → CONFIRM (primary); REROLL (N left) shown as secondary
 *                     while attempts remain so the player can fire the
 *                     current dice without burning rerolls.
 *   main-post       → END TURN
 *   discard         → (auto-advance)
 *
 * Plus secondary buttons: pause/menu, undo (n/a in MVP).
 */
import { cn } from "@/lib/cn";
import type { GameState, HeroSnapshot } from "@/game/types";
import { Button } from "@/components/ui/Button";
import { stacksOf } from "@/game/status";

interface ActionBarProps {
  state: GameState;
  active: HeroSnapshot;
  accent: string;
  enabled: boolean;
  /** True when this player is the *current viewer* — we hide the bar otherwise. */
  isViewerActive: boolean;
  onRoll: () => void;
  onAdvancePhase: () => void;
  onEndTurn: () => void;
  onMenu?: () => void;
}

export function ActionBar({
  state, active, accent, enabled, isViewerActive,
  onRoll, onAdvancePhase, onEndTurn, onMenu,
}: ActionBarProps) {
  const stunned = stacksOf(active, "stun") > 0;
  const phase = state.phase;

  let primaryLabel = "WAITING";
  let primaryAction: () => void = () => {};
  let primaryEnabled = false;
  let secondary: { label: string; action: () => void } | null = null;

  if (isViewerActive) {
    if (phase === "main-pre") {
      primaryLabel = stunned ? "SKIP ROLL (STUN)" : "ROLL";
      primaryAction = onRoll;
      primaryEnabled = enabled;
    } else if (phase === "offensive-roll") {
      primaryLabel = "CONFIRM";
      primaryAction = onAdvancePhase;
      primaryEnabled = enabled;
      if (active.rollAttemptsRemaining > 0) {
        secondary = { label: `REROLL (${active.rollAttemptsRemaining} left)`, action: onRoll };
      }
    } else if (phase === "main-post") {
      primaryLabel = "END TURN";
      primaryAction = onEndTurn;
      primaryEnabled = enabled;
    } else if (phase === "match-end") {
      primaryLabel = "MATCH OVER";
      primaryEnabled = false;
    } else {
      primaryLabel = "...";
      primaryEnabled = false;
    }
  } else {
    primaryLabel = "OPPONENT'S TURN";
    primaryEnabled = false;
  }

  return (
    <div className={cn(
      "fixed left-0 right-0 bottom-0 z-20",
      "px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2",
      "bg-gradient-to-t from-arena-0 to-arena-0/0",
    )}>
      <div className="flex items-center gap-2">
        {onMenu && (
          <button
            onClick={onMenu}
            className="min-w-tap min-h-tap rounded-card surface text-muted hover:text-ink grid place-items-center"
            aria-label="Menu"
          >
            ☰
          </button>
        )}
        {secondary && (
          <div className="flex-1">
            <Button
              size="lg"
              variant="secondary"
              disabled={!primaryEnabled}
              onClick={secondary.action}
              sound={null}
              className="w-full"
            >
              {secondary.label}
            </Button>
          </div>
        )}
        <div className="flex-1">
          <Button
            size="lg"
            variant="primary"
            heroAccent={accent}
            disabled={!primaryEnabled}
            onClick={primaryAction}
            sound={null}
            className="w-full"
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
