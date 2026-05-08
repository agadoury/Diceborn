/**
 * AttackEffect — full-screen overlay that plays a signature visual when a
 * Tier 1-3 ability lands. Each ability has its own treatment:
 *
 *   Barbarian   Cleave              Single red diagonal slash
 *               Axe Swing           Double crimson chop + shockwave
 *               Berserker Frenzy    3 rapid impacts + radial sparks + RAGE
 *
 *   Pyromancer  Firebolt            Streaking flame dart, ember trail
 *               Fire Lance          Sustained piercing flame beam
 *               Fireball            Expanding orange explosion ring + smoke
 *
 *   Paladin     Smite               Vertical golden light pillar
 *               Righteous Blow      Hammer descent + golden shockwave
 *               Divine Decree       Cross-shaped radiant burst
 *
 * Tier 4 ultimates use the existing AbilityCinematicLayer (full-screen).
 *
 * All effects are CSS-keyframe SVG overlays — no canvas, no WebGL. Cleanup
 * happens via the choreo store's endAttackEffect() called on a timeout
 * matching durationMs.
 */
import { useEffect } from "react";
import { useChoreoStore } from "@/store/choreoStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export function AttackEffectLayer() {
  const eff = useChoreoStore(s => s.attackEffect);
  const reduced = useReducedMotion();

  // No-op when reduced motion is on (the damage number + screen shake + log
  // entry already convey the action; the attack effect is pure flavour).
  useEffect(() => {
    if (!eff || reduced) return;
  }, [eff, reduced]);

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
    <div
      className="absolute inset-0 grid place-items-center"
    >
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
function Effect({ ability, accent, crit }: { ability: string; accent: string; crit: boolean }) {
  switch (ability) {
    case "cleave":           return <CleaveFx accent={accent} crit={crit} />;
    case "axe-swing":        return <AxeSwingFx accent={accent} crit={crit} />;
    case "berserker-frenzy": return <BerserkerFrenzyFx accent={accent} crit={crit} />;
    case "firebolt":         return <FireboltFx accent={accent} crit={crit} />;
    case "fire-lance":       return <FireLanceFx accent={accent} crit={crit} />;
    case "fireball":         return <FireballFx accent={accent} crit={crit} />;
    case "smite":            return <SmiteFx accent={accent} crit={crit} />;
    case "righteous-blow":   return <RighteousBlowFx accent={accent} crit={crit} />;
    case "divine-decree":    return <DivineDecreeFx accent={accent} crit={crit} />;
    default:                 return <DefaultFx accent={accent} />;
  }
}

interface FxProps { accent: string; crit?: boolean }

/* ── BARBARIAN ──────────────────────────────────────────────────────────── */
function CleaveFx({ accent }: FxProps) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
      <line x1="0" y1="20" x2="100" y2="80" stroke={accent} strokeWidth="2"
        strokeLinecap="round"
        style={{
          filter: `drop-shadow(0 0 6px ${accent})`,
          strokeDasharray: 200, strokeDashoffset: 200,
          animation: "cleave-slash 700ms cubic-bezier(.5,0,.75,0) forwards",
        }} />
      <style>{`
        @keyframes cleave-slash {
          0%   { stroke-dashoffset: 200; opacity: 0; }
          15%  { opacity: 1; }
          60%  { stroke-dashoffset: 0;   opacity: 1; }
          100% { stroke-dashoffset: 0;   opacity: 0; }
        }
      `}</style>
    </svg>
  );
}

