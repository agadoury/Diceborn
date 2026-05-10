/**
 * MatchScreen — full match UI.
 *
 * Mobile portrait layout (primary):
 *   top status bar     — opponent panel (compact)
 *   arena center       — DiceTray + PhaseIndicator
 *   active hero panel  — full HeroPanel including ladder
 *   hand               — fanned cards
 *   action bar         — primary CTA (fixed bottom)
 *
 * Desktop layout (Step 6) overlays via `lg:` Tailwind classes — the same
 * components reflow to a wide arena with side ladders.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useGameStore, useInputUnlocked } from "@/store/gameStore";
import { useUIStore } from "@/store/uiStore";
import { getHero } from "@/content";
import type { CardId, HeroId, PlayerId } from "@/game/types";
import { nextAiAction } from "@/game/ai";
import { resolveAbilityFor } from "@/game/cards";
import { useChoreoStore } from "@/store/choreoStore";
import { Button } from "@/components/ui/Button";

import { HeroPanel } from "@/components/game/HeroPanel";
import { Hand } from "@/components/game/Hand";
import { DiceTray } from "@/components/game/DiceTray";
import { ActionBar } from "@/components/game/ActionBar";
import { PhaseIndicator } from "@/components/game/PhaseIndicator";
import { HotSeatCurtain } from "@/components/game/HotSeatCurtain";
import { AbilityLadder } from "@/components/game/AbilityLadder";
import { HeroBackground } from "@/components/effects/HeroBackground";
import { ResultScreen } from "@/components/screens/ResultScreen";
import { buildMatchSummary } from "@/game/match-summary";
import { STARTING_HP } from "@/game/types";
import { useMemo } from "react";
import { HEROES } from "@/content";

export default function MatchScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const startMatch  = useGameStore(s => s.startMatch);
  const dispatch    = useGameStore(s => s.dispatch);
  const reset       = useGameStore(s => s.reset);
  const state       = useGameStore(s => s.state);
  const mode        = useGameStore(s => s.mode);
  const aiPlayer    = useGameStore(s => s.aiPlayer);
  const matchLog    = useGameStore(s => s.matchLog);

  const inputUnlocked = useInputUnlocked();

  const viewer       = useUIStore(s => s.currentViewer);
  const setViewer    = useUIStore(s => s.setViewer);
  const curtainOpen  = useUIStore(s => s.curtainOpen);
  const setCurtain   = useUIStore(s => s.setCurtain);

  // Boot the match on first mount based on URL params. Hero IDs are
  // validated against the live registry; if none are registered, the
  // match-end overlay below renders with a "no heroes" message.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    const validHeroes = Object.keys(HEROES) as HeroId[];
    const fallback = validHeroes[0] ?? "";
    if (!fallback) return;   // nothing to start; UI shows empty-state below
    startedRef.current = true;
    const p1   = readHero(params.get("p1"), validHeroes) ?? fallback;
    const p2   = readHero(params.get("p2"), validHeroes) ?? fallback;
    const m    = (params.get("mode") as "hot-seat" | "vs-ai" | null) ?? "hot-seat";
    const seed = params.get("seed") ? Number(params.get("seed")) : undefined;
    startMatch({ p1, p2, mode: m, seed });
    setViewer("p1");
  }, [params, startMatch, setViewer]);

  // Hot-seat: when the active player changes mid-game, raise the curtain.
  // Skip during the match-end phase and during the very first turn.
  const lastActiveRef = useRef<PlayerId | null>(null);
  useEffect(() => {
    if (!state) return;
    const cur = state.activePlayer;
    if (lastActiveRef.current && lastActiveRef.current !== cur && state.phase !== "match-end" && mode === "hot-seat") {
      setCurtain(true);
    }
    lastActiveRef.current = cur;
  }, [state, mode, setCurtain]);

  function dismissCurtain() {
    if (!state) return;
    setViewer(state.activePlayer);
    setCurtain(false);
  }

  // AI driver — fires whenever the AI has an action to take. That includes
  // its own turn, *and* off-turn responses where it's the defender of a
  // pending attack or the holder of a pending counter prompt.
  const aiCooldownRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state || mode !== "vs-ai" || !aiPlayer) return;
    if (state.winner) return;
    if (!inputUnlocked) return;

    const aiIsDefender = !!(state.pendingAttack && state.pendingAttack.defender === aiPlayer);
    const aiHasPendingCounter = !!(state.pendingCounter && state.pendingCounter.holder === aiPlayer);
    const aiCanAct =
      state.activePlayer === aiPlayer || aiIsDefender || aiHasPendingCounter;
    if (!aiCanAct) return;
    // On the AI's own turn, if the human is the defender of a pending
    // attack the engine is paused waiting for the human's select-defense.
    // Don't fire — nextAiAction would fall through to advance-phase / end-turn
    // and blow past the pause.
    if (
      state.activePlayer === aiPlayer &&
      state.pendingAttack &&
      state.pendingAttack.defender !== aiPlayer
    ) return;

    if (aiCooldownRef.current) window.clearTimeout(aiCooldownRef.current);
    aiCooldownRef.current = window.setTimeout(() => {
      // Read state fresh inside the timeout to avoid stale snapshots.
      const live = useGameStore.getState().state;
      if (!live || live.winner) return;
      const stillCanAct =
        live.activePlayer === aiPlayer ||
        (live.pendingAttack && live.pendingAttack.defender === aiPlayer) ||
        (live.pendingCounter && live.pendingCounter.holder === aiPlayer);
      if (!stillCanAct) return;
      if (
        live.activePlayer === aiPlayer &&
        live.pendingAttack &&
        live.pendingAttack.defender !== aiPlayer
      ) return;
      const action = nextAiAction(live, aiPlayer);
      dispatch(action);
    }, 900);   // breathe between AI actions so the player can read what just happened
    return () => { if (aiCooldownRef.current) window.clearTimeout(aiCooldownRef.current); };
  }, [state, mode, aiPlayer, inputUnlocked, dispatch]);

  // Hooks that depend on `state` MUST be called before any early return —
  // Rules of Hooks. All safely handle null state internally.
  const rollKey = useDiceRollKey(viewer);
  const summary = useMemo(() => {
    if (!state || !state.winner) return null;
    return buildMatchSummary(matchLog, {
      winner: state.winner,
      turns: state.turn,
      startingHp: STARTING_HP,
    });
  }, [state, matchLog]);
  // Click-to-fire from the ladder is a two-step interaction: the click stashes
  // the chosen ability index and surfaces a confirm modal; the confirm button
  // dispatches advance-phase + select-offensive-ability. Cancel just clears.
  const [pendingLadderFire, setPendingLadderFire] = useState<number | null>(null);
  useEffect(() => {
    if (state?.phase !== "offensive-roll" && pendingLadderFire != null) setPendingLadderFire(null);
  }, [state?.phase, pendingLadderFire]);

  if (!state) return null;

  // Identify panels by viewer.
  const opponentId: PlayerId = viewer === "p1" ? "p2" : "p1";
  const meSnap   = state.players[viewer];
  const oppSnap  = state.players[opponentId];
  const meHero   = getHero(meSnap.hero);
  const oppHero  = getHero(oppSnap.hero);

  // Capability gating.
  const myTurn   = state.activePlayer === viewer;
  const canInput = myTurn && inputUnlocked && !state.winner;

  // Action handlers.
  function play(cardId: CardId, targetDie?: number) {
    dispatch({ kind: "play-card", card: cardId, targetDie: targetDie as 0|1|2|3|4|undefined });
  }
  function sell(cardId: CardId) {
    dispatch({ kind: "sell-card", card: cardId });
  }
  function roll() {
    dispatch({ kind: "roll-dice" });
  }
  function advance() {
    dispatch({ kind: "advance-phase" });
  }
  function endTurn() {
    dispatch({ kind: "end-turn" });
  }
  function toggleLock(idx: number) {
    const live = useGameStore.getState().state;
    if (!live || live.phase !== "offensive-roll") return;
    dispatch({ kind: "toggle-die-lock", die: idx as 0|1|2|3|4 });
  }
  function requestFireFromLadder(abilityIndex: number) {
    const live = useGameStore.getState().state;
    if (!live || live.phase !== "offensive-roll") return;
    setPendingLadderFire(abilityIndex);
  }
  function confirmLadderFire() {
    const idx = pendingLadderFire;
    setPendingLadderFire(null);
    if (idx == null) return;
    const live = useGameStore.getState().state;
    if (!live || live.phase !== "offensive-roll") return;
    dispatch({ kind: "advance-phase" });
    const after = useGameStore.getState().state;
    if (!after?.pendingOffensiveChoice) return;
    if (!after.pendingOffensiveChoice.matches.some(m => m.abilityIndex === idx)) return;
    dispatch({ kind: "select-offensive-ability", abilityIndex: idx });
  }
  const ladderFire = canInput && state.phase === "offensive-roll" ? requestFireFromLadder : undefined;

  return (
    <div className="safe-pad min-h-svh bg-arena-0 text-ink relative flex flex-col
                    lg:grid lg:grid-cols-[340px_1fr_340px] lg:grid-rows-[auto_1fr_auto] lg:gap-4 lg:p-6">
      {/* Living arena background — atmospherics for the active player's hero. */}
      <HeroBackground
        hero={state.players[state.activePlayer].hero}
        intensity="ambient"
        className="z-0"
      />
      {/* MOBILE: top opponent panel. DESKTOP: top-center opponent panel,
          capped to a comfortable max-width and centered in the column. */}
      <div
        className="rounded-card mb-2 lg:mb-0 lg:col-start-2 lg:row-start-1
                   lg:max-w-2xl lg:w-full lg:mx-auto"
        style={{ background: `linear-gradient(180deg, ${oppHero.accentColor}11 0%, transparent 100%)` }}
      >
        <HeroPanel
          hero={oppHero}
          snapshot={oppSnap}
          variant="opponent"
          active={state.activePlayer === opponentId}
          isOpponentView
        />
      </div>

      {/* DESKTOP: opponent ladder on left side rail. */}
      <div className="hidden lg:block lg:col-start-1 lg:row-start-1 lg:row-span-3 lg:self-start lg:sticky lg:top-6">
        <div className="surface rounded-card p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2">
            {oppHero.name} ladder
          </div>
          {/* Re-uses AbilityLadder via HeroPanel's collapsible — but on desktop we want it always-open and standalone. */}
          <DesktopSideLadder hero={oppHero} rows={oppSnap.ladderState} isOpponentView snapshot={oppSnap} />
        </div>
      </div>

      {/* DESKTOP: own ladder on right side rail. */}
      <div className="hidden lg:block lg:col-start-3 lg:row-start-1 lg:row-span-3 lg:self-start lg:sticky lg:top-6">
        <div className="surface rounded-card p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2">
            {meHero.name} ladder
          </div>
          <DesktopSideLadder hero={meHero} rows={meSnap.ladderState} snapshot={meSnap} onFire={ladderFire} />
        </div>
      </div>

      {/* Arena center. */}
      <div className="relative flex-1 flex flex-col items-center justify-center gap-2 my-2
                      lg:my-0 lg:col-start-2 lg:row-start-2">
        <PhaseIndicator
          phase={state.phase}
          activePlayer={state.activePlayer}
          thinking={mode === "vs-ai" && state.activePlayer === aiPlayer && !state.winner}
        />
        {/* Dice tray dims outside the roll phases — cards own the screen during Main,
            dice own it during Roll. */}
        <div
          className="transition-opacity duration-300 ease-out-quart"
          style={{
            opacity: state.phase === "offensive-roll" || state.phase === "defensive-roll" ? 1 : 0.45,
          }}
        >
          <DiceTray
            dice={state.players[state.activePlayer].dice}
            accent={getHero(state.players[state.activePlayer].hero).accentColor}
            rollKey={rollKey}
            onToggleLock={state.activePlayer === viewer ? toggleLock : undefined}
            centerStage={state.phase === "offensive-roll"}
          />
        </div>
        {/* Match-end result — full ResultScreen overlay rendered below. */}
      </div>

      {/* Active hero panel + hand share one grid cell on desktop so they
          stack vertically inside it; on mobile they sit in normal flow.
          Capped to the same max-width as the opponent panel for symmetry. */}
      <div className="lg:col-start-2 lg:row-start-3 flex flex-col gap-2
                      lg:max-w-2xl lg:w-full lg:mx-auto">
        <div className="rounded-card mb-1 lg:mb-0"
             style={{ background: `linear-gradient(0deg, ${meHero.accentColor}1c 0%, transparent 100%)` }}>
          <HeroPanel
            hero={meHero}
            snapshot={meSnap}
            variant="active"
            active={myTurn}
            onFire={ladderFire}
          />
        </div>

        <Hand
          state={state}
          hero={meSnap}
          opponent={oppSnap}
          accent={meHero.accentColor}
          enabled={canInput && (state.phase === "main-pre" || state.phase === "main-post" || state.phase === "offensive-roll")}
          onPlay={play}
          onSell={sell}
        />
      </div>

      {/* Spacer so the fixed action bar doesn't cover the hand on mobile. */}
      <div className="h-[88px] sm:h-[96px] lg:hidden" />

      {/* Action bar. Mobile: fixed bottom. Desktop: also fixed bottom but centered narrower. */}
      <ActionBar
        state={state}
        active={meSnap}
        accent={meHero.accentColor}
        enabled={canInput}
        isViewerActive={myTurn}
        onRoll={roll}
        onAdvancePhase={advance}
        onEndTurn={endTurn}
        onMenu={() => { reset(); navigate("/"); }}
      />

      {/* Hot-seat curtain. */}
      <HotSeatCurtain
        open={curtainOpen && mode === "hot-seat"}
        nextPlayer={state.activePlayer}
        nextHero={state.players[state.activePlayer].hero}
        onContinue={dismissCurtain}
      />

      {/* Match-end overlay with descriptor + stats. */}
      {state.winner && summary && (
        <ResultScreen
          summary={summary}
          viewer={viewer}
          myHero={meHero}
          oppHero={oppHero}
          onMenu={() => { reset(); navigate("/"); }}
          onRematch={() => {
            reset();
            startMatch({ p1: meSnap.hero, p2: oppSnap.hero, mode });
          }}
        />
      )}

      {/* Ladder click-to-fire confirm. Resolves the ability through the
          upgrade pipeline so the prompt shows the live name. */}
      {pendingLadderFire != null && (() => {
        const a = meHero.abilityLadder[pendingLadderFire];
        if (!a) return null;
        const resolved = resolveAbilityFor(meSnap, a, "offensive");
        return (
          <FireConfirm
            abilityName={resolved.name}
            tier={resolved.tier}
            shortText={resolved.shortText}
            accent={meHero.accentColor}
            onConfirm={confirmLadderFire}
            onCancel={() => setPendingLadderFire(null)}
          />
        );
      })()}
    </div>
  );
}

