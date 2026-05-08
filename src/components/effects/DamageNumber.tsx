/**
 * DamageNumberLayer — full-screen absolute layer that renders all current
 * damage numbers. Each number flies up from its spawn point, scales 0→1.2→1,
 * drifts up 60px while fading over 1s. Big numbers (≥10/≥20) are larger and
 * rotate slightly + emit sparks.
 */
import { useChoreoStore, type DamageNumber as DN } from "@/store/choreoStore";
import { cn } from "@/lib/cn";

const VARIANT_COLOR: Record<DN["variant"], string> = {
  dmg:   "text-rose-400",
  heal:  "text-emerald-400",
  pure:  "text-violet-300",
  crit:  "text-amber-300",
  white: "text-white",
  cp:    "text-amber-300 drop-shadow-[0_0_12px_rgba(245,158,11,0.7)]",
};

export function DamageNumberLayer() {
  const damageNumbers = useChoreoStore(s => s.damageNumbers);
  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none z-30 overflow-hidden">
      {damageNumbers.map(d => (
        <DamageNumberItem key={d.id} dn={d} />
      ))}
    </div>
  );
}

function DamageNumberItem({ dn }: { dn: DN }) {
  const isBig    = dn.size === "lg" || dn.amount >= 20;
  const isMedium = dn.size === "md" || dn.amount >= 10;
  const sizeClass =
    isBig    ? "text-6xl sm:text-7xl" :
    isMedium ? "text-4xl sm:text-5xl" :
               "text-2xl sm:text-3xl";

  return (
    <span
      className={cn(
        "absolute font-num font-black drop-shadow-[0_3px_0_rgba(0,0,0,0.65)]",
        VARIANT_COLOR[dn.variant],
        sizeClass,
        "animate-[dn-float_1s_ease-out_forwards]",
        isBig && "animate-[dn-float-big_1s_ease-out_forwards]",
      )}
      style={{
        left: `${dn.x * 100}%`,
        top: `${dn.y * 100}%`,
        transform: "translate(-50%, -50%)",
        willChange: "transform, opacity",
      }}
    >
      {dn.variant === "heal" ? `+${dn.amount}` :
       dn.variant === "cp"   ? `+${dn.amount} CP` :
       dn.amount}

      <style>{`
        @keyframes dn-float {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
          25%  {              transform: translate(-50%, -55%) scale(1.0); }
          80%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 60px)) scale(0.95); }
        }
        @keyframes dn-float-big {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.3) rotate(-3deg); }
          12%  { opacity: 1; transform: translate(-50%, -50%) scale(1.4) rotate(2deg); }
          25%  {              transform: translate(-50%, -55%) scale(1.15) rotate(-1deg); }
          80%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 80px)) scale(1) rotate(0deg); }
        }
      `}</style>
    </span>
  );
}
