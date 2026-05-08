/**
 * Banner — top-of-screen toast for turn-started, match-won, etc.
 * Auto-dismisses; controlled by choreographer state.
 */
import { useChoreoStore } from "@/store/choreoStore";

export function Banner() {
  const text = useChoreoStore(s => s.bannerText);
  if (!text) return null;
  return (
    <div className="fixed top-[max(env(safe-area-inset-top),16px)] left-1/2 -translate-x-1/2 z-30
                    px-4 py-2 surface rounded-card text-ink text-sm font-display tracking-wider
                    pointer-events-none animate-[banner-in_240ms_cubic-bezier(.34,1.56,.64,1)]">
      {text}
      <style>{`
        @keyframes banner-in {
          from { transform: translate(-50%, -16px); opacity: 0; }
          to   { transform: translate(-50%, 0);     opacity: 1; }
        }
      `}</style>
    </div>
  );
}
