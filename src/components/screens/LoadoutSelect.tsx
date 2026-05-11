/**
 * LoadoutSelect — standalone entry point to the loadout builder.
 *
 * Reached from the main menu's "Abilities" / "Loadout" CTA. Shows every
 * registered hero as a portrait card with a "LOADOUT SAVED" badge if the
 * player already has a custom loadout for that hero, plus a "DEFAULT"
 * hint otherwise.
 *
 * Tapping a hero forwards to `/loadout?hero=<id>` (no `mode`, `p1`, or
 * `p2`) — LoadoutBuilder reads that as standalone mode and returns the
 * player to this screen on commit instead of launching a match.
 */
import { useNavigate } from "react-router-dom";
import { HEROES } from "@/content";
import type { HeroDefinition, HeroId } from "@/game/types";
import { HeroPortrait } from "@/components/game/HeroPortrait";
import { Button } from "@/components/ui/Button";
import { loadLoadout } from "@/store/loadoutStorage";
import { sfx } from "@/audio/sfx";

export default function LoadoutSelect() {
  const navigate = useNavigate();
  const ALL_HEROES = Object.keys(HEROES) as HeroId[];

  if (ALL_HEROES.length === 0) {
    return (
      <main className="safe-pad min-h-svh bg-arena-0 text-ink grid place-items-center">
        <div className="surface rounded-card p-6 max-w-md text-center space-y-3">
          <h1 className="font-display text-d-2 tracking-widest text-ember">NO HEROES REGISTERED</h1>
          <p className="text-muted text-sm">
            Once a hero is registered in <code>src/content/index.ts</code>, it'll appear here.
          </p>
          <Button variant="ghost" onClick={() => navigate("/")}>← Back to menu</Button>
        </div>
      </main>
    );
  }

  function pick(id: HeroId) {
    sfx("ui-tap");
    navigate(`/loadout?hero=${id}`);
  }

  return (
    <main className="safe-pad min-h-svh bg-arena-0 text-ink">
      <header className="flex items-center justify-between gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} sound="ui-back">← Home</Button>
        <h1 className="font-display tracking-widest text-d-2">LOADOUTS</h1>
        <span className="w-12" />
      </header>

      <p className="text-muted text-sm text-center max-w-md mx-auto mb-6">
        Pick a hero to draft their abilities. Each loadout is 4 offensive
        abilities (one per tier) + 2 defensive abilities, chosen from the
        hero's catalog. Saved loadouts persist across matches; heroes
        without a custom loadout play their recommended draft.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
        {ALL_HEROES.map(id => {
          const hero = HEROES[id];
          if (!hero) return null;
          return <HeroLoadoutCard key={id} hero={hero} onPick={() => pick(id)} />;
        })}
      </div>
    </main>
  );
}

function HeroLoadoutCard({ hero, onPick }: { hero: HeroDefinition; onPick: () => void }) {
  const hasSaved = loadLoadout(hero.id) != null;
  return (
    <button
      type="button"
      onClick={onPick}
      className="surface rounded-card p-4 flex items-center gap-4 text-left
                 hover:scale-[1.01] active:scale-[0.99] transition-transform
                 ring-1 ring-transparent hover:ring-1"
      style={{ ["--hover-ring" as never]: hero.accentColor }}
      aria-label={`Edit ${hero.name}'s loadout`}
    >
      <HeroPortrait hero={hero.id} accent={hero.accentColor} size={64} active />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="font-display tracking-wider text-base truncate" style={{ color: hero.accentColor }}>
            {hero.name}
          </span>
          {hasSaved ? (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] tracking-widest font-display
                         bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30 shrink-0"
              title="You have a custom loadout saved for this hero"
            >
              SAVED
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[9px] tracking-widest font-display
                             bg-arena-0/60 text-muted ring-1 ring-white/10 shrink-0">
              DEFAULT
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted truncate">
          {hero.archetype.toUpperCase()} · COMPLEXITY {hero.complexity}
        </div>
        <div className="text-xs text-ink/70 truncate mt-0.5">
          {hero.abilityCatalog.length} offensive · {hero.defensiveCatalog?.length ?? 0} defensive
        </div>
      </div>
    </button>
  );
}
