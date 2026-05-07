/**
 * HotSeatCurtain — pass-and-play handoff between turns.
 *
 * Per §2: mandatory between turns, requires explicit tap (not swipe), with
 * a 0.5s anti-tap delay so the previous player's last tap doesn't dismiss
 * it. Honoured even with reduced-motion.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { HeroId, PlayerId } from "@/game/types";
import { Button } from "@/components/ui/Button";

interface Props {
  open: boolean;
  nextPlayer: PlayerId;
  nextHero: HeroId;
  onContinue: () => void;
}

const ANTI_TAP_MS = 500;

export function HotSeatCurtain({ open, nextPlayer, nextHero, onContinue }: Props) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!open) { setArmed(false); return; }
    const t = window.setTimeout(() => setArmed(true), ANTI_TAP_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="Pass and play"
      className={cn(
        "fixed inset-0 z-[60] grid place-items-center safe-pad",
        "bg-arena-0",
      )}
    >
      <div className="flex flex-col items-center gap-6 text-center max-w-sm">
        <div className="text-xs uppercase tracking-widest text-muted">Hot-seat handoff</div>
        <div className="font-display text-d-1 tracking-widest">
          PASS TO {nextPlayer.toUpperCase()}
        </div>
        <div className="text-base text-muted">
          {prettyHero(nextHero)}'s turn
        </div>
        <Button
          variant="primary"
          size="lg"
          disabled={!armed}
          onClick={onContinue}
          sound="ui-tap"
        >
          {armed ? "TAP TO CONTINUE" : "..."}
        </Button>
        <div className="text-xs text-muted">
          {armed ? "Pass the device, then tap." : "(briefly arming...)"}
        </div>
      </div>
    </div>
  );
}

function prettyHero(id: HeroId): string {
  switch (id) {
    case "barbarian":  return "Barbarian";
    case "pyromancer": return "Pyromancer";
    case "paladin":    return "Paladin";
  }
}
