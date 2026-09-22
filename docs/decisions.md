# Decisions

Short entries, only for things actually decided. See `docs/experiments.md`
(from Phase 8 onward) for gameplay experiments.

## Phase 1

**Renamed `packages/colyseus-contract` to `packages/server-runtime`, and
moved `apps/server/src/app.config.ts` into it.**
Why: the plan's package table gives `server-runtime` the job of owning "the
Colyseus room implementation, actual server definition, sessions and bot
orchestration," with a narrow `/contract` type-only export — not a package
that only holds room classes while the real `defineServer(...)` stays in
`apps/server`. The pre-existing `colyseus-contract` package already did the
"room lives in a package, client imports its type only" half of this; moving
`app.config.ts` in completes it, and is what makes
`client.joinOrCreate("arena")` (no explicit `<Arena>` generic) type-check the
room name against the server's real definitions instead of trusting a
hand-passed type argument.

**Removed `packages/jev` (uncommitted Cloudflare-`ai/run`-based decision
engine sketch) instead of adapting it.**
Why: it predates `Jev_Game_Implementation_Plan.md` and doesn't match its
Phase 7 design (TypeSafe's Choice/Score/Noul primitives, a different
provider contract, different file layout). It was also unreferenced by any
other code and was the sole reason `pnpm lint` failed repo-wide. Handled by
first committing the working baseline (so the sketch stays recoverable in
git history) per the user's explicit choice, then deleting it. Phase 7 will
build the real thing from the plan's spec, not from this leftover.

**Compiled workspace packages, not source-only `exports`.**
Why: `apps/server`'s `tsc` build was already broken for production use
before this phase — `node dist/index.js` couldn't resolve
`@jev-game/shared` / `@jev-game/colyseus-contract`, both of which exported
raw `.ts` source. Section 5 of the plan specifies exactly this fix
(`dist/`-pointing `exports`, dependency-ordered builds). Verified rather
than assumed: a real `node dist/index.js` now serves `/hi` and `/api/hello`;
before the fix it threw `ERR_MODULE_NOT_FOUND` immediately. See
`docs/architecture.md` for the mechanics (typecheck/build ordering, watch
mode, the `noImplicitOverride` fallout).

**Enforced the app/package import boundary with `oxlint` `overrides`, not
just convention.**
Why: the plan calls for "client lint rules [that] permit only a type import
from `/contract`" — a real, ongoing guarantee needs a linter rule, not a
comment. `no-restricted-imports` (already available in this oxlint version)
blocks `apps/client` from importing the bare `@jev-game/server-runtime`
specifier (only `/contract` is allowed) and blocks both `apps/client` and
`apps/server` from importing each other via relative paths.

