import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Mobile-first; lg: 1024px is the mobile -> desktop boundary.
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        // Arena
        "arena-0": "var(--c-arena-0)",
        "arena-1": "var(--c-arena-1)",
        "arena-2": "var(--c-arena-2)",
        // Brand & semantic
        brand:   "var(--c-brand)",
        ember:   "var(--c-ember)",
        cyan:    "var(--c-cyan)",
        dmg:     "var(--c-dmg)",
        heal:    "var(--c-heal)",
        ink:     "var(--c-ink)",
        muted:   "var(--c-muted)",
        // Hero accents
        "hero-barbarian":  "var(--c-hero-barbarian)",
        "hero-pyromancer": "var(--c-hero-pyromancer)",
        "hero-paladin":    "var(--c-hero-paladin)",
        "hero-moonelf":    "var(--c-hero-moonelf)",
        "hero-monk":       "var(--c-hero-monk)",
        "hero-ninja":      "var(--c-hero-ninja)",
        "hero-shadow":     "var(--c-hero-shadow)",
        "hero-treant":     "var(--c-hero-treant)",
      },
      fontFamily: {
        display: ["Cinzel", "Georgia", "serif"],
        body:    ["Inter", "system-ui", "sans-serif"],
        num:     ["Rubik", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Display ramp
        "d-1": ["clamp(1.6rem, 5vw, 2.4rem)",   { lineHeight: "1.05", letterSpacing: "0.04em" }],
        "d-2": ["clamp(1.25rem, 4vw, 1.75rem)", { lineHeight: "1.1",  letterSpacing: "0.05em" }],
        "d-3": ["clamp(1.05rem, 3vw, 1.35rem)", { lineHeight: "1.15", letterSpacing: "0.06em" }],
        // Numeric
        "num-xl": ["clamp(2.5rem, 8vw, 4rem)",  { lineHeight: "1",    letterSpacing: "-0.01em" }],
        "num-l":  ["clamp(1.5rem, 5vw, 2rem)",  { lineHeight: "1" }],
        "num-m":  ["1.125rem", { lineHeight: "1" }],
      },
      spacing: {
        // Touch targets
        tap:     "44px",   // HIG min
        "tap-l": "56px",   // primary actions
        "tap-xl":"64px",
        // Safe-area helpers
        "safe-t":"env(safe-area-inset-top)",
        "safe-b":"env(safe-area-inset-bottom)",
        "safe-l":"env(safe-area-inset-left)",
        "safe-r":"env(safe-area-inset-right)",
      },
      borderRadius: {
        die:  "12px",
        card: "10px",
      },
      boxShadow: {
        "panel":   "0 1px 0 rgba(255,255,255,0.06) inset, 0 -1px 0 rgba(0,0,0,0.4) inset, 0 12px 24px rgba(20,8,32,0.45)",
        "die":     "0 2px 0 rgba(0,0,0,0.35), 0 6px 14px rgba(20,8,32,0.5)",
        "ember":   "0 0 24px rgba(245,158,11,0.45)",
        "brand":   "0 0 24px rgba(168,85,247,0.45)",
      },
      transitionTimingFunction: {
        "snap":        "cubic-bezier(.34,1.56,.64,1)",
        "snap-soft":   "cubic-bezier(.22,1,.36,1)",
        "in-quart":    "cubic-bezier(.5,0,.75,0)",
        "out-quart":   "cubic-bezier(.25,1,.5,1)",
      },
      transitionDuration: {
        "hitstop":  "100ms",
        "ladder":   "200ms",
        "tumble":   "900ms",   // mobile baseline
        "tumble-d": "1200ms",  // desktop
      },
      keyframes: {
        "torch-flicker": {
          "0%,100%": { opacity: "0.85" },
          "47%":     { opacity: "0.7"  },
          "53%":     { opacity: "1"    },
        },
        "breathe": {
          "0%,100%": { transform: "scale(1)" },
          "50%":     { transform: "scale(1.015)" },
        },
        "pulse-glow": {
          "0%,100%": { filter: "drop-shadow(0 0 8px var(--glow, currentColor))" },
          "50%":     { filter: "drop-shadow(0 0 18px var(--glow, currentColor))" },
        },
      },
      animation: {
        "torch-flicker": "torch-flicker 2.4s ease-in-out infinite",
        "breathe":       "breathe 4s ease-in-out infinite",
        "pulse-glow":    "pulse-glow 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
