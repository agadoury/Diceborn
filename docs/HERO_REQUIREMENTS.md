# DICEBORN — Hero Creation Requirements

> **You are designing a brand-new, original hero for Diceborn — a 1v1 dice-and-card combat game.** This document is your full brief: the game's constraints, the engine's mechanical primitives, the originality rules, the output format, and a self-check list. Read all of it before you start designing. Output the filled-in template at the end.

---

## 1. Project context (what Diceborn is)

Diceborn is a digital, mobile-first 1v1 game built around custom dice and cards. Each hero rolls 5 hero-specific dice (each with 6 faces) on their offensive turn, locks any combination between rolls (up to 3 roll attempts total), and the highest-tier dice combo their hero recognises fires that ability. Cards manipulate dice, modify abilities, or play standalone effects. Match length target: 5–8 minutes, roughly 6–8 turns.

The engine, choreographer, audio, UI, and screens are already built. Heroes are pure data — your spec gets converted into a `HeroDefinition` TypeScript module and dropped into the codebase.

---

## 2. Hard game constants (you cannot change these)

| Constant | Value |
|---|---|
| Starting HP | 30 |
| Max HP | 40 (start + 10 heal cap) |
| Starting CP | 2 |
| Max CP | 15 |
| Starting hand | 4 cards |
| Hand cap | 6 (over-cap auto-sells for +1 CP each at end of turn) |
| Dice per hero | 5 (all identical) |
| Faces per die | 6 (numbered 1 through 6) |
| Roll attempts per offensive turn | 3 |
| Ability tiers | 4 (Tier 1 Basic, Tier 2 Strong, Tier 3 Signature, Tier 4 Ultimate) |
| Cards in hero deck | ~12 |

**Selling cards:** any card in hand can be sold for +1 CP at any phase the player has the floor.

---

## 3. Originality rules — read this carefully

Diceborn is a fan project that explicitly avoids reproducing creative content from published commercial games. The mechanical patterns (dice + cards, tier-based abilities, combo grammar, status tokens) are public game mechanics, not copyrightable. **The hero contents you design — names, ability rosters, card kits, dice compositions, signature mechanics — must be original creations, not transcriptions or translations of any published game's hero boards.**

### Specifically:

- **Do NOT reference, transcribe, paraphrase, or translate any published game's hero boards.** This includes (non-exhaustive list): the Dice Throne game by Roxley/Nerd Ninjas, the Quarriors family by Wizkids, the Roll Player family, any video-game character ability set, any TTRPG class ability list, etc.
- **Do NOT use ability or card names that are clearly drawn from a published game.** Names like *Strike, Resolute Strike, Powerful Blow, Overpower, Critical Strike, Reckless, RAGE!, Thick Skin, Patience, Scorch, Fire Blast, Flamewall, Inferno, Pyroclast, Meteor, Pyroblast, Smite, Righteous Blow, Consecrate, Holy Strike, Divine Wrath, Redemption, Judgment Day, Lay on Hands, Divine Barrier, Wall of Faith, Battle Focus, Bloodthirst, Cleave, Berserk, Trophy Pole, Last Stand, Stoke the Flames, Heat Wave, Phoenix Form, Final Burn, Sanctuary, Aegis, Vow* are all directly traceable to a published Dice Throne hero board and must NOT be used. If a name you're considering feels like something you've seen in a TTRPG or video game, swap it for an original phrase.
- **Do NOT pick obvious mainstream-fantasy archetypes** (Barbarian, Pyromancer, Paladin, Wizard, Cleric, Rogue, Monk, Ranger). These map directly to existing TTRPG/digital-game character lineups and bias the design toward known ability rosters. Pick something more lateral.
- **Do NOT design dice compositions that mirror published hero boards** (e.g. *3 sword + 2 vitality + 1 strength*, *2 flame + 2 spark + 1 ember + 1 pyroblast*, *2 hammer + 2 shield + 1 heal + 1 divine* are all from the published Dice Throne hero boards).
- **Do NOT use signature mechanics or token names that trace to published games.** RAGE-on-low-HP, IGNITE-on-hit, DIVINE FAVOR-on-defense, Bleeding, Smolder, Judgment all trace to published Dice Throne. Invent your own.