function AxeSwingFx({ accent }: FxProps) {
  return (
    <div className="absolute inset-0">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <line x1="0" y1="22" x2="100" y2="78" stroke={accent} strokeWidth="2.5" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${accent})`,
                   strokeDasharray: 200, strokeDashoffset: 200,
                   animation: "axe-slash-1 800ms cubic-bezier(.5,0,.75,0) forwards" }} />
        <line x1="0" y1="34" x2="100" y2="68" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.6"
          style={{ filter: `drop-shadow(0 0 6px ${accent})`,
                   strokeDasharray: 200, strokeDashoffset: 200,
                   animation: "axe-slash-2 800ms 80ms cubic-bezier(.5,0,.75,0) forwards" }} />
      </svg>
      {/* Shockwave ring at impact */}
      <div className="absolute left-[60%] top-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 12, height: 12,
          border: `3px solid ${accent}`,
          boxShadow: `0 0 24px ${accent}aa`,
          animation: "axe-ring 800ms 120ms cubic-bezier(.25,1,.5,1) forwards",
        }} />
      <style>{`
        @keyframes axe-slash-1 { 0%{stroke-dashoffset:200;opacity:0} 20%{opacity:1} 60%{stroke-dashoffset:0} 100%{opacity:0} }
        @keyframes axe-slash-2 { 0%{stroke-dashoffset:200;opacity:0} 20%{opacity:0.6} 60%{stroke-dashoffset:0} 100%{opacity:0} }
        @keyframes axe-ring    { 0%{transform:translate(-50%,-50%) scale(0.2);opacity:0}
                                 25%{opacity:1}
                                 100%{transform:translate(-50%,-50%) scale(14);opacity:0} }
      `}</style>
    </div>
  );
}

function BerserkerFrenzyFx({ accent }: FxProps) {
  return (
    <div className="absolute inset-0">
      {/* Three rapid full-screen flashes */}
      <div className="absolute inset-0"
        style={{ background: accent, animation: "frenzy-flash 900ms steps(6) forwards", mixBlendMode: "overlay" }} />
      {/* Diagonal slashes from random angles */}
      {[0, 1, 2].map(i => (
        <svg key={i} viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <line
            x1={i * 30}      y1={10 + i * 25}
            x2={70 + i * 10} y2={90 - i * 20}
            stroke={accent} strokeWidth="3" strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 10px ${accent})`,
              strokeDasharray: 200, strokeDashoffset: 200,
              animation: `frenzy-slash 900ms ${i * 130}ms cubic-bezier(.5,0,.75,0) forwards`,
            }}
          />
        </svg>
      ))}
      <style>{`
        @keyframes frenzy-flash { 0%,100%{opacity:0} 8%,28%,48%{opacity:0.45} 16%,36%,56%{opacity:0} }
        @keyframes frenzy-slash { 0%{stroke-dashoffset:200;opacity:0} 25%{opacity:1} 70%{stroke-dashoffset:0} 100%{opacity:0} }
      `}</style>
    </div>
  );
}

/* ── PYROMANCER ─────────────────────────────────────────────────────────── */
function FireboltFx({ accent }: FxProps) {
  return (
    <div className="absolute inset-0">
      {/* Streaking flame bolt */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 rounded-full"
        style={{
          width: 60, height: 8,
          background: `linear-gradient(90deg, transparent 0%, ${accent} 40%, #fde68a 80%, white 100%)`,
          boxShadow: `0 0 24px ${accent}, 0 0 48px ${accent}88`,
          animation: "firebolt-streak 700ms cubic-bezier(.5,0,.75,0) forwards",
        }} />
      {/* Trail of small embers */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="absolute rounded-full"
          style={{
            width: 6, height: 6,
            top: `${44 + (Math.random() * 12)}%`,
            background: accent,
            boxShadow: `0 0 8px ${accent}`,
            animation: `firebolt-ember 700ms ${50 + i * 60}ms ease-out forwards`,
          }} />
      ))}
      <style>{`
        @keyframes firebolt-streak {
          0%   { left: -10%; opacity: 0; transform: translateY(-50%) scaleX(0.5); }
          15%  { opacity: 1; }
          90%  { left: 110%; opacity: 1; transform: translateY(-50%) scaleX(1.5); }
          100% { left: 120%; opacity: 0; }
        }
        @keyframes firebolt-ember {
          0%   { left: 0%;   opacity: 0; transform: scale(0.4); }
          30%  { opacity: 1; }
          100% { left: 100%; opacity: 0; transform: scale(0.2) translateY(20px); }
        }
      `}</style>
    </div>
  );
}

