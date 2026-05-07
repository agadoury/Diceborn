/**
 * Diceborn — placeholder audio.
 *
 * Step 3 ships synthesized WebAudio tones for the dice playground. Step 4
 * brings Howler + the audio sprite. Same public API on either side, so
 * components don't change.
 *
 * iOS Safari requires a user gesture to start the audio context. The
 * `diceborn:audio-unlock` event in main.tsx fires on the first interaction;
 * we resume the context then.
 */

type Sfx =
  | "die-throw"      // anticipation whoosh
  | "die-tumble"     // rolling clatter (loops short)
  | "die-land"       // thud
  | "die-lock"       // crisp tick
  | "ladder-firing"  // soft ascending chime when a tier becomes FIRING
  | "ladder-lethal"  // ominous low bell when LETHAL appears
  | "status-apply"   // generic token-slam
  | "status-tick"    // soft pulse
  | "ui-tap"         // button confirm
  | "ui-back";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let unlocked = false;
let muted = false;
let sfxVolume = 0.7;

function ensureCtx(): AudioContext {
  if (!ctx) {
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = sfxVolume;
    masterGain.connect(ctx.destination);
  }
  return ctx!;
}

if (typeof window !== "undefined") {
  window.addEventListener("diceborn:audio-unlock", () => {
    unlocked = true;
    const c = ensureCtx();
    if (c.state === "suspended") void c.resume();
  });
}

export function setMuted(value: boolean): void {
  muted = value;
  if (masterGain) masterGain.gain.value = muted ? 0 : sfxVolume;
}
export function setSfxVolume(v: number): void {
  sfxVolume = Math.max(0, Math.min(1, v));
  if (masterGain && !muted) masterGain.gain.value = sfxVolume;
}
export function isUnlocked(): boolean { return unlocked; }

/** Fire-and-forget synth: a single envelope with optional pitch sweep + noise. */
function play(
  freq: number,
  durMs: number,
  opts: { type?: OscillatorType; sweepTo?: number; noise?: number; gain?: number } = {},
): void {
  if (!unlocked || muted) return;
  const c = ensureCtx();
  const t0 = c.currentTime;
  const dur = durMs / 1000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, opts.gain ?? 0.6), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(masterGain!);

  // Tonal layer
  const o = c.createOscillator();
  o.type = opts.type ?? "triangle";
  o.frequency.setValueAtTime(freq, t0);
  if (opts.sweepTo) o.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + dur);
  o.connect(g);
  o.start(t0); o.stop(t0 + dur + 0.05);

  // Optional noise layer (for clatter/thud realism)
  if (opts.noise && opts.noise > 0) {
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.6;
    const src = c.createBufferSource(); src.buffer = buf;
    const ng = c.createGain(); ng.gain.value = opts.noise;
    src.connect(ng); ng.connect(g);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }
}

// ── Public sfx — placeholder synth recipes ──────────────────────────────────
export function sfx(name: Sfx): void {
  switch (name) {
    case "die-throw":      play(420, 90,  { type: "sine",     sweepTo: 720, gain: 0.45 }); break;
    case "die-tumble":     play(180, 100, { type: "square",   noise: 0.4,   gain: 0.18 }); break;
    case "die-land":       play(95,  140, { type: "triangle", noise: 0.6,   sweepTo: 60, gain: 0.55 }); break;
    case "die-lock":       play(880, 50,  { type: "square",                gain: 0.3  }); break;
    case "ladder-firing":  play(660, 180, { type: "sine",     sweepTo: 880, gain: 0.35 }); break;
    case "ladder-lethal":  play(120, 600, { type: "sine",     sweepTo: 95,  gain: 0.55 }); break;
    case "status-apply":   play(220, 120, { type: "triangle", noise: 0.3,   gain: 0.4  }); break;
    case "status-tick":    play(540, 60,  { type: "sine",                  gain: 0.25 }); break;
    case "ui-tap":         play(720, 40,  { type: "square",                gain: 0.25 }); break;
    case "ui-back":        play(360, 60,  { type: "triangle", sweepTo: 220, gain: 0.25 }); break;
  }
}
