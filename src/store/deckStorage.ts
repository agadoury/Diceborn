/**
 * Diceborn — deck persistence layer.
 *
 * Pure functions (no React, no Zustand). Stores per-hero saved decks and a
 * default-hero pointer in localStorage under a single versioned key. All
 * accesses are wrapped in try/catch so SSR, Safari private mode, and
 * over-quota errors degrade gracefully to "no saved deck".
 *
 * Storage shape (key: `diceborn:decks:v1`):
 *   {
 *     version: 1,
 *     perHero: { [heroId]: { cardIds: CardId[], updatedAt: number } },
 *     defaultHero: HeroId | null
 *   }
 */
import type { CardId, HeroId } from "@/game/types";

const STORAGE_KEY = "diceborn:decks:v1";
const SCHEMA_VERSION = 1;

interface PerHeroEntry { cardIds: CardId[]; updatedAt: number; }
interface StorageRoot {
  version: number;
  perHero: Partial<Record<HeroId, PerHeroEntry>>;
  defaultHero: HeroId | null;
}

function emptyRoot(): StorageRoot {
  return { version: SCHEMA_VERSION, perHero: {}, defaultHero: null };
}

function readRoot(): StorageRoot {
  try {
    if (typeof localStorage === "undefined") return emptyRoot();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyRoot();
    const parsed = JSON.parse(raw) as Partial<StorageRoot>;
    if (!parsed || parsed.version !== SCHEMA_VERSION) return emptyRoot();
    return {
      version: SCHEMA_VERSION,
      perHero: parsed.perHero ?? {},
      defaultHero: parsed.defaultHero ?? null,
    };
  } catch {
    return emptyRoot();
  }
}

function writeRoot(root: StorageRoot): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    // Ignore quota / private-mode errors — saved deck simply won't persist.
  }
}

/** Load the saved deck for a hero, or null if none has been persisted. */
export function loadDeck(heroId: HeroId): CardId[] | null {
  const entry = readRoot().perHero[heroId];
  return entry ? [...entry.cardIds] : null;
}

/** Save a deck (12 CardIds) for a hero. Caller is responsible for validating
 *  composition before saving — this layer is pure storage. */
export function saveDeck(heroId: HeroId, cardIds: ReadonlyArray<CardId>): void {
  const root = readRoot();
  root.perHero = {
    ...root.perHero,
    [heroId]: { cardIds: [...cardIds], updatedAt: Date.now() },
  };
  writeRoot(root);
}

/** Clear the saved deck for a hero (does not affect other heroes or the
 *  default-hero pointer). */
export function clearDeck(heroId: HeroId): void {
  const root = readRoot();
  if (!root.perHero[heroId]) return;
  const next = { ...root.perHero };
  delete next[heroId];
  root.perHero = next;
  writeRoot(root);
}

/** Read the default-hero pointer — used by Quick Match to pick a starting
 *  hero without prompting. */
export function loadDefaultHero(): HeroId | null {
  return readRoot().defaultHero;
}

export function saveDefaultHero(heroId: HeroId): void {
  const root = readRoot();
  root.defaultHero = heroId;
  writeRoot(root);
}

/** Test/debug helper — wipes all stored decks and the default-hero pointer. */
export function clearAll(): void {
  writeRoot(emptyRoot());
}
