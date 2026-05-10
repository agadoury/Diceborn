/**
 * HeroSelect — pick a hero (or two for hot-seat) and start a match.
 *
 * Per §10:
 *   - Full-bleed atmospheric background that cross-fades on selection
 *   - Hero portrait grid (2-col mobile horizontal scroll, side rail desktop)
 *   - Info panel (right rail desktop / bottom sheet mobile)
 *   - Big PLAY CTA at bottom
 *   - Hot-seat: after Player 1 selects, transition to Player 2 with curtain
 *   - Vs AI: AI auto-picks with a 1s "thinking" animation
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HEROES } from "@/content";
import type { HeroDefinition, HeroId } from "@/game/types";
import { Button } from "@/components/ui/Button";
import { HeroPortrait } from "@/components/game/HeroPortrait";
import { HeroBackground } from "@/components/effects/HeroBackground";
import { sfx } from "@/audio/sfx";
import { vibrate } from "@/hooks/useHaptics";

export default function HeroSelect() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mode = (params.get("mode") as "hot-seat" | "vs-ai") ?? "vs-ai";

  // Read the live registry — heroes are added by content modules.
  const ALL_HEROES = Object.keys(HEROES) as HeroId[];
  const noHeroes = ALL_HEROES.length === 0;

  // Hot-seat: pick p1 then p2. Vs AI: pick p1 only.
  const [step, setStep] = useState<"p1" | "p2">("p1");
  const [p1Hero, setP1Hero] = useState<HeroId>(ALL_HEROES[0] ?? "");
  const [p2Hero, setP2Hero] = useState<HeroId>(ALL_HEROES[1] ?? ALL_HEROES[0] ?? "");

  const currentSel = step === "p1" ? p1Hero : p2Hero;
  const selDef: HeroDefinition | undefined = HEROES[currentSel];

  function selectHero(id: HeroId) {
    sfx("ui-tap"); vibrate("die-lock");
    if (step === "p1") setP1Hero(id);
    else setP2Hero(id);
  }

  function commit() {
    if (noHeroes) return;
    if (mode === "hot-seat" && step === "p1") {
      sfx("ui-tap");
      setStep("p2");
      return;
    }
    let finalP2 = p2Hero;
    if (mode === "vs-ai") {
      finalP2 = ALL_HEROES.find(h => h !== p1Hero) ?? ALL_HEROES[0] ?? "";
      setP2Hero(finalP2);
    }
    sfx("victory-fanfare");
    navigate(`/play?mode=${mode}&p1=${p1Hero}&p2=${finalP2}`);
  }

  if (noHeroes) {
    return (
      <main className="relative safe-pad min-h-svh bg-arena-0 text-ink grid place-items-center">
        <div className="surface rounded-card p-6 max-w-md text-center space-y-3">
          <h1 className="font-display text-d-2 tracking-widest text-ember">NO HEROES REGISTERED</h1>
          <p className="text-muted text-sm">
            Hero content hasn't been added to <code>src/content/heroes/</code> yet. Once a hero file
            registers itself in <code>src/content/index.ts</code>, it'll appear here.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-3 px-4 py-2 rounded-card surface text-ink hover:text-brand"
          >
            ← Back to menu
          </button>
        </div>
      </main>
    );
  }

  if (!selDef) return null;   // defensive — past the noHeroes guard, this should never trip

  return (
    <main className="relative safe-pad min-h-svh bg-arena-0 text-ink overflow-hidden">
      {/* Atmospheric background — cross-fades when selection changes. */}
      <HeroBackground hero={currentSel} intensity="full" className="z-0" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} sound="ui-back">← Back</Button>
        <h1 className="font-display text-d-2 tracking-widest"
            style={{ color: selDef.accentColor, textShadow: `0 0 20px ${selDef.accentColor}66` }}>
          HEROES
        </h1>
        <span className="text-xs uppercase tracking-widest text-muted">
          {mode === "vs-ai" ? "Vs AI" : `P${step === "p1" ? "1" : "2"} pick`}
        </span>
      </header>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[280px_1fr_360px] gap-4 lg:gap-6 max-w-6xl mx-auto">
        {/* Left rail: hero grid */}
        <div className="lg:col-start-1">
          <div className="flex lg:flex-col gap-2 sm:gap-3 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-2 px-2 lg:mx-0 lg:px-0">
            {ALL_HEROES.map(id => HEROES[id] && (
              <HeroCard
                key={id}
                hero={HEROES[id]!}
                selected={currentSel === id}
                onSelect={() => selectHero(id)}
              />
            ))}
          </div>
        </div>

        {/* Center: large hero illustration */}
        <div className="lg:col-start-2 flex flex-col items-center justify-center min-h-[260px] lg:min-h-[480px]">
          <HeroPortrait
            hero={currentSel}
            accent={selDef.accentColor}
            size={220}
            className="!ring-[3px]"
          />
          <div className="mt-4 font-display tracking-[0.18em] text-3xl sm:text-5xl"
               style={{ color: selDef.accentColor, textShadow: `0 0 20px ${selDef.accentColor}aa, 0 4px 0 rgba(0,0,0,0.4)` }}>
            {selDef.name}
          </div>
        </div>

        {/* Right rail: info panel */}
        <div className="lg:col-start-3">
          <InfoPanel hero={selDef} />
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="relative z-10 mt-6 flex justify-center pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button
          variant="primary"
          size="lg"
          heroAccent={selDef.accentColor}
          onClick={commit}
          className="min-w-[220px]"
        >
          {mode === "hot-seat" && step === "p1" ? "CONFIRM (P1)" : "PLAY"}
        </Button>
      </div>
    </main>
  );
}

