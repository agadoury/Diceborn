/**
 * DefenseSelectLayer — overlay shown to the defender after `attack-intended`
 * fires, while `state.pendingAttack` is set on the engine. The defender picks
 * one of their hero's defensive abilities (or "take it") and dispatches
 * `select-defense` to resume the engine.
 *
 * Per Correction 5, defense is a real strategic choice, not auto-resolved:
 *   - Each defense lists its combo, dice count, and effect on screen
 *   - One pick → single roll of that defense's dice count → resolved
 *   - No rerolls, no locking — the up-front pick is the decision
 *
 * If the defender has no defensive ladder, the overlay still appears with
 * just the "TAKE IT" option so the player explicitly acknowledges the hit.
 *
 * Vs AI: when the AI is the defender, this layer renders a brief "thinking"
 * state while the AI driver dispatches its own select-defense action; the
 * driver is in `useAiDriver` (in MatchScreen).
 */
import { useGameStore, useInputUnlocked } from "@/store/gameStore";
import type { AbilityDef, DamageType } from "@/game/types";

export function DefenseSelectLayer() {
  const state    = useGameStore(s => s.state);
  const aiPlayer = useGameStore(s => s.aiPlayer);
  const dispatch = useGameStore(s => s.dispatch);
  // Wait for the choreographer to finish playing the lead-up events
  // (ability-triggered, attack-intended) before showing the picker.
  const ready = useInputUnlocked();
  if (!state || !state.pendingAttack || !ready) return null;

  const pa = state.pendingAttack;
  const defenderIsAi = aiPlayer != null && aiPlayer === pa.defender;
  const defender = state.players[pa.defender];
  // The defender's drafted defensive loadout (2 abilities), not the catalog.
  const ladder: readonly AbilityDef[] = defender?.activeDefense ?? [];

  function pick(idx: number | null) {
    dispatch({ kind: "select-defense", abilityIndex: idx });
  }

  return (
    <div
      role="dialog"
      aria-label="Pick a defense"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),16px)] pt-3
                 bg-gradient-to-t from-arena-0 via-arena-0/95 to-transparent pointer-events-auto"
    >
      <div className="surface mx-auto max-w-lg rounded-card p-3 sm:p-4 ring-1 ring-amber-400/40
                      shadow-[0_0_24px_rgba(251,191,36,0.35)]">

        <div className="flex items-center justify-between mb-2">
          <span className="font-display tracking-widest text-amber-300 text-sm">DEFEND?</span>
          <span className="text-[10px] text-muted uppercase tracking-widest">{pa.defender.toUpperCase()}</span>
        </div>

        {/* Incoming attack summary */}
        <div className="mb-3 px-3 py-2 rounded-card bg-arena-0/60 ring-1 ring-arena-0/50">
          <div className="flex items-baseline justify-between">
            <span className="font-display tracking-wider text-ink text-sm">{pa.abilityName}</span>
            <span className="font-num text-2xl text-ember leading-none">{pa.incomingAmount}</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted mt-0.5">
            T{pa.tier} · {damageTypeLabel(pa.damageType)} · incoming
          </div>
        </div>

        {/* Defense list */}
        {ladder.length === 0 && (
          <div className="text-xs text-muted text-center mb-3 italic">No defensive ladder declared — take the hit.</div>
        )}

        {ladder.length > 0 && (
          <div className="flex flex-col gap-2 mb-2">
            {ladder.map((d, i) => (
              <button
                key={i}
                disabled={defenderIsAi}
                onClick={() => pick(i)}
                className="surface rounded-card px-3 py-2 text-left flex items-start gap-3
                           hover:ring-1 hover:ring-amber-300/50 transition-all
                           disabled:opacity-60"
              >
                <span className="grid place-items-center w-7 h-7 rounded-md bg-amber-400/20 text-amber-200 font-display tracking-widest text-xs shrink-0 mt-0.5">
                  T{d.tier}
                </span>
                <span className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display tracking-wider text-ink text-sm truncate">{d.name}</span>
                    <span className="text-[10px] text-muted shrink-0">{d.defenseDiceCount ?? 3}d</span>
                  </div>
                  <div className="text-xs text-ink/85 truncate">{d.shortText}</div>
                  <div className="text-[10px] text-muted truncate mt-0.5">{d.longText}</div>
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={defenderIsAi}
          onClick={() => pick(null)}
          className="w-full text-center text-xs uppercase tracking-widest py-2 rounded-card
                     border border-arena-0/60 hover:bg-arena-0/40 disabled:opacity-60"
        >
          Take it (no defense)
        </button>

        {defenderIsAi && (
          <div className="mt-2 text-[10px] uppercase tracking-widest text-muted text-center">
            AI choosing…
          </div>
        )}
      </div>
    </div>
  );
}

function damageTypeLabel(t: DamageType): string {
  switch (t) {
    case "normal":        return "normal damage";
    case "undefendable":  return "undefendable";
    case "pure":          return "pure damage";
    case "collateral":    return "collateral";
    case "ultimate":      return "ultimate";
  }
}
