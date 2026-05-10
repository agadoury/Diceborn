/**
 * DeckSelect — standalone entry point to the deck-builder.
 *
 * Reached from the main menu's "Deck Builder" CTA. Shows every registered
 * hero as a portrait card with a "DECK SAVED" badge if the player already
 * has a custom deck for that hero, plus a "DEFAULT" hint otherwise.
 *
 * Tapping a hero forwards to `/deck-builder?hero=<id>` (no `mode`, `p1`,
 * or `p2`) — DeckBuilder reads that as standalone mode, swaps the
 * "SAVE & PLAY" CTA for plain "SAVE", and returns the player to this
 * screen on commit instead of launching a match.
 */
import { useNavigate } from "react-router-dom";
import { HEROES } from "@/content";
import type { HeroDefinition, HeroId } from "@/game/types";
import { HeroPortrait } from "@/components/game/HeroPortrait";
import { Button } from "@/components/ui/Button";
import { loadDeck } from "@/store/deckStorage";
import { sfx } from "@/audio/sfx";

export default function DeckSelect() {
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
    navigate(`/deck-builder?hero=${id}`);
  }

  return (
    <main className="safe-pad min-h-svh bg-arena-0 text-ink">
      <header className="flex items-center justify-between gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} sound="ui-back">← Home</Button>
        <h1 className="font-display tracking-widest text-d-2">DECK BUILDER</h1>
        <span className="w-12" />
      </header>

      <p className="text-muted text-sm text-center max-w-md mx-auto mb-6">
        Pick a hero to edit their deck. Saved decks are remembered for future
        matches; heroes without a custom deck use a balanced starter pack.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
        {ALL_HEROES.map(id => {
          const hero = HEROES[id];
          if (!hero) return null;
          return <HeroDeckCard key={id} hero={hero} onPick={() => pick(id)} />;
        })}
      </div>
    </main>
  );
}

function HeroDeckCard({ hero, onPick }: { hero: HeroDefinition; onPick: () => void }) {
  const hasSavedDeck = loadDeck(hero.id) != null;
  return (
    <button
      type="button"
      onClick={onPick}
      className="surface rounded-card p-4 flex items-center gap-4 text-left
                 hover:scale-[1.01] active:scale-[0.99] transition-transform
                 ring-1 ring-transparent hover:ring-1"
      style={{ ["--hover-ring" as never]: hero.accentColor }}
      aria-label={`Edit ${hero.name}'s deck`}
    >
      <HeroPortrait hero={hero.id} accent={hero.accentColor} size={64} active />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="font-display tracking-wider text-base truncate" style={{ color: hero.accentColor }}>
            {hero.name}
          </span>
          {hasSavedDeck ? (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] tracking-widest font-display
                         bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30 shrink-0"
              title="You have a custom deck saved for this hero"
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
          {hero.signatureMechanic.name} — {hero.signatureMechanic.description.split(".")[0]}.
        </div>
      </div>
    </button>
  );
}
