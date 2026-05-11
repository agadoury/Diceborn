/**
 * /dev/components — the storybook + dice playground.
 *
 * Hero-bound demos (dice playground, ladder demo, card showcase) require
 * at least one hero registered in src/content/index.ts. They render an
 * empty-state notice when the registry is empty.
 *
 * Hero-agnostic demos (Choreographer test bench, status track demo,
 * UI primitives) work regardless and are always shown.
 */
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GENERIC_CARDS, HEROES, getDeckCards } from "@/content";
import { evaluateLadder } from "@/game/dice";
import type { Die, GameEvent, HeroDefinition, HeroSnapshot, LadderRowState, StatusInstance } from "@/game/types";

import { Button } from "@/components/ui/Button";
import { HealthBar } from "@/components/ui/HealthBar";
import { CPMeter } from "@/components/ui/CPMeter";
import { DiceTray } from "@/components/game/DiceTray";
import { AbilityLadder } from "@/components/game/AbilityLadder";
import { StatusTrack } from "@/components/game/StatusTrack";
import { StatusBadge } from "@/components/game/StatusBadge";
import { CardView } from "@/components/game/CardView";
import { sfx } from "@/audio/sfx";
import { audio } from "@/audio/manager";
import { vibrate } from "@/hooks/useHaptics";
import { enqueueEvents, useChoreoStore } from "@/store/choreoStore";

/** Returns the first registered hero, or null if the registry is empty. */
function firstHero(): HeroDefinition | null {
  const ids = Object.keys(HEROES);
  return ids.length > 0 ? HEROES[ids[0]] ?? null : null;
}

