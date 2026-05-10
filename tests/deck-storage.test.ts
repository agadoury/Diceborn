/**
 * deck-storage.test.ts — round-trip + corruption + fallback behavior for
 * the per-hero deck persistence layer.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  loadDeck, saveDeck, clearDeck,
  loadDefaultHero, saveDefaultHero,
  clearAll,
} from "../src/store/deckStorage";

// vitest runs in `node` environment; install a minimal localStorage shim so
// the storage layer has somewhere to read/write.
beforeAll(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size; },
      },
    });
  }
});

beforeEach(() => {
  localStorage.clear();
});

describe("deckStorage round-trip", () => {
  it("returns null when nothing has been saved", () => {
    expect(loadDeck("berserker")).toBeNull();
    expect(loadDefaultHero()).toBeNull();
  });

  it("saves and loads a per-hero deck", () => {
    const ids = ["a/x", "a/y", "a/z"];
    saveDeck("berserker", ids);
    expect(loadDeck("berserker")).toEqual(ids);
  });

  it("each hero has independent storage", () => {
    saveDeck("berserker", ["a", "b"]);
    saveDeck("pyromancer", ["c", "d"]);
    expect(loadDeck("berserker")).toEqual(["a", "b"]);
    expect(loadDeck("pyromancer")).toEqual(["c", "d"]);
  });

  it("clearDeck removes only the targeted hero", () => {
    saveDeck("berserker", ["a"]);
    saveDeck("pyromancer", ["b"]);
    clearDeck("berserker");
    expect(loadDeck("berserker")).toBeNull();
    expect(loadDeck("pyromancer")).toEqual(["b"]);
  });

  it("default-hero pointer round-trips independently of saved decks", () => {
    saveDefaultHero("pyromancer");
    expect(loadDefaultHero()).toBe("pyromancer");
    // saving a deck does not stomp the default-hero pointer
    saveDeck("berserker", ["x"]);
    expect(loadDefaultHero()).toBe("pyromancer");
  });
});

describe("deckStorage resilience", () => {
  it("treats corrupted JSON as empty storage", () => {
    localStorage.setItem("pact-of-heroes:decks:v1", "not-json{{");
    expect(loadDeck("berserker")).toBeNull();
    expect(loadDefaultHero()).toBeNull();
  });

  it("ignores entries from a different schema version", () => {
    localStorage.setItem(
      "pact-of-heroes:decks:v1",
      JSON.stringify({ version: 999, perHero: { berserker: { cardIds: ["x"], updatedAt: 0 } } }),
    );
    expect(loadDeck("berserker")).toBeNull();
  });

  it("clearAll wipes both decks and default-hero pointer", () => {
    saveDeck("berserker", ["a"]);
    saveDefaultHero("berserker");
    clearAll();
    expect(loadDeck("berserker")).toBeNull();
    expect(loadDefaultHero()).toBeNull();
  });
});
