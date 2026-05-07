import { Link } from "react-router-dom";

export default function DevComponentsStub() {
  return (
    <main className="safe-pad min-h-svh flex flex-col items-center justify-center gap-6 text-center">
      <h1 className="font-display text-d-1 text-ink">/dev/components</h1>
      <p className="text-muted max-w-prose">
        The component storybook lands in Step 3 of the execution plan — Button,
        HealthBar, CPMeter, DiceTray (with the full tumble + center-stage
        choreography), AbilityLadder (with FIRING / TRIGGERED / REACHABLE /
        OUT-OF-REACH / LETHAL states), StatusTrack, plus the dice playground.
      </p>
      <Link to="/dev/tokens" className="px-5 py-3 surface rounded-card text-ink hover:text-brand">
        See tokens →
      </Link>
    </main>
  );
}
