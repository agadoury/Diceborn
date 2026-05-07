/**
 * Hand — fanned cards with horizontal scroll on mobile.
 *
 * Interaction:
 *   tap a card → lifts into "ready" state (scales up over the arena center).
 *   While lifted: a CONFIRM bar appears at the bottom; tap CONFIRM to play,
 *   tap the card again or anywhere else to dismiss.
 *   Long-press for inspect tooltip.
 *
 * Drag is intentionally not supported on mobile (scroll conflict). Step 9
 * may add an opt-in drag mode for desktop.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { Card, CardId, GameState, HeroSnapshot } from "@/game/types";
import { CardView } from "./CardView";
import { canPlay } from "@/game/cards";
import { useUIStore } from "@/store/uiStore";

interface HandProps {
  state: GameState;
  hero: HeroSnapshot;
  opponent: HeroSnapshot;
  accent: string;
  /** Whether this player can currently play cards (their turn + input unlocked). */
  enabled: boolean;
  onPlay: (cardId: CardId, targetDie?: number) => void;
  onSell: (cardId: CardId) => void;
  className?: string;
}

export function Hand({ state, hero, opponent, accent, enabled, onPlay, onSell, className }: HandProps) {
  const liftedId = useUIStore(s => s.liftedCardId);
  const liftCard = useUIStore(s => s.liftCard);
  const ref = useRef<HTMLDivElement>(null);

  // Cancel lift when phase changes / hand contents change such that the lifted card disappears.
  useEffect(() => {
    if (liftedId && !hero.hand.find(c => c.id === liftedId)) liftCard(null);
  }, [hero.hand, liftedId, liftCard]);

  const lifted = liftedId ? hero.hand.find(c => c.id === liftedId) : null;

  function tapCard(c: Card) {
    if (!enabled) return;
    if (liftedId === c.id) liftCard(null);
    else liftCard(c.id);
  }

  return (
    <>
      <div
        ref={ref}
        className={cn(
          "relative w-full overflow-x-auto overflow-y-visible",
          "scrollbar-thin py-2 -mx-2 px-2",
          className,
        )}
        aria-label="Hand"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex gap-2 items-end px-2 pb-2 min-w-max">
          {hero.hand.length === 0 && (
            <span className="text-xs text-muted italic px-3">(no cards)</span>
          )}
          {hero.hand.map(card => {
            const playable = enabled && canPlay(state, hero, opponent, card);
            const isLifted = liftedId === card.id;
            return (
              <button
                key={card.id}
                type="button"
                disabled={!enabled}
                onClick={() => tapCard(card)}
                className={cn(
                  "relative shrink-0 transition-transform duration-200 ease-snap-soft",
                  isLifted && "-translate-y-3 scale-105",
                  !playable && enabled && "opacity-60",
                )}
              >
                <CardView card={card} accent={accent} lifted={isLifted} />
                {!playable && enabled && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[10px] bg-arena-0/80 text-muted">
                    not playable
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lifted-card overlay at the bottom of the screen with CONFIRM/SELL/CANCEL */}
      {lifted && enabled && (
        <CardLiftedOverlay
          card={lifted}
          accent={accent}
          canPlay={canPlay(state, hero, opponent, lifted)}
          canSell={state.phase === "main-pre" || state.phase === "main-post"}
          onConfirm={() => { onPlay(lifted.id); liftCard(null); }}
          onSell={() => { onSell(lifted.id); liftCard(null); }}
          onCancel={() => liftCard(null)}
        />
      )}
    </>
  );
}

function CardLiftedOverlay({
  card, accent, canPlay, canSell, onConfirm, onSell, onCancel,
}: {
  card: Card;
  accent: string;
  canPlay: boolean;
  canSell: boolean;
  onConfirm: () => void;
  onSell: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={`Card ${card.name} ready`}
      className="fixed inset-0 z-30 pointer-events-auto bg-black/60 backdrop-blur-sm
                 flex flex-col items-center justify-center gap-6 px-6"
      onClick={onCancel}
    >
      <div onClick={e => e.stopPropagation()}>
        <CardView card={card} accent={accent} lifted className="!w-[200px] sm:!w-[240px]" />
      </div>
      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        {canSell && (
          <button
            type="button"
            onClick={onSell}
            className="min-h-tap-l px-4 py-3 rounded-card surface text-ink hover:text-brand transition-colors"
          >
            Sell (+1 CP)
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="min-h-tap-l px-4 py-3 rounded-card surface text-muted hover:text-ink transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canPlay}
          onClick={onConfirm}
          className="min-h-tap-l px-5 py-3 rounded-card font-display tracking-widest text-arena-0
                     transition-[filter,transform] active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          style={{ background: accent, boxShadow: `0 0 18px ${accent}aa` }}
        >
          PLAY
        </button>
      </div>
      <span className="text-xs text-muted/80 tracking-widest">tap outside to dismiss</span>
    </div>
  );
}
