/**
 * AttackSelectLayer — overlay shown to the active player after their
 * offensive roll completes, while `state.pendingOffensiveChoice` is set.
 * Lists every ability whose combo currently matches; the player picks
 * one (or "Pass") and dispatches `select-offensive-ability` to resume
 * the engine.
 *
 * Mirrors the DefenseSelectLayer pattern. Matches are pre-sorted
 * highest-tier-first then highest-base-damage-first.
 *
 * Vs AI: when the AI is the picker, this layer renders a brief "thinking"
 * state while the AI driver dispatches its choice.
 */
import { useGameStore, useInputUnlocked } from "@/store/gameStore";
import { getHero } from "@/content";
import type { DamageType } from "@/game/types";

export function AttackSelectLayer() {
  const state    = useGameStore(s => s.state);
  const aiPlayer = useGameStore(s => s.aiPlayer);
  const dispatch = useGameStore(s => s.dispatch);
  const ready    = useInputUnlocked();
  if (!state || !state.pendingOffensiveChoice || !ready) return null;

  const choice = state.pendingOffensiveChoice;
  const attackerIsAi = aiPlayer != null && aiPlayer === choice.attacker;
  const attacker = state.players[choice.attacker];
  const hero = attacker ? getHero(attacker.hero) : undefined;
  const accent = hero?.accentColor ?? "var(--c-brand)";

  function pick(idx: number | null) {
    dispatch({ kind: "select-offensive-ability", abilityIndex: idx });
  }

  return (
    <div
      role="dialog"
      aria-label="Pick your attack"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),16px)] pt-3
                 bg-gradient-to-t from-arena-0 via-arena-0/95 to-transparent pointer-events-auto"
    >
      <div
        className="surface mx-auto max-w-lg rounded-card p-3 sm:p-4 ring-1"
        style={{ borderColor: accent, boxShadow: `0 0 24px ${accent}55` }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-display tracking-widest text-sm" style={{ color: accent }}>
            FIRE WHICH ATTACK?
          </span>
          <span className="text-[10px] text-muted uppercase tracking-widest">
            {choice.attacker.toUpperCase()}
          </span>
        </div>

        {/* Match list — already sorted highest-tier first. */}
        <div className="flex flex-col gap-2 mb-2">
          {choice.matches.map(m => (
            <button
              key={m.abilityIndex}
              disabled={attackerIsAi}
              onClick={() => pick(m.abilityIndex)}
              className="surface rounded-card px-3 py-2 text-left flex items-start gap-3
                         hover:ring-1 transition-all disabled:opacity-60"
              style={{ ["--hover" as string]: accent }}
            >
              <span
                className="grid place-items-center w-7 h-7 rounded-md font-display tracking-widest text-xs shrink-0 mt-0.5"
                style={{ background: `${accent}25`, color: accent }}
              >
                T{m.tier}
              </span>
              <span className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display tracking-wider text-ink text-sm truncate">
                    {m.abilityName}
                  </span>
                  <span className="font-num text-lg leading-none text-ember shrink-0">
                    {m.baseDamage}
                  </span>
                </div>
                <div className="text-xs text-ink/85 truncate">{m.shortText}</div>
                <div className="text-[10px] text-muted truncate mt-0.5">
                  {damageTypeLabel(m.damageType)}
                </div>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={attackerIsAi}
          onClick={() => pick(null)}
          className="w-full text-center text-xs uppercase tracking-widest py-2 rounded-card
                     border border-arena-0/60 hover:bg-arena-0/40 disabled:opacity-60"
        >
          Pass (no attack)
        </button>

        {attackerIsAi && (
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
