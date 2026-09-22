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

## Phase 3

**Every hero has exactly one `basicAttackId` plus an ordered `abilityIds`
list; abilities are tried first, the basic attack is the fallback.** The
plan's own phrase — "abilities resolve before its basic attack; by default
it does one of these per tick" — is the spec for this. `bruiser` has no
extra abilities (`abilityIds: []`), so it behaves exactly as it did in
Phase 2. `ranger`'s *basic attack itself* is `bolt` — there's no separate
"ranged ability," the ranged behaviour just *is* what the hero's basic
attack does. `support` has `abilityIds: ["mend"]` with `basicAttackId:
"strike"` as a fallback, so a support with nothing to heal still fights
instead of standing idle — and, just as importantly, still has a
well-defined *engagement range* for movement purposes (see next entry).

**Movement's stop-distance is the unit's basic attack's range, not a flat
per-unit field.** Phase 2's `UnitState.attackRangeUnits` is gone — abilities
can have different ranges from each other (`strike` 10, `bolt` 30, `mend`
8), so "how close does this unit walk before it starts doing anything" had
to become a lookup (`abilities/getEngageRange`) instead of a stored number.
This is also why `ranger` needed *a* basic attack (`bolt` itself) rather
than none: movement always needs an engagement range to approach to.

**`mend` grants a heal *and* a shield in one `AbilityDefinition` (two
effects on the same ability), instead of a fourth ability file.** The plan
lists shield as its own implementation step (10.6) but the starter content
list in section 4 is fixed at three named ability files —
`strike`/`bolt`/`mend`. `AbilityDefinition.effects` was already designed as
an array specifically so one ability can do more than one thing; bundling
the shield onto mend (20 heal + 15 shield/60 ticks) exercises the shield
status mechanism for real, inside the given content budget, rather than
inventing a fourth ability the plan didn't ask for. Recorded here because
it's a real interpretation call, not because it needed the array — the
array was already there.

**The lab's hero-stat override inputs (Phase 2) are removed, not extended
to the new fields.** They don't generalise: overriding "max HP" applied to
*every* hero in the catalogue at once defeats the reason three different
heroes exist. Replaced with a scenario `<select>` (`duel` / `three-vs-three`)
in the same tuning drawer. `LabScenario`'s export/import format changed
shape to match (`{version: 2, seed, scenario}`, dropping `heroOverrides`
entirely) — old exports don't import; `parseScenario` rejects anything but
version 2 rather than silently reinterpreting it, continuing the fix from
the Phase 1+2 review pass. Tuning for the discovery session below now means
editing `packages/content` directly and reloading, which is arguably more
honest for data-driven catalogue content than a live-only input ever was.

**Recording samples every tick and is built incrementally by the live
session, not by re-simulating after the fact.** `packages/game`'s
`recordBattle` (used by `scripts/simulate.ts`'s own verification and
available for headless use) runs a battle start-to-finish and samples a
snapshot after every `stepBattle` call. `apps/client`'s local session does
the equivalent live — it already calls `stepBattle` every tick, so it just
also pushes the resulting snapshot and events onto its own recording
buffers, discarding them on `reset()`. `getRecording()` returns `null`
until `state.result !== null`, so a mid-battle Replay click is a defined
no-op rather than replaying a partial fight.

