/**
 * LoadoutBuilder — pre-match ability draft.
 *
 * The player picks 4 offensive abilities (one per tier T1-T4) and 2
 * defensive abilities from the hero's catalog. Loadouts persist per-hero
 * in localStorage via `loadoutStorage.ts`. The "Use default" CTA loads
 * the hero's `recommendedLoadout`.
 *
 * URL: /loadout?hero=<id>[&mode=<vs-ai|hot-seat>][&p1=<id>&p2=<id>]
 *
 * Three entry points decide the post-save navigation + the CTA label:
 *   - Standalone (no `mode`, `p1`, or `p2`): launched from `/loadouts` via
 *     the main-menu Loadouts button. CTA is "SAVE"; commit returns to
 *     `/loadouts` without launching a match.
 *   - Pre-pick (`mode` set, no `p1`/`p2`): "Customize" tapped on HeroSelect
 *     before committing to a match. CTA is "NEXT: DECK"; commit forwards
 *     to `/deck-builder?hero=...&mode=...` so the player can finish
 *     drafting their deck before the match.
 *   - Match flow (`mode + p1 + p2` all set): HeroSelect commit-with-deck
 *     path. CTA is "NEXT: DECK"; commit forwards to
 *     `/deck-builder?hero=...&mode=...&p1=...&p2=...` so the player
 *     continues to the second customize step before launching the match.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { getHero } from "@/content";
import { validateLoadout, LOADOUT_DEFENSE_SIZE } from "@/game/loadout";
import { saveLoadout, loadLoadout } from "@/store/loadoutStorage";
import type { AbilityDef, AbilityTier, HeroId, LoadoutSelection } from "@/game/types";
import { sfx } from "@/audio/sfx";

const TIERS: ReadonlyArray<AbilityTier> = [1, 2, 3, 4];
const TIER_LABEL: Record<AbilityTier, string> = {
  1: "Tier 1 — Basic",
  2: "Tier 2 — Strong",
  3: "Tier 3 — Signature",
  4: "Tier 4 — Ultimate",
};

export default function LoadoutBuilder() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const heroId = params.get("hero") as HeroId | null;
  const rawMode = params.get("mode");
  const mode = rawMode ?? "vs-ai";
  const p1 = params.get("p1");
  const p2 = params.get("p2");
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
  const offenseCatalog = hero.abilityCatalog;
  const defenseCatalog = hero.defensiveCatalog ?? [];

  // Initial selection = saved loadout (if any) else recommendedLoadout.
  const initial = loadLoadout(heroId) ?? {
    offense: [...hero.recommendedLoadout.offense],
    defense: [...hero.recommendedLoadout.defense],
  };
  const [offense, setOffense] = useState<string[]>([...initial.offense]);
  const [defense, setDefense] = useState<string[]>([...initial.defense]);

  // Map tier → currently selected ability name.
  const selectedByTier = useMemo(() => {
    const m = new Map<AbilityTier, string>();
    for (const name of offense) {
      const def = offenseCatalog.find(a => a.name.toLowerCase() === name.toLowerCase());
      if (def) m.set(def.tier, def.name);
    }
    return m;
  }, [offense, offenseCatalog]);

  const sel: LoadoutSelection = { offense, defense };
  const issues = validateLoadout(hero, sel);
  const isValid = issues.length === 0;

  function setOffenseAtTier(tier: AbilityTier, abilityName: string) {
    sfx("ui-tap");
    const others = offense.filter(name => {
      const def = offenseCatalog.find(a => a.name.toLowerCase() === name.toLowerCase());
      return def && def.tier !== tier;
    });
    setOffense([...others, abilityName]);
  }

  function toggleDefense(abilityName: string) {
    sfx("ui-tap");
    const selected = defense.some(n => n.toLowerCase() === abilityName.toLowerCase());
    if (selected) {
      setDefense(defense.filter(n => n.toLowerCase() !== abilityName.toLowerCase()));
      return;
    }
    if (defense.length >= LOADOUT_DEFENSE_SIZE) return; // full
    setDefense([...defense, abilityName]);
  }

  function loadDefault() {
    sfx("ui-tap");
    setOffense([...hero.recommendedLoadout.offense]);
    setDefense([...hero.recommendedLoadout.defense]);
  }

  function commit() {
    if (!isValid) return;
    saveLoadout(heroId!, sel);
    sfx("victory-fanfare");
    const qs = new URLSearchParams({ hero: heroId!, mode });
    if (entry === "play" || entry === "pre-pick") {
      if (p1) qs.set("p1", p1);
      if (p2) qs.set("p2", p2);
      navigate(`/deck-builder?${qs.toString()}`);
      return;
    }
    navigate("/loadouts");
  }

  const commitLabel = entry === "standalone" ? "SAVE" : "NEXT: DECK";

  // Offensive sections (grouped by tier).
  const offenseByTier: Record<AbilityTier, AbilityDef[]> = {
    1: offenseCatalog.filter(a => a.tier === 1),
    2: offenseCatalog.filter(a => a.tier === 2),
    3: offenseCatalog.filter(a => a.tier === 3),
    4: offenseCatalog.filter(a => a.tier === 4),
  };

  return (
    <main className="safe-pad min-h-svh bg-arena-0 text-ink">
      <header className="flex items-center justify-between gap-3 mb-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} sound="ui-back">← Back</Button>
        <h1 className="font-display tracking-widest text-d-2"
            style={{ color: hero.accentColor, textShadow: `0 0 20px ${hero.accentColor}66` }}>
          {hero.name.toUpperCase()}
        </h1>
        <span className="text-xs uppercase tracking-widest text-muted">
          {entry === "standalone" ? "LOADOUT" : "STEP 1 / 2"}
        </span>
      </header>

      {/* Stepper hint when this is part of the match-setup flow. */}
      {entry !== "standalone" && (
        <div className="flex items-center justify-center gap-2 mb-3 text-[10px] uppercase tracking-widest">
          <span className="text-ink/90" style={{ color: hero.accentColor }}>1 · ABILITIES</span>
          <span className="text-muted">›</span>
          <span className="text-muted">2 · DECK</span>
        </div>
      )}

      {/* Validation strip */}
      <ValidationStrip
        offenseCount={offense.length}
        defenseCount={defense.length}
        issues={issues}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 max-w-6xl mx-auto">
        {/* Left/top: tier-by-tier catalog */}
        <section className="space-y-3">
          {TIERS.map(tier => (
            <TierSection
              key={tier}
              tier={tier}
              abilities={offenseByTier[tier]}
              selectedName={selectedByTier.get(tier)}
              accent={hero.accentColor}
              onPick={(name) => setOffenseAtTier(tier, name)}
            />
          ))}

          {/* Defenses */}
          <div className="surface rounded-card p-3">
            <div className="flex items-baseline justify-between text-[10px] uppercase tracking-widest mb-2">
              <span className="font-display">DEFENSES — pick {LOADOUT_DEFENSE_SIZE}</span>
              <span className="text-muted">{defense.length}/{LOADOUT_DEFENSE_SIZE}</span>
            </div>
            {defenseCatalog.length === 0 ? (
              <div className="text-xs text-muted italic">This hero has no defensive catalog.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {defenseCatalog.map(d => {
                  const isSelected = defense.some(n => n.toLowerCase() === d.name.toLowerCase());
                  const disabled = !isSelected && defense.length >= LOADOUT_DEFENSE_SIZE;
                  return (
                    <AbilityCard
                      key={d.name}
                      ability={d}
                      accent={hero.accentColor}
                      selected={isSelected}
                      disabled={disabled}
                      onPick={() => toggleDefense(d.name)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right/bottom: summary panel */}
        <aside className="surface rounded-card p-3 lg:sticky lg:top-3 lg:self-start">
          <h2 className="text-[11px] uppercase tracking-widest text-muted mb-2">Your loadout</h2>
          <div className="space-y-1.5 mb-3">
            {TIERS.map(tier => {
              const name = selectedByTier.get(tier);
              return (
                <div
                  key={tier}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded
                             ring-1 ring-white/5"
                >
                  <span className="text-[10px] uppercase tracking-widest text-muted">T{tier}</span>
                  <span className="font-display tracking-wider text-sm truncate"
                        style={{ color: name ? hero.accentColor : undefined }}>
                    {name ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted mt-3 mb-1">Defenses</div>
          <div className="space-y-1.5">
            {Array.from({ length: LOADOUT_DEFENSE_SIZE }).map((_, i) => {
              const name = defense[i];
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded
                             ring-1 ring-white/5"
                >
                  <span className="text-[10px] uppercase tracking-widest text-muted">D{i + 1}</span>
                  <span className="font-display tracking-wider text-sm truncate"
                        style={{ color: name ? hero.accentColor : undefined }}>
                    {name ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Sticky bottom CTAs */}
      <div className="sticky bottom-0 left-0 right-0 mt-4 -mx-4 px-4 py-3
                      bg-arena-0/85 backdrop-blur-sm border-t border-white/5
                      pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={loadDefault}>Use default</Button>
          </div>
          <Button
            variant="primary"
            size="lg"
            heroAccent={hero.accentColor}
            onClick={commit}
            disabled={!isValid}
            className="min-w-[200px]"
          >
            {isValid ? commitLabel : "PICK ALL TIERS"}
          </Button>
        </div>
      </div>
    </main>
  );
}

function ValidationStrip({
  offenseCount, defenseCount, issues,
}: {
  offenseCount: number;
  defenseCount: number;
  issues: string[];
}) {
  return (
    <div className="surface rounded-card px-3 py-2 mb-3 flex items-center gap-3 flex-wrap">
      <span className={`text-[11px] tracking-widest uppercase font-display ${offenseCount === 4 ? "text-emerald-300" : "text-muted"}`}>
        Offense {offenseCount}/4
      </span>
      <span className={`text-[11px] tracking-widest uppercase font-display ${defenseCount === LOADOUT_DEFENSE_SIZE ? "text-emerald-300" : "text-muted"}`}>
        Defense {defenseCount}/{LOADOUT_DEFENSE_SIZE}
      </span>
      {issues.length > 0 && (
        <span className="text-[11px] text-amber-300/90 ml-auto">{issues[0]}</span>
      )}
    </div>
  );
}

function TierSection({
  tier, abilities, selectedName, accent, onPick,
}: {
  tier: AbilityTier;
  abilities: AbilityDef[];
  selectedName?: string;
  accent: string;
  onPick: (name: string) => void;
}) {
  return (
    <div className="surface rounded-card p-3">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-widest mb-2">
        <span className="font-display">{TIER_LABEL[tier]}</span>
        <span className="text-muted">{abilities.length} option{abilities.length === 1 ? "" : "s"}</span>
      </div>
      {abilities.length === 0 ? (
        <div className="text-xs text-muted italic">No abilities at this tier in the catalog.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {abilities.map(a => {
            const isSelected = selectedName?.toLowerCase() === a.name.toLowerCase();
            return (
              <AbilityCard
                key={a.name}
                ability={a}
                accent={accent}
                selected={isSelected}
                onPick={() => onPick(a.name)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function AbilityCard({
  ability, accent, selected, disabled, onPick,
}: {
  ability: AbilityDef;
  accent: string;
  selected: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`text-left px-3 py-2 rounded-card transition-all ring-1
                  ${selected ? "ring-2" : "ring-white/5 hover:ring-white/15"}
                  ${disabled ? "opacity-40 cursor-not-allowed" : "active:scale-[0.99]"}`}
      style={selected ? { borderColor: accent, boxShadow: `0 0 12px ${accent}55` } : undefined}
      aria-pressed={selected}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display tracking-wider text-sm truncate"
              style={{ color: selected ? accent : undefined }}>
          {ability.name}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted shrink-0">
          {damageTypeLabel(ability.damageType)}
        </span>
      </div>
      <div className="text-xs text-ink/85 truncate">{ability.shortText}</div>
      <div className="text-[10px] text-muted mt-0.5 line-clamp-2">{ability.longText}</div>
    </button>
  );
}

function damageTypeLabel(t: import("@/game/types").DamageType): string {
  switch (t) {
    case "normal":        return "normal";
    case "undefendable":  return "undefendable";
    case "pure":          return "pure";
    case "collateral":    return "collateral";
    case "ultimate":      return "ultimate";
  }
}
