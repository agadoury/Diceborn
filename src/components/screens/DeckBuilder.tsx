/**
 * DeckBuilder — deck customization.
 *
 * The player picks 12 cards from their hero's catalog along the four-axis
 * composition rule:
 *   - 4 generic
 *   - 3 dice-manip
 *   - 3 ladder-upgrade  (each must target a distinct {T1,T2,T3,Defensive} slot)
 *   - 2 signature
 *
 * Decks persist per-hero in localStorage via deckStorage.ts. The "Use
 * default" CTA loads the hero's recommendedDeck.
 *
 * URL: /deck-builder?hero=<id>[&mode=<vs-ai|hot-seat>][&p1=<id>&p2=<id>]
 *
 * Three entry points decide the post-save navigation + the CTA label:
 *   - Standalone (no `mode`, `p1`, or `p2`): launched from `/decks` via
 *     the main-menu Deck Builder button. CTA is "SAVE"; commit returns
 *     to `/decks` without launching a match.
 *   - Pre-pick (`mode` set, no `p1`/`p2`): "Customize deck" tapped on
 *     HeroSelect before committing to a match. CTA is "SAVE"; commit
 *     returns to `/heroes?mode=...` so the player still has to pick.
 *   - Match flow (`mode + p1 + p2` all set): HeroSelect commit-with-deck
 *     path. CTA is "SAVE & PLAY"; commit forwards to `/play?...`.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { CardView } from "@/components/game/CardView";
import { getCardCatalog, getHero } from "@/content";
import { validateDeckComposition } from "@/game/cards";
import { saveDeck, loadDeck } from "@/store/deckStorage";
import { loadLoadout } from "@/store/loadoutStorage";
import type { Card, CardCategory, CardId, HeroId } from "@/game/types";
import { sfx } from "@/audio/sfx";

type Filter = "all" | CardCategory;

const CATEGORY_LIMITS: Record<CardCategory, number> = {
  "generic": 4,
  "dice-manip": 3,
  "ladder-upgrade": 3,
  "signature": 2,
};

const CATEGORY_LABEL: Record<CardCategory, string> = {
  "generic": "Generic",
  "dice-manip": "Dice",
  "ladder-upgrade": "Upgrade",
  "signature": "Signature",
};

export default function DeckBuilder() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const heroId = params.get("hero") as HeroId | null;
  const rawMode = params.get("mode");
  const mode = rawMode ?? "vs-ai";
  const p1 = params.get("p1");
  const p2 = params.get("p2");
  // Three entry points: full match flow (HeroSelect already picked p1+p2),
  // pre-pick customize (HeroSelect "Customize deck" before commit, mode set,
  // no p1/p2), and standalone (DeckSelect from main menu, no params at all).
  const entry: "play" | "pre-pick" | "standalone" =
    p1 && p2 ? "play" : rawMode ? "pre-pick" : "standalone";

  if (!heroId) {
    return (
      <main className="safe-pad min-h-svh grid place-items-center text-ink">
        <div className="surface rounded-card p-6 max-w-md text-center space-y-3">
          <p>Missing hero. Pick one from the hero select screen first.</p>
          <Button variant="ghost" onClick={() => navigate("/heroes")}>Back</Button>
        </div>
      </main>
    );
  }

  const hero = getHero(heroId);
  const catalog = useMemo(() => getCardCatalog(heroId), [heroId]);
  const cardById = useMemo(() => new Map(catalog.map(c => [c.id, c])), [catalog]);

  // Loadout-aware soft warnings on mastery cards. A mastery scoped to a
  // specific ability id ("Cleave Mastery") is dead-weight if that ability
  // isn't in the player's drafted loadout. We surface a warning chip but
  // don't block the deck from being saved — see deck-building docs.
  const loadoutAbilityNames = useMemo(() => {
    const sel = loadLoadout(heroId) ?? hero.recommendedLoadout;
    const names = new Set<string>();
    for (const n of [...sel.offense, ...sel.defense]) names.add(n.toLowerCase());
    return names;
  }, [heroId, hero.recommendedLoadout]);

  // Initial deck = saved deck (if any) else recommendedDeck.
  const initialIds = loadDeck(heroId) ?? [...hero.recommendedDeck];
  const [deckIds, setDeckIds] = useState<CardId[]>(initialIds);
  const [filter, setFilter] = useState<Filter>("all");

  const deckCards = deckIds.map(id => cardById.get(id)).filter((c): c is Card => !!c);
  const issues = validateDeckComposition(deckCards);
  const isValid = issues.length === 0;

  // Counts per category for slot indicators.
  const counts = useMemo(() => {
    const c: Record<CardCategory, number> = { "generic": 0, "dice-manip": 0, "ladder-upgrade": 0, "signature": 0 };
    for (const card of deckCards) c[card.cardCategory]++;
    return c;
  }, [deckCards]);

  // Track which ladder-upgrade slots are filled (to disable upgrades targeting
  // an already-occupied slot in the catalog).
  const filledUpgradeSlots = useMemo(() => {
    const set = new Set<string | number>();
    for (const card of deckCards) {
      if (card.cardCategory === "ladder-upgrade" && card.masteryTier != null) set.add(card.masteryTier);
    }
    return set;
  }, [deckCards]);

  function add(card: Card) {
    if (deckIds.length >= 12) return;
    if (counts[card.cardCategory] >= CATEGORY_LIMITS[card.cardCategory]) return;
    if (card.cardCategory === "ladder-upgrade" && card.masteryTier != null) {
      if (filledUpgradeSlots.has(card.masteryTier)) return; // duplicate slot
    }
    sfx("ui-tap");
    setDeckIds([...deckIds, card.id]);
  }

  function removeAt(index: number) {
    sfx("ui-tap");
    setDeckIds(deckIds.filter((_, i) => i !== index));
  }

  function loadDefault() {
    sfx("ui-tap");
    setDeckIds([...hero.recommendedDeck]);
  }

  function reset() {
    sfx("ui-tap");
    setDeckIds([]);
  }

  function commit() {
    if (!isValid) return;
    saveDeck(heroId!, deckIds);
    sfx("victory-fanfare");
    const target =
      entry === "play"     ? `/play?mode=${mode}&p1=${p1}&p2=${p2}` :
      entry === "pre-pick" ? `/heroes?mode=${mode}` :
                             /* standalone */ "/decks";
    navigate(target);
  }
  const commitLabel =
    entry === "play"     ? "SAVE & PLAY" :
    entry === "pre-pick" ? "SAVE" :
                           "SAVE";

  const visibleCatalog = filter === "all"
    ? catalog
    : catalog.filter(c => c.cardCategory === filter);

  return (
    <main className="safe-pad min-h-svh bg-arena-0 text-ink">
      <header className="flex items-center justify-between gap-3 mb-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} sound="ui-back">← Back</Button>
        <h1 className="font-display tracking-widest text-d-2"
            style={{ color: hero.accentColor, textShadow: `0 0 20px ${hero.accentColor}66` }}>
          {hero.name.toUpperCase()}
        </h1>
        <span className="text-xs uppercase tracking-widest text-muted">
          {entry === "standalone" ? `${deckIds.length}/12` : "STEP 2 / 2"}
        </span>
      </header>

      {/* Wizard stepper hint when this is part of the match-setup flow. */}
      {entry !== "standalone" && (
        <div className="flex items-center justify-center gap-2 mb-3 text-[10px] uppercase tracking-widest">
          <span className="text-muted">1 · ABILITIES</span>
          <span className="text-muted">›</span>
          <span style={{ color: hero.accentColor }}>2 · DECK ({deckIds.length}/12)</span>
        </div>
      )}

      {/* Validation strip */}
      <ValidationStrip counts={counts} issues={issues} />

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-2 px-2">
        <FilterChip label="All"      active={filter === "all"}            onClick={() => setFilter("all")} />
        <FilterChip label="Generic"  active={filter === "generic"}        onClick={() => setFilter("generic")} />
        <FilterChip label="Dice"     active={filter === "dice-manip"}     onClick={() => setFilter("dice-manip")} />
        <FilterChip label="Upgrade"  active={filter === "ladder-upgrade"} onClick={() => setFilter("ladder-upgrade")} />
        <FilterChip label="Signature" active={filter === "signature"}     onClick={() => setFilter("signature")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 max-w-6xl mx-auto">
        {/* Left/top: catalog */}
        <section>
          <h2 className="text-[11px] uppercase tracking-widest text-muted mb-2">Catalog</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
            {visibleCatalog.map(card => {
              const cat = card.cardCategory;
              const catFull = counts[cat] >= CATEGORY_LIMITS[cat];
              const slotTaken = cat === "ladder-upgrade"
                && card.masteryTier != null
                && filledUpgradeSlots.has(card.masteryTier)
                && !deckIds.includes(card.id);
              const disabled = catFull || slotTaken;
              const loadoutMiss = masteryTargetsMissing(card, loadoutAbilityNames);
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => add(card)}
                  disabled={disabled}
                  className={`text-left relative ${disabled ? "opacity-40 cursor-not-allowed" : "hover:scale-[1.02] active:scale-[0.98]"} transition-transform`}
                  aria-label={`Add ${card.name}`}
                >
                  <CardView card={card} accent={card.hero === "generic" ? undefined : hero.accentColor} />
                  <div className="mt-1 text-[10px] tracking-widest uppercase text-muted text-center">
                    {CATEGORY_LABEL[cat]}
                    {cat === "ladder-upgrade" && card.masteryTier != null && ` · T${card.masteryTier === "defensive" ? "Def" : card.masteryTier}`}
                  </div>
                  {loadoutMiss && (
                    <span
                      className="absolute top-1 right-1 px-1.5 py-0.5 rounded
                                 text-[9px] tracking-widest font-display
                                 bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40"
                      title="This mastery's target ability isn't in your current loadout — it won't trigger in match."
                    >
                      NO TARGET
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Right/bottom: deck slots */}
        <aside className="surface rounded-card p-3 lg:sticky lg:top-3 lg:self-start">
          <h2 className="text-[11px] uppercase tracking-widest text-muted mb-2">Your deck</h2>
          {(["generic", "dice-manip", "ladder-upgrade", "signature"] as const).map(cat => (
            <DeckGroup
              key={cat}
              label={CATEGORY_LABEL[cat]}
              required={CATEGORY_LIMITS[cat]}
              cards={deckCards
                .map((c, i) => ({ c, i }))
                .filter(x => x.c.cardCategory === cat)}
              onRemove={removeAt}
              accent={hero.accentColor}
            />
          ))}
        </aside>
      </div>

      {/* Sticky bottom CTAs */}
      <div className="sticky bottom-0 left-0 right-0 mt-4 -mx-4 px-4 py-3
                      bg-arena-0/85 backdrop-blur-sm border-t border-white/5
                      pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={loadDefault}>Use default</Button>
            <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
          </div>
          <Button
            variant="primary"
            size="lg"
            heroAccent={hero.accentColor}
            onClick={commit}
            disabled={!isValid}
            className="min-w-[180px]"
          >
            {isValid ? commitLabel : `${12 - deckIds.length} TO GO`}
          </Button>
        </div>
      </div>
    </main>
  );
}

/** True when the card is a mastery whose `upgradesAbilities` lists a
 *  specific ability name that isn't currently in the player's loadout.
 *  Tier / category-scoped masteries (`all-tier-N`, `all-defenses`) never
 *  warn — those scopes match whichever abilities are drafted. */
function masteryTargetsMissing(card: Card, loadoutNames: Set<string>): boolean {
  if (card.kind !== "mastery") return false;
  const targets = card.upgradesAbilities;
  if (!Array.isArray(targets)) return false;
  if (targets.length === 0) return false;
  return targets.every(name => !loadoutNames.has(name.toLowerCase()));
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-display tracking-widest transition-colors
                  ${active ? "bg-brand text-arena-0" : "surface text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );
}

function ValidationStrip({
  counts, issues,
}: {
  counts: Record<CardCategory, number>;
  issues: string[];
}) {
  return (
    <div className="surface rounded-card px-3 py-2 mb-3 flex items-center gap-3 flex-wrap">
      {(["generic", "dice-manip", "ladder-upgrade", "signature"] as const).map(cat => {
        const have = counts[cat];
        const need = CATEGORY_LIMITS[cat];
        const ok = have === need;
        return (
          <span
            key={cat}
            className={`text-[11px] tracking-widest uppercase font-display ${ok ? "text-emerald-300" : "text-muted"}`}
          >
            {CATEGORY_LABEL[cat]} {have}/{need}
          </span>
        );
      })}
      {issues.length > 0 && (
        <span className="text-[11px] text-amber-300/90 ml-auto">{issues[0]}</span>
      )}
    </div>
  );
}

function DeckGroup({
  label, required, cards, onRemove, accent,
}: {
  label: string;
  required: number;
  cards: { c: Card; i: number }[];
  onRemove: (idx: number) => void;
  accent: string;
}) {
  const slots = Array.from({ length: required }, (_, k) => cards[k]);
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted mb-1.5">
        <span>{label}</span>
        <span>{cards.length}/{required}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {slots.map((slot, k) => slot ? (
          <button
            key={`${slot.c.id}-${k}`}
            type="button"
            onClick={() => onRemove(slot.i)}
            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded
                       hover:bg-white/5 transition-colors text-left"
            title="Remove from deck"
          >
            <span className="font-display tracking-wider text-sm truncate"
                  style={{ color: slot.c.hero === "generic" ? "var(--c-ink)" : accent }}>
              {slot.c.name}
            </span>
            <span className="text-[10px] text-muted shrink-0">×</span>
          </button>
        ) : (
          <div key={`empty-${k}`}
               className="px-2 py-1.5 rounded border border-dashed border-white/10 text-muted text-xs">
            empty
          </div>
        ))}
      </div>
    </div>
  );
}
