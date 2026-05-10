# Diceborn — Multiplayer Readiness Audit

**Audit date:** 2026-05-10
**Codebase commit:** `1fcc97e4d8f38a8900663c34e151e55fbf388c54`
**Branch:** `claude/multiplayer-readiness-audit-e0ZnZ`

> Note: the prompt referenced "Pact of Heroes" but `package.json` and source strings name the game **Diceborn**. This report uses Diceborn throughout. Stack confirmed: React 18 + TypeScript 5 + Vite 5 + Zustand 4 + Vitest, with a `tsx`-based headless simulator at `scripts/simulate.ts`.

## Executive summary

**Readiness: GREEN.** This codebase is unusually well-prepared for a server-authoritative multiplayer migration. The engine is a pure reducer (`applyAction(state, action) => { state, events }`) with no browser APIs, no UI imports, and no `Math.random()` calls — randomness flows through a seeded mulberry32 RNG keyed off `state.rngSeed`/`state.rngCursor`. Actions are first-class data (a closed 16-variant `Action` union), the entire match state is plain JSON-serializable data, and components dispatch actions rather than mutate state. A working bot-vs-bot simulator already runs the engine headless under Node via `tsx`.

**Total estimated effort to make the engine multiplayer-ready (excluding the actual server build): ~2–4 solo-dev days.** Most of that is hardening (round-trip serialization tests, an explicit action log, lifting two non-engine `Math.random()`/`Date.now()` calls out of `gameStore`), not refactoring.

**Single most important thing to address:** add a serialization round-trip test (`JSON.parse(JSON.stringify(state))` then continue play with the same action stream) wired into the existing simulator so any future regression in plain-data shape is caught immediately. Everything else is downstream of that guarantee.

---

## Seam 1 — Randomness control

**Status:** ready

**Findings:**
- The engine has its own seeded RNG: `src/game/rng.ts` (mulberry32, `next/nextInt/rollOn/shuffleInPlace`). `state.rngSeed`/`state.rngCursor` are part of `GameState` and advance deterministically.
- **Zero `Math.random()` or `crypto.*` calls inside `src/game/**` or `src/content/**`.** All engine randomness flows through `rollOn`/`nextInt`/`shuffleInPlace` against `state.rngSeed`/`state.rngCursor`. Verified at `src/game/dice.ts:420-427`, `src/game/phases.ts:485-486, 1004-1005`, `src/game/cards.ts:30, 397-399, 837-838`, `src/game/engine.ts:73-74`.
- **Math.random() call sites total: 7.**
  - Engine/content (must be controllable): **0**.
  - UI/animation (fine to leave): 6 — `src/components/effects/HeroBackground.tsx:57-61` (5 ambient particles), `src/components/game/Die.tsx:60` (face-cycle during tumble animation only), `src/audio/sfx.ts:99` (synth noise).
  - Dev/tests: 1 — `src/components/screens/DevComponents.tsx:153` (dev tooling).
- **Two caller-side calls live in the store, not the engine:** `src/store/gameStore.ts:54` uses `Date.now() & 0xffff` as the default match seed, and `src/store/gameStore.ts:55` uses `Math.random() < 0.5` as the default coin-flip winner. Both feed the `start-match` action; the engine itself is deterministic given the action. In multiplayer the server picks the seed and the coin and ships them in `start-match` — no engine change needed.
- The simulator (`scripts/simulate.ts`) already drives `applyAction` with explicit `seed: 42` and reuses that seed across bulk runs — direct evidence the RNG path is fully controllable.
- `coinFlip(seed)` exists and is deterministic (`src/game/rng.ts:66-68`); the store currently bypasses it for the default but the engine is happy with whatever PlayerId you hand `start-match`.

**Estimated effort:** ~2–4 hours. Have the server generate `seed` and `coinFlipWinner` and pass them into `startMatch({...})`; remove the `Date.now()`/`Math.random()` defaults from `gameStore.startMatch`. No engine changes.