### Heuristic:

If you find yourself thinking *"this archetype maps to X character from Y game,"* **redirect**. Pick a less obvious archetype. Pick mechanics that don't have a 1:1 analogue.

### Encouraged archetype directions (less mainstream):

A Cartographer · a Beekeeper · a Lighthouse-Keeper · a Distiller · a Glassblower · a Falconer · an Astronomer · a Stevedore · a Ferryman · a Mortician · a Locksmith · a Cooper · a Watchmaker · a Gravedigger · a Fishmonger · an Acrobat · a Storm-Caller · a Mushroom-Forager · a Tax-Collector · a Tide-Tracker · a Knot-Tier · a Bell-Ringer · a Quarry-Cutter — anything that doesn't have a famous pre-existing video-game hero or TTRPG class.

You can absolutely design a hero who is mechanically aggressive, defensive, or DOT-focused — those are mechanical archetypes, not specific character archetypes. Just hang the hero on an unusual concept.

---

## 4. Engine primitives — what mechanics are available

These are the building blocks the engine recognises. Design within these unless you know you need a custom escape hatch (see "Custom logic" at the end).

### 4.1 Combo grammar (dice requirements)

A combo specifies what dice configuration triggers an ability.

| Kind | Meaning | Notes |
|---|---|---|
| `symbol-count` | "N or more dice showing this symbol" | Counts dice whose face has the given symbol — useful when multiple faces share a symbol category |
| `n-of-a-kind` | "N dice all showing the same face value" | Strict face-value match (e.g. 4 sixes). N is 2–5 |
| `straight` | "A run of consecutive face values" | `length: 4` = small straight, `length: 5` = large straight |
| `compound and` | "All of these conditions hold" | Pass an array of sub-combos |
| `compound or` | "Any of these conditions hold" | Same |

**Examples:**
- *"3 dice showing the **slate** symbol"* → `symbol-count: slate, count: 3`
- *"4 dice all showing the same face value"* → `n-of-a-kind, count: 4`
- *"A small straight (4 consecutive values)"* → `straight, length: 4`
- *"3 of the **shell** symbol AND a small straight"* → `compound and: [{symbol-count shell, 3}, {straight 4}]`

### 4.2 Effects (what abilities/cards do)

| Effect | Meaning |
|---|---|
| `damage` | Fixed damage. Specify amount + damage type (`normal` / `undefendable` / `pure` / `ultimate`) |
| `scaling-damage` | Damage that grows with how many extra dice contribute beyond the combo's minimum. Specify base, perExtra, maxExtra |
| `reduce-damage` | Defensive — reduce incoming damage by amount (defensive ladder only) |
| `heal` | Heal a target (self or opponent) by amount |
| `apply-status` | Apply N stacks of a status token to target (self or opponent) |
| `remove-status` | Strip up to N stacks of a status from target |
| `gain-cp` | Add N CP to caster (clamped to 15) |
| `draw` | Draw N cards |
| `compound` | Multiple effects in sequence |
| `custom` | Escape hatch — describe in plain English, will be hand-written |

**Damage type semantics:**
- `normal` — defender's defensive ability can reduce or block it
- `undefendable` — bypasses defensive abilities (still affected by Shield/Protect tokens)
- `pure` — bypasses everything except direct status modifiers
- `ultimate` — same as normal but reserved for Tier 4 (triggers full screen cinematic)

### 4.3 Status tokens (built-in universal pool)

These are pre-registered in the engine. Any hero can apply them.

| Token | Type | Behaviour |
|---|---|---|
| `burn` | debuff | Ticks 1 dmg/stack at holder's upkeep, decrements 1. Stack limit 5. |
| `stun` | debuff | Holder skips their next offensive roll. Single-use, stack limit 1. |
| `protect` | buff | Each token prevents 2 damage on incoming hit. Stack limit 5. |
| `shield` | buff | Reduces incoming damage by 1 per stack flat. Stack limit 3. |
| `regen` | buff | Heals 1 HP/stack at holder's upkeep, decrements 1. Stack limit 5. |

