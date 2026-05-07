/**
 * StatusBadge — a single token chip in the status track.
 *
 * Visual treatment per §4:
 *  - icon (large, ~28pt mobile / 36pt desktop), stack count corner badge
 *  - hostile (debuff) tokens pulse to draw attention
 *  - tap-to-inspect via Tooltip
 *  - "applied" entry: slam-in via the parent track's animate-presence
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { ICON_REGISTRY } from "./StatusIcon";
import { Tooltip } from "@/components/ui/Tooltip";
import { getStatusDef } from "@/game/status";

interface StatusBadgeProps {
  statusId: string;
  stacks: number;
  /** Trigger an entry slam-in animation. */
  isFresh?: boolean;
  className?: string;
}

export function StatusBadge({ statusId, stacks, isFresh, className }: StatusBadgeProps) {
  const def = getStatusDef(statusId);
  const Icon = ICON_REGISTRY[statusId];
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (isFresh) setAnimKey(k => k + 1);
  }, [isFresh, stacks]);

  if (!def || !Icon) return null;
  const isDebuff = def.type === "debuff";
  const color = def.visualTreatment.color;
  return (
    <Tooltip
      content={
        <span className="block">
          <span className="block font-display text-d-3 tracking-wider" style={{ color }}>
            {def.name.toUpperCase()} ×{stacks}
          </span>
          <span className="block mt-1 text-muted">{describe(statusId, stacks)}</span>
        </span>
      }
    >
      <span
        key={animKey}
        className={cn(
          "relative inline-flex items-center justify-center",
          "w-7 h-7 sm:w-9 sm:h-9 rounded-full",
          "ring-1 transition",
          isDebuff && def.visualTreatment.pulse && "animate-pulse",
          className,
        )}
        style={{
          color,
          background: `radial-gradient(ellipse at top, ${color}33 0%, var(--c-arena-1) 70%)`,
          // @ts-expect-error CSS var
          "--ring-c": color,
          boxShadow: `inset 0 0 0 1px ${color}66, 0 0 12px ${color}55`,
        }}
        aria-label={`${def.name} ${stacks} stacks`}
      >
        <Icon size={20} />
        <span
          className="absolute -bottom-1 -right-1 min-w-[16px] h-4 px-1 grid place-items-center
                     rounded-full bg-arena-0 text-[10px] font-num font-bold text-ink ring-1 ring-white/15"
        >
          {stacks}
        </span>
      </span>
    </Tooltip>
  );
}

function describe(id: string, stacks: number): string {
  switch (id) {
    case "burn":     return `Take ${stacks} damage at start of own upkeep, then -1 stack.`;
    case "stun":     return `Skip your next offensive roll.`;
    case "protect":  return `Each token prevents 2 damage. ${stacks * 2} damage shielded.`;
    case "shield":   return `Reduces incoming damage by ${stacks} per hit.`;
    case "regen":    return `Heal ${stacks} HP at start of own upkeep, then -1 stack.`;
    case "bleeding": return `Take ${stacks} damage when the applier next reaches their upkeep.`;
    case "smolder":  return `${stacks} damage at upkeep + 2 ignition damage when removed.`;
    case "judgment": return `Attacker's next ability deals -2 damage; Paladin gains +1 CP on resolve.`;
    default:         return "";
  }
}
