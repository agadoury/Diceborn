import { Link } from "react-router-dom";
import Logo from "../Logo";

/**
 * Main Menu — minimal stub for Step 1.
 *
 * The full juicy version (animated arena background, torch flicker, low-tempo
 * orchestral hum, big stacked CTAs with hero-accent glows) lands in Step 10.
 * For now this is just the entry point with the logo and routes.
 */
export default function MainMenu() {
  return (
    <main className="safe-pad min-h-svh flex flex-col items-center justify-between gap-8 py-10 hero-bg">
      <header className="w-full flex items-center justify-center pt-6">
        <Logo className="w-[min(80vw,420px)] h-auto" />
      </header>

      <nav className="w-full max-w-sm flex flex-col gap-3">
        <MenuButton to="/heroes?mode=vs-ai"    label="Vs AI" recommended />
        <MenuButton to="/heroes?mode=hot-seat" label="Hot-Seat" />
        <MenuButton to="/loadouts"             label="Loadouts" />
        <MenuButton to="/decks"                label="Deck Builder" />
        <MenuButton to="/how-to-play"          label="How to play" />
        <MenuButton to="/settings"             label="Settings" />
        <MenuButton to="/dev/tokens"           label="Design tokens" subtle />
        <MenuButton to="/dev/components"       label="Component storybook" subtle />
      </nav>

      <footer className="text-muted text-sm text-center pb-2">
        Pact of Heroes — fan project. Step 1 scaffold.
      </footer>
    </main>
  );
}

function MenuButton({
  to, label, recommended, subtle,
}: { to: string; label: string; recommended?: boolean; subtle?: boolean }) {
  const base =
    "block w-full text-center font-display tracking-wider rounded-card transition-colors duration-200";
  const size = "min-h-tap-l px-5 py-4 text-d-3";
  const tone = subtle
    ? "surface text-muted hover:text-ink"
    : recommended
      ? "bg-brand/90 text-arena-0 shadow-brand hover:bg-brand"
      : "surface text-ink hover:text-brand";
  return (
    <Link to={to} className={`${base} ${size} ${tone}`}>
      {label}
      {recommended && <span className="ml-2 text-xs font-body uppercase opacity-70">recommended</span>}
    </Link>
  );
}