function FireConfirm({
  abilityName, tier, shortText, accent, onConfirm, onCancel,
}: {
  abilityName: string;
  tier: 1 | 2 | 3 | 4;
  shortText: string;
  accent: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={`Activate ${abilityName}?`}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onCancel}
    >
      <div
        className="surface rounded-card p-4 sm:p-5 max-w-sm w-full ring-1"
        style={{ borderColor: accent, boxShadow: `0 0 24px ${accent}55` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <span
            className="grid place-items-center w-8 h-8 rounded-md font-display tracking-widest text-xs shrink-0"
            style={{ background: `${accent}25`, color: accent }}
          >
            T{tier}
          </span>
          <span className="font-display tracking-wider text-base" style={{ color: accent }}>
            {abilityName}
          </span>
        </div>
        <div className="text-sm text-ink/85 mb-4">{shortText}</div>
        <div className="text-xs text-muted mb-4">Activate this ability?</div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Button variant="secondary" size="lg" onClick={onCancel} className="w-full" sound="ui-back">
              Cancel
            </Button>
          </div>
          <div className="flex-1">
            <Button variant="primary" size="lg" heroAccent={accent} onClick={onConfirm} className="w-full" sound="ui-tap">
              Activate
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Desktop side rail rendering the AbilityLadder (always open, no collapse). */
function DesktopSideLadder({
  hero, rows, isOpponentView, snapshot, onFire,
}: {
  hero: import("@/game/types").HeroDefinition;
  rows: import("@/game/types").HeroSnapshot["ladderState"];
  isOpponentView?: boolean;
  snapshot?: import("@/game/types").HeroSnapshot;
  onFire?: (abilityIndex: number) => void;
}) {
  return <AbilityLadder hero={hero} rows={rows} isOpponentView={isOpponentView} snapshot={snapshot} onFire={onFire} />;
}

function readHero(s: string | null, valid: HeroId[]): HeroId | null {
  return s && valid.includes(s as HeroId) ? (s as HeroId) : null;
}

/**
 * Returns a counter that bumps every time the viewer's last seen
 * `dice-rolled` event finished playing. DiceTray uses this to trigger a
 * fresh tumble on each roll.
 *
 * NOTE: We want the tray to only tumble once per server roll regardless of
 * whether the dice-rolled event is being processed by the choreographer
 * right now — so we listen for finishCurrent transitions on dice-rolled.
 */
function useDiceRollKey(viewer: PlayerId): number {
  const playing = useChoreoStore(s => s.playing);
  const handled = useChoreoStore(s => s.totalEventsHandled);
  const lastBump = useRef(0);
  // Bump on every `dice-rolled` event seen for either player so the active
  // tray (which always shows the active player's dice) tumbles.
  if (playing && playing.t === "dice-rolled") {
    void viewer;
    lastBump.current = handled + 1;
  }
  return lastBump.current;
}
