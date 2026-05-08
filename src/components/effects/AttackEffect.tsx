/**
 * AttackEffect — full-screen overlay that plays a signature visual when a
 * Tier 1-3 ability lands.
 *
 * The Effect router below dispatches on `abilityId` (a slug derived from
 * the ability name in Choreographer.tsx, e.g. "ember-burst"). Each hero
 * registers its own per-ability visuals by extending the switch — when no
 * specific case matches, the default radial burst fires in the hero's
 * accent color.
 *
 * Tier 4 ultimates use the AbilityCinematicLayer (full-screen) instead.
 */
import { useChoreoStore } from "@/store/choreoStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export function AttackEffectLayer() {
  const eff = useChoreoStore(s => s.attackEffect);
  const reduced = useReducedMotion();

  if (!eff) return null;
  if (reduced) return <NameFlash text={eff.abilityName} accent={eff.accent} reduced />;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[40] pointer-events-none overflow-hidden"
    >
      <Effect ability={eff.abilityId} accent={eff.accent} crit={eff.isCritical} />
      <NameFlash text={eff.abilityName} accent={eff.accent} crit={eff.isCritical} />
    </div>
  );
}

/* ── Name flash ─────────────────────────────────────────────────────────── */
function NameFlash({
  text, accent, crit, reduced,
}: { text: string; accent: string; crit?: boolean; reduced?: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div
        className="font-display tracking-[0.2em] text-3xl sm:text-5xl text-center"
        style={{
          color: accent,
          textShadow: `0 0 24px ${accent}cc, 0 4px 0 rgba(0,0,0,0.6)`,
          animation: reduced
            ? "ae-name-static 700ms ease-out forwards"
            : "ae-name-flash 800ms cubic-bezier(.34,1.56,.64,1) forwards",
        }}
      >
        {crit && <span className="block text-lg sm:text-2xl text-amber-300 mb-1 tracking-[0.4em]">CRITICAL!</span>}
        {text}
      </div>
      <style>{`
        @keyframes ae-name-flash {
          0%   { transform: translateY(20px) scale(0.7);  opacity: 0; letter-spacing: 0.05em; }
          25%  { transform: translateY(0)    scale(1.1);  opacity: 1; letter-spacing: 0.2em; }
          70%  { transform: translateY(0)    scale(1);    opacity: 1; }
          100% { transform: translateY(-8px) scale(0.95); opacity: 0; }
        }
        @keyframes ae-name-static {
          0% { opacity: 0 } 30% { opacity: 1 } 80% { opacity: 1 } 100% { opacity: 0 }
        }
      `}</style>
    </div>
  );
}

/* ── Effect router ──────────────────────────────────────────────────────── */
function Effect({ ability, accent }: { ability: string; accent: string; crit: boolean }) {
  // Hero-specific cases land here as content is registered.
  void ability;
  return <DefaultFx accent={accent} />;
}

interface FxProps { accent: string }

/** Default fallback effect — radial burst in the hero's accent color. */
function DefaultFx({ accent }: FxProps) {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        width: 140, height: 140,
        background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`,
        animation: "default-burst 700ms ease-out forwards",
      }}>
      <style>{`
        @keyframes default-burst {
          0%   { transform: translate(-50%,-50%) scale(0.2); opacity: 0; }
          40%  {                                              opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(3);   opacity: 0; }
        }
      `}</style>
    </div>
  );
}
