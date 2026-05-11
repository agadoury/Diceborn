/**
 * loadout-storage.test.ts — round-trip + corruption + fallback behavior
 * for the per-hero loadout persistence layer.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  loadLoadout, saveLoadout, clearLoadout, clearAllLoadouts,
} from "../src/store/loadoutStorage";

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

describe("loadoutStorage round-trip", () => {
  it("returns null when nothing has been saved", () => {
    expect(loadLoadout("berserker")).toBeNull();
  });

  it("saves and loads a per-hero loadout", () => {
    const sel = {
      offense: ["Cleave", "Winter Storm", "Blood Harvest", "Wolf's Howl"],
      defense: ["Wolfhide", "Bloodoath"],
    };
    saveLoadout("berserker", sel);
    expect(loadLoadout("berserker")).toEqual(sel);
  });

  it("each hero has independent storage", () => {
    saveLoadout("berserker", { offense: ["A", "B", "C", "D"], defense: ["E", "F"] });
    saveLoadout("pyromancer", { offense: ["W", "X", "Y", "Z"], defense: ["P", "Q"] });
    expect(loadLoadout("berserker")?.offense).toEqual(["A", "B", "C", "D"]);
    expect(loadLoadout("pyromancer")?.defense).toEqual(["P", "Q"]);
  });

  it("clearLoadout removes only the targeted hero", () => {
    saveLoadout("berserker", { offense: ["A", "B", "C", "D"], defense: ["E", "F"] });
    saveLoadout("pyromancer", { offense: ["W", "X", "Y", "Z"], defense: ["P", "Q"] });
    clearLoadout("berserker");
    expect(loadLoadout("berserker")).toBeNull();
    expect(loadLoadout("pyromancer")).not.toBeNull();
  });
});

describe("loadoutStorage resilience", () => {
  it("treats corrupted JSON as empty storage", () => {
    localStorage.setItem("pact-of-heroes:loadouts:v1", "not-json{{");
    expect(loadLoadout("berserker")).toBeNull();
  });

  it("ignores entries from a different schema version", () => {
    localStorage.setItem(
      "pact-of-heroes:loadouts:v1",
      JSON.stringify({ version: 999, perHero: { berserker: { offense: [], defense: [], updatedAt: 0 } } }),
    );
    expect(loadLoadout("berserker")).toBeNull();
  });

  it("clearAllLoadouts wipes everything", () => {
    saveLoadout("berserker", { offense: ["A", "B", "C", "D"], defense: ["E", "F"] });
    clearAllLoadouts();
    expect(loadLoadout("berserker")).toBeNull();
  });
});