You can also design **your own signature token** — give it a name, a stack limit, a tick behaviour ("ticks at holder's upkeep" / "ticks at applier's upkeep" / "never ticks (consumed by other rules)" / "fires on a specific trigger"), an effect per stack (damage, heal, mitigation), and an optional on-removal effect (e.g. "ignites for +2 dmg when removed").

Token names should be descriptive and original — not Bleeding/Smolder/Judgment (those trace to a published game).

### 4.4 Cards

Each hero ships ~12 cards. Categories:

| Kind | Playable when |
|---|---|
| `main-phase` | During the active player's Main phase only |
| `roll-phase` | During the active player's Offensive Roll phase (between rolls) |
| `instant` | Any time — auto-prompts both players after qualifying events (damage, ability fired, ultimate, defense, status applied). 1.5s window to respond. |

Cards have: `id` (slug like `myhero/card-name`), `name`, `cost` in CP (0–5 typical), `kind`, `text` (player-facing rules), `effect` (any of the effect primitives above, or `custom` with a plain-English description).

### 4.5 Signature passive

Each hero declares a signature mechanic — one mechanically distinctive thing they do that no other hero does. Examples of mechanic *categories* the engine can hook into:

- **Per-upkeep behaviour** — e.g. "if HP is below threshold, gain a stack of something"
- **On-hit-landing behaviour** — e.g. "every successful offensive ability also applies a token"
- **On-defense behaviour** — e.g. "successful defenses bank a resource the hero can spend later"
- **On-resource-tick behaviour** — e.g. "every time a status ticks on opponent, hero gains CP"
- **On-card-played behaviour** — e.g. "first card played each turn costs 0"

Describe yours in plain English. The engine has flexible dispatch — a custom handler can be wired for any reasonable shape.

### 4.6 Defensive ladder (optional)

Heroes can declare a separate ladder of defensive abilities (auto-resolved when attacked). Same combo grammar, same picker rules (highest tier matched, then highest reduction). Effects are typically `reduce-damage`, `heal`, or `apply-status` (e.g. apply a token to the attacker).

If you don't declare a defensive ladder, the engine falls back to "1 damage reduced per shield-symbol face the defender rolls."

---

## 5. The four uniqueness pillars (use these to differentiate heroes)

Every hero must be distinct on **all four** axes — otherwise heroes feel interchangeable.

| Pillar | Question to answer |
|---|---|
| **Dice identity** | What do this hero's dice DO differently? Not just different symbols — different probability distributions, different "meanings" per face. What does it feel like to roll these dice? |
| **Resource identity** | How does this hero spend and earn CP? What rewards aggressive play vs. setup play vs. defensive play? |
| **Win-condition identity** | How does this hero intend to close out a match? Burst damage? DOT accumulation? Outlasting? Combo setup? Different heroes should play to different match rhythms. |
| **Signature mechanic** | One thing only this hero does. Not a stat tweak — a genuinely distinct mechanical hook. |

If two heroes' games feel similar — *"I roll for damage, opponent rolls for damage, lower HP loses"* — they've failed.

---

## 6. Tuning targets (for landing rates and damage)

The simulator will validate your ability landing rates after implementation. Aim for these bands:

| Tier | Target landing rate | Damage envelope | Role |
|---|---|---|---|
| **Tier 1 (Basic)** | 75–95% | 3–7 dmg | "I always do something" — fires nearly every turn |
| **Tier 2 (Strong)** | 45–70% | 5–9 dmg | "I'm playing well" — every other turn |
| **Tier 3 (Signature)** | 20–45% | 9–13 dmg | Big swing — earned, not expected |
| **Tier 4 (Ultimate)** | 8–25% | 13–18 dmg | Once or twice per match (full cinematic moment) |

**Damage scaling rationale (30 HP):** average damage per turn should land near 5 HP so matches resolve in 6–8 turns. Single hits over 18 dmg should be very rare (one-shot risks).

