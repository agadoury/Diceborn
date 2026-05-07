import { Link } from "react-router-dom";

export default function PlayStub() {
  return (
    <main className="safe-pad min-h-svh flex flex-col items-center justify-center gap-6 text-center">
      <h1 className="font-display text-d-1 text-ink">PLAY</h1>
      <p className="text-muted max-w-prose">
        The match screen lands in Step 5 of the execution plan. For now, this
        route exists so the router resolves cleanly.
      </p>
      <Link to="/" className="px-5 py-3 surface rounded-card text-ink hover:text-brand">
        Back to menu
      </Link>
    </main>
  );
}
