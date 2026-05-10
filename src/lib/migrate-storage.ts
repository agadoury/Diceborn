/**
 * One-shot localStorage migration: legacy `diceborn:*` keys → `pact-of-heroes:*`.
 *
 * Runs once at app boot from `main.tsx`, before any module reads its own
 * storage. For each known legacy key, if the new key isn't already set,
 * we copy the old value over and remove the old key. This preserves
 * saved decks, audio settings, motion preferences, and the haptics
 * toggle across the rename.
 *
 * After a successful migration the legacy keys are gone — re-running
 * the migrator is a cheap no-op. Wrapped in try/catch so SSR, private-
 * mode Safari, and quota errors degrade silently.
 */

const LEGACY_TO_NEW: ReadonlyArray<readonly [string, string]> = [
  ["diceborn:decks:v1",      "pact-of-heroes:decks:v1"],
  ["diceborn:reduced-motion", "pact-of-heroes:reduced-motion"],
  ["diceborn:haptics",       "pact-of-heroes:haptics"],
  ["diceborn:audio:muted",   "pact-of-heroes:audio:muted"],
  ["diceborn:audio:sfx",     "pact-of-heroes:audio:sfx"],
  ["diceborn:audio:music",   "pact-of-heroes:audio:music"],
];

export function migrateLegacyStorage(): void {
  try {
    if (typeof localStorage === "undefined") return;
    for (const [oldKey, newKey] of LEGACY_TO_NEW) {
      const old = localStorage.getItem(oldKey);
      if (old == null) continue;
      // Only copy when the new key isn't already populated — never clobber
      // post-rename writes.
      if (localStorage.getItem(newKey) == null) {
        localStorage.setItem(newKey, old);
      }
      localStorage.removeItem(oldKey);
    }
  } catch {
    // Storage access failed — nothing to do; app continues with empty state.
  }
}