function HeroCard({ hero, selected, onSelect }: { hero: HeroDefinition; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative shrink-0 w-[110px] aspect-square lg:w-full lg:aspect-auto lg:h-24 surface rounded-card
                  grid place-items-center lg:grid-cols-[64px_1fr] lg:place-items-center lg:px-4 lg:gap-3
                  transition-all duration-200 ease-out-quart
                  ${selected ? "scale-105 lg:scale-[1.02]" : "opacity-90 hover:opacity-100"}`}
      style={selected ? {
        boxShadow: `0 0 0 2px ${hero.accentColor}, 0 0 24px ${hero.accentColor}aa`,
      } : undefined}
      aria-pressed={selected}
    >
      <div className="lg:col-start-1 lg:justify-self-start">
        <HeroPortrait hero={hero.id} accent={hero.accentColor} size={64} active />
      </div>
      <div className="absolute bottom-1 left-2 right-2 text-center lg:static lg:col-start-2 lg:text-left lg:justify-self-stretch lg:min-w-0">
        <div className="text-[10px] sm:text-xs lg:text-sm font-display tracking-widest lg:truncate"
             style={{ color: hero.accentColor }}>
          {hero.name}
        </div>
      </div>
    </button>
  );
}

function InfoPanel({ hero }: { hero: HeroDefinition }) {
  const dieFaces = hero.diceIdentity.faces;
  const seenSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const f of dieFaces) set.add(f.symbol);
    return [...set];
  }, [dieFaces]);

  return (
    <div className="surface rounded-card p-4 sm:p-5 space-y-3">
      <div>
        <div className="font-display text-d-3 tracking-widest" style={{ color: hero.accentColor }}>
          {hero.name}
        </div>
        <div className="text-xs text-muted mt-0.5">
          {hero.archetype.toUpperCase()} · COMPLEXITY {hero.complexity}
        </div>
      </div>

      <div className="text-sm italic text-ink/85">"{hero.signatureQuote}"</div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Signature</div>
        <div className="font-display tracking-wider text-base" style={{ color: hero.accentColor }}>
          {hero.signatureMechanic.name}
        </div>
        <div className="text-xs text-ink/85">{hero.signatureMechanic.description}</div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Dice</div>
        <div className="text-xs text-ink/85 mb-2">{hero.diceIdentity.fluffDescription}</div>
        <div className="flex gap-1 flex-wrap">
          {seenSymbols.map(sym => {
            const count = dieFaces.filter(f => f.symbol === sym).length;
            const label = dieFaces.find(f => f.symbol === sym)?.label;
            return (
              <span key={sym} className="px-2 py-1 rounded-md text-[11px] surface text-ink/85">
                {label} ×{count}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Win condition</div>
        <div className="text-xs text-ink/85">{archetypeBlurb(hero.archetype)}</div>
      </div>
    </div>
  );
}

function archetypeBlurb(a: HeroDefinition["archetype"]): string {
  switch (a) {
    case "rush":     return "Close it out fast. Big hits, short matches.";
    case "burn":     return "Stack damage-over-time. The opponent melts whether they react or not.";
    case "control":  return "Shape the board. Every turn matters.";
    case "combo":    return "Set up a payoff. One big play wins it.";
    case "survival": return "Outlast. Heal, mitigate, grind them down.";
  }
}