**Playback is a second, separate `BattleLabSession` implementation
(`createPlaybackSession`), not a mode flag on the live session.** It steps
an index into the recording's frame list instead of calling `stepBattle`,
but exposes the *exact* same interface, so `battle-lab-scene.ts`,
`battle-view.ts` and every HUD panel render it with zero changes. `main.ts`
owns swapping between the two — a `mount()` helper disposes whichever scene
is active and creates a fresh one over the new session. Verified at the
session level (not just by clicking through it once): stepping a playback
session to its own end reproduces the live run's exact terminal tick,
`BattleResult`, and full ordered event list — checked by direct comparison,
not by eye. The DOM-level swap itself (`mount`'s dispose-then-recreate) is
exercised structurally by the pre-existing scenario-import flow, which
takes the same code path; a full 297-tick duel was not manually stepped
through the browser tool just to watch the same swap happen again.

**Units are drawn as distinct shapes by role (circle/triangle/diamond) and
carry a persistent shield ring plus a fading cast-cue ring, instead of only
varying by team colour.** Not asked for by name in the plan's "distinct
cast cues" line, but directly serves it: with three roles now on screen at
once (six units in `three-vs-three`), team-colour-only rendering from
Phase 2 would make bruiser/ranger/support indistinguishable at a glance.
Confirmed in the browser, not assumed: the ranger's long engagement ring
and target line visibly explain its kiting behaviour, and a support's
shield ring is visible on whichever ally it just protected.

**The unit inspector shows ability cooldown state (`ready` / ticks
remaining) and shield status instead of the old flat damage/range chips.**
Those chips read straight off `UnitState.attackDamage`/`attackRangeUnits`,
which no longer exist — the inspector's `update()` now also takes the
current tick (previously just the unit), needed to compute "ticks until
ready" and "ticks of shield left" from the stored absolute tick numbers.

## Phase 3 review pass

An independent review (a second model, given the diff and no prior context)
found two bugs that should have blocked the phase and one place where this
document overclaimed what verification actually showed. Fixed here, not
silently — the point of asking for a cold review was to catch exactly this.

**Movement/HUD showed one target, damage landed on another.**
`resolveTarget` (retaining: keep the current target until it dies) governed
`UnitState.targetUnitId`, which drove movement and everything the HUD reads.
`resolveAbilityTarget`'s `"nearest-enemy"` branch called `findNearestEnemy`
independently — freshly, with no retention — so an ability could fire on
whichever enemy was nearest *this tick*, not the one the unit was shown
approaching. Measured on `three-vs-three` seed 1 before the fix: 18 of 90
casts (20%) hit a different unit than `targetUnitId` named. Fixed by making
`resolveAbilityTarget`'s enemy branch call `resolveTarget` itself, so
movement, the HUD, and damage resolution are now provably the same
lookup — not just conventionally kept in sync by hand.

**`effects.ts` and `step-battle.ts`'s effect dispatch were not exhaustive.**
Both were an if-chain that treated anything that wasn't `"damage"` or
`"heal"` as `"shield"`, with no `default` case. Confirmed empirically: adding
a fourth `EffectDefinition` kind to the type and typechecking passed clean —
the new kind would have silently behaved like a shield at runtime. Rewritten
as `switch` statements ending in `const exhaustive: never = x` (no cast, so
`require-safety-comment-for-type-assertion` doesn't apply), so a future
effect kind fails to compile here instead of misbehaving silently. This is
what the plan's "use exhaustive switches" was actually asking for; the prior
if-chain read as exhaustive but wasn't.

**A fizzled cast (target died to a higher-priority action earlier the same
tick) burned its ability's cooldown and emitted nothing.** The cooldown
burn is correct — section 10's action model consumes the cooldown at
proposal time, before resolution can know the target will still be legal —
but silence wasn't: a support's `mend` could go on a 90-tick cooldown with
no visible cause. Added a `cast-fizzled` event, emitted from the same branch
that used to just `continue`, described in the event feed as "X's Y
fizzled, Z was no longer a legal target."

**Catalogue validation didn't check that an effect's kind matched its
ability's target policy.** A `damage` effect on a `lowest-hp-fraction-ally`
ability (or a `heal`/`shield` effect on a `nearest-enemy` one) would have
validated cleanly and then friendly-fired or healed an enemy at runtime.
`validateAbilities` now rejects that combination by content ID, matching
the existing style of every other check in this file.

**`scenario-editor.ts`'s `parseScenario` had an unannounced implicit
`any`.** `JSON.parse`'s result flowed untyped into `parsed.seed`, and
`Number(parsed.seed)` turned a missing or malformed seed into `NaN`, then
silently into seed `0` on the next `>>> 0` inside `createRng` — a rejection
had turned into a quiet wrong answer. Rewritten with hand-written guards
(`isRecord`, `isFiniteNumber`, `isScenarioKind`, none of them using `typeof`
or `as`, matching this project's existing `no-runtime-typeof` /
`require-safety-comment-for-type-assertion` workarounds) so a malformed
scenario throws instead of importing as seed 0.

**Clicking Step after a battle ends appended a duplicate terminal frame to
the recording.** `stepBattle` early-returns without advancing the tick once
`state.result` is set, but `local-session.ts`'s `stepOnceInternal` pushed a
recording frame unconditionally regardless. Confirmed: three post-battle
Step clicks produced 698 frames instead of 695, the last four all at the
final tick, and playback then stalled on the frozen duplicates. Fixed by
making `stepOnceInternal` a true no-op once `state.result !== null`.

**Reset during Replay silently did the wrong thing.** `createPlaybackSession`'s
`reset()` ignored its `seed`/`scenario` arguments entirely and just rewound
the tape to frame 0 — so the seed field and scenario `<select>` in the
tuning drawer looked live during replay but weren't; the only real way back
to a live battle was the scenario-import textarea. `battle-controls.ts` no
longer calls `session.reset()` directly; it calls an `onReset` callback,
exactly mirroring how Replay already works. `main.ts` now tracks whether
the active session is a replay and, on Reset, either resets the live
session in place (unchanged behaviour) or mounts a brand-new live session
with the chosen seed/scenario (exiting replay mode, which is what the
control looked like it should always have done). `main.ts`'s `mount()` also
now calls the outgoing session's own `dispose()` before dropping it, which
was previously skipped — currently a no-op in practice (both session
implementations' `dispose()` just clear an already-emptied listener set,
since `activeScene?.dispose()` unsubscribes first) but is the correct
lifecycle regardless of what a future session implementation's `dispose()`
ends up doing.

**Correction to this document's own claim: the seed does not exercise
anything the shipped scenarios' outcomes can show.** The RNG's only
consumer is `shufflePriority` (same-tick resolution order among
simultaneous actions); every scenario this project ships
(`duel`/`three-vs-three`/`three-bruisers`) is a mirrored, symmetric
matchup, where within-tick resolution order cannot change who wins, only
(in principle) fine timing — and even that didn't move across 200 sampled
seeds per scenario in testing, all landing on identical tick counts and
`draw: mutual-elimination`. "Run `pnpm simulate three-vs-three 1` twice,
compare digest" genuinely proves same-seed reproducibility (a real,
worthwhile check — it would have caught the Phase 1+2 lexicographic-order
bug this project already fixed once). It does **not** prove the pipeline is
free of new order-dependence, because a symmetric matchup can't distinguish
"order-independent" from "order-dependent but still mirror-cancels." See
`docs/phase-status.md`'s corrected discovery-session entry for what follows
from this for the Phase 4 gate.

**A unit could get permanently stuck exactly at its own engage range,
unable to ever attack.** Found while chasing down why `three-bruisers` (a
same-hero mirror — this project's own established way to catch order/bias
bugs, see `docs/decisions.md`'s earlier entries from the previous game) was
producing a *deterministic win* instead of a draw, on every seed tried.
Traced with a throwaway probe script (written, run, deleted — not left in
the repo): `A-2`'s distance to its target settled at
`10.000000000000004`, `B-2`'s mirror-symmetric distance to its own target
settled at `9.999999999999998` — the same real-world distance, off by
about 6e-15 due to ordinary floating-point rounding in the movement math,
landing on opposite sides of the `> ability.range` check used by
`abilities.ts`'s range test. `movement.ts`'s stop condition
(`distanceToTarget <= engageRangeUnits`) uses the complementary comparison,
so a unit that rounds a hair *over* range stops advancing (it believes
it's arrived) while `proposeAction`'s strict `>` check keeps rejecting it
(it isn't *quite* there) — a self-consistent trap with no way out: the
remaining true distance is sub-ULP, so further movement steps round to no
movement at all. `A-2` sat frozen 10 units from its target for 150 ticks,
unable to land a single hit, while its mirror `B-2` fought normally.
Fixed with a shared `isWithinRange(actualDistance, range)` helper
(`math/vector.ts`, tolerance `RANGE_EPSILON = 1e-6` in `constants.ts`) used
by both the movement stop check and the ability range check, so the two
can no longer disagree about the same boundary. Re-running
`three-bruisers` across seeds 1–5 post-fix now gives an exact mirror
result every time — `draw: mutual-elimination` at tick 392, with
`A-1`/`B-1`, `A-2`/`B-2`, `A-3`/`B-3` damage dealt pairs bit-identical —
confirming the fix, not just plausible reasoning about it. This bug
predates this review pass; it was latent in the original Phase 3 movement/
ability code, just never surfaced by a scenario that put two mirrored
units on the exact same range boundary at the exact same tick until this
investigation ran one. It is not limited to mirror matchups — any unit
whose approach happens to round onto this knife-edge could have gone
silently, permanently idle in a normal fight, which is a worse failure
mode than the deterministic-mirror-win symptom that happened to make it
visible here.

**Not fixed here, and deliberately so: support units rarely reach the ally
they're trying to heal.** `getEngageRange` derives a unit's stopping
distance from its basic attack's range only (`strike`, 10 for support), but
`mend` targets an ally at range 8, and movement only ever chases the
nearest *enemy* — there is no notion of "move toward the ally I'm about to
heal" anywhere in `movement.ts`. Measured (re-verified after the two fixes
above, since both changed simulated behaviour — this is the current
figure): in `three-vs-three` seed 1, 8 of the support's 12 `mend` casts
landed on itself, because the wounded ally was routinely out of range
while the support was still in position to engage the enemy. A real fix
means deciding how a support
should actually behave — stop advancing on the enemy to peel back to a
wounded ally? only when badly hurt? never break formation? — which is a
gameplay call, not a bug fix, and is left open pending that decision rather
than picked unilaterally.

## Phase 4: upgrades that change how builds play

**`HeroBuild` is persistent, `UnitState` is disposable, `compileBuild` is
the only bridge between them.** `packages/game/src/builds/state.ts` holds
`HeroBuild { buildId, heroId, upgrades: {upgradeId, stacks}[] }` — no HP,
position or cooldowns. `create-battle.ts` calls `compileBuild(build,
catalogue)` once per unit at battle start and never touches
`catalogue.heroes`/`catalogue.abilities` directly for stats again;
`UnitSetup.heroId` was replaced outright with `UnitSetup.build` rather than
kept alongside it, so there is exactly one path into a unit's starting
stats, not two that could drift.

Before writing a single upgrade, this refactor alone was checkpointed
against the Phase 3 baseline: a zero-upgrade build must compile to the
hero definition's numbers bit-for-bit, or the compile path itself has a
bug independent of any upgrade content. `pnpm simulate duel 1`,
`three-vs-three 1`, and `three-bruisers 1` all reproduced their
already-committed tick counts, results and event digests exactly
(297/829/392 ticks) before any upgrade or reaction code was written. Only
after that passed did upgrade content get added — the checkpoint is what
makes the numbers below trustworthy as "the upgrades did this," not "the
refactor did this and the upgrades are incidental."

**Stat formula:** `(base + flat) * (1 + percent)`, one function
(`compileStat` in `compile-build.ts`), reused for every stat. One real
bug came out of this while wiring `bonus-damage-vs-slowed`: a percent
modifier multiplying onto a stat whose natural base is `0` (a pure bonus
fraction with nothing to scale) compiles to `0 * anything = 0` — the
upgrade was silently inert. Caught by a probe script that diffed a
bruiser's strike damage with and without the upgrade selected and found
no difference at all, then confirmed by printing `compileBuild`'s output
directly (`slowedTargetBasicAttackDamageBonusFraction: 0`). Fixed by
changing that one modifier from `percent` to `flat` — for a zero-base
stat, "flat" is the only modifier kind that can ever produce a nonzero
result, so any future zero-base stat (a stat with no hero-intrinsic
value to scale) must use `flat`, never `percent`. This is exactly the
"don't let '10% faster' have two meanings" trap the plan warned about,
just one level removed: same formula, but two structurally different
*uses* of "percent" that looked interchangeable and weren't.

**Chain lightning (`bolt` → `chain-damage`) reused the exact ULP-boundary
bug class from the Phase 3 range fix, deliberately guarded against up
front.** Bounce-target selection compares candidate distances the same
way `findNearestEnemy` does, and two mirrored candidates at
geometrically identical distance can differ in the last bits of a
`Math.hypot` result — the same trap that stranded a unit at its engage
boundary last phase. `resolveChainDamage`'s target search
(`packages/game/src/battle/chain.ts`) quantizes distance to
`RANGE_EPSILON` (`Math.round(distance / RANGE_EPSILON)`) before comparing,
then falls back to `unitId` for an exact tie, so two mirrored bounces
can never diverge over sub-micrometer noise. Verified, not assumed: a
probe ran `three-vs-three` across 5 seeds and diffed `A-2`'s bounce
target sequence against `B-2`'s (with team labels swapped) — identical
every time. Also verified `bolt` actually chains at all (12 of 18 casts
in one run hit more than one target) and that at most one hit lands per
target per cast (enforced by the `visited` set in `resolveChainDamage`,
not just claimed).

**`slow` reuses `shield`'s exact expiry convention on purpose.** One
comparison site (`expiresAtTick > tick` = not yet expired), run in the
same per-tick pass as shield's, and the bonus-damage check at
damage-resolution time is a plain `target.slow !== null` — it does not
re-derive "is this still active" with its own `>=`/`>` comparison. Two
comparison sites for one boundary is what produced the Phase 3
movement/ability disagreement; this phase's slow status was written to
never have that seam.

**Reactions run through a drained queue, not recursion.** Every job
carries a `rootActionSequence` and a `depth`; `processReactionQueue`
(`packages/game/src/battle/reactions.ts`) dequeues with `Array.shift`
inside a `while`, checking `depth > MAX_REACTION_DEPTH` (4) and a total
`MAX_REACTIONS_PER_TICK` budget (16) before doing any work, so a runaway
chain aborts instead of blowing the stack or looping forever. None of
the six shipped upgrades can actually trigger a cycle — the only
reaction fires on `after-heal-effect` and produces a `shield` effect,
which is not itself a heal, so it structurally cannot retrigger its own
trigger. That means the safety mechanism has no real content that
exercises it under normal play. It was verified anyway, directly: a
synthetic queue of 20 jobs (16 at depth 1, 4 at depth 10) was fed straight
into `processReactionQueue` outside of any battle, and it correctly
processed exactly 16 jobs, emitted a `reaction-budget-exceeded` diagnostic
naming the offending root action and the depth reached, then stopped —
proving the abort path works even though shipped content can't reach it.
`step-battle.ts` turns that into a `failure` result with
`reason: "reaction budget exceeded"` and a `reaction-budget-exceeded`
event before `battle-ended`, matching the plan's "ends the lab scenario
with a diagnostic" requirement. The plan's parallel requirement — "aborts
an online battle without changing run health" — doesn't apply yet; there
is no online battle or run-health concept until Phase 5/6, so that half is
deliberately not built.

**`mend` gave up its baked-in shield; the shield is now what "healing
that also grants a shield" buys you.** Phase 3 shipped `mend` as
heal-and-shield in one ability because a fourth ability file wasn't
justified yet. The plan's own upgrade list assumes a heal-only base with
an upgrade that adds the shield, so Phase 3's shortcut had to be undone:
`mend`'s effects are now `[{kind: "heal", amount: 20}]` only. The shield
comes back through a real reaction (`mend-shield`, trigger
`after-heal-effect`), granted by the `healing-that-also-shields` upgrade,
whose own flat stat-modifier (`value: 15`) supplies the reaction's base
shield amount — there is no bare "15" living in the reaction definition
itself, so the granting upgrade's flat contribution *is* the base, and
`stronger-shield`'s percent modifier (gated behind
`healing-that-also-shields` as a prerequisite) multiplies onto exactly
that, giving `15 * 1.5 = 22.5 → 23` at one stack. This is a genuine
Phase 4 content rebalance, not a silent edit: it changes `three-vs-three`
seed 1's baseline from 829 ticks / `50, 190, 120` damage to **379 ticks /
`50, 170, 90`** (removing the periodic shield from every unmodified
support materially shortens the mirror fight — explicable, not a bug: a
15-point shield reapplied roughly every 90 ticks was absorbing a
meaningful share of chip damage across the whole match). `duel` and
`three-bruisers` are untouched (neither scenario uses a support), and
were reconfirmed identical to their already-committed numbers
(297 / 392 ticks) as part of the same re-verification pass.

**The six upgrades, and one deliberate exclusion:**
`more-max-hp` (any hero, +15 flat HP, stacks 3) and `faster-attacks` (any
hero, +15% attack rate, stacks 2) are pure stat modifiers with no new
mechanics. `extra-lightning-bounce` (ranger only, +1 `bolt` bounce,
stacks 2) and `bonus-damage-vs-slowed` (bruiser only, +50% `strike`
damage vs. a currently-slowed target) are restricted to one hero each —
deliberately, not by omission. `bonus-damage-vs-slowed` reads
`isBasicAttack` plus the *single-target* `damage` effect path in
`applyEffect`; `bolt`'s damage goes through the separate `chain-damage`
path in `chain.ts`, which never consults the bonus. Offering this upgrade
to a ranger would be a "never-useful choice" — checked, never do
anything — so it is not offered to one. Restricting it to bruiser turns
it into the intended cross-unit synergy instead: a ranger's `bolt` slows
a target, and a bruiser with this upgrade capitalizes on it with `strike`
— verified live in the browser (see below), not just in the headless
probe.

**Client: an upgrade picker in the existing tuning drawer, not a new
overlay.** `apps/client/src/hud/upgrade-picker.ts` renders one checkbox
section per hero present on **team A only** for the current scenario;
team B always stays at its stock, zero-upgrade build. This is a
deliberate asymmetry, not a limitation: the plan's Phase 4 deliverable is
"compare a build with its previous version" against a *fixed* opponent,
which a mirrored symmetric toggle can't give you as directly. Eligibility
(`isUpgradeEligible`) re-runs on every checkbox change, so
`stronger-shield` starts disabled and greys back in the instant
`healing-that-also-shields` is checked — verified in the browser, not
just by reading the eligibility function. Live-tested end to end:
checking `healing-that-also-shields` + `stronger-shield` on the support
and resetting `three-vs-three` produced `A-3 healed A-1 for 20` followed
immediately by `A-3 shielded A-1 for 23` in the event feed (matching the
headless-probe math exactly), team B's support only ever logged a bare
heal with no shield line, and the battle ended in a team A **win** at
tick 295 — a draw-mirror turned into an outright win by one upgrade pair,
which is the "clearly different behaviour, not merely larger numbers" bar
the plan sets, demonstrated live rather than asserted. Selecting
`bonus-damage-vs-slowed` in a `duel` (bruiser vs. bruiser, no slow source
in either kit) correctly did nothing and crashed nothing — the expected
behaviour for a synergy upgrade with no partner present, not a bug.

**Known, deliberate gaps, left for a human to weigh in on rather than
guessed at:**
- The picker only offers each upgrade as a single toggle (0 or 1 stack),
  even though the engine and `compileBuild` fully support higher stacks
  (`more-max-hp` at 3 stacks and `stronger-shield` at 2 were both verified
  directly through `compileBuild`, just not through the picker's UI). A
  stack-count control is a Phase 5 lobby concern, not a Phase 4 lab one.
- Upgrade selections are not part of the scenario export/import JSON —
  they live only in the picker's in-memory state for the current page
  session. Extending `LabScenario` to carry them was judged out of scope
  for this pass rather than silently skipped.
- The reaction-budget safety path (`MAX_REACTION_DEPTH` / total budget)
  has no shipped content that can actually reach it; it is verified by a
  synthetic test, not by any real battle outcome. The first genuinely
  self-retriggering reaction (a future upgrade) should re-verify this
  path against real content, not just trust the synthetic test still
  applies.
- Support-unit positioning (documented above, still open from Phase 3)
  now has a second consequence: `healing-that-also-shields` only pays off
  when `mend` lands on an *ally*, and the support's own self-heal rate
  was last measured at 8 of 12 casts. Whether that upgrade reads as
  strong or weak in practice is entangled with the unresolved positioning
  question, not a separate finding — worth re-measuring together in the
  discovery session rather than judging the upgrade in isolation.

## Phase 4 review pass (Opus)

An independent Opus review of the Phase 4 diff found one real blocking bug
and several worth a decision. All fixed and re-verified; the zero-upgrade
baselines (`duel` 297, `three-vs-three` 379/`50,170,90`, `three-bruisers`
392) were re-run after every fix in this pass and are unchanged except
where a fix specifically changes an event count (noted below).

**Blocking: `createHeroBuild` enforced nothing, and it was the only build
constructor scenarios/the lab/`scripts/simulate.ts` actually use.**
`applyUpgrade` already enforced `heroId` restriction, `maxStacks`, and
prerequisites correctly — nothing called it. Confirmed concretely:
`createHeroBuild("x", "bruiser", ["more-max-hp"×4], catalogue)` compiled to
160 max HP against a stated cap of 145 before the fix. `createHeroBuild`
now folds each upgrade ID through `applyUpgrade` in order instead of
building the selection list by hand, so it's impossible to construct an
over-stacked, cross-hero, or prerequisite-missing build through this
function anymore — confirmed by re-running the reviewer's exact
reproduction (now throws `"... is not a legal choice for build ..."`) and
by three more targeted cases (cross-hero, missing-prerequisite). This does
mean `createHeroBuild` now requires a `Catalogue` argument and can throw;
every call site (`duel.ts`, `three-versus-three.ts`,
`apps/client/src/hud/upgrade-picker.ts`) was updated to pass one. The
picker wraps its own call in a fallback (`buildOrEmpty`) that treats a
hero's selection as empty rather than crashing the whole panel if it ever
becomes inconsistent — defence in depth, since the picker's own
eligibility-gated checkboxes shouldn't be able to produce an illegal
selection in the first place, but a UI shouldn't hard-crash on bad state
regardless of how confident the code around it is.

**Validator hardening, three new checks in `validateCatalogue`:**
- `slowFraction` must now be in `(0, 1)`, not `(0, 1]` — a full root
  (`1.0`) is rejected. No shipped content used it, but it's a direct route
  to the same "a unit can structurally never act again" failure class the
  Phase 3 range-epsilon bug produced by accident; there's no reason to
  leave that door open when nothing needs it.
- A new `validatePrerequisiteGraph` pass rejects a self-referencing
  `prerequisiteUpgradeIds` entry, any prerequisite cycle (walked, not just
  checked one hop deep), and a prerequisite whose `heroId` conflicts with
  its dependent's (which would make the dependent permanently
  unreachable — eligible for no build that could ever satisfy it).
  Verified against four synthetic broken catalogues (clone +
  mutate, never touching shipped content): self-reference, a 2-cycle,
  and a cross-hero prerequisite each correctly throw before this pass;
  a fourth was the confirmation that the *legal* prerequisite order
  (`healing-that-also-shields` → `stronger-shield`) still compiles fine.
- The self-referencing case doubled as a real client-side bug: before
  this pass, `upgrade-picker.ts`'s deselect cascade recursed over
  `catalogue.upgrades` with no visited-set guard, so a cyclic
  `prerequisiteUpgradeIds` would stack-overflow the picker (reproduced:
  `RangeError` around recursion depth 4995). `deselectCascade` now takes
  an explicit `visited: Set<UpgradeDefinitionId>` and returns immediately
  on a repeat — the validator should always catch this in content before
  it ships, but the UI no longer trusts that as its only line of defence.

**`compileBuild`'s basic-attack-cooldown rate had an unguarded division.**
A large enough negative `percent` sum on `basic-attack-cooldown` drives
the compiled rate to `0` or below; `1 / 0` is `Infinity`, and
`Math.max(1, Math.round(Infinity))` is still `Infinity` — an ability with
an infinite cooldown, permanently disabled, not a crash but a silent
content footgun. No shipped upgrade has a large enough negative percent to
trigger this, but nothing stopped one from being authored that way.
`abilityCooldownDurations` is now clamped to
`[1, DEFAULT_TICK_LIMIT]` (`DEFAULT_TICK_LIMIT` from `constants.ts`) — a
pathological rate now compiles to "effectively never castable within one
battle," a finite number, instead of `Infinity` propagating into whatever
reads that field next. Verified with a synthetic `-500%` modifier:
compiles to `1350` (the tick limit), finite.

**Effects no longer apply to a target that already died earlier in the
same cast, and a unit's `shield`/`slow` are cleared the instant it dies.**
`bolt`'s effects are `[chain-damage, slow]`; before this fix, a
`chain-damage` hit that killed the primary target was immediately followed
by a `slow` effect applied to that same, now-dead unit — a real event
observed live (`damage-dealt` → `slow-applied` → `death`, same tick,
consecutive sequence numbers). `step-battle.ts`'s per-effect loop now
checks `target.alive` at the top of each iteration and stops processing
further effects once it's false. Separately, `applyDamage` (the single
choke point both the plain-damage and chain-damage paths call through) now
nulls `unit.shield`/`unit.slow` in the same branch that sets
`unit.alive = false`, so a corpse can never keep reporting a live status
for the rest of the battle regardless of which effect killed it. Verified
by instrumenting a full `three-vs-three` battle and asserting no dead unit
ever has a non-null `shield` or `slow` on any tick: zero violations across
all 379 ticks. This also trimmed `three-vs-three` seed 1's event count
from 153 to 149 (four fewer now-nonsensical `slow-applied` events on
already-dead targets) — ticks, result and damage totals are unchanged;
only the spurious post-mortem events are gone.

**Confirmed as intentional, documented rather than changed (the plan's
own "document and inspect this ordering rather than hiding it" guidance,
item 10):**
- A reaction-granted shield *overwrites* rather than stacks with an
  existing shield (matches `applyEffect`'s plain shield case — reapplying
  always replaces amount and refreshes duration, documented back in the
  Phase 3 review pass). Consistent behaviour, not a special case for
  reactions.
- A source unit that dies later in the *same tick* after its heal already
  resolved still lands its reaction-granted shield — the heal (and the
  reaction it queues) is already complete by the time a later action in
  the same tick's resolution order kills the source; the reaction doesn't
  re-check the source's aliveness at drain time, only the target's. Not
  observed to matter in any shipped scenario (`three-vs-three` seed 1's
  reaction shields land at ticks 27/117/207 with no source death in the
  same tick), and changing it would need a real design answer (does a
  dead unit's queued-but-unresolved reaction still fire at all?) rather
  than a one-line guard.
- The reaction-budget safety path (`MAX_REACTION_DEPTH` /
  `MAX_REACTIONS_PER_TICK`) still has no shipped content that can reach it
  — the only reaction's generated effect is a shield, which can't
  retrigger `after-heal-effect`. Re-confirmed by re-deriving the same
  synthetic test from the first review (20-job queue, 16 legal + 4
  over-depth: processes 16, reports the depth-exceeded diagnostic). The
  first genuinely self-retriggering reaction should re-verify this path
  against real content, not just trust the synthetic test still applies.
- `bonus-damage-vs-slowed` stays restricted to `heroId: "bruiser"` —
  re-confirmed the restriction is load-bearing, not just a preference:
  `bolt`'s damage never routes through the single-target `damage` case
  the bonus reads, so offering it to a ranger would be a checked,
  always-inert choice.

**Not changed: `shield-applied`'s `abilityId` field carries a
`ReactionDefinitionId` for a reaction-granted shield** (e.g.
`"mend-shield"`, not a real ability). Both are plain `string` aliases so
this type-checks; it's inert today because `event-log.ts`'s
`shield-applied` case doesn't look the field up in
`catalogue.abilities`. Left as-is — flagged here so a future change that
*does* do a catalogue lookup on a `shield-applied` event's `abilityId`
knows to check for this case first.