**Multi-ability per tier is fine** — heroes can have 2 abilities at the same tier with different combos. The engine fires whichever is matched (highest-damage among ties).

---

## 6.5 Presentation primitives — what the renderer / choreographer / audio layer can take

The mechanics above (combos, effects, statuses, cards) are the **rules engine** layer. Diceborn also has a **presentation** layer that gives each hero atmospheric weight: a tinted background, a portrait that reacts to game state, glyphs on each die face, per-ability cinematics, and audio cues. None of these are required for a hero to be playable — but a hero that fills them in feels finished.

| Layer | What you can specify |
|---|---|
| **Lore** | Name origin, backstory paragraph, personality, motivation, voice register (gruff / formal / playful / cryptic) |
| **Visual identity** | Accent hex (already in core), secondary palette (1–2 supporting hexes), background motif (tundra / forge / cavern / orchard / observatory / wharf), atmospheric particle behaviour (drift direction, density, hue), silhouette posture (looming / coiled / poised / hunched) |
| **Die-face rendering** | A glyph idea or short SVG description per unique symbol (renderer will produce the actual SVG), a tint hex per symbol |
| **Hero portrait reactive states** | What the portrait does at: full HP / mid HP / low HP (≤10) / when an Ultimate is charging / on victory / on defeat. Can be subtle (eye-glow shift) or dramatic (whole pose change) |
| **Per-ability cinematics** | For each ability: a short camera/FX brief (e.g. "screen tilts left, three vertical slash streaks across centre, opponent flinches right; audio is 3 quick metal-on-bone hits"). Tier 4 should describe a full-screen cinematic moment (1.5–3s) |
| **Audio identity** | A signature one-shot motif (3–6 notes, instrument family), per-event bark line snippets (hero rolls / hero lands T3 / hero lands T4 / hero takes lethal / hero wins), ambient bed under the hero's screen (wind / hearth / dripping / clockwork) |
| **Status visuals** | If you defined a signature token, what it looks like on the HUD (icon idea, animation when applied — slam-in / fade-in / spiral) |

These fields go into the optional **PRESENTATION** block in the template below. Skip any field with `(skip)` if you don't have a strong opinion — defaults will be used.

---

## 7. Required output template

Fill this in for ONE hero. Paste back exactly this format. Sections marked **CORE** are required for a playable hero; sections marked **PRESENTATION** are optional but strongly recommended for a hero that feels finished.

