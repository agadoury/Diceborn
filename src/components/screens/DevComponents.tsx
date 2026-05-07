/**
 * /dev/components — the storybook + dice playground.
 *
 * Step 3 acceptance gate: every primitive demoed in its states,
 * dice playground proves the tumble feels good 20 times in a row,
 * ladder demo shows live highlighting + LETHAL via opponent-HP slider,
 * status track demo applies/ticks/removes each token.
 */
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BARBARIAN } from "@/content/heroes/barbarian";
import { BARBARIAN_CARDS } from "@/content/cards/barbarian";
import { GENERIC_CARDS } from "@/content/cards/generic";
import { evaluateLadder } from "@/game/dice";
import type { Die, HeroSnapshot, LadderRowState, StatusInstance } from "@/game/types";

import { Button } from "@/components/ui/Button";
import { HealthBar } from "@/components/ui/HealthBar";
import { CPMeter } from "@/components/ui/CPMeter";
import { DiceTray } from "@/components/game/DiceTray";
import { AbilityLadder } from "@/components/game/AbilityLadder";
import { StatusTrack } from "@/components/game/StatusTrack";
import { StatusBadge } from "@/components/game/StatusBadge";
import { CardView } from "@/components/game/CardView";
import { sfx } from "@/audio/sfx";
import { vibrate } from "@/hooks/useHaptics";

const SYM_FACES = BARBARIAN.diceIdentity.faces;