export default function DevComponents() {
  return (
    <main className="safe-pad min-h-svh bg-arena-0 text-ink pb-12">
      <header className="flex items-center justify-between gap-3 mb-4">
        <Link to="/" className="text-muted hover:text-ink text-sm">← Home</Link>
        <h1 className="font-display text-d-2 tracking-widest">COMPONENTS</h1>
        <Link to="/dev/tokens" className="text-muted hover:text-ink text-sm">tokens →</Link>
      </header>

      <p className="text-xs text-muted mb-6">
        First user gesture unlocks the audio context. After that, all SFX +
        haptic feedback is live. Tap-and-hold any badge or ladder row for
        details.
      </p>

      <div className="flex flex-col gap-6">
        <ChoreoTestBench />
        <DicePlayground />
        <LadderDemo />
        <StatusDemo />
        <PrimitivesShowcase />
        <CardShowcase />
      </div>
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   0. CHOREOGRAPHER TEST BENCH — generic event firing, hero-agnostic.
   ──────────────────────────────────────────────────────────────────────── */
function ChoreoTestBench() {
  const queueLen = useChoreoStore(s => s.queue.length);
  const playing  = useChoreoStore(s => !!s.playing);
  const totalHandled = useChoreoStore(s => s.totalEventsHandled);
  const reset    = useChoreoStore(s => s.reset);

  const [muted, setMuted] = useState(audio.isMuted());

  function fire(events: GameEvent | GameEvent[]) {
    enqueueEvents(Array.isArray(events) ? events : [events]);
  }

  return (
    <Section
      title="Choreographer test bench"
      hint="Fire engine events; the Choreographer runs each as a timed visual+audio+haptic beat. Audio unlocks on first interaction (iOS)."
    >
      <div className="surface rounded-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>queue: <strong className="text-ink font-num">{queueLen}</strong></span>
          <span>playing: <strong className="text-ink">{playing ? "yes" : "no"}</strong></span>
          <span>handled: <strong className="text-ink font-num">{totalHandled}</strong></span>
          <span className="ml-auto inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={muted}
              onChange={e => { audio.setMuted(e.target.checked); setMuted(e.target.checked); }}
              className="accent-brand"
            />
            mute
          </span>
          <Button size="sm" variant="ghost" onClick={() => { reset(); }}>clear queue</Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <Button sound={null} onClick={() => fire({ t: "damage-dealt", from: "p1", to: "p2", amount: 3, type: "normal", mitigated: 0 })}>
            damage 3
          </Button>
          <Button sound={null} onClick={() => fire({ t: "damage-dealt", from: "p1", to: "p2", amount: 11, type: "normal", mitigated: 2 })}>
            damage 11
          </Button>
          <Button sound={null} onClick={() => fire({ t: "damage-dealt", from: "p1", to: "p2", amount: 24, type: "ultimate", mitigated: 0 })}>
            damage 24 ULT
          </Button>
          <Button sound={null} onClick={() => fire({ t: "damage-dealt", from: "p1", to: "p2", amount: 7, type: "pure", mitigated: 0 })}>
            damage 7 pure
          </Button>
          <Button sound={null} onClick={() => fire({ t: "heal-applied", player: "p1", amount: 5 })}>
            heal 5
          </Button>
          <Button sound={null} onClick={() => fire({ t: "rage-changed", player: "p1", stacks: 3 })}>
            sig stack = 3
          </Button>
          <Button sound={null} onClick={() => fire({ t: "turn-started", player: "p1", turn: 4 })}>
            turn started
          </Button>
          <Button sound={null} onClick={() => fire({ t: "match-won", winner: "p1" })} variant="primary">
            match won
          </Button>
          <Button sound={null} onClick={() => fire({ t: "match-won", winner: "draw" })} variant="ghost">
            draw
          </Button>
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   1. DICE PLAYGROUND — requires a registered hero.
   ──────────────────────────────────────────────────────────────────────── */
function DicePlayground() {
  const hero = firstHero();
  const [dice, setDice] = useState<Die[]>(() => freshDice(hero));
  const [rollKey, setRollKey] = useState(0);
  const [centerStage, setCenterStage] = useState(false);
  const [rollsThisSession, setRollsThisSession] = useState(0);
  const tumbleTimerRef = useRef<number | null>(null);

  if (!hero) {
    return <EmptyHeroDemo title="Dice playground" />;
  }

  function roll() {
    if (!hero) return;
    setCenterStage(true);
    setDice(prev => prev.map(d =>
      d.locked ? d : { ...d, current: Math.floor(Math.random() * hero.diceIdentity.faces.length) },
    ));
    setRollKey(k => k + 1);
    setRollsThisSession(n => n + 1);
    if (tumbleTimerRef.current) window.clearTimeout(tumbleTimerRef.current);
    tumbleTimerRef.current = window.setTimeout(() => setCenterStage(false), 1300);
  }

  function reset() {
    sfx("ui-back");
    setDice(freshDice(hero));
    setRollKey(0);
    setRollsThisSession(0);
    setCenterStage(false);
  }

  function toggleLock(idx: number) {
    setDice(prev => prev.map((d, i) => i === idx ? { ...d, locked: !d.locked } : d));
  }

  return (
    <Section
      title="Dice playground"
      hint="Tap a die to lock it. Press ROLL repeatedly — feel the tumble + land + settle loop. Fully audio + haptic."
    >
      <div
        className="relative rounded-card surface p-4 overflow-hidden"
        style={{
          background: centerStage
            ? `radial-gradient(ellipse at 50% 38%, ${hero.accentColor}22 0%, var(--c-arena-0) 70%)`
            : "linear-gradient(180deg, rgba(43,23,64,0.85) 0%, rgba(15,8,20,0.85) 100%)",
          transition: "background 200ms ease-out",
        }}
      >
        <div className="flex items-center justify-between text-xs text-muted mb-2"
             style={{ opacity: centerStage ? 0.4 : 1, transition: "opacity 200ms" }}>
          <span>Hero: <strong className="text-ink">{hero.name}</strong></span>
          <span>rolls this session: <strong className="text-ink font-num">{rollsThisSession}</strong></span>
        </div>

        <DiceTray
          dice={dice}
          accent={hero.accentColor}
          rollKey={rollKey}
          centerStage={centerStage}
          onToggleLock={toggleLock}
        />

        <div className="flex items-center justify-center gap-3 mt-4">
          <Button variant="ghost" size="md" onClick={reset} sound="ui-back">Reset</Button>
          <Button variant="primary" size="lg" onClick={roll} heroAccent={hero.accentColor} sound={null}>
            🎲 ROLL
          </Button>
          <Button
            variant="ghost" size="md"
            onClick={() => { sfx("die-lock"); vibrate("die-lock"); }}
            sound={null}
          >
            test haptic
          </Button>
        </div>
      </div>
    </Section>
  );
}

function freshDice(hero: HeroDefinition | null): Die[] {
  if (!hero) return [];
  const faces = hero.diceIdentity.faces;
  return [0, 1, 2, 3, 4].map(i => ({
    index: i as Die["index"],
    faces,
    current: i % faces.length,
    locked: false,
  }));
}

/* ────────────────────────────────────────────────────────────────────────
   2. LADDER DEMO — requires a registered hero.
   ──────────────────────────────────────────────────────────────────────── */
function LadderDemo() {
  const hero = firstHero();
  const [dice, setDice] = useState<Die[]>(() => freshDice(hero));
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(3);
  const [opponentHp, setOpponentHp] = useState(7);
  const [bonus, setBonus] = useState(0);

  const snapshot: HeroSnapshot | null = useMemo(() => {
    if (!hero) return null;
    return {
      player: "p1",
      hero: hero.id,
      hp: 30, hpStart: 30, hpCap: 40, cp: 5,
      dice,
      rollAttemptsRemaining: attemptsRemaining,
      hand: [], deck: [], discard: [], statuses: [],
      upgrades: { 1: 0, 2: 0, 3: 0, 4: 0 },
      signatureState: {},
      activeOffense: hero.recommendedLoadout.offense
        .map(n => hero.abilityCatalog.find(a => a.name.toLowerCase() === n.toLowerCase()))
        .filter(<T,>(a: T): a is NonNullable<T> => !!a),
      activeDefense: hero.recommendedLoadout.defense
        .map(n => (hero.defensiveCatalog ?? []).find(a => a.name.toLowerCase() === n.toLowerCase()))
        .filter(<T,>(a: T): a is NonNullable<T> => !!a),
      ladderState: blankLadder(),
      isLowHp: false,
      nextAbilityBonusDamage: 0,
      abilityModifiers: [],
      symbolBends: [],
      lastStripped: {},
      masterySlots: {},
      consumedOncePerMatchCards: [],
      consumedOncePerTurnCards: [],
      tokenOverrides: [],
      pipelineBuffs: [],
      triggerBuffs: [],
      comboOverrides: [],
    };
  }, [hero, dice, attemptsRemaining]);

  const rows = useMemo<LadderRowState[]>(() => {
    if (!hero || !snapshot) return [];
    return evaluateLadder(hero, snapshot, attemptsRemaining, {
      opponentHp,
      pendingOpponentDamage: 0,
      damageBonus: bonus,
      reachabilitySamples: 300,
      reachabilitySeed: 13,
    });
  }, [hero, snapshot, attemptsRemaining, opponentHp, bonus]);

  if (!hero) return <EmptyHeroDemo title="Ladder live-state demo" />;

  function setFace(dieIdx: number, faceIdx: number) {
    setDice(prev => prev.map((d, i) => i === dieIdx ? { ...d, current: faceIdx } : d));
  }
  function toggleLock(idx: number) {
    setDice(prev => prev.map((d, i) => i === idx ? { ...d, locked: !d.locked } : d));
  }

  return (
    <Section title="Ladder live-state demo" hint="Set face values, drag the opponent's HP slider, watch ladder transitions in real time.">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface rounded-card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted w-24">Attempts left</span>
            {[0, 1, 2, 3].map(n => (
              <Button key={n} size="sm"
                variant={n === attemptsRemaining ? "primary" : "secondary"}
                onClick={() => setAttemptsRemaining(n)}
                sound="ui-tap">
                {n}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-3 text-xs text-muted">
            <span className="w-24">Opponent HP</span>
            <input type="range" min={0} max={40} value={opponentHp}
              onChange={e => setOpponentHp(Number(e.target.value))} className="flex-1 accent-dmg" />
            <span className="font-num text-ink w-8 text-right">{opponentHp}</span>
          </label>
          <label className="flex items-center gap-3 text-xs text-muted">
            <span className="w-24">Damage bonus</span>
            <input type="range" min={0} max={5} value={bonus}
              onChange={e => setBonus(Number(e.target.value))} className="flex-1 accent-rose-500" />
            <span className="font-num text-ink w-8 text-right">{bonus}</span>
          </label>

          <div>
            <div className="text-xs text-muted mb-1">Set each die face manually:</div>
            <div className="flex flex-col gap-2">
              {dice.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Button size="sm" variant={d.locked ? "primary" : "secondary"}
                          onClick={() => toggleLock(i)} sound={null}>
                    {d.locked ? "🔒" : "🔓"}
                  </Button>
                  <div className="flex flex-wrap gap-1 flex-1">
                    {hero.diceIdentity.faces.map((f, j) => (
                      <Button
                        key={`${i}-${j}-${f.symbol}`}
                        size="sm"
                        variant={d.current === j ? "primary" : "ghost"}
                        onClick={() => setFace(i, j)}
                        sound={null}
                        className="text-xs"
                      >
                        {f.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="surface rounded-card p-3">
            <div className="text-xs text-muted mb-2">Current dice</div>
            <DiceTray dice={dice} accent={hero.accentColor} rollKey={0} onToggleLock={toggleLock} dieSize={56} />
          </div>
          <AbilityLadder hero={hero} rows={rows} />
        </div>
      </div>
    </Section>
  );
}
function blankLadder(): LadderRowState[] {
  return [];
}

/* ────────────────────────────────────────────────────────────────────────
   3. STATUS TRACK DEMO — generic, hero-agnostic.
   ──────────────────────────────────────────────────────────────────────── */
function StatusDemo() {
  const [statuses, setStatuses] = useState<StatusInstance[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  function apply(id: string) {
    sfx("status-apply");
    vibrate("card-play");
    setFreshIds(new Set([id]));
    setStatuses(prev => {
      const existing = prev.find(s => s.id === id);
      if (existing) return prev.map(s => s.id === id ? { ...s, stacks: Math.min(5, s.stacks + 1) } : s);
      return [...prev, { id, stacks: 1, appliedBy: "p1" }];
    });
  }
  function strip(id: string) {
    setStatuses(prev => prev.filter(s => s.id !== id));
  }
  function tick(id: string) {
    sfx("status-tick");
    setStatuses(prev => prev.flatMap(s =>
      s.id === id ? (s.stacks > 1 ? [{ ...s, stacks: s.stacks - 1 }] : []) : [s],
    ));
  }
  function reset() { sfx("ui-back"); setStatuses([]); }

  // Universal status tokens registered in src/game/status.ts.
  const TOKENS = ["burn", "stun", "protect", "shield", "regen"];

  return (
    <Section title="Status track demo" hint="Apply, tick, and strip each token — confirm slam-in animation, pulse on debuffs, dissolve on remove.">
      <div className="surface rounded-card p-4">
        <div className="text-xs text-muted mb-1">Live track:</div>
        <StatusTrack statuses={statuses} freshIds={freshIds} emptyHint="(no statuses)" />

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TOKENS.map(id => (
            <div key={id} className="flex flex-col gap-1 items-stretch">
              <div className="flex items-center gap-2 px-2">
                <StatusBadge statusId={id} stacks={(statuses.find(s => s.id === id)?.stacks) ?? 0} />
                <span className="text-xs uppercase tracking-wide text-muted">{id}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <Button size="sm" sound={null} onClick={() => apply(id)}>+1</Button>
                <Button size="sm" sound={null} onClick={() => tick(id)}>tick</Button>
                <Button size="sm" sound={null} onClick={() => strip(id)} variant="danger">x</Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={reset}>Clear all</Button>
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   4. PRIMITIVES — generic, hero-agnostic.
   ──────────────────────────────────────────────────────────────────────── */
function PrimitivesShowcase() {
  const hero = firstHero();
  const accent = hero?.accentColor ?? "var(--c-brand)";
  const [hp, setHp] = useState(30);
  const [cp, setCp] = useState(2);
  return (
    <Section title="UI primitives">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="surface rounded-card p-4 flex flex-col gap-3">
          <div className="text-xs text-muted">Buttons</div>
          <div className="flex flex-wrap gap-2 items-end">
            <Button size="sm">sm</Button>
            <Button size="md">md</Button>
            <Button size="lg" variant="primary">lg primary</Button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <Button variant="primary">primary</Button>
            <Button variant="secondary">secondary</Button>
            <Button variant="ghost">ghost</Button>
            <Button variant="danger">danger</Button>
            <Button disabled>disabled</Button>
          </div>
        </div>

        <div className="surface rounded-card p-4 flex flex-col gap-3">
          <div className="text-xs text-muted">Health & CP</div>
          <HealthBar hp={hp} hpMax={40} accent={accent} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setHp(h => Math.max(0, h - 5))} variant="danger">-5 HP</Button>
            <Button size="sm" onClick={() => setHp(h => Math.min(40, h + 5))} variant="secondary">+5 HP</Button>
            <Button size="sm" onClick={() => setHp(40)} variant="ghost">reset</Button>
          </div>
          <CPMeter cp={cp} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setCp(c => Math.max(0, c - 1))}>-1</Button>
            <Button size="sm" onClick={() => setCp(c => Math.min(15, c + 1))}>+1</Button>
            <Button size="sm" onClick={() => setCp(0)}>0</Button>
            <Button size="sm" onClick={() => setCp(12)}>12</Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   5. CARD SHOWCASE — generic universal cards + first hero's cards.
   ──────────────────────────────────────────────────────────────────────── */
function CardShowcase() {
  const hero = firstHero();
  const accent = hero?.accentColor ?? "var(--c-brand)";
  const heroCards = hero ? getDeckCards(hero.id).slice(0, 6) : [];
  const cards = [...heroCards, ...GENERIC_CARDS];
  return (
    <Section title="Cards">
      <div className="surface rounded-card p-4 overflow-x-auto">
        {cards.length === 0 ? (
          <p className="text-xs text-muted italic">No cards available — register a hero or add generic cards.</p>
        ) : (
          <div className="flex gap-3 min-w-max">
            {cards.map(card => (
              <CardView key={card.id} card={card} accent={accent} />
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

/* ── Empty-state helper ─────────────────────────────────────────────────── */
function EmptyHeroDemo({ title }: { title: string }) {
  return (
    <Section title={title}>
      <div className="surface rounded-card p-4 text-xs text-muted italic">
        No hero registered yet. This demo activates once at least one hero is added to
        <code className="ml-1 not-italic">src/content/index.ts</code>.
      </div>
    </Section>
  );
}

/* ── Shared section wrapper ─────────────────────────────────────────────── */
function Section({
  title, hint, children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="font-display tracking-wider text-d-3 text-ember">{title}</h2>
        {hint && <p className="text-xs text-muted mt-0.5 max-w-prose">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