```
=== HERO === [CORE]

ID:           <lowercase-slug>          (e.g. "tide-tracker", not a published character)
NAME:         <DISPLAY NAME>            (all caps)
ARCHETYPE:    <one of: rush | control | burn | combo | survival>
COMPLEXITY:   <1–6>                     (1 = teach-the-game, 6 = expert)
ACCENT:       #xxxxxx                   (primary hex color matching hero's vibe)
QUOTE:        "<one short line>"        (hero's catchphrase)

=== LORE === [PRESENTATION]

Origin:       <one or two sentences — where this hero is from, what shaped them>
Personality:  <one sentence — how they speak, what they value, what cracks them>
Motivation:   <one sentence — why they fight>
Voice:        <gruff | formal | playful | cryptic | weary | feverish | other>

=== VISUAL IDENTITY === [PRESENTATION]

Secondary palette:  #xxxxxx, #xxxxxx           (1–2 hexes that pair with ACCENT)
Background motif:   <tundra | forge | cavern | orchard | observatory | wharf | other>
Particle behaviour: <e.g. "snow drifting down-left, sparse" / "ember sparks rising, dense">
Silhouette posture: <looming | coiled | poised | hunched | sprawled>
Signature motif:    <a recurring visual element — e.g. "frost cracks", "running ink", "candle flames", "tally marks">

=== DICE === [CORE]

Description: <one sentence on the overall feel of this hero's dice>

Face 1: symbol="<id>:<sym-a>"  label="<WordA>"   glyph="<short visual idea>"  tint=#xxxxxx
Face 2: symbol="<id>:<sym-a>"  label="<WordA>"   (faces can share a symbol — same glyph/tint)
Face 3: symbol="<id>:<sym-b>"  label="<WordB>"   glyph="<...>"                tint=#xxxxxx
Face 4: symbol="<id>:<sym-b>"  label="<WordB>"
Face 5: symbol="<id>:<sym-c>"  label="<WordC>"   glyph="<...>"                tint=#xxxxxx
Face 6: symbol="<id>:<sym-d>"  label="<WordD>"   glyph="<...>"                tint=#xxxxxx

(Symbols are hero-scoped strings. Two faces sharing a symbol means
symbol-count treats them interchangeably; n-of-a-kind / straight still
differentiate by faceValue. Glyph + tint are PRESENTATION — skip with
"(skip)" if you don't have a strong idea.)

=== PORTRAIT REACTIVE STATES === [PRESENTATION]

Full HP (>20):       <one line — what does the portrait look like at rest>
Mid HP (10–20):      <one line — first sign of strain>
Low HP (≤10):        <one line — visibly hurt; this is also when "isLowHp" passives may fire>
Ultimate charging:   <one line — what happens when a Tier 4 combo lands and the cinematic is about to play>
Victory pose:        <one line>
Defeat pose:         <one line>

=== SIGNATURE PASSIVE === [CORE]

Name:        <NAME>           (one or two words)
Description: <one sentence player-facing description>
How it fires (plain English): <when does it trigger, what does it do, what state does it manage>
HUD readout: <how is the current state communicated to the player — e.g. "ring of pips around the portrait, 0–5", "small badge under HP showing the threshold", "screen-edge vignette intensifies"> [PRESENTATION]

=== SIGNATURE TOKEN (optional) === [CORE if present]

If your hero has a unique buff/debuff token they apply, describe it here. Otherwise write "(none — uses universal tokens only)".

ID:           <id>:<token-name>
Display name: <NAME>
Type:         buff | debuff
Stack limit:  <number>
Tick behaviour: <one of: holder's upkeep / applier's upkeep / never ticks / on specific trigger>
Effect per stack at tick: <e.g. "1 dmg" / "1 heal" / "n/a — consumed by …">
On-removal effect: <e.g. "+2 final dmg ignition" / "none">
Visual: <icon idea + slam-in animation — e.g. "dripping red icon, slams in from above with a wet thud"> [PRESENTATION]

=== RESOURCE TRIGGER (optional) ===

How does this hero earn extra CP? Pick zero or more, describe in plain English.

(Examples: "+1 CP whenever an offensive ability lands" / "+1 CP whenever
[your-token] ticks on opponent" / "+1 CP on every successful defense" /
some custom condition you describe.)

=== OFFENSIVE ABILITY LADDER === [CORE; cinematic field is PRESENTATION]

Specify any number of abilities across tiers 1–4. Each on its own block.

[T1] NAME
  Combo:        <plain English; engine primitive (symbol-count / n-of-a-kind / straight / compound)>
  Effect:       <plain English: damage + statuses + heal etc.>
  Damage type:  <normal | undefendable | pure | ultimate>
  Target land:  <range, e.g. 80–95%>
  ShortText:    <one-line ladder display, e.g. "5 dmg + 1 token">
  LongText:     <plain-language combo description for tooltips>
  Cinematic:    <2–3 sentences of camera/FX brief — what plays on screen when this fires.
                 Camera move, particle/streak description, hit-stop intensity, opponent reaction.
                 Audio: instrument family + length, e.g. "two short timpani thuds + glass crack">

[T2] NAME
  ... (same fields)

[T3] NAME
  ...

[T4] NAME           (full-screen Ultimate cinematic — make this feel like a moment)
  Cinematic:    <a fuller brief — 1.5–3s of screen time. Letterboxing, slow-mo, signature
                 motif on display, hero bark line, distinct musical sting. This is the
                 highest-budget animation slot for the hero.>
  Bark line:    "<one short line the hero says when this fires>"

(Multiple abilities at the same tier are fine — useful for offering
strategic flexibility. Picker fires highest-tier matched, then highest-
damage among ties.)

=== DEFENSIVE LADDER (optional) ===

Specify defensive abilities (auto-resolved when this hero is attacked).
Same shape as offensive — combo + effect (typically reduce-damage / heal /
apply-status to attacker).

[T1] NAME
  Combo:    <...>
  Effect:   reduce N dmg + ...
  Land:     <range, e.g. 50–70%>

[T2] NAME      ... (same fields, target ~25–45%)
[T3] NAME      ... (same fields, target ~8–20%)

(If skipped, fallback is "1 dmg reduced per shield-symbol face rolled.")

=== CARDS (~12) ===

Mix of main-phase / roll-phase / instant. Distribution suggestion:
  3 dice manipulation (set a die, reroll, swap, lock-for-free)
  3–5 ability upgrades (permanently boost a specific tier's ability)
  3–5 signature plays (express the hero's identity)
  0–2 instant counter cards (auto-prompt on qualifying events)

For each card:

CARD: NAME
  ID:     <id>/<card-slug>
  Cost:   <0–5 CP>
  Kind:   <main-phase | roll-phase | instant>
  Text:   <player-facing rules text, one or two sentences>
  Effect: <plain English: pick one of: damage / heal / apply-status / remove-status /
          gain-cp / draw / compound / scaling-damage / custom>
  Trigger (instants only): <when it auto-prompts — e.g. "when this hero would take damage" /
          "when opponent fires a Tier 4 ability" / "when opponent removes one of your tokens">
  Notes:  <any custom logic that doesn't fit the standard effects — describe in plain
          English; will be hand-coded as a custom handler>
  Flavor: <one short italic line — flavor text shown under the rules text> [PRESENTATION]
  FX:     <one line — what plays when card is played, e.g. "card slides up, glow pulse,
          quick chime"> [PRESENTATION]

(Repeat for each of the ~12 cards.)

=== AUDIO IDENTITY === [PRESENTATION]

Signature motif:    <3–6 notes + instrument family — e.g. "low cello drone + 3 ascending
                    plucked notes" / "muted brass triplet falling a fifth">
Ambient bed:        <what plays under this hero's screen when it's their turn — e.g. "low
                    wind + distant bell" / "crackling hearth + slow heartbeat">
Bark — on roll:     "<short line>"
Bark — T3 lands:    "<short line>"
Bark — T4 fires:    "<short line — paired with the cinematic above>"
Bark — taking lethal hit: "<short line>"
Bark — victory:     "<short line>"
Bark — defeat:      "<short line>"

=== TUNING / PLAYTEST NOTES === [PRESENTATION]

Expected play pattern:  <2–3 sentences — what does a typical match with this hero look like?
                        When does the hero feel powerful, when do they feel vulnerable?>
Strong matchups:        <hero archetypes this hero beats — "punishes slow control heroes" / "out-trades burst rush heroes">
Weak matchups:          <hero archetypes this hero struggles into>
Anti-pattern warning:   <one or two ways the hero could feel oppressive or feel-bad if mistuned —
                        flag these for the simulator pass>

=== QUICK REFERENCE CARD === [PRESENTATION]

A one-screen at-a-glance summary of the hero. Used for hero-select and reference sheets.
Format as a tight bulleted list — keep each line short.

NAME · ARCHETYPE · COMPLEXITY
Dice: <one-line summary, e.g. "3 axe / 2 fur / 1 howl">
Win condition: <one line>
Signature: <name + 6-word description>
Tier 1: <name + short>      Tier 2: <name + short>
Tier 3: <name + short>      Tier 4: <name + short>
Standout cards: <2–3 names that define the deck>
"<the hero's catchphrase>"
```