**Left `apps/server`'s test and loadtest scripts in `apps/server`, only
updating their imports.**
Why: moving them into `packages/server-runtime` would be a bigger diff for
no behavioral gain in Phase 1 — apps are allowed to import types/values from
packages (that's normal), just not from each other. Revisit only if
`server-runtime` grows its own test suite independent of `apps/server`.

**No code comments anywhere from this point on, including in code written
before the rule (stripped retroactively in Phase 1's `contract.ts`,
`main.ts`, `index.ts`, `oxlint.config.ts`).**
Why: the user added "do not ever write comments, you are forbidden" to
`agents.md`/`claude.md` mid-Phase-1 and confirmed it was intentional. Applies
to code comments; README/docs prose is unaffected. This constrains later
choices below (branded IDs, scenario parsing) that would otherwise have used
a justifying comment.

## Phase 2

**No Phaser yet.** The plan names Phaser throughout (section 1's stack
table, section 4's `game/create-game.ts`), but Phase 1 found it isn't
actually installed — the existing demo is plain DOM/CSS. Phase 2's
acceptance checks (circles approaching, health bars, a selected-unit range
ring, target lines, an event log, clean resets) are all satisfiable with
DOM/SVG, which this repo already has a working, tested pattern for. Adding a
rendering engine before anything needs its specific capabilities (Phase 3's
cast cues, maybe) repeats the Phase-1 esbuild mistake — a dependency added
on the plan's say-so before it was confirmed necessary. Revisit when a
concrete Phase 3+ need (sprite animation, particle effects) shows up.

**No branded ID types (`HeroDefinitionId`, `UnitId`, etc. are plain
`string` aliases).**
Why: the standard branding pattern needs an unchecked type assertion to
manufacture a branded value from a plain string, which the anti-slop lint
config requires a `SAFETY:` comment to justify — precisely what's now
forbidden. Plain aliases still document intent through parameter/field
names; they just don't stop a caller from passing the wrong kind of string
at compile time. Revisit if that gap actually causes a bug.

**`stepBattle(state, catalogue)` takes `catalogue` from Phase 2 onward, even
though Phase 2 doesn't read it.**
Why: Phase 3's abilities need catalogue-driven lookups inside the tick
pipeline (ability definitions aren't baked into `UnitState` the way basic
stats are). Adding the parameter now costs nothing (every call site already
has the catalogue in scope) and avoids changing the signature — and every
caller — again next phase.

**`createBattle` now rejects setups with fewer than two distinct
`teamId`s.**
Why: `evaluateResult` declares a win once exactly one team has living units,
which is vacuously true for a single-team setup on tick 1 — a fabricated
victory, which section 6 explicitly forbids. Caught during Phase 2 review
before any UI could let someone build that setup by hand.

**Lab hero-stat overrides build a fresh `Catalogue` object per reset;
`packages/content`'s `bruiser` constant is never mutated.**
Why: `bruiser` is a module-level singleton shared by the headless runner,
every browser tab, and every past/future reset. Mutating it would corrupt
sibling consumers silently. `catalogueWithOverrides` in
`apps/client/src/session/local-session.ts` copies the hero record and runs
the result back through `packages/content`'s own `validateCatalogue` before
use — lab overrides get the same validation as any other catalogue, for
free.

**Determinism verification covers the event sequence, not just the final
result.** `scripts/simulate.ts` accumulates every event and prints an FNV-1a
digest alongside the tick count and result. Confirmed: identical seed → identical
digest across repeated headless runs, and the browser lab (both at 1x and at
4x speed) reaches the exact same terminal tick, result, and per-tick event
text as the headless run for the same seed and stats. A result-only
comparison would have passed even with event-order drift; the digest
wouldn't.

**Mirror-duel probe confirms no resolution-order bias.** Two identical
bruisers, symmetric spawn positions: `stepBattle` collects all of a tick's
attack proposals before applying any damage, and does not check whether a
proposal's source is still alive before resolving it (only whether its
target is). Result: a genuine mutual-elimination draw with 100/100 damage
dealt, not "team A always wins." Verified via `pnpm simulate duel 1`.

**Scenario export/import (`apps/client/src/dev/scenario-editor.ts`) parses
JSON with plain property access and `Number(...)` coercion, not hand-written
`typeof` guards or a schema library.** Why: the lint config's
`no-runtime-typeof` rule bans typeof-based narrowing outright (even inside
type-guard functions — `allowInTypeGuards` defaults to and stays `false`),
and its intended replacement (parse with a schema library at the I/O
boundary) would mean adding `zod` back for one small feature. Malformed
input naturally fails downstream: bad numbers become `NaN`/`undefined`,
which `validateCatalogue` already rejects with a clear message, and the caller
already wraps `parseScenario` in a `try`/`catch`. Revisit if scenario import
grows real structure (Phase 4's builds, Phase 5's run setups) worth a proper
schema.

**Corrected mid-review: the lab renders to a full-viewport `<canvas>` with
the HUD as an absolutely-positioned overlay on top, not a DOM arena box
sitting next to an HTML sidebar.** The user caught this after the first
pass — "html with elements and a canvas inside" is exactly what section 4's
"ordinary HTML and CSS... alongside the canvas" does *not* mean. Rebuilt
`game/views/arena-view.ts` to own a canvas sized to `window.innerWidth/
innerHeight` (with devicePixelRatio scaling) instead of a bounded DOM box;
`unit-view.ts` became pure `CanvasRenderingContext2D` draw functions instead
of persistent DOM nodes; `battle-view.ts` does hit-testing for unit
selection from canvas click coordinates instead of per-unit click
listeners. The real bug this surfaced: centering the arena across the
*entire* viewport put units directly underneath the opaque HUD sidebar.
Fixed with `SafeAreaInsets` — `arena-view.ts` fits the arena into
`viewport minus insets`, and `battle-lab-scene.ts` computes those insets
from the actual HUD panels' `getBoundingClientRect()` (recomputed on window
resize and on the scenario-editor `<details>` toggling) rather than
hardcoding panel dimensions that would drift from the CSS. Verified: at
1024×768 both units are now visible and centered in the space left of the
sidebar; the same mutual-elimination duel replays identically on the canvas
renderer at both 1x and 4x speed.

