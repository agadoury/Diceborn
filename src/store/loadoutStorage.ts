/**
 * Pact of Heroes — loadout persistence layer.
 *
 * Pure functions (no React, no Zustand). Stores per-hero saved
 * `LoadoutSelection`s in localStorage under a single versioned key.
 * Same fail-soft posture as `deckStorage.ts` — SSR, private-mode, and
 * over-quota errors silently degrade to "no saved loadout".
 *
 * Storage shape (key: `pact-of-heroes:loadouts:v1`):
 *   {
 *     version: 1,
 *     perHero: {
 *       [heroId]: { offense: string[], defense: string[], updatedAt: number }
 *     }
 *   }
 */
import type { HeroId, LoadoutSelection } from "@/game/types";

const STORAGE_KEY = "pact-of-heroes:loadouts:v1";
const SCHEMA_VERSION = 1;

interface PerHeroEntry {
  offense: string[];
  defense: string[];
  updatedAt: number;
}
interface StorageRoot {
  version: number;
  perHero: Partial<Record<HeroId, PerHeroEntry>>;
}

function emptyRoot(): StorageRoot {
  return { version: SCHEMA_VERSION, perHero: {} };
}

function readRoot(): StorageRoot {
  try {
    if (typeof localStorage === "undefined") return emptyRoot();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyRoot();
    const parsed = JSON.parse(raw) as Partial<StorageRoot>;
    if (!parsed || parsed.version !== SCHEMA_VERSION) return emptyRoot();
    return { version: SCHEMA_VERSION, perHero: parsed.perHero ?? {} };
  } catch {
    return emptyRoot();
  }
}

function writeRoot(root: StorageRoot): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    // Quota / private-mode — loadout simply doesn't persist.
  }
}

/** Load the saved loadout for a hero, or null if none has been persisted. */
export function loadLoadout(heroId: HeroId): LoadoutSelection | null {
  const entry = readRoot().perHero[heroId];
  if (!entry) return null;
  return { offense: [...entry.offense], defense: [...entry.defense] };
}

/** Save a loadout for a hero. Caller is responsible for validating
 *  composition (see `validateLoadout`) before saving — this layer is
 *  pure storage. */
export function saveLoadout(heroId: HeroId, sel: LoadoutSelection): void {
  const root = readRoot();
  root.perHero = {
    ...root.perHero,
    [heroId]: {
      offense: [...sel.offense],
      defense: [...sel.defense],
      updatedAt: Date.now(),
    },
  };
  writeRoot(root);
}

/** Clear the saved loadout for a hero. */
export function clearLoadout(heroId: HeroId): void {
  const root = readRoot();
  if (!root.perHero[heroId]) return;
  const next = { ...root.perHero };
  delete next[heroId];
  root.perHero = next;
  writeRoot(root);
}

/** Test / debug — wipe all stored loadouts. */
export function clearAllLoadouts(): void {
  writeRoot(emptyRoot());
}
