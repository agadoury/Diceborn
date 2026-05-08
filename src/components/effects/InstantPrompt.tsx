/**
 * InstantPromptLayer — overlay that opens when the Choreographer pump
 * detects playable Instant cards in a hand after a qualifying event
 * (damage-dealt, ability-triggered, ultimate-fired, defense-resolved,
 * status-applied). Auto-closes after the TTL set by the pump.
 *
 * UX:
 *   - Bottom-anchored band with the holder's accent color trim
 *   - "INSTANT?" header + listing of each candidate card by name
 *   - Tap a card → play it (dispatches play-card on the game store)
 *   - Tap Skip / outside / wait for TTL → close without playing
 *
 * Vs AI: when the AI is the holder, this layer renders briefly while the
 * AI's "decision" is computed; for MVP the AI declines to play Instants
 * unless extended (left as TODO; the prompt closes via TTL).
 */
import { useEffect, useState } from "react";
import { useChoreoStore } from "@/store/choreoStore";
import { useGameStore } from "@/store/gameStore";

export function InstantPromptLayer() {
  const prompt   = useChoreoStore(s => s.instantPrompt);
  const endPrompt = useChoreoStore(s => s.endInstantPrompt);
  const dispatch  = useGameStore(s => s.dispatch);
  const state     = useGameStore(s => s.state);
  const [tick, setTick] = useState(0);

  // Re-render once per ~120ms to update the TTL bar.
  useEffect(() => {
    if (!prompt) return;
    const id = window.setInterval(() => setTick(t => t + 1), 120);
    return () => window.clearInterval(id);
  }, [prompt]);

  if (!prompt || !state) return null;

  const holderHand = state.players[prompt.holder].hand;
  const cards = prompt.candidateCardIds
    .map(id => holderHand.find(c => c.id === id))
    .filter(Boolean) as ReturnType<typeof holderHand.find>[];
  if (cards.length === 0) {
    // Hand contents changed (e.g. AI already discarded) — close immediately.
    endPrompt();
    return null;
  }

  const remaining = Math.max(0, prompt.expiresAt - performance.now());
  const total = 1500;
  const fillPct = Math.min(100, (remaining / total) * 100);

  function play(cardId: string) {
    dispatch({ kind: "play-card", card: cardId });
    endPrompt();
  }
  function skip() { endPrompt(); }

  return (
    <div
      role="dialog"
      aria-label="Play an Instant"
      onClick={skip}
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),16px)] pt-3
                 bg-gradient-to-t from-arena-0 via-arena-0/95 to-transparent pointer-events-auto"
    >
      <div onClick={(e) => e.stopPropagation()}
           className="surface mx-auto max-w-md rounded-card p-3 sm:p-4 ring-1 ring-rose-400/40
                      shadow-[0_0_24px_rgba(244,63,94,0.35)]">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display tracking-widest text-rose-300 text-sm">INSTANT?</span>
          <span className="text-[10px] text-muted uppercase tracking-widest">{prompt.holder.toUpperCase()}</span>
        </div>

        {/* TTL bar */}
        <div className="h-1 rounded-full bg-arena-0 overflow-hidden mb-3">
          <div
            className="h-full bg-rose-400/80"
            style={{ width: `${fillPct}%`, transition: "width 100ms linear" }}
          />
        </div>

        <div className="flex flex-col gap-2">
          {cards.map(card => (
            <button
              key={card!.id}
              onClick={() => play(card!.id)}
              className="surface rounded-card px-3 py-2 text-left flex items-center gap-3
                         hover:ring-1 hover:ring-rose-300/50 transition-all"
            >
              <span className="grid place-items-center w-6 h-6 rounded-full bg-ember text-arena-0 font-num font-bold text-xs shrink-0">
                {card!.cost}
              </span>
              <span className="flex-1 min-w-0">
                <div className="font-display tracking-wider text-ink text-sm truncate">{card!.name}</div>
                <div className="text-xs text-muted truncate">{card!.text}</div>
              </span>
              <span className="text-rose-300 text-xs font-display tracking-widest">PLAY</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={skip}
          className="mt-2 w-full text-center text-xs text-muted hover:text-ink py-2"
        >
          Skip ({(remaining / 1000).toFixed(1)}s)
        </button>

        <div className="mt-1 text-[10px] uppercase tracking-widest text-muted/60 text-center">
          triggered by {prompt.triggeringEventName.replace(/-/g, " ")}
        </div>
      </div>
      {/* Hint that we're using `tick` so the linter is happy. */}
      <span aria-hidden className="hidden">{tick}</span>
    </div>
  );
}