**Corrected again: the arena canvas is full-bleed with zero reserved space for
the HUD — `SafeAreaInsets` is gone entirely, not just tuned.** The insets
approach (previous entry) still produced what the user was rejecting: a
visibly bordered game rectangle sitting in the viewport space left over after
carving out full-width/full-height strips for the top, side, and bottom HUD
panels, with dead unused canvas in the strips the panels didn't actually
fill. The user caught this from a screenshot — "I see a clear border around
the game and the HUD is outside it" — the opposite of a real overlay.
`computeTransform` in `arena-view.ts` now fits the arena into the *entire*
viewport (minus a small cosmetic `PADDING_PIXELS` on all sides, not
HUD-shaped insets); `createArenaView`, `createBattleView`, and
`createBattleLabScene` no longer take or compute a `getSafeAreaInsets`
callback, and the `<details>` toggle in `main.ts` no longer needs to dispatch
a synthetic `resize` to recompute anything. Verified: canvas
`getBoundingClientRect()` equals `window.innerWidth`/`innerHeight` exactly at
any viewport size; `pnpm simulate` and the tick/event pipeline are untouched
(only the view-layer fit changed).

**This alone did not fix it, and the entry above originally claimed it did.**
The draft of this entry asserted that units now "render behind a panel and are
still visible through it" — that was never observed, only assumed from the
CSS, and it was false: two things still broke the overlay. (1)
`arena-view.ts` still had a `drawBoundary()` that stroked a 1px rectangle
around the arena bounds — literally "a clear border around the game," the
user's exact words, untouched by the insets work. (2) The canvas painted
nothing but two dots on transparent black, so there was no game surface for a
panel to sit *on top of*; a translucent panel over a void is
indistinguishable from a panel beside a void. Fixed by deleting
`drawBoundary()` outright (not softening it) and replacing it with
`drawFloor()`, which fills the **entire canvas** — `(0,0)` to
`(clientWidth, clientHeight)`, not the arena rect — plus a world-aligned grid
at `GRID_UNITS` intervals extended past every edge. Filling the arena rect
instead would have swapped a stroked frame for a filled one of the same size
and changed nothing. The arena→screen `Math.min` fit is deliberately
unchanged; the arena's edge simply stopped being drawn. Verified by pixel,
not by screenshot (the Browser pane returns ~400px images that can't settle
it): `ctx.getImageData` at the centre of `.hud-tuning`'s bounding rect
returns floor pixels, and all four viewport corners return `rgb(25,25,38)`,
so the surface bleeds off every edge and continues underneath the HUD.

**The HUD is edge-anchored game chrome, not a panel of web form controls.**
Same review thread, after the overlay itself was fixed: the lab still "looked
like a website" because every HUD element was a bordered, rounded, padded
card, the right third of the screen was a permanent `<fieldset>` of labelled
number inputs, and the page had an `<h1>`. Restructured against the user's
Dota Underlords reference: `<h1>` deleted; status became a compact
uppercase pill at top centre (and reads `team A wins` / `draw · timeout`
rather than a `JSON.stringify` of `BattleResult`); transport controls became a
bottom-centre bar of icon buttons with `0.5x/1x/2x/4x` chips replacing the
`<select>`; the event log became a borderless, right-aligned feed with a
fade mask instead of a bordered scrolling `<ul>`; the unit inspector became a
bottom-left card that is `hidden` until something is selected, instead of a
permanent box reading "none — click a unit"; and seed plus the hero-stat
overrides moved into the collapsed `tuning` drawer at bottom right next to
scenario export/import. No new features — the same controls, re-anchored.
The control glyphs are unicode placeholders and are logged in
`missing_assets.md` as an icon request, per the repo rule about missing art.

