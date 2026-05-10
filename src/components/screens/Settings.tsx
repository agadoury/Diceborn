/**
 * Settings — minimal per §16: master mute, SFX volume, music volume,
 * reduced-motion override, haptics toggle.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { audio } from "@/audio/manager";
import { useHaptics } from "@/hooks/useHaptics";
import { Button } from "@/components/ui/Button";

export default function Settings() {
  const [muted, setMuted] = useState(audio.isMuted());
  const [sfxVol, setSfxVol] = useState(audio.getSfxVolume());
  const [musicVol, setMusicVol] = useState(audio.getMusicVolume());
  const [hapticsOn, setHapticsOn, hapticsSupported] = useHaptics();
  const [reducedOverride, setReducedOverride] = useState<"system" | "off" | "on">(() => {
    if (typeof localStorage === "undefined") return "system";
    return (localStorage.getItem("pact-of-heroes:reduced-motion") as "system" | "off" | "on" | null) ?? "system";
  });

  function setReduced(v: "system" | "off" | "on") {
    setReducedOverride(v);
    try {
      if (v === "system") localStorage.removeItem("pact-of-heroes:reduced-motion");
      else                localStorage.setItem("pact-of-heroes:reduced-motion", v);
    } catch { /* */ }
  }

  return (
    <main className="safe-pad min-h-svh bg-arena-0 text-ink">
      <header className="flex items-center justify-between gap-3 mb-4">
        <Link to="/" className="text-muted hover:text-ink text-sm">← Home</Link>
        <h1 className="font-display text-d-2 tracking-widest">SETTINGS</h1>
        <span className="w-12" />
      </header>

      <div className="max-w-md mx-auto space-y-3">
        {/* Master mute */}
        <Row label="Master mute" hint="Silences all SFX without changing volume sliders.">
          <Toggle value={muted} onChange={v => { audio.setMuted(v); setMuted(v); }} />
        </Row>

        {/* SFX volume */}
        <Row label="SFX volume" hint={`${Math.round(sfxVol * 100)}%`}>
          <Slider
            value={sfxVol}
            onChange={v => { audio.setSfxVolume(v); setSfxVol(v); }}
            disabled={muted}
          />
        </Row>

        {/* Music volume */}
        <Row label="Music volume" hint={`${Math.round(musicVol * 100)}%  (Step 9 placeholder)`}>
          <Slider
            value={musicVol}
            onChange={v => { audio.setMusicVolume(v); setMusicVol(v); }}
            disabled={muted}
          />
        </Row>

        {/* Reduced motion */}
        <Row label="Reduced motion" hint="System default follows your OS preference.">
          <div className="flex gap-1">
            {(["system", "off", "on"] as const).map(v => (
              <Button
                key={v} size="sm"
                variant={reducedOverride === v ? "primary" : "secondary"}
                onClick={() => setReduced(v)}
                sound={null}
              >
                {v}
              </Button>
            ))}
          </div>
        </Row>

        {/* Haptics */}
        <Row
          label="Haptics"
          hint={hapticsSupported ? "Vibration cues on dice settles, damage, etc." : "Not supported on this device."}
        >
          <Toggle
            value={hapticsOn}
            onChange={setHapticsOn}
            disabled={!hapticsSupported}
          />
        </Row>
      </div>
    </main>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="surface rounded-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="font-display tracking-wider text-d-3 text-ember">{label}</div>
          {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative inline-flex items-center w-14 h-8 rounded-full transition-colors duration-200
                  ${value ? "bg-brand" : "bg-arena-1 ring-1 ring-white/10"}
                  ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      <span className={`block w-6 h-6 rounded-full bg-ink transition-transform duration-200
                        ${value ? "translate-x-7" : "translate-x-1"}`} />
    </button>
  );
}

function Slider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <input
      type="range" min={0} max={1} step={0.01}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      disabled={disabled}
      className="w-32 sm:w-44 accent-brand disabled:opacity-40"
    />
  );
}
