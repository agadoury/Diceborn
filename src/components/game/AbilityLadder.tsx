/**
 * AbilityLadder — vertical stack of 4 ability rows, Tier 4 at top.
 *
 * Live state per §4 (rendered for the active player only):
 *   FIRING       — bright accent glow + scale 1.04× + READY flag
 *   TRIGGERED    — soft accent glow at 60% opacity + scale 1.02×
 *   REACHABLE    — default styling + percentage badge
 *   OUT-OF-REACH — desaturated 40% opacity
 *
 * LETHAL overlay — layered on top of any of the above:
 *   - red-gold border + skull badge + pulsing "LETHAL" tag
 *   - on first appearance this turn: bell sting + brief border flare
 *
 * Combo strip is rendered as inline face-icons, not text.
 */
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { AbilityDef, DiceCombo, HeroDefinition, LadderRowState, SymbolId } from "@/game/types";
import { FACE_GLYPHS, FACE_TINT } from "./dieFaces";
import { Tooltip } from "@/components/ui/Tooltip";
import { sfx } from "@/audio/sfx";

interface AbilityLadderProps {
  hero: HeroDefinition;
  rows: readonly LadderRowState[];
  className?: string;
  /** Set false on the opponent's ladder to suppress some treatments. */
  isOpponentView?: boolean;
}

export function AbilityLadder({ hero, rows, className, isOpponentView = false }: AbilityLadderProps) {
  // Track which row is currently FIRING for sting playback on transition.
  const prevFiringRef = useRef<number>(-1);
  const prevLethalRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const firingIdx = rows.findIndex(r => r.kind === "firing");
    if (firingIdx >= 0 && firingIdx !== prevFiringRef.current) {
      sfx("ladder-firing");
    }
    prevFiringRef.current = firingIdx;
    // LETHAL transition sting.
    const newLethal = new Set<number>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if ((r.kind === "firing" || r.kind === "triggered" || r.kind === "reachable") && r.lethal) {
        newLethal.add(i);
        if (!prevLethalRef.current.has(i)) sfx("ladder-lethal");
      }
    }
    prevLethalRef.current = newLethal;
  }, [rows]);

  // Render Tier 4 → Tier 1 (top → bottom).
  const visualOrder = [3, 2, 1, 0];

  return (
    <div
      className={cn("flex flex-col gap-2 sm:gap-3 w-full", className)}
      aria-label={`${hero.name} ability ladder`}
    >
      {visualOrder.map(idx => (
        <Row
          key={idx}
          ability={hero.abilityLadder[idx]}
          state={rows[idx]}
          accent={hero.accentColor}
          isOpponentView={isOpponentView}
        />
      ))}
    </div>
  );
}

function Row({
  ability, state, accent, isOpponentView,
}: { ability: AbilityDef; state: LadderRowState; accent: string; isOpponentView: boolean }) {
  const isUlt = ability.tier === 4;
  const lethal = state.kind !== "out-of-reach" && (state as { lethal?: boolean }).lethal;
  const stateKind = state.kind;

  // Per-state visual:
  let scale = 1;
  let opacity = 1;
  let saturate = 1;
  let glow = "0 0 0 0 transparent";
  let badge: React.ReactNode = null;

  if (stateKind === "firing") {
    scale = 1.04; opacity = 1;
    glow = `0 0 0 1px ${accent}, 0 0 22px ${accent}aa`;
    badge = <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest bg-arena-0/70 text-ink ring-1 ring-white/15">READY</span>;
  } else if (stateKind === "triggered") {
    scale = 1.02; opacity = 0.95;
    glow = `0 0 0 1px ${accent}99, 0 0 14px ${accent}66`;
  } else if (stateKind === "reachable") {
    scale = 1;
    badge = (
      <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-num bg-arena-0/70 text-muted ring-1 ring-white/10">
        {Math.round(state.probability * 100)}%
      </span>
    );
  } else if (stateKind === "out-of-reach") {
    opacity = 0.4; saturate = 0.4;
  }

  if (lethal) {
    // Layered on top of whatever else is going on.
    glow = `0 0 0 2px #fde68a, 0 0 22px #fde68aaa, 0 0 6px #ef4444cc`;
  }

  const fluffText = isOpponentView && stateKind !== "firing" ? null : ability.shortText;

  return (
    <Tooltip
      content={
        <span className="block">
          <span className="block font-display text-d-3 tracking-wider" style={{ color: accent }}>
            T{ability.tier} {ability.name}
          </span>
          <span className="block mt-1 text-muted">{ability.longText}</span>
          <span className="block mt-1 text-ink">{ability.shortText}</span>
        </span>
      }
    >
      <motion.div
        layout
        animate={{ scale, opacity }}
        transition={{ type: "spring", stiffness: 360, damping: 24 }}
        className={cn(
          "surface relative flex items-center gap-3 px-3 py-2 sm:py-3",
          "rounded-card overflow-hidden",
          isUlt && "ring-1 ring-amber-300/30",
          lethal && "animate-pulse",
        )}
        style={{
          filter: `saturate(${saturate})`,
          boxShadow: glow,
          transition: "box-shadow 200ms cubic-bezier(.22,1,.36,1), filter 200ms",
        }}
      >
        {/* Tier badge */}
        <TierBadge tier={ability.tier} />

        {/* Combo strip — inline face icons */}
        <ComboStrip combo={ability.combo} />

        {/* Name + outcome */}
        <div className="flex-1 min-w-0">
          <div className={cn("font-display tracking-wider truncate", isUlt ? "text-base sm:text-lg" : "text-sm")}
               style={{ color: accent }}>
            {ability.name}
            {badge}
            {lethal && <LethalTag />}
          </div>
          {fluffText && <div className="text-[11px] sm:text-xs text-muted truncate">{fluffText}</div>}
        </div>
      </motion.div>
    </Tooltip>
  );
}