function freshDice(): Die[] {
  return [0, 1, 2, 3, 4].map(i => ({
    index: i as Die["index"],
    faces: SYM_FACES,
    current: i % SYM_FACES.length,
    locked: false,
  }));
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
   1. DICE PLAYGROUND — the §3 acceptance gate.
   "I can roll dice 20 times in a row and it feels good every single time."
   ──────────────────────────────────────────────────────────────────────── */
function DicePlayground() {
  const [dice, setDice] = useState<Die[]>(() => freshDice());
  const [rollKey, setRollKey] = useState(0);
  const [centerStage, setCenterStage] = useState(false);
  const [rollsThisSession, setRollsThisSession] = useState(0);
  const tumbleTimerRef = useRef<number | null>(null);

  // Roll: pick fresh face indices for unlocked dice, bump rollKey.
  function roll() {
    setCenterStage(true);
    setDice(prev => prev.map(d =>
      d.locked ? d : { ...d, current: Math.floor(Math.random() * SYM_FACES.length) },
    ));
    setRollKey(k => k + 1);
    setRollsThisSession(n => n + 1);
    if (tumbleTimerRef.current) window.clearTimeout(tumbleTimerRef.current);
    // Dice tumble totals ~990ms mobile / ~1240ms desktop; release center-stage after.
    tumbleTimerRef.current = window.setTimeout(() => setCenterStage(false), 1300);
  }

  function reset() {
    sfx("ui-back");
    setDice(freshDice());
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
            ? `radial-gradient(ellipse at 50% 38%, ${BARBARIAN.accentColor}22 0%, var(--c-arena-0) 70%)`
            : "linear-gradient(180deg, rgba(43,23,64,0.85) 0%, rgba(15,8,20,0.85) 100%)",
          transition: "background 200ms ease-out",
        }}
      >
        {/* Other-UI dimming proxy: a faint banner that dims while center-stage */}
        <div className="flex items-center justify-between text-xs text-muted mb-2"
             style={{ opacity: centerStage ? 0.4 : 1, transition: "opacity 200ms" }}>
          <span>Hero: <strong className="text-ink">Barbarian</strong></span>
          <span>rolls this session: <strong className="text-ink font-num">{rollsThisSession}</strong></span>
        </div>

        <DiceTray
          dice={dice}
          accent={BARBARIAN.accentColor}
          rollKey={rollKey}
          centerStage={centerStage}
          onToggleLock={toggleLock}
        />

        <div className="flex items-center justify-center gap-3 mt-4">
          <Button variant="ghost" size="md" onClick={reset} sound="ui-back">Reset</Button>
          <Button variant="primary" size="lg" onClick={roll} heroAccent={BARBARIAN.accentColor} sound={null}>
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

/* ────────────────────────────────────────────────────────────────────────
   2. LADDER DEMO — lock dice, drag opponent HP slider, watch LETHAL fire.
   ──────────────────────────────────────────────────────────────────────── */
function LadderDemo() {
  const [dice, setDice] = useState<Die[]>(() => freshDice());
  const [attemptsRemaining, setAttemptsRemaining] = useState<0 | 1 | 2>(2);
  const [opponentHp, setOpponentHp] = useState(7);
  const [rage, setRage] = useState(0);

  // Build a synthetic snapshot from these dice so evaluateLadder can read it.
  const snapshot: HeroSnapshot = useMemo(() => ({
    player: "p1",
    hero: "barbarian",
    hp: 30, hpStart: 30, hpCap: 40, cp: 5,
    dice,
    rollAttemptsRemaining: attemptsRemaining,
    hand: [], deck: [], discard: [], statuses: [],
    upgrades: { 1: 0, 2: 0, 3: 0, 4: 0 },
    signatureState: { rage },
    ladderState: blankLadder(),
    isLowHp: false,
    nextAbilityBonusDamage: 0,
  }), [dice, attemptsRemaining, rage]);

  const rows = useMemo<[LadderRowState, LadderRowState, LadderRowState, LadderRowState]>(
    () => evaluateLadder(BARBARIAN, snapshot, attemptsRemaining, {
      opponentHp,
      pendingOpponentDamage: 0,
      damageBonus: rage,                   // rage = +1 dmg per stack
      reachabilitySamples: 300,
      reachabilitySeed: 13,
    }),
    [snapshot, attemptsRemaining, opponentHp, rage],
  );

  function setFace(dieIdx: number, faceIdx: number) {
    setDice(prev => prev.map((d, i) => i === dieIdx ? { ...d, current: faceIdx } : d));
  }
  function toggleLock(idx: number) {
    setDice(prev => prev.map((d, i) => i === idx ? { ...d, locked: !d.locked } : d));
  }

  return (
    <Section title="Ladder live-state demo" hint="Set face values for each die, drag the opponent's HP slider, and watch FIRING / TRIGGERED / REACHABLE / OUT-OF-REACH and LETHAL transitions in real time.">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Controls */}
        <div className="surface rounded-card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted w-24">Attempts left</span>
            {[0, 1, 2].map(n => (
              <Button key={n} size="sm"
                variant={n === attemptsRemaining ? "primary" : "secondary"}
                onClick={() => setAttemptsRemaining(n as 0 | 1 | 2)}
                sound="ui-tap">
                {n}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-3 text-xs text-muted">
            <span className="w-24">Opponent HP</span>
            <input
              type="range" min={0} max={40}
              value={opponentHp}
              onChange={e => setOpponentHp(Number(e.target.value))}
              className="flex-1 accent-dmg"
            />
            <span className="font-num text-ink w-8 text-right">{opponentHp}</span>
          </label>
          <label className="flex items-center gap-3 text-xs text-muted">
            <span className="w-24">Rage stacks</span>
            <input
              type="range" min={0} max={5}
              value={rage}
              onChange={e => setRage(Number(e.target.value))}
              className="flex-1 accent-rose-500"
            />
            <span className="font-num text-ink w-8 text-right">{rage}</span>
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
                    {SYM_FACES.map((f, j) => (
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

        {/* Ladder + a small dice preview */}
        <div className="flex flex-col gap-3">
          <div className="surface rounded-card p-3">
            <div className="text-xs text-muted mb-2">Current dice</div>
            <DiceTray
              dice={dice}
              accent={BARBARIAN.accentColor}
              rollKey={0}
              onToggleLock={toggleLock}
              dieSize={56}
            />
          </div>
          <AbilityLadder hero={BARBARIAN} rows={rows} />
        </div>
      </div>
    </Section>
  );
}
function blankLadder(): [LadderRowState, LadderRowState, LadderRowState, LadderRowState] {
  return [
    { kind: "out-of-reach", tier: 1 },
    { kind: "out-of-reach", tier: 2 },
    { kind: "out-of-reach", tier: 3 },
    { kind: "out-of-reach", tier: 4 },
  ];
}

/* ────────────────────────────────────────────────────────────────────────
   3. STATUS TRACK DEMO — apply / tick / strip each of the 8 tokens.
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

  const ALL_TOKENS = ["burn", "stun", "protect", "shield", "regen", "bleeding", "smolder", "judgment"];

  return (
    <Section title="Status track demo" hint="Apply, tick, and strip each token — confirm slam-in animation, pulse on debuffs, dissolve on remove.">
      <div className="surface rounded-card p-4">
        <div className="text-xs text-muted mb-1">Live track:</div>
        <StatusTrack statuses={statuses} freshIds={freshIds} emptyHint="(no statuses)" />

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL_TOKENS.map(id => (
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
   4. PRIMITIVES — Button sizes/variants, HealthBar, CPMeter.
   ──────────────────────────────────────────────────────────────────────── */
function PrimitivesShowcase() {
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
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <Button heroAccent="#DC2626">barbarian</Button>
            <Button heroAccent="#F97316">pyromancer</Button>
            <Button heroAccent="#FBBF24">paladin</Button>
            <Button disabled>disabled</Button>
          </div>
        </div>

        <div className="surface rounded-card p-4 flex flex-col gap-3">
          <div className="text-xs text-muted">Health & CP</div>
          <HealthBar hp={hp} hpMax={40} accent={BARBARIAN.accentColor} />
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
   5. CARD SHOWCASE.
   ──────────────────────────────────────────────────────────────────────── */
function CardShowcase() {
  return (
    <Section title="Cards">
      <div className="surface rounded-card p-4 overflow-x-auto">
        <div className="flex gap-3 min-w-max">
          {[...BARBARIAN_CARDS.slice(0, 6), ...GENERIC_CARDS].map(card => (
            <CardView key={card.id} card={card} accent={BARBARIAN.accentColor} />
          ))}
        </div>
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