---

## Seam 2 — Action-dispatch architecture

**Status:** ready

**Findings:**
- **State management:** Zustand. The match store is a thin wrapper around the pure reducer (`src/store/gameStore.ts:72-82`):
  ```ts
  dispatch: (action) => { const r = applyAction(cur, action); enqueueEvents(r.events); set(...); }
  ```
- **Actions are first-class data.** `Action` is a closed discriminated union of 16 variants (`src/game/types.ts:882-930`):
  `start-match`, `advance-phase`, `toggle-die-lock`, `roll-dice`, `play-card`, `sell-card`, `end-turn`, `respond-to-counter`, `respond-to-status-removal`, `select-offensive-ability`, `select-defense`, `spend-bank`, `decline-bank-spend`, `status-holder-action`, `concede`. Every payload is plain data (numbers, ids, booleans, optional refs to `CardId`/`PlayerId`).
- **Single mutation point.** `applyAction` is the only function that produces a new `GameState` (`src/game/engine.ts:43-66`); it `switch`es exhaustively on `action.kind`. Other call sites of `applyAction` are: `src/store/gameStore.ts:58, 75` (the dispatcher), `scripts/simulate.ts:43, 51` (simulator). No component calls `applyAction` directly.
- **Components dispatch action objects, never mutate state.** Verified at `src/components/screens/MatchScreen.tsx:178, 181, 184, 187, 190, 195, 208, 212`, `src/components/effects/AttackSelect.tsx:32`, `src/components/effects/DefenseSelect.tsx:39`, `src/components/effects/InstantPrompt.tsx:52`. All read-shaped use of the engine from components is via pure helpers (`resolveAbilityFor`, `canPlay`, `stacksOf`, `evaluateLadder`) — preview queries, not state changes.
- **Pseudo-action patterns:** none observed. The store provides exactly two mutation entry points (`startMatch`, `dispatch`), plus `reset`. Components do not import `applyAction`.

**Estimated effort:** ~0 days. The architecture already matches what a server-authoritative multiplayer client needs: shipped actions are JSON, the reducer is pure, side-effects (visuals, audio, haptics) are driven off the returned `events` array, not the action itself.

---

## Seam 3 — Match state serializability

**Status:** ready (with two minor items worth a hardening pass)

**Top-level shape:** `GameState` (`src/game/types.ts:810-877`):
| Field | Status |
|---|---|
| `rngSeed`, `rngCursor`, `turn` | ✅ number |
| `activePlayer`, `startPlayer` | ✅ `"p1" \| "p2"` literal |
| `startPlayerSkippedFirstIncome` | ✅ boolean |
| `phase` | ✅ string-literal union |
| `players: Record<PlayerId, HeroSnapshot>` | ✅ plain record (see below) |
| `pendingCounter?` | ⚠️ `expiresAt: number` is intended as a turn counter (no `Date` semantics observed); field is declared but **never assigned** anywhere in the engine — confirm before relying on it |
| `pendingStatusRemoval?`, `pendingOffensiveChoice?`, `pendingAttack?`, `pendingBankSpend?`, `pendingOffensiveCommit?` | ✅ plain object snapshots; `matches` is `ReadonlyArray` of plain objects |
| `log: LogEntry[]` | ✅ plain (`{ turn, phase, text, t }`); the field is declared but **never written** by the engine — see Bonus B3 |
| `winner?: PlayerId \| "draw"` | ✅ literal union |

**`HeroSnapshot`** (`src/game/types.ts:726-775`): every field is plain data — `hp/cp/hpStart/hpCap` numbers, `dice: Die[]` (length 5, plain), `hand/deck/discard: Card[]`, `statuses: StatusInstance[]` (id + stacks + appliedBy), `upgrades: Record<AbilityTier, number>`, `signatureState: Record<string, number>`, `ladderState: LadderRowState[]` (tagged union), `abilityModifiers/tokenOverrides/symbolBends/pipelineBuffs/triggerBuffs/comboOverrides` arrays of plain objects, `lastStripped: Record<StatusId, number>`, `masterySlots: { 1?, 2?, 3?, defensive? }`, `consumedOncePerMatch/Turn` arrays of strings.