---

## 7.5 Field-by-field cheat sheet — what gets used where

So the writer knows what each field becomes when the hero is implemented:

| Template field | Becomes | Used by |
|---|---|---|
| ID | `HeroId` slug | routing, save data, debug |
| NAME | `hero.name` | hero-select, banner, action log |
| ACCENT | `hero.accentColor` | UI theming, glows, button accents |
| QUOTE | `hero.signatureQuote` | hero-select info panel |
| Lore.* | render in HeroSelect info panel + How-To-Play hero pages | content pages |
| Visual identity.background motif | drives `registerAtmosphere(heroId, ...)` config | HeroBackground |
| Visual identity.particle behaviour | particle direction / density / hue in atmosphere config | HeroBackground |
| Dice.glyph + tint | drives `FACE_GLYPHS[symbol]` SVG + `FACE_TINT[symbol]` hex | dieFaces.tsx |
| Portrait reactive states | drives `registerSigil(heroId, render)` with state-aware variants | HeroPortrait |
| Signature passive.HUD readout | drives the per-hero status badge near the HP bar | HeroPanel |
| Signature token.Visual | slam-in animation + icon for the token chip | StatusToken component |
| Ability.Cinematic | drives the ability cinematic + AttackEffect for that ability | Choreographer + AbilityCinematic + AttackEffect |
| Ability T4.Bark line | spoken/displayed in the Ultimate cinematic | AbilityCinematic |
| Card.Flavor | italic line under rules text | Card component |
| Card.FX | brief play animation when the card is dropped | choreoStore + Card |
| Audio identity.Signature motif | the hero's musical sting (plays on hero-select highlight + T4) | audio/sfx.ts |
| Audio identity.Ambient bed | looped bed under the match screen for that player's turn | audio/sfx.ts |
| Audio identity.Bark lines | short audio cues at the listed events | sfx + Choreographer |
| Tuning notes | go into the simulator README + PR description | docs |
| Quick reference card | renders as the HeroSelect info panel + how-to-play summary card | HeroSelect |

