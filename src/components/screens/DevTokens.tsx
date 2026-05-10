import { Link } from "react-router-dom";
import { useState } from "react";
import Logo from "../Logo";

/**
 * /dev/tokens — design-system showcase.
 *
 * Step-1 acceptance gate: this page must render correctly on iPhone 14 Pro
 * (390×844, with safe-area insets respected) and on a 1440px desktop.
 * Every color, type ramp, ease curve, and spacing primitive is on display.
 */
export default function DevTokens() {
  return (
    <main className="safe-pad min-h-svh bg-arena-0 text-ink allow-select">
      <header className="flex items-center justify-between gap-4 mb-6">
        <Link to="/" className="text-muted hover:text-ink text-sm">← Back</Link>
        <h1 className="font-display text-d-2 tracking-widest">DESIGN TOKENS</h1>
        <span className="text-muted text-sm hidden sm:inline">step 1</span>
      </header>

      <Logo className="w-[min(60vw,360px)] h-auto mb-8" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Arena & brand">
          <Swatches items={[
            ["arena-0",   "var(--c-arena-0)"],
            ["arena-1",   "var(--c-arena-1)"],
            ["arena-2",   "var(--c-arena-2)"],
            ["brand",     "var(--c-brand)"],
            ["ember",     "var(--c-ember)"],
            ["cyan",      "var(--c-cyan)"],
            ["dmg",       "var(--c-dmg)"],
            ["heal",      "var(--c-heal)"],
            ["ink",       "var(--c-ink)"],
            ["muted",     "var(--c-muted)"],
          ]} />
        </Section>

        <Section title="Hero accents">
          <p className="text-xs text-muted italic">
            (None registered yet — heroes add their accent color via HeroDefinition.)
          </p>
        </Section>

        <Section title="Type — display (Cinzel)">
          <p className="font-display text-d-1 tracking-widest">PACT OF HEROES</p>
          <p className="font-display text-d-2 tracking-wider">DISPLAY 02</p>
          <p className="font-display text-d-3 tracking-wider">DISPLAY 03</p>
          <p className="font-num text-num-xl">42</p>
          <p className="font-num text-num-l">12</p>
          <p className="font-num text-num-m">3</p>
        </Section>

        <Section title="Type — body (Inter)">
          <p className="text-base">The arena is alive. Banners ripple. Torches flicker.</p>
          <p className="text-sm text-muted">
            Tier 1 lands 75–85%. Tier 2 lands 45–55%. Tier 3 lands 20–30%.
            Tier 4 lands 8–15%. The landing curve is the spine of the game.
          </p>
        </Section>

        <Section title="Surfaces">
          <div className="surface p-4">
            <h3 className="font-display tracking-wider mb-2">Panel</h3>
            <p className="text-sm text-muted">Layered top highlight + bottom shadow + warm-purple drop shadow.</p>
          </div>
          <div className="surface p-4 hero-bg" style={{ ["--hero-accent" as never]: "var(--c-brand)" }}>
            <h3 className="font-display tracking-wider mb-2">Hero-themed surface</h3>
            <p className="text-sm">Driven by --hero-accent — heroes set this at runtime.</p>
          </div>
        </Section>

        <Section title="Motion — eases & durations">
          <MotionDemo />
        </Section>

        <Section title="Spacing & touch targets">
          <div className="flex items-center gap-3 flex-wrap">
            <Box label="44pt"  size="44px"  hint="HIG min" />
            <Box label="56pt"  size="56px"  hint="primary action" />
            <Box label="64pt"  size="64px"  hint="oversized CTA" />
          </div>
        </Section>

        <Section title="Safe-area visualisation">
          <SafeAreaProbe />
        </Section>

        <Section title="Shadows & glows">
          <div className="flex flex-wrap gap-4">
            <ShadowBox label="panel"   className="shadow-panel" />
            <ShadowBox label="die"     className="shadow-die" />
            <ShadowBox label="ember"   className="shadow-ember" />
            <ShadowBox label="brand"   className="shadow-brand" />
          </div>
        </Section>
      </div>

      <footer className="text-muted text-xs mt-10 pt-6 border-t border-arena-1">
        Pact of Heroes / Step 1 / design tokens — these are the source of
        truth for every later screen.
      </footer>
    </main>
  );
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-4 sm:p-5 flex flex-col gap-3">
      <h2 className="font-display text-d-3 tracking-wider text-ember">{title}</h2>
      {children}
    </section>
  );
}

function Swatches({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map(([name, color]) => (
        <div key={name} className="flex items-center gap-2">
          <span
            className="inline-block w-8 h-8 rounded-md border border-white/10"
            style={{ background: color }}
          />
          <div className="text-xs">
            <div className="font-medium">{name}</div>
            <div className="text-muted font-num">{color}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Box({ label, size, hint }: { label: string; size: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-xs">
      <div
        className="rounded-md surface flex items-center justify-center font-num"
        style={{ width: size, height: size }}
      >
        {label}
      </div>
      {hint && <span className="text-muted">{hint}</span>}
    </div>
  );
}

function ShadowBox({ label, className }: { label: string; className: string }) {
  return (
    <div className={`w-24 h-16 bg-arena-2 rounded-card flex items-center justify-center text-xs font-num ${className}`}>
      {label}
    </div>
  );
}

function MotionDemo() {
  const [bumpKey, setBumpKey] = useState(0);
  const eases: { name: string; cls: string }[] = [
    { name: "snap (overshoot)", cls: "ease-snap" },
    { name: "snap-soft",        cls: "ease-snap-soft" },
    { name: "in-quart",         cls: "ease-in-quart" },
    { name: "out-quart",        cls: "ease-out-quart" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setBumpKey(k => k + 1)}
        className="self-start min-h-tap px-4 py-2 surface text-ink hover:text-brand rounded-card font-medium"
      >
        Trigger
      </button>
      <div className="grid grid-cols-1 gap-2">
        {eases.map(e => (
          <div key={e.name} className="flex items-center gap-3 text-xs">
            <div className="w-24 text-muted">{e.name}</div>
            <div className="flex-1 h-3 bg-arena-1 rounded-full overflow-hidden relative">
              <div
                key={`${e.name}-${bumpKey}`}
                className={`absolute inset-y-0 left-0 bg-brand rounded-full duration-700 ${e.cls}`}
                style={{ width: bumpKey % 2 === 0 ? "20%" : "92%" }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-muted text-xs">
        Tap "Trigger" to flip-flop the bars. Use this to feel the difference
        between snap (the die-land bounce) and the standard quart curves.
      </p>
    </div>
  );
}

function SafeAreaProbe() {
  return (
    <div className="relative h-40 bg-arena-1 rounded-card overflow-hidden">
      <div
        className="absolute inset-0 border-2 border-dashed border-brand/60 rounded-card"
        style={{
          marginTop:    "env(safe-area-inset-top)",
          marginRight:  "env(safe-area-inset-right)",
          marginBottom: "env(safe-area-inset-bottom)",
          marginLeft:   "env(safe-area-inset-left)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
        Dashed box = safe area inside this panel.
        On iPhone with the notch, the box should hug the inner edge.
      </div>
    </div>
  );
}