**`Card`** (`src/game/types.ts:458-501`) — full data object (id, hero, kind, name, cost, text, trigger, effect, flags). `effect` and `trigger` are tagged unions, not functions. ✅

**`Die`** — `{ index, faces: readonly DieFace[], current: number, locked: boolean }`. ✅

**Field-by-field problem checklist:**
- ❌ functions on state — none observed.
- ❌ class instances — none. `cloneState` (`src/game/engine.ts:662-700`) shallow-rebuilds plain objects; engine never instantiates a class.
- ❌ circular references — none observed; statuses reference players by `PlayerId` literal, modifiers by `creatorPlayer: PlayerId`.
- ❌ `Map` / `Set` on state — only local-scope `new Map`/`new Set` (e.g. `src/content/index.ts:48`, `src/game/cards.ts:1065`). Never assigned to state.
- ❌ `Date` — engine has zero `Date.now()`/`new Date(...)`/`performance.now()` references.
- ❌ React refs / DOM nodes — none.

**Module-state coupling (worth flagging, not blocking):** status definitions and custom card handlers live in module-scope registries (`src/game/status.ts:138 registerStatus`, `src/game/cards.ts:43 registerCustomCard`). State references them by `StatusId`/`id` strings only — serialization is fine. **But** server and client must load identical hero/card content modules so id resolution agrees on rehydrate. This is an obvious requirement; it's worth an explicit content-registry version check at session start.

**Computed-vs-derived:** `ladderState` is computed by `emitLadderState` and stored on snapshot — this is intentional (the UI reads it), and it's pure data, so it survives serialization. `pendingOffensiveChoice.matches[].baseDamage/shortText` is also pre-computed on the engine side and embedded in state — UI just renders.

