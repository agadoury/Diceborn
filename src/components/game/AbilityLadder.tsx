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
import type { AbilityDef, DiceCombo, HeroDefinition, HeroSnapshot, LadderRowState, SymbolId } from "@/game/types";
import { resolveAbilityFor } from "@/game/cards";
import { FACE_GLYPHS, FACE_TINT } from "./dieFaces";
import { Tooltip } from "@/components/ui/Tooltip";
import { sfx } from "@/audio/sfx";

interface AbilityLadderProps {
  hero: HeroDefinition;
  rows: readonly LadderRowState[];
  className?: string;
  /** Set false on the opponent's ladder to suppress some treatments. */
  isOpponentView?: boolean;
  /** When provided, ladder rows are resolved through ladder-upgrade
   *  modifiers (replace + append + repeat) so an upgrade in flight surfaces
   *  the new combo / name / effect on the UI. */
  snapshot?: HeroSnapshot;
  /** Called with the ability's ladder index when the user clicks a firing
   *  or triggered row. Skips the picker overlay — caller is responsible for
   *  the dispatch chain (advance-phase + select-offensive-ability). When
   *  omitted, rows are not clickable. */
  onFire?: (abilityIndex: number) => void;
}

export function AbilityLadder({ hero, rows, className, isOpponentView = false, snapshot, onFire }: AbilityLadderProps) {
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

  // Resolve through ladder-upgrade pipeline when a snapshot is supplied.
  // The live ladder for an in-match snapshot is `activeOffense` (the
  // player's 4-ability drafted loadout). Without a snapshot (dev-tools
  // previews) fall back to the recommended loadout's offensive entries —
  // resolved against the full catalog by name — with no replacement marker.
  const previewAbilities = (() => {
    if (snapshot) return snapshot.activeOffense;
    const wanted = new Set(hero.recommendedLoadout.offense.map(n => n.toLowerCase()));
    const matched = hero.abilityCatalog.filter(a => wanted.has(a.name.toLowerCase()));
    return matched.length === 4 ? matched : hero.abilityCatalog;
  })();
  const resolvedAbilities = snapshot
    ? previewAbilities.map(a => resolveAbilityFor(snapshot, a, "offensive"))
    : previewAbilities.map(a => ({ ...a, isReplaced: false as boolean }));

  // Group abilities by tier and render T4 → T1. Within a tier, order by
  // base damage descending so the most-impactful row sits at the top.
  const grouped = ([4, 3, 2, 1] as const).map(tier => ({
    tier,
    items: resolvedAbilities
      .map((ability, idx) => ({ ability, idx, state: rows[idx], isReplaced: ability.isReplaced }))
      .filter(x => x.ability.tier === tier)
      .sort((a, b) => effectMaxDamage(b.ability.effect) - effectMaxDamage(a.ability.effect)),
  })).filter(g => g.items.length > 0);

  return (
    <div
      className={cn("flex flex-col gap-2 sm:gap-3 w-full", className)}
      aria-label={`${hero.name} ability ladder`}
    >
      {grouped.map(group => (
        <div key={group.tier} className="flex flex-col gap-1 sm:gap-1.5">
          {/* Tier header — only render if this hero has multiple tiers visible
              or has multiple abilities in any tier. Always render for clarity. */}
          <div className="flex items-center gap-2 px-1 text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-muted/80">
            <span className="font-display">Tier {group.tier}</span>
            <span className="flex-1 h-px bg-white/5" />
            <span>{tierName(group.tier)}</span>
          </div>
          {group.items.map(({ ability, idx, state, isReplaced }) => (
            <Row
              key={idx}
              ability={ability}
              state={state}
              accent={hero.accentColor}
              isOpponentView={isOpponentView}
              isReplaced={isReplaced}
              onFire={onFire ? () => onFire(idx) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function tierName(t: 1 | 2 | 3 | 4): string {
  switch (t) {
    case 1: return "Basic";
    case 2: return "Strong";
    case 3: return "Signature";
    case 4: return "Ultimate";
  }
}

function effectMaxDamage(effect: import("@/game/types").AbilityEffect): number {
  switch (effect.kind) {
    case "damage":         return effect.amount;
    case "scaling-damage": return effect.baseAmount + effect.perExtra * effect.maxExtra;
    case "compound":       return effect.effects.reduce((acc, e) => acc + effectMaxDamage(e), 0);
    default:               return 0;
  }
}

function Row({
  ability, state, accent, isOpponentView, isReplaced, onFire,
}: { ability: AbilityDef; state: LadderRowState; accent: string; isOpponentView: boolean; isReplaced?: boolean; onFire?: () => void }) {
  const isUlt = ability.tier === 4;
  const lethal = state.kind !== "out-of-reach" && (state as { lethal?: boolean }).lethal;
  const stateKind = state.kind;
  const firePrimed = !!onFire && (stateKind === "firing" || stateKind === "triggered");

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
        role={firePrimed ? "button" : undefined}
        tabIndex={firePrimed ? 0 : undefined}
        onClick={firePrimed ? onFire : undefined}
        onKeyDown={firePrimed ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFire?.(); } } : undefined}
        aria-label={firePrimed ? `Fire ${ability.name}` : undefined}
        className={cn(
          "surface relative flex items-center gap-3 px-3 py-2 sm:py-3",
          "rounded-card overflow-hidden",
          isUlt && "ring-1 ring-amber-300/30",
          lethal && "animate-pulse",
          firePrimed && "cursor-pointer hover:brightness-110 active:scale-[0.98]",
        )}
        style={{
          filter: `saturate(${saturate})`,
          boxShadow: glow,
          transition: "box-shadow 200ms cubic-bezier(.22,1,.36,1), filter 200ms",
        }}
      >
        {/* Combo strip — inline face icons */}
        <ComboStrip combo={ability.combo} />

        {/* Name + outcome */}
        <div className="flex-1 min-w-0">
          <div className={cn("font-display tracking-wider truncate", isUlt ? "text-base sm:text-lg" : "text-sm")}
               style={{ color: accent }}>
            {ability.name}
            {isReplaced && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest bg-arena-0/70 text-ink ring-1 ring-white/15 align-middle">
                UPGRADED
              </span>
            )}
            {badge}
            {lethal && <LethalTag />}
          </div>
          {fluffText && <div className="text-[11px] sm:text-xs text-muted truncate">{fluffText}</div>}
        </div>
      </motion.div>
    </Tooltip>
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

export function ComboStrip({ combo }: { combo: DiceCombo }) {
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
      <svg viewBox="0 0 100 100" className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" aria-hidden>
        {Glyph ? <Glyph /> : null}
      </svg>
      {count > 1 && (
        <span className="absolute -mb-3 -mr-3 text-[9px] font-num font-bold text-ink">×{count}</span>
      )}
    </span>
  );
}
