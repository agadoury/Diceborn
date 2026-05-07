/**
 * Audio manager — thin facade.
 *
 * Step 4 ships placeholder WebAudio synth via `sfx.ts`. When real audio
 * assets arrive (Step 9 polish), this file becomes the Howler-backed
 * sprite loader; the public API (`play`, `setVolumes`, `setMuted`) stays
 * stable so callers don't change.
 *
 * The unlock event is dispatched once on first user interaction by main.tsx.
 */

import { sfx, setMuted as setSfxMuted, setSfxVolume, isUnlocked, type Sfx } from "./sfx";

export type { Sfx };

const LS_MUTED = "diceborn:audio:muted";
const LS_SFX   = "diceborn:audio:sfx";
const LS_MUSIC = "diceborn:audio:music";

interface AudioState {
  muted: boolean;
  sfxVolume: number;
  musicVolume: number;
}

const state: AudioState = {
  muted:       readBool(LS_MUTED, false),
  sfxVolume:   readNum (LS_SFX,   0.7),
  musicVolume: readNum (LS_MUSIC, 0.5),
};

function readBool(k: string, fallback: boolean): boolean {
  if (typeof localStorage === "undefined") return fallback;
  const v = localStorage.getItem(k);
  return v == null ? fallback : v === "1";
}
function readNum(k: string, fallback: number): number {
  if (typeof localStorage === "undefined") return fallback;
  const v = localStorage.getItem(k);
  return v == null ? fallback : Number(v);
}

function applyMute() { setSfxMuted(state.muted); }
function applyVolumes() { setSfxVolume(state.muted ? 0 : state.sfxVolume); }

applyMute();
applyVolumes();

export const audio = {
  play(name: Sfx): void { sfx(name); },
  setMuted(v: boolean): void {
    state.muted = v;
    try { localStorage.setItem(LS_MUTED, v ? "1" : "0"); } catch { /* */ }
    applyMute(); applyVolumes();
  },
  isMuted(): boolean { return state.muted; },
  setSfxVolume(v: number): void {
    state.sfxVolume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(LS_SFX, String(state.sfxVolume)); } catch { /* */ }
    applyVolumes();
  },
  getSfxVolume(): number { return state.sfxVolume; },
  setMusicVolume(v: number): void {
    state.musicVolume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(LS_MUSIC, String(state.musicVolume)); } catch { /* */ }
    // Music bus is a Step-9 add. Persisted now so settings UI works ahead of time.
  },
  getMusicVolume(): number { return state.musicVolume; },
  isUnlocked(): boolean { return isUnlocked(); },
};