function FireLanceFx({ accent }: FxProps) {
  return (
    <div className="absolute inset-0">
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-3"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${accent} 20%, #fef3c7 50%, ${accent} 80%, transparent 100%)`,
          filter: `drop-shadow(0 0 12px ${accent})`,
          animation: "fire-lance-beam 900ms ease-out forwards",
        }} />
      {/* Heat shimmer overlay */}
      <div className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, ${accent}33 0%, transparent 60%)`,
          animation: "fire-lance-haze 900ms ease-out forwards",
        }} />
      <style>{`
        @keyframes fire-lance-beam {
          0%   { transform: scaleX(0); opacity: 0; }
          15%  { transform: scaleX(0.4); opacity: 1; }
          70%  { transform: scaleX(1);   opacity: 1; }
          100% { transform: scaleX(1.1); opacity: 0; }
        }
        @keyframes fire-lance-haze {
          0%, 100% { opacity: 0; }
          30%, 70% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function FireballFx({ accent }: FxProps) {
  return (
    <div className="absolute inset-0">
      {/* Traveling fireball */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 rounded-full"
        style={{
          width: 28, height: 28,
          background: `radial-gradient(circle, white 0%, #fde68a 40%, ${accent} 70%, transparent 100%)`,
          boxShadow: `0 0 32px ${accent}, 0 0 64px ${accent}88`,
          animation: "fireball-travel 600ms ease-in forwards",
        }} />
      {/* Explosion ring */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 30, height: 30,
          border: `4px solid ${accent}`,
          boxShadow: `0 0 32px ${accent}, inset 0 0 16px ${accent}`,
          animation: "fireball-boom 700ms 500ms cubic-bezier(.25,1,.5,1) forwards",
          opacity: 0,
        }} />
      {/* Inner flash */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 60, height: 60,
          background: `radial-gradient(circle, ${accent}cc 0%, transparent 70%)`,
          animation: "fireball-flash 500ms 480ms ease-out forwards",
        }} />
      <style>{`
        @keyframes fireball-travel {
          0%   { left: -5%; opacity: 0; transform: translateY(-50%) scale(0.8) rotate(0deg); }
          20%  { opacity: 1; }
          85%  { left: 50%; transform: translateY(-50%) scale(1.4) rotate(360deg); }
          100% { left: 50%; opacity: 0; transform: translateY(-50%) scale(0.5) rotate(720deg); }
        }
        @keyframes fireball-boom {
          0%   { transform: translate(-50%,-50%) scale(0.2); opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(18); opacity: 0; }
        }
        @keyframes fireball-flash {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(0.4); }
          50% { opacity: 1; transform: translate(-50%,-50%) scale(1.6); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(2); }
        }
      `}</style>
    </div>
  );
}

/* ── PALADIN ────────────────────────────────────────────────────────────── */
function SmiteFx({ accent }: FxProps) {
  return (
    <div className="absolute inset-0">
      {/* Vertical pillar of light */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-3"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${accent} 30%, #fffbeb 50%, ${accent} 70%, transparent 100%)`,
          boxShadow: `0 0 32px ${accent}, 0 0 80px ${accent}88`,
          animation: "smite-pillar 800ms ease-out forwards",
        }} />
      {/* Impact flash */}
      <div className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 80, height: 80,
          background: `radial-gradient(circle, white 0%, ${accent}cc 40%, transparent 70%)`,
          animation: "smite-flash 500ms 350ms ease-out forwards",
        }} />
      <style>{`
        @keyframes smite-pillar {
          0%   { transform: translateX(-50%) scaleY(0); opacity: 0; transform-origin: top; }
          15%  { opacity: 1; }
          50%  { transform: translateX(-50%) scaleY(1); opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes smite-flash {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(0.2); }
          40% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(2); }
        }
      `}</style>
    </div>
  );
}

