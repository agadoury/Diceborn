/**
 * How To Play — concise rules walkthrough as scrollable cards.
 * Static reference; an interactive in-match tutorial would be v2.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

const SECTIONS = [
  {
    title: "The goal",
    body:
      "Both heroes start at 30 HP. First to 0 loses. Matches run 5–8 minutes — " +
      "roughly 6–8 turns of attacking, defending, and bending the dice.",
  },
  {
    title: "Your turn",
    body:
      "Status effects tick, you draw a card and gain 1 CP, then you play cards " +
      "from hand if you want. Hit ROLL to start your offensive roll. After the " +
      "attack resolves and the opponent defends, you can play follow-up cards, " +
      "then tap END TURN to pass control.",
  },
  {
    title: "Rolling & the ladder",
    body:
      "5 hero dice, up to 3 roll attempts (1 initial + 2 rerolls). Tap a die " +
      "between rolls to LOCK it. The ladder on your hero panel highlights every " +
      "ability you can still reach: FIRING (matched right now), TRIGGERED " +
      "(matched but a bigger one is firing), REACHABLE (% chance with rerolls), " +
      "OUT-OF-REACH (locks make it impossible). LETHAL flag = this kills the " +
      "opponent if it lands. CONFIRM commits the current dice; REROLL keeps " +
      "going if you have attempts left.",
  },
  {
    title: "Picking what to fire",
    body:
      "When the roll ends, every matched ability is offered in a picker — pick " +
      "one to fire, or Pass. You can also tap a FIRING or TRIGGERED row directly " +
      "in your ladder to skip the picker. Each hero has one Tier 4 Ultimate gated " +
      "on rolling all five dice on its face-6 symbol — a once-per-career screenshot " +
      "moment, not a regular play.",
  },
  {
    title: "Defending",
    body:
      "When the opponent attacks you, pick one defense from your ladder (or take " +
      "the hit). The engine rolls that defense's dice once — no rerolls — and a " +
      "banner shows DEFENDED (combo landed, damage reduced) or MISSED (combo " +
      "didn't hit, full damage applies). Undefendable, pure, and ultimate damage " +
      "skip the defense roll entirely.",
  },
  {
    title: "Cards & decks",
    body:
      "Hand of 4 to start, capped at 6 (over-cap cards auto-sell at end of turn " +
      "for +1 CP each). Decks are 12 cards: 4 universal generics + 3 dice-manip " +
      "+ 3 Mastery upgrades (one per ability tier) + 2 hero signatures. Tap a " +
      "card to lift, then PLAY to confirm; tap Sell to convert any card to +1 CP.",
  },
  {
    title: "Status tokens",
    body:
      "Burn / Bleeding tick damage at upkeep. Stun skips your next roll. " +
      "Shield reduces every hit; Protect prevents a flat amount per token; " +
      "Regen heals you at upkeep. Each hero also lays down its own signature " +
      "token (Berserker → Frost-bite, Pyromancer → Cinder, Lightbearer → Verdict) " +
      "with hero-specific rules.",
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
