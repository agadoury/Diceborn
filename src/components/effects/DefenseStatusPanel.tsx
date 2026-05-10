/**
 * DefenseStatusPanel — persistent context overlay during the defensive
 * flow. Renders from the moment `pendingAttack` is set through the end of
 * the defense events, so the player sees:
 *   - what's coming (incoming ability + damage)
 *   - what they picked (defense name + combo sigils + dice count)
 *   - the outcome (DEFENDED -X / MISSED) once the roll resolves
 *
 * Lives independently from DefenseSelectLayer (the picker). The picker
 * disappears on click, this panel stays until the dice and damage have
 * played through.
 *
 * Reads context from a mix of sources: `state.pendingAttack` while the
 * picker is up, and the queued/playing `defense-*` events afterwards
 * (since pendingAttack is cleared by the engine on dispatch).
 */
import { useGameStore } from "@/store/gameStore";
import { useChoreoStore } from "@/store/choreoStore";
import { getHero } from "@/content";
import { resolveAbilityFor } from "@/game/cards";
import { ComboStrip } from "@/components/game/AbilityLadder";
import type { GameEvent, PlayerId } from "@/game/types";

export function DefenseStatusPanel() {
  const state    = useGameStore(s => s.state);
  const queue    = useChoreoStore(s => s.queue);
  const playing  = useChoreoStore(s => s.playing);
  if (!state) return null;

  const pa = state.pendingAttack;
  const events: GameEvent[] = [...(playing ? [playing] : []), ...queue];
  const defenseIntended = events.find(e => e.t === "defense-intended") as
    | (Extract<GameEvent, { t: "defense-intended" }>) | undefined;
  const defenseRolled = events.find(e => e.t === "defense-dice-rolled") as
    | (Extract<GameEvent, { t: "defense-dice-rolled" }>) | undefined;
  const defenseResolved = events.find(e => e.t === "defense-resolved") as
    | (Extract<GameEvent, { t: "defense-resolved" }>) | undefined;

  // Show nothing if no defense is in flight.
  if (!pa && !defenseIntended) return null;

  // Source incoming-attack info from pendingAttack while it's set; otherwise
  // from the most-recent attack-intended in the queue/playing — but that's
  // already gone by the time defense events play, so once pendingAttack
  // clears we lose the attacker side. To keep it visible, the engine
  // doesn't have it cached anywhere reachable. Best we can do: pull what
  // pendingAttack told us, and once it clears, fall back to omitting it.
  const attackerId: PlayerId | undefined = pa?.attacker;
  const defenderId: PlayerId | undefined =
    pa?.defender ?? defenseIntended?.defender ?? defenseRolled?.player ?? defenseResolved?.player;
  if (!defenderId) return null;

  const defender = state.players[defenderId];
  const defenderHero = getHero(defender.hero);
  const accent = defenderHero.accentColor;

  // Incoming attack name + amount: only available while pendingAttack is set
  // (DefenseSelectLayer was showing this). The picker disappears after
  // dispatch and we lose visibility into it. Show a generic line afterwards.
  const incomingName = pa?.abilityName;
  const incomingAmount = pa?.incomingAmount;
  const incomingType = pa?.damageType;

  // Defense ability the defender chose / is rolling.
  const defenseAbilityIndex = defenseIntended?.abilityIndex ?? null;
  const defenseAbility = (() => {
    if (defenseAbilityIndex == null) return null;
    const dl = defenderHero.defensiveLadder;
    if (!dl || defenseAbilityIndex < 0 || defenseAbilityIndex >= dl.length) return null;
    return resolveAbilityFor(defender, dl[defenseAbilityIndex], "defensive");
  })();

  // Status message progression.
  let status: { kind: "picking" | "rolling" | "landed" | "missed" | "tookHit"; text: string } | null = null;
  if (defenseResolved && playing?.t === "defense-resolved") {
    if (defenseResolved.landed) {
      const reduction = defenseResolved.reduction ?? 0;
      status = { kind: "landed", text: reduction > 0 ? `DEFENDED  −${reduction}` : "DEFENDED" };
    } else if (defenseAbility) {
      status = { kind: "missed", text: "MISSED" };
    } else {
      status = { kind: "tookHit", text: "TAKING HIT" };
    }
  } else if (defenseRolled || (playing?.t === "defense-dice-rolled")) {
    status = { kind: "rolling", text: "ROLLING…" };
  } else if (defenseIntended) {
    status = { kind: "rolling", text: "DEFENDING…" };
  } else if (pa) {
    status = { kind: "picking", text: defender.player === defenderId ? "DEFEND?" : "" };
  }

  const statusColor =
    status?.kind === "landed" ? "text-emerald-300" :
    status?.kind === "missed" ? "text-rose-300"   :
    status?.kind === "tookHit" ? "text-rose-300"  :
    "text-ink";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 top-[88px] z-40 px-3 pointer-events-none"
    >
      <div
        className="surface rounded-card px-3 py-2 ring-1 min-w-[260px] max-w-[92vw] backdrop-blur-sm bg-arena-0/80"
        style={{ borderColor: accent, boxShadow: `0 0 14px ${accent}55` }}
      >
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className="font-display tracking-widest text-[11px]" style={{ color: accent }}>
            {defenderId.toUpperCase()} DEFENSE
          </span>
          {status && (
            <span className={`font-display tracking-widest text-[11px] ${statusColor}`}>
              {status.text}
            </span>
          )}
        </div>

        {/* Incoming attack row. Only renders while pendingAttack is set. */}
        {incomingName != null && (
          <div className="flex items-baseline justify-between gap-3 text-[11px] text-ink/85">
            <span className="truncate">
              <span className="text-muted">vs. </span>
              <span className="font-display tracking-wider">
                {attackerId?.toUpperCase()} {incomingName.toUpperCase()}
              </span>
            </span>
            {incomingAmount != null && (
              <span className="font-num text-ember shrink-0">−{incomingAmount}{incomingType === "ultimate" ? " ULT" : ""}</span>
            )}
          </div>
        )}

        {/* Chosen defense row. */}
        {defenseAbility && (
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <ComboStrip combo={defenseAbility.combo} />
            <span className="font-display tracking-wider truncate" style={{ color: accent }}>
              {defenseAbility.name}
            </span>
            <span className="ml-auto text-muted shrink-0">
              {defenseAbility.defenseDiceCount ?? 3}D
            </span>
          </div>
        )}
        {defenseAbility?.shortText && (
          <div className="text-[10px] text-muted truncate">
            {defenseAbility.shortText}
          </div>
        )}
      </div>
    </div>
  );
}