function TierBadge({ tier }: { tier: 1 | 2 | 3 | 4 }) {
  const palette = ["", "bg-white text-arena-0", "bg-amber-700 text-amber-50", "bg-zinc-300 text-arena-0", "bg-amber-400 text-arena-0"];
  return (
    <span className={cn(
      "shrink-0 grid place-items-center w-7 h-7 sm:w-8 sm:h-8 rounded-full font-display font-bold text-xs sm:text-sm",
      palette[tier],
    )}>
      {tier}
    </span>
  );
}

function LethalTag() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
          style={{
            background: "linear-gradient(180deg, #fde68a, #f59e0b)",
            color: "#1B1228",
            boxShadow: "0 0 12px #fde68aaa",
          }}>
      <SkullIcon /> LETHAL
    </span>
  );
}
function SkullIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden>
      <path d="M12 3a8 8 0 0 0-8 8c0 3 1.6 5 3 6v3h2v-2h2v2h2v-2h2v2h2v-3c1.4-1 3-3 3-6a8 8 0 0 0-8-8zm-3 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
        fill="currentColor"/>
    </svg>
  );
}

function ComboStrip({ combo }: { combo: DiceCombo }) {
  const items = renderCombo(combo);
  return (
    <span className="flex items-center gap-1 shrink-0">
      {items.map((item, i) => (
        item.kind === "symbol"
          ? <SymbolChip key={i} symbol={item.symbol} count={item.count} />
          : <span key={i} className="text-muted text-xs px-0.5">{item.text}</span>
      ))}
    </span>
  );
}

type ComboPiece =
  | { kind: "symbol"; symbol: SymbolId; count: number }
  | { kind: "text"; text: string };

function renderCombo(combo: DiceCombo): ComboPiece[] {
  switch (combo.kind) {
    case "matching":
    case "at-least":
    case "symbol-count":
      return [{ kind: "symbol", symbol: combo.symbol, count: combo.count }];
    case "n-of-a-kind":
      return [{ kind: "text", text: `×${combo.count}` }];
    case "matching-any":
      return [{ kind: "text", text: `${combo.count}×` }, { kind: "text", text: "★" }];
    case "any-of":
      return [
        ...combo.symbols.map<ComboPiece>(s => ({ kind: "symbol", symbol: s, count: 0 })),
        { kind: "text", text: `≥${combo.count}` },
      ];
    case "specific-set":
      return combo.symbols.map<ComboPiece>(s => ({ kind: "symbol", symbol: s, count: 1 }));
    case "compound": {
      const sep = combo.op === "and" ? "+" : "/";
      const out: ComboPiece[] = [];
      combo.clauses.forEach((c, i) => {
        if (i > 0) out.push({ kind: "text", text: sep });
        out.push(...renderCombo(c));
      });
      return out;
    }
    case "straight":
      return [{ kind: "text", text: `straight ${combo.length}` }];
  }
}

function SymbolChip({ symbol, count }: { symbol: SymbolId; count: number }) {
  const Glyph = FACE_GLYPHS[symbol];
  const tint = FACE_TINT[symbol] ?? "#fde68a";
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-md ring-1 ring-white/10 bg-arena-0/60"
      style={{ color: tint }}
      title={symbol}
    >
      <span className="w-4 h-4 sm:w-5 sm:h-5 inline-block">
        {Glyph ? <Glyph /> : null}
      </span>
      {count > 1 && (
        <span className="absolute -mb-3 -mr-3 text-[9px] font-num font-bold text-ink">×{count}</span>
      )}
    </span>
  );
}
