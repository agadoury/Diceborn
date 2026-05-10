/**
 * DefenseRollLayer — overlay shown after the defender picks a defense
 * ability. The engine pauses on `pendingDefenseRoll` until the defender
 * dispatches `roll-defense-dice`. This layer surfaces a clear ROLL CTA so
 * the player has agency over the roll instead of it auto-resolving.
 *
 * The AI never sees this overlay — its driver dispatches `roll-defense-dice`
 * directly via `nextAiAction`. We still render the "AI rolling…" fallback
 * for symmetry while the engine is waiting on the AI's dispatch, in case the
 * inputUnlocked gate hasn't caught up.
 */
import { useGameStore, useInputUnlocked } from "@/store/gameStore";
import { getHero } from "@/content";
import { Button } from "@/components/ui/Button";

export function DefenseRollLayer() {
  const state    = useGameStore(s => s.state);
  const aiPlayer = useGameStore(s => s.aiPlayer);
  const dispatch = useGameStore(s => s.dispatch);
  const ready    = useInputUnlocked();
  if (!state || !state.pendingDefenseRoll || !ready) return null;

  const pdr = state.pendingDefenseRoll;
  const defender = state.players[pdr.defender];
  const defenderHero = getHero(defender.hero);
  const ladder = defenderHero.defensiveLadder ?? [];
  const ability = ladder[pdr.abilityIndex];
  if (!ability) return null;

  const defenderIsAi = aiPlayer != null && aiPlayer === pdr.defender;
  const accent = defenderHero.accentColor;

  function roll() {
    dispatch({ kind: "roll-defense-dice" });
  }

  return (
    <div
      role="dialog"
      aria-label={`Roll ${ability.name}`}
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),16px)] pt-3
                 bg-gradient-to-t from-arena-0 via-arena-0/95 to-transparent pointer-events-auto"
    >
      <div
        className="surface mx-auto max-w-lg rounded-card p-3 sm:p-4 ring-1"
        style={{ borderColor: accent, boxShadow: `0 0 24px ${accent}55` }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-display tracking-widest text-sm" style={{ color: accent }}>
            ROLL DEFENSE
          </span>
          <span className="text-[10px] text-muted uppercase tracking-widest">
            {pdr.defender.toUpperCase()}
          </span>
        </div>

        <div className="px-3 py-2 mb-3 rounded-card bg-arena-0/60 ring-1 ring-arena-0/50">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display tracking-wider text-ink text-sm truncate">{ability.name}</span>
            <span className="text-[10px] text-muted shrink-0">{ability.defenseDiceCount ?? 3}d</span>
          </div>
          <div className="text-xs text-ink/85 truncate">{ability.shortText}</div>
          <div className="text-[10px] text-muted mt-0.5">Roll the dice — combo must match for the defense to land.</div>
        </div>

        <Button
          variant="primary"
          size="lg"
          heroAccent={accent}
          disabled={defenderIsAi}
          onClick={roll}
          className="w-full"
          sound="ui-tap"
        >
          {defenderIsAi ? "AI ROLLING…" : "ROLL"}
        </Button>
      </div>
    </div>
  );
}