If a field is left as `(skip)`, the renderer falls back to a generic default (concentric-circle portrait, plain dot glyph, default screen-shake hit FX, no bark line, etc.). The hero is still fully playable — just less distinctive.

---

## 8. Self-check before submitting

Run through this list. If you can't answer "yes" to all of them, redesign.

- [ ] None of the ability names appear in any published game's character ability list (Dice Throne, Hearthstone, MTG, D&D, video games, etc.). I have done a mental search.
- [ ] None of the card names match published game card names.
- [ ] The dice composition (e.g. *X swords + Y vitality + Z strength*) is not a known published hero board's dice mix.
- [ ] The signature passive concept is not a 1:1 translation of a known published game's mechanic. (Generic patterns like "stacks-at-low-HP" or "DOT-on-hit" are common mechanics, but the *specific* mechanic should be your own design — different threshold, different stack curve, different effect, different name.)
- [ ] The hero archetype is not the obvious mainstream-fantasy character (Barbarian, Pyromancer, Paladin, Wizard, Rogue, etc.).
- [ ] The four uniqueness pillars (dice identity, resource identity, win-condition identity, signature mechanic) all answer different questions. The hero would feel mechanically distinct from any other I might design.
- [ ] Damage numbers fit the 30-HP-match envelope. T1 basics 3–7, T4 ultimates 13–18.
- [ ] Each ability's combo uses an engine primitive (symbol-count / n-of-a-kind / straight / compound). Custom logic is flagged with `[custom]` and described in plain English.
- [ ] All names in the spec (hero, abilities, token, cards) are original.

---

## 9. Tone note

The hero you design should feel **distinctive**, **mechanically interesting**, and **fun to play repeatedly** — not just a stat block. The dice rolls should *mean something* (not just "more damage"), the cards should reinforce the hero's identity, and the signature mechanic should be the thing players remember about them.

Aim to surprise. The most-played heroes in any game are ones with a memorable hook — a single mechanical signature that's both readable in 30 seconds and fun to play with for 30 hours.

---

## 10. Output format

Paste the filled-in template (section 7) directly back to the user. They'll forward it to a separate tool that turns it into TypeScript hero data, validates landing rates against the simulator, and reports any tuning issues for you to address.

Just one hero per submission. If you want to design multiple heroes, design them one at a time — each gets its own simulator pass before the next one is started.
