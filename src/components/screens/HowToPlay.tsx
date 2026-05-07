/**
 * How To Play — concise rules walkthrough as scrollable cards.
 * (Step 10 ships this static reference. The fully-interactive 6-step
 * tutorial described in §10 is a v2 enhancement.)
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

const SECTIONS = [
  {
    title: "The goal",
    body: "Both heroes start at 30 HP. First to 0 loses. Matches typically run 5–8 minutes.",
  },
  {
    title: "Your turn — 5 phases",
    body:
      "1. Upkeep (status effects tick) → 2. Income (+1 CP, +1 card) → " +
      "3. Main (play cards / sell for CP) → 4. Offensive Roll (up to 2 attempts) → " +
      "5. Defensive Roll (auto). Then Main resumes for follow-up plays. Tap END TURN to pass.",
  },
  {
    title: "Dice & abilities",
    body:
      "5 hero dice. Each turn you get up to 2 roll attempts. Tap a die between rolls to LOCK it. " +
      "After your final roll, the engine fires the highest-tier ability your dice satisfy.",
  },
  {
    title: "Reading the ladder",
    body:
      "Tier 4 (Ultimate) at top → Tier 1 at bottom. Rows light up as you roll: " +
      "FIRING (will trigger now), TRIGGERED (matched but eclipsed), REACHABLE (% chance), " +
      "OUT-OF-REACH (locked dice make this impossible). LETHAL flag = this kills the opponent.",
  },
  {
    title: "Status tokens",
    body:
      "Burn / Bleeding / Smolder ticks at upkeep. Stun skips your next roll. " +
      "Protect prevents 2 dmg per token. Shield reduces every hit. Regen heals at upkeep. " +
      "Each MVP hero applies a unique signature token.",
  },
  {
    title: "Cards",
    body:
      "Tap a card in hand to lift it; tap PLAY to confirm. Sell any card for +1 CP. " +
      "Hand caps at 6 — over-cap cards auto-sell at end of turn.",
  },
];

export default function HowToPlay() {
  return (
    <main className="safe-pad min-h-svh bg-arena-0 text-ink">
      <header className="flex items-center justify-between gap-3 mb-4">
        <Link to="/" className="text-muted hover:text-ink text-sm">← Home</Link>
        <h1 className="font-display text-d-2 tracking-widest">HOW TO PLAY</h1>
        <span className="w-12" />
      </header>

      <div className="max-w-2xl mx-auto space-y-3">
        {SECTIONS.map((s, i) => (
          <section key={s.title} className="surface rounded-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center w-8 h-8 rounded-full bg-brand text-arena-0 font-num font-bold shrink-0">
                {i + 1}
              </span>
              <div className="flex-1">
                <h2 className="font-display tracking-wider text-d-3 text-ember">{s.title}</h2>
                <p className="text-sm text-ink/85 mt-1 leading-relaxed">{s.body}</p>
              </div>
            </div>
          </section>
        ))}

        <div className="flex justify-center pt-4">
          <Button variant="primary" size="lg">
            <Link to="/heroes?mode=vs-ai">Play vs AI</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