function RighteousBlowFx({ accent }: FxProps) {
  return (
    <div className="absolute inset-0">
      {/* Hammer shape (simplified) descending */}
      <div className="absolute left-1/2 -translate-x-1/2"
        style={{
          width: 40, height: 80,
          top: "10%",
          background: `linear-gradient(180deg, ${accent} 0%, ${accent} 50%, transparent 100%)`,
          clipPath: "polygon(20% 0%, 80% 0%, 100% 25%, 100% 50%, 60% 50%, 60% 100%, 40% 100%, 40% 50%, 0% 50%, 0% 25%)",
          boxShadow: `0 0 24px ${accent}, 0 0 48px ${accent}66`,
          animation: "hammer-descend 700ms cubic-bezier(.5,0,.75,0) forwards",
        }} />
      {/* Shockwave ring at impact point (mid-screen) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 16, height: 16,
          border: `4px solid ${accent}`,
          boxShadow: `0 0 24px ${accent}cc`,
          animation: "hammer-ring 700ms 350ms cubic-bezier(.25,1,.5,1) forwards",
          opacity: 0,
        }} />
      {/* Cross-shaped sparkles */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-5xl"
        style={{
          color: accent,
          textShadow: `0 0 16px ${accent}`,
          animation: "hammer-sparkle 600ms 400ms ease-out forwards",
          opacity: 0,
        }}>
        ✦
      </div>
      <style>{`
        @keyframes hammer-descend {
          0%   { top: -20%; opacity: 0; transform: translateX(-50%) rotate(-5deg); }
          25%  { opacity: 1; }
          70%  { top: 35%; transform: translateX(-50%) rotate(0deg); }
          100% { top: 38%; opacity: 0; }
        }
        @keyframes hammer-ring {
          0%   { transform: translate(-50%,-50%) scale(0.2); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(20); opacity: 0; }
        }
        @keyframes hammer-sparkle {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(0.2); }
          50% { opacity: 1; transform: translate(-50%,-50%) scale(1.4); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(2); }
        }
      `}</style>
    </div>
  );
}

function DivineDecreeFx({ accent }: FxProps) {
  return (
    <div className="absolute inset-0">
      {/* Three concentric rings */}
      {[0, 1, 2].map(i => (
        <div key={i}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 24, height: 24,
            border: `${4 - i}px solid ${accent}`,
            boxShadow: `0 0 20px ${accent}`,
            animation: `decree-ring 900ms ${i * 120}ms cubic-bezier(.25,1,.5,1) forwards`,
            opacity: 0,
          }} />
      ))}
      {/* Cross-shaped burst */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: 140, height: 140, animation: "decree-cross 800ms ease-out forwards" }}>
        <rect x="42" y="10" width="16" height="80" fill={accent} rx="2"
          style={{ filter: `drop-shadow(0 0 12px ${accent})` }} />
        <rect x="10" y="42" width="80" height="16" fill={accent} rx="2"
          style={{ filter: `drop-shadow(0 0 12px ${accent})` }} />
      </svg>
      {/* Inner flash */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 100, height: 100,
          background: `radial-gradient(circle, white 0%, ${accent} 50%, transparent 80%)`,
          animation: "decree-flash 600ms ease-out forwards",
        }} />
      <style>{`
        @keyframes decree-ring {
          0%   { transform: translate(-50%,-50%) scale(0.2); opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(16); opacity: 0; }
        }
        @keyframes decree-cross {
          0%   { transform: translate(-50%,-50%) scale(0.3) rotate(-30deg); opacity: 0; }
          25%  { opacity: 1; }
          50%  { transform: translate(-50%,-50%) scale(1.1) rotate(0deg); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1) rotate(0deg); opacity: 0; }
        }
        @keyframes decree-flash {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(0.2); }
          40% { opacity: 1; transform: translate(-50%,-50%) scale(1.2); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(2); }
        }
      `}</style>
    </div>
  );
}

/* ── Default fallback ───────────────────────────────────────────────────── */
function DefaultFx({ accent }: FxProps) {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        width: 80, height: 80,
        background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`,
        animation: "default-burst 700ms ease-out forwards",
      }}>
      <style>{`
        @keyframes default-burst {
          0% { transform: translate(-50%,-50%) scale(0.2); opacity: 0; }
          40% { opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