**One HTML page, not two: the battle lab is `apps/client/index.html` at
`/`; the Phase-1 movement/prediction demo's page is gone.** The user
explicitly rejected having both `index.html` (movement demo) and `lab.html`
(battle lab) as separate Vite entries — "`/lab` should just be `/`."
`lab.ts`/`lab.css` were promoted to `main.ts`/`style.css`; the old
`main.ts`/`style.css` (the demo's DOM wiring and page styling) and
`apps/client/vite.config.ts` (only needed for the two-entry
`rollupOptions.input`) were deleted. `packages/shared`'s `stepEntity` and
the server's `Arena` room stay exactly as they were — Phase 1's networking
proof lives on in git history and isn't otherwise affected; only the
client-side demo page is gone. `pnpm build` now emits a single
`dist/index.html` again.

## Phase 1 + 2 review pass

A read-through against the plan's Phase 1 and 2 sections turned up one live
bug and several gaps against the §6 simulation contract. Fixed in one pass,
each verified rather than assumed:

**`BattleLabSession.getView()` drained `pendingEvents` as a side effect, and
had two call sites.** The scene's render loop called it every tick; `main.ts`'s
`currentScenario()` (used by Export) also called it, for the seed and one
unit's stats. In the current synchronous wiring — `notify()` calls the render
subscriber immediately after every step, before control returns to the event
loop — this turned out not to be reachable via a real click sequence (verified
in the browser: stepped to two attack-hit events, clicked Export, both
events were still in the feed afterward). It was still a real footgun: any
future second consumer, or a render path that isn't perfectly synchronous,
would silently lose events. Fixed by splitting the destructive read from a
plain one — added `peekSnapshot(): { seed, snapshot }` to `BattleLabSession`
for one-off reads, and `currentScenario()` now uses that instead of
`getView()`. `getView()` keeps draining, and now has exactly one caller.

**`packages/game` was not actually sealed against Node, Colyseus or
workspace imports**, contradicting §8.7 ("`game` cannot import browser, Node,
Colyseus or Jev modules"). Verified, not assumed: a probe file importing
`colyseus` and `node:fs` passed both `pnpm typecheck` and `pnpm lint` before
this fix (Node types resolve fine through hoisted `node_modules`, and no lint
rule covered `packages/game`). Added a `no-restricted-imports` override in
`oxlint.config.ts` scoped to `packages/game/**`, blocking `node:*`,
`@colyseus/*`, `colyseus`, common non-prefixed Node built-ins, and any
`@jev-game/*` specifier. Re-ran the same probe file after the fix: both
imports are now flagged. DOM stays out only because no `lib.dom` is
configured — that's unenforced by this change, just already true.

**Phase 1's contract boundary has no client-side consumer left, and the
one-page consolidation didn't clean up after that.** Deleting the movement
demo (per the user's explicit "`/lab` should just be `/`") removed the only
`ColyseusSDK` call site, so two Phase 1 acceptance checks — two clients
connecting, and a deliberately invalid room name/payload failing to compile —
are no longer demonstrable from the working tree. The architecture itself is
intact (`packages/server-runtime` still owns `defineServer`, `/contract`
still exports `GameServer`); this is a loss of verifiability caused by a
correct, requested change, not a design regression. What hadn't been cleaned
up alongside it: `apps/client/package.json` still declared `@colyseus/sdk`,
`@jev-game/shared` and `@jev-game/server-runtime` with no source importing
any of them — removed. The `no-restricted-imports` override guarding
`apps/client`'s import of the server-runtime package root is left in place;
it's not dead, it's a guard rail with nothing to currently violate it, and
removing it would just remove the protection for whenever real networking
comes back.

**§6 contract gaps, each closed:**

- *No seeded resolution-priority order.* Attack proposals were sorted
  lexicographically by `sourceUnitId`, so `A-1` always resolved before `B-1`
  — invisible at 2 units (both damage totals land regardless of order) but a
  real systematic bias once Phase 5's multi-unit battles share targets. §6
  asks for "a seeded priority order established at battle creation." Added
  `BattleState.resolutionPriority`: a Fisher–Yates shuffle of unit IDs done
  once in `createBattle`, using the same RNG the state carries forward (the
  RNG was already threaded through and otherwise unused). `stepBattle` sorts
  attack proposals by rank in that order instead of by ID string. Verified:
  same seed produces the same priority order across two separate
  `createBattle` calls; the duel's result, tick count and per-unit damage are
  unchanged (297 ticks, 100/100, mutual elimination) but the event digest
  changed, as expected, because event order is no longer ID-derived.
- *HP/damage weren't required to be integers.* `validateCatalogue` now
  requires `maxHp`, `attackDamage` and `attackIntervalTicks` to be positive
  integers (range and move speed stay continuous — they're world units and
  units/second, not counts). `applyDamage` now rounds its input, per §6's
  "rounding specified in the calculation function." The lab's tuning inputs
  round `maxHp`/`attackDamage`/`attackIntervalTicks` to the nearest integer
  before calling `session.reset()`, so a typed `10.5` can't reach
  `validateCatalogue` and throw out of an unguarded click handler — the
  Reset button had no try/catch, unlike Import.
- *Spawns weren't bounds-checked.* `createBattle` validated finiteness but
  not that a spawn lies inside the arena. Added a bounds check; an
  out-of-arena spawn now throws at creation instead of silently clamping on
  the unit's first move.
- *`BattleResult` had no per-unit contribution, and `BattleSnapshot` carried
  no RNG state* — both named as required concepts in §6. Added
  `UnitState.damageDealt`, accumulated in `stepBattle` on every resolved hit;
  each `BattleResult` variant now carries `damageDealt: Record<UnitId,
  number>`, built once when the result is decided. `BattleSnapshot.rng` is a
  `cloneRng`'d copy, never the live reference. `scripts/simulate.ts` now
  prints `state.result.damageDealt` instead of re-deriving it from the event
  log — one source of truth instead of two.
- *`kind: "failure"` was declared but unreachable.* Added the one check §6
  actually asks for — corrupt state, not a missing feature: if any unit's HP
  or position is non-finite when a result is evaluated, the battle ends in
  `failure` with a reason, not a fabricated draw or win. Deliberately not a
  speculative "safety budget" subsystem; the tick limit already is that
  budget (draw on timeout), and no path in the current engine can actually
  produce non-finite state — this is a backstop, verified to compile and
  type-check, not exercised by a real failure yet.
- *Scenario import silently overwrote the version field it claimed to
  check.* `parseScenario` set `version: 1` on its return value regardless of
  what was in the imported JSON. Now it reads `parsed.version` and throws on
  anything other than `1`, so a future format change fails loudly on import
  instead of being silently reinterpreted as the current format.

Edge cases re-verified after all of the above (a throwaway script run from
inside the workspace, then deleted): same-position spawns don't go `NaN`
after 20 ticks; a zero-speed, out-of-range pair times out as a `draw`/
`timeout` at a short custom `tickLimit`; an out-of-bounds spawn now throws;
a non-integer hero stat is rejected by `validateCatalogue`; a 3-unit battle's
`resolutionPriority` is confirmed to be a permutation of its unit IDs and
identical across two `createBattle` calls with the same seed.

Not changed: §17.5 asks for JSDoc on public functions; `CLAUDE.md` forbids
comments outright and wins. `apps/server/src/index.ts`'s Colyseus-generated
banner comment and `packages/server-runtime/src/rooms/arena.ts`'s design-
rationale JSDoc were left as they were — the former says "do not manually
edit this file," and both predate this pass; stripping them is a separate,
explicit ask, not something to fold into a bug-fix pass.
