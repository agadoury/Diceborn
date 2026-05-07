/**
 * StatusTrack — horizontal row of StatusBadges anchored under a HealthBar.
 * First-class HUD per §4 — never collapsed, always visible.
 *
 * Animation:
 *  - new tokens enter via slide-in-from-right + scale snap (onto the track)
 *  - removed tokens dissolve via fade-out (handled when stacks go to 0)
 */
import { AnimatePresence, motion } from "framer-motion";
import type { StatusInstance } from "@/game/types";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/cn";

interface StatusTrackProps {
  statuses: StatusInstance[];
  /** Set of statusIds that just entered — for slam-in animation. */
  freshIds?: Set<string>;
  className?: string;
  /** Empty-state placeholder text. */
  emptyHint?: string;
}

export function StatusTrack({ statuses, freshIds, className, emptyHint }: StatusTrackProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 min-h-[36px] sm:min-h-[44px]",
        "px-1 py-1",
        className,
      )}
      aria-label="Status tokens"
    >
      <AnimatePresence initial={false}>
        {statuses.map(s => (
          <motion.span
            key={s.id}
            layout
            initial={{ opacity: 0, x: 32, scale: 0.6 }}
            animate={{ opacity: 1, x: 0,  scale: 1 }}
            exit={{    opacity: 0, scale: 0.4 }}
            transition={{ type: "spring", stiffness: 480, damping: 22 }}
          >
            <StatusBadge statusId={s.id} stacks={s.stacks} isFresh={freshIds?.has(s.id)} />
          </motion.span>
        ))}
      </AnimatePresence>
      {statuses.length === 0 && emptyHint && (
        <span className="text-xs text-muted/60 italic">{emptyHint}</span>
      )}
    </div>
  );
}