**Estimated effort:** ~0.5 day to add a serialization round-trip test (round-trip after every action, run a 100-match bot-vs-bot suite, assert states match). Optional ~2 hours to delete the unused `state.log` field or actually populate it (it's declared but never written).

---

## Seam 4 — Engine portability

**Status:** ready

**Findings:**
- Engine and UI are cleanly separated by directory. `src/game/*` (the engine) is pure TypeScript; `src/components/*`, `src/store/*`, `src/audio/*`, `src/hooks/*`, `src/lib/*` are presentation/transport.
- **Zero browser API references inside `src/game/**` or `src/content/**`.** Searched for `window`, `document`, `navigator`, `localStorage`, `sessionStorage`, `requestAnimationFrame`, `performance.now`, `Date.now`, `new Date(`. Nothing matches.
- **Zero UI imports from engine.** `src/game/**` and `src/content/**` import only from `./` siblings, `../content`, and `./types`. No imports of `@/components`, `@/store`, `@/audio`, `@/hooks`, `@/lib`, `react`, `react-dom`, `framer-motion`, `gsap`, or `howler`.
- The reverse direction is healthy too: `src/audio/library.ts:5` only imports `GameEvent` as a type from `@/game/types`. Components import engine types and pure helper functions, never the other way.
- `src/game/types.ts:1-7` even documents this as a contract: *"Pure TypeScript. No React, no DOM. Runs in Node."*
- **Direct positive evidence:** `scripts/simulate.ts` runs full bot-vs-bot matches via `tsx` under Node, calling `applyAction` and `nextAiAction` directly. `npm run simulate` is a working command. The engine is already proven to execute headless.

**Estimated effort:** ~0 days. Drop the engine modules into a Node/Bun server and they'll run as-is, modulo loading the same content registry on both sides.

---

## Seam 5 — UI / engine boundary discipline

**Status:** ready

**Spot-check (sample of components):**
| Component | Renders | Dispatches | Computes game logic |
|---|---|---|---|
| `MatchScreen.tsx` | ✅ | ✅ (8 dispatches, all action objects) | ❌ |
| `HeroPanel.tsx` | ✅ | — | ❌ |
| `AbilityLadder.tsx` | ✅ | (only via `onFire` prop → parent dispatches) | reads `resolveAbilityFor` (pure preview); sorts by `effectMaxDamage` for visual order only |
| `DiceTray.tsx` | ✅ | — | ❌ |
| `Die.tsx` | ✅ | — | uses `Math.random()` for tumble face cycle (animation only; `current` always coincides with the engine's value once settled) |
| `Hand.tsx` | ✅ | — | reads `canPlay` (pure preview) |
| `ActionBar.tsx` | ✅ | (via parent props) | reads `stacksOf` for stun gating (display) |
| `DamageNumber.tsx` | ✅ | — | ❌ |
| `AttackSelect.tsx` | ✅ | ✅ `select-offensive-ability` | ❌ — renders `m.baseDamage`/`m.shortText` already computed by the engine |
| `DefenseSelect.tsx` / `DefenseStatusPanel.tsx` | ✅ | ✅ `select-defense` | ❌ — uses `pa.incomingAmount` / `resolveAbilityFor` |
| `Choreographer.tsx` | ✅ (drives all visual side-effects from event queue) | — | ❌ — pure event→side-effect mapping |

- **No damage / ability resolution logic in components.** Damage previews come from `pendingAttack.incomingAmount` (engine-computed), ability previews from `pendingOffensiveChoice.matches[].baseDamage/shortText` (engine-computed). When the UI needs to display a derived value (e.g. ability name after a mastery upgrade), it calls the pure read query `resolveAbilityFor(snapshot, ability, "offensive")` rather than re-implementing the rule.
- **One minor smell** — `src/components/screens/DevComponents.tsx:269` calls `evaluateLadder` directly to compute reachability for the dev panel. This is a developer tool, not gameplay UI; safe to ignore for the MP migration.
- "Optimistic" UI patterns: none. The choreographer queues events and gates input on `useInputUnlocked()` (`gameStore.ts:91-96`); the UI is reactive to state, not predictive. This is the cleanest possible starting point for server reconciliation.

**Estimated effort:** ~0 days.

---

## Bonus findings

**B1 — Test coverage of engine.** 5 test files, ~62 cases total under `tests/` (`engine-loads`, `ability-upgrade`, `match-summary`, `deck-storage`, `deck-validation`). Coverage is concentrated on combo grammar, status registry, deck composition, and ability-upgrade transforms — i.e., the small pure pieces. There are **no end-to-end action-stream tests** that drive `applyAction` through a scripted match. Adding (a) a serialization round-trip test and (b) a handful of golden-seed bot-vs-bot determinism tests would meaningfully harden the engine for refactors. ~1–2 days.

**B2 — Determinism guarantees.** Beyond the seeded RNG: no `Date.now()`, `performance.now()`, or `new Date(...)` inside `src/game/**` or `src/content/**`. Iteration over players uses the literal tuple `["p1","p2"] as const`, not `Object.keys(state.players)` (so JS-engine key-order quirks don't bite). Hand/deck/status iteration is by index over arrays. No floating-point math beyond integer dice math and `Math.floor(value * n)` in the RNG. Concern level: low.

**B3 — Action history.** `gameStore.matchLog: GameEvent[]` accumulates every event since match start and is consumed by `match-summary`. That's an *event log*, not an *action log* — replays would need to re-run the original `Action[]` through `applyAction` against the same seed. There's no `actionLog: Action[]` on `GameState` or in the store today. Adding one (push every dispatched action to a store-side array, or onto state for in-engine record-keeping) is a ~½ day task and unlocks: replay tooling, server-client desync detection, post-mortem debugging. Note: `state.log: LogEntry[]` is declared in the type but never written by the engine — either delete it or repurpose it.

**B4 — Performance smell.** Engine is ~6,200 LOC across 9 files, dominated by `phases.ts` (1,458) and `cards.ts` (1,271). Per-action work is bounded by hand size (≤6), deck size (12), abilities (~4–9 per hero), dice (5), statuses (small). I scanned for nested loops in hot paths — none look problematic at these sizes; each could become hot at higher orders but multiplayer doesn't add scale per match. No O(n²) hot path observed.

---

## Recommended sequencing

1. **(½ day) Wire a serialization round-trip into the simulator.** After every `applyAction`, do `JSON.parse(JSON.stringify(state))` and continue from the parsed copy. Run `npm run simulate -- --n 100`. Any divergence is a bug to fix before starting on the server. Highest-leverage thing on this list.
2. **(½ day) Add an explicit action log.** Push each dispatched `Action` to `actionLog: Action[]` on the store (or on state). Also assert at end-of-match: re-running the full `actionLog` against `makeEmptyState()` reproduces the same final state. This is your replay/desync tool.
3. **(2–4 hours) Lift coin/seed defaults out of `gameStore`.** Replace `Date.now() & 0xffff` and `Math.random() < 0.5` in `src/store/gameStore.ts:54-55` with required parameters. The MP server provides them; the single-player path can keep a thin caller that supplies them locally.
4. **(2 hours) Decide on `state.log` and `state.pendingCounter`.** Both are declared in `GameState` and never written. Either implement or remove — leaving dead fields invites confusion when the server starts validating shapes.
5. **(1 day) Add 4–6 golden-seed bot-vs-bot determinism tests.** Match outcome and final state should be byte-identical for a fixed seed across runs. Cheap to write once, catches regressions across every future engine change.
6. **(½ day) Document the content-registry contract.** A short `docs/multiplayer-prep.md` listing the assumption "server and client must load the same hero/card/status content version" with a startup check (e.g., a hash of registered ids exchanged at handshake).

---

## Things you should NOT do yet

- **Do not add a websocket/transport library or any networking code yet.** The engine and store are clean; pulling in `socket.io`/`ws`/Colyseus/Nakama before you have a server target picked will only add coupling to back out.
- **Do not refactor the engine to be "more pure" or split into more files.** It is already pure. Splitting `phases.ts` or `cards.ts` for size alone is yak-shaving.
- **Do not introduce optimistic UI / client-side prediction.** The current "queue events, gate input on drain" model is exactly what reconciles cleanly with a server. Predictive UI is a layer to add *after* the server is real and you've measured perceived latency.
- **Do not build matchmaking, auth, or lobby UI before the dispatch round-trip works over a network.** The minimum viable MP client is "dispatch action → server replies with `{ state, events }` → enqueue events". Get that first; everything else is product scope.

---

## Open questions for the human

1. **Target backend.** Is the plan a custom Node/Bun server hosting `applyAction`, or a managed runtime (Colyseus, Nakama, PartyKit, durable objects)? The engine doesn't care, but it determines whether `state.log` / `actionLog` should live on state (re-broadcast) or in transport (server-side only).
2. **Authoritative seed origin.** Should the server pick the seed once at `start-match` and trust client-derived randomness from `rngCursor` thereafter (current shape), or should the server re-roll on its side and ship dice results as part of its replies? Both work; the first is cheaper and matches today's code.
3. **Hot-seat retention.** Hot-seat mode exists (`MatchMode = "hot-seat" | "vs-ai"`). Will MP coexist with it (offline still works) or replace it? Affects whether the store needs a transport-abstraction layer or just a network mode.
4. **Card/hero versioning policy.** When a card is rebalanced post-launch, do existing in-flight matches keep playing on the version they started with, or does the server force a reload? This drives whether `state` needs a `contentVersion: string` field.
5. **Replay storage.** Are full action logs persisted server-side for replays/spectating? If yes, "Recommended sequencing #2" should write to a server-flushed log rather than just a store array.
