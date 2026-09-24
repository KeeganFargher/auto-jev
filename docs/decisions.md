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

## Phase 5 (engine slice): the run state machine

This pass built and verified the plan's implementation-order steps 1–6
(seat/round/pairing/standings types, `createPairings`, commands and
rejection reasons, private offers, per-round battle orchestration, bot
controllers) as a headless, fully-tested engine in a new `packages/run`.
**Not built in this pass, on purpose:** the client UI (lobby/draft/
standings/`MatchScene`, step 7), the command/decision recording and
export-to-lab bridge (step 8), and deadline/timeout handling for a
stalled human seat (part of step 1/"preparing"). See "Deliberately
deferred" below — this is a checkpoint partway through the phase, not a
claim that Phase 5 is done.

**`createPairings` was built and verified first, before any other type
settled, per its own explicit plan callout ("produce a printable
eight-player schedule before adding UI").** It's the one component with a
real algorithm in it: a deterministic circle-method round-robin for an
unchanged roster (fix one seat, rotate the rest by one position per
round; for 2m players this produces a `2m-1`-round cycle where every
player meets every other exactly once), falling back to a brute-forced
ranked perfect-matching (all `(n-1)!!` matchings for the `n` survivors,
ranked by fewest immediate rematches, then fewest total prior encounters,
tie-broken by a seeded permutation) once eliminations change the roster,
with bye selection (fewest prior byes, then not-the-previous-round's-bye,
then seeded) for an odd survivor count. Verified directly, not by
inspection: an 8-player, 7-round schedule (two different seeds) covers
all 28 possible pairs exactly once with zero repeats; a 6-player,
5-round schedule covers all 15 pairs exactly once; a shrinking roster
(8→7→5→3→2) gives a different bye to a different player each time a bye
was needed; a 10-round bye simulation on a 5-player roster produces a
perfectly even 2-each bye distribution with zero consecutive repeats.

`createPairings`'s signature is exactly the plan's literal
`(activePlayerIds, history, pairingSeed)` — no separate `round` or
`initialPlayerIds` parameters — because both live inside `PairingHistory`
(`nextRound`, `initialPlayerIds`) instead. This was a deliberate reading:
the circle method needs a *stable* shuffled seat order across all rounds
of one cycle (reshuffling every round would break the "rotate by one
step" invariant), so the seed used for that shuffle has to be constant
for the whole run, derived once (`derivePairingSeed(runSeed)`), not
re-derived per round — `history.nextRound` is what varies per round
instead, entirely inside the "history" the function already takes.

**Seed derivation is per-purpose and per-scope, not one RNG threaded
through the round — decided up front, per the plan's explicit "one
battle's extra random calls must not change another battle."**
`packages/run/src/seed.ts`'s `hashSeed` (a small FNV-1a-style hash over
`[runSeed, purpose, ...scope]`) derives four independent seeds:
`derivePairingSeed(runSeed)` (once per run), `deriveBattleSeed(runSeed,
round, battleId)` (once per pairing), `deriveOfferSeed(runSeed, round,
playerId, purpose)` (once per seat per offer kind), and
`deriveControllerSeed(runSeed, round, playerId)` (once per seat's bot
decision). None of these share state or draw from a common RNG stream,
so four simultaneous battles — or four bots deciding in the same phase —
can never become order-coupled the way a single shared RNG would make
them.

**`decisionRevision` is per-seat; `phaseEpoch` is shared — kept as two
separate counters on purpose, per the plan's own explicit reason** ("
another seat picking an upgrade must not invalidate your outstanding
choice"). `RunState.phaseEpoch` increments on every phase transition;
each `PlayerSeat.decisionRevision` increments only when *that* seat's own
command is accepted. Readiness for the current phase is
`decisionRevision > readyThresholdByPlayer[playerId]`, where the
threshold is snapshotted per seat at the moment the phase is entered —
so one seat's command can never affect another seat's readiness
calculation, and `applyCommand` rejects a command carrying a stale
`expectedRevision` (`stale-revision`) rather than silently applying it
against a choice that's since changed.

**`RunState` stores `HeroBuild`s, not compiled stats — `compileBuild`
only ever runs inside `createBattle`, at the same barrier the plan
names.** "Restore battle HP/cooldowns each round; preserve builds" reads
directly onto Phase 4's own split: a `HeroBuild` has no HP or cooldowns
to restore, so restoring per round is just recompiling a fresh
`UnitState` from the same, unmutated `HeroBuild` — which is exactly what
`createMatchBattleSetup` + `createBattle` already do every round, with no
special-casing needed. This also directly satisfies "two hero copies can
have independent upgrades": two `PlayerSeat`s' `HeroBuild`s are
independent objects from the moment the draft creates them
(`createHeroBuild` per hero slot), so one seat's upgrade choice can never
leak into another's compiled stats.

**Battle resolution is synchronous and instant, not incrementally
ticked — a deliberate simplification of the plan's `battle` phase, not
an oversight.** `enterBattlePhase` calls `recordBattle` to full
completion for every pairing in the round the moment `preparing` becomes
`battle`, rather than modelling per-tick advancement through the run
state machine itself. This means "a fast fight cannot advance its
participants while a slow fight remains active" and "duplicate
battle-complete events cannot subtract health twice" are both true by
construction rather than by a guard: there is no per-duel completion
event to duplicate, and no notion of one duel finishing before another
inside the state machine at all — the whole round's results exist
atomically the instant `battle` phase is entered, and `settleRound`
(the very next transition) applies every result together in one pure
step. A future client can still show duels finishing at different
*visual* paces by replaying each `RoundBattle.setup` through
`recordBattle` independently for playback — exactly how the existing lab
already turns a `BattleSetup` into a frame-by-frame recording — without
the run's own domain state needing to track "still ticking." `RoundBattle`
stores the `BattleSetup` (not a full recording) for this reason: replay is
cheap and deterministic to recompute on demand, so there's no reason to
carry a potentially-1350-frame recording inside `RunState` for four
simultaneous battles when the source of truth (the `setup`) already
reproduces it exactly.

**A simulation failure aborts the whole match, not just that battle** —
`settleRound` checks every battle in the round for a `failure` result
*before* applying any health changes; if any battle failed, the round
transitions straight to `finished` with `abortReason` set and `players`
left untouched, matching "abort the whole lobby match with diagnostics
and no round-health settlement" exactly. `abortReason: string | null`
and `winnerPlayerIds: PlayerId[] | null` are deliberately separate
fields: an aborted match has an `abortReason` and no winners; a match
that ends with everyone eliminated in the same settlement ("the match is
a draw") has `winnerPlayerIds: []` (a real, empty list of winners) and no
`abortReason` — the two "nothing happened" shapes don't collide.

**Bot controllers are seeded and independent, but "heuristic" is
currently an alias for "random."** Both `random-bot` and
`heuristic-bot` controller kinds route through the same
`deriveControllerSeed`-seeded random choice in `controllers.ts` for this
pass — a real heuristic (prefer survivability upgrades, avoid an
all-duplicate hero trio, etc.) was judged out of scope for getting the
state machine itself right first. Each bot's decision uses its own
per-seat, per-round seed, so two bots deciding in the same phase can
never desync each other's randomness — verified by the two-run
determinism check (same run seed, independently re-run end to end,
produces identical winners and identical final health distribution for
all 8 seats).

**Verified end to end, not just per-function:** an 8-bot match (no
humans) run through the full `lobby → draft → preparing → battle →
round-result → upgrade → ...` cycle via a `pumpRun` driver produces
exactly 4 battles covering all 8 players in round 1 with no bye; runs to
a single-winner `finished` state; and reproduces bit-for-bit identical
winners and health distributions when re-run with the same run seed. A
round-cap of 2 forces a `finished` state after exactly 2 rounds with a
*shared* win among every seat still at full health (three-way tie),
matching "equal highest health gives a shared win." A 5-player roster
(odd, exercises byes every round) and a 2-player roster (final duel, no
pairing algorithm needed at all) both complete correctly to a single
winner.

### Deliberately deferred (this pass)

- **The client UI** — lobby roster, draft screen, standings, preparation
  timer, `MatchScene`. Nothing in `apps/client` was touched this pass;
  the entire above is verified headlessly via `packages/run`'s own
  exports, the same way the battle engine itself was built and proven
  before Phase 2's lab existed to show it.
- **Deadlines / stalled-human handling.** "Use deadlines rather than
  waiting forever," the 30-second choice window, and "a labelled
  deterministic fallback only for outstanding required choices" are
  explicit plan requirements with no code yet. `readyThresholdByPlayer`
  gives a clean hook for a future timeout (a caller can already tell
  which seats are and aren't ready at any point), but nothing currently
  forces a phase forward on a timer.
- **Recording/replay/export-to-lab (step 8).** `RunState` is already
  plain, serializable data with no functions or classes, so replaying a
  saved run is *architecturally* just re-applying the same recorded
  `RunCommand` sequence through `applyCommand` — but nothing currently
  records that sequence, and "export any battle to the laboratory" (wiring
  a `RoundBattle.setup` into the existing `createPlaybackSession`) isn't
  wired up yet either, even though both halves already exist
  independently.
- **Formation choice during `preparing`.** The plan mentions "accepts
  legal formation/build choices" as part of `preparing`; this pass treats
  `preparing` as a pure readiness gate (`confirm-ready` only) with a fixed
  default spawn formation (the same mirrored 3-slot layout `three-vs-three`
  already uses), since the plan doesn't specify formation mechanics beyond
  naming that they exist. A real formation choice would be a new command
  type, not a change to the phases already built.
- **A real heuristic bot** — see above; `heuristic-bot` is currently
  identical to `random-bot` in behaviour.

## Phase 5 (client slice): a playable match UI, and two real bugs it found

Building the client UI immediately surfaced two bugs the headless
probe scripts never hit, because both are specifically about *replaying
the same phase twice against a live, reactive session* — something a
one-shot `driveToCompletion` script never does, but a real UI naturally
does (every `subscribe` callback re-renders from current state, and nothing
stops the driver from being invoked again while still "in" a phase).

**`runBotCommands` re-decided for bots that had already committed, and
the second attempt crashed instead of failing gracefully.** `MatchSession`
calls `pumpRun` then `runBotCommands` in a loop until nothing changes.
Once bots have already submitted for the current phase but a human
hasn't, `pumpRun` returns the state unchanged (correctly blocked) — but
the old `runBotCommands` had no notion of "already decided," so it asked
*every* non-human seat to decide again, including ones that had already
committed. For `commit-draft`/`confirm-ready` this was wasteful but
harmless (the same choice, re-submitted, is accepted again against the
seat's *new* `decisionRevision` and just overwrites itself). For
`commit-upgrade` it was a real bug: a bot's second, redundant pick could
land on an upgrade its *own first pick* had just made ineligible (e.g. a
`maxStacks: 1` upgrade it already has), and `applyUpgrade` throws on an
illegal choice rather than returning one — an uncaught exception that
killed the whole session, reproduced live in the browser the first time
a bot was offered `healing-that-also-shields` twice in the same upgrade
phase. Fixed at the root: `runBotCommands` now skips any seat that
`isSeatReady` already reports ready for the current phase (`readiness.ts`,
the same helper `advanceIfReady` itself uses), so a bot is only ever
asked to decide once per phase. Fixed again, independently, as a second
layer: `applyCommitUpgrade` now calls `isUpgradeEligible` before
`applyUpgrade` and returns a proper `ineligible-upgrade` rejection instead
of ever reaching the throw — commands should never crash their caller,
even a caller with a bug in it. Re-verified with 30 seeded 8-bot matches
run to completion after the fix: zero crashes (was reproducible within
the very first match before it).

**`.match-root[hidden]` needed an explicit rule — a class that sets its
own `display` silently defeats the `hidden` attribute.** `.match-root`
declares `display: flex` (to lay out the standings/panel column). The
browser's default `[hidden] { display: none }` rule and a bare class
selector have equal specificity, so source order decides, and an author
stylesheet always comes after the UA default — meaning `.match-root`'s
own `display: flex` silently won every time, regardless of the `hidden`
attribute being correctly set on the element (confirmed via
`element.hidden === true` in the live page while the panel was still
visibly rendered on screen). Switching from Match back to Lab left the
match panel floating on top of the lab's canvas. Fixed with
`.match-root[hidden] { display: none; }` (specificity `0,2,0`, correctly
above the bare class). `#lab-canvas-root`/`#lab-hud` never had this
problem because neither sets its own `display`. General lesson for any
future toggled full-screen container in this codebase: if the container's
own class sets `display`, it needs its own `[hidden]` override too — the
attribute alone isn't enough once the class opts into a non-default
`display` value.

**The mode switch is a plain `location.hash` check (`apps/client/src/
main.ts`'s `applyMode`), not a router.** `#match` shows the match UI and
hides the lab's canvas/HUD (without disposing the lab's session — it's
just hidden, so switching back resumes exactly where it was, no reset);
anything else (including the bare `#lab` the switch-back link sets)
shows the lab. Chosen over adding a routing dependency for two static
screens.

**`MatchSession` always auto-resolves a full turn cycle per human action,
including battle and round-result — there is no UI-facing pause at those
two phases**, consistent with the engine-level decision (documented
above) that battle resolution is synchronous. The UI instead shows the
completed round's outcome (`describeResult`, reading `state.currentRound`,
which stays populated through `round-result` and `upgrade` even after the
live phase has moved past it) on the very next screen the human actually
sees (`upgrade`, or `finished`), with an on-demand "Watch battle" button
that reconstructs the full tick-by-tick recording from the stored
`BattleSetup` via `recordBattle` and plays it through the *same*
`createBattleView`/`createUnitInspectorView`/`createEventLogView`
components the lab itself uses — battle rendering was built once, for the
lab, and is reused here unchanged rather than rebuilt.

**Verified live in the browser, not just headlessly:** a full human
draft (5 offers, pick 3, real per-hero stat text), a resolved round-1
battle with a correct opponent pairing, a "Watch battle" replay that
plays a real tick-by-tick recording with working unit selection and an
event feed, an upgrade pick that correctly gated `stronger-shield` behind
`healing-that-also-shields` (offered only after the prerequisite was
taken, exactly matching the picker's existing eligibility behaviour from
Phase 4), four full rounds played through with a loss, a win, an
elimination visibly struck through in the standings strip, and zero
repeated opponents across those four rounds — matching the pairing
schedule's own guarantee.

## Phase 5 (client slice, round 2): the intended loop, and two more bugs

The first UI pass made watching a battle an opt-in button and dropped the
player straight into a text summary. Reworked to the intended loop (menu
→ draft → round → you watch your battle → result → timer → next round
with a different pairing), which is a closer match to the plan's actual
`MatchScene` framing than the original "text summary with an optional
replay" shape was.

**A main menu now gates session creation.** `MatchScene` starts with
`session: MatchSession | null = null` and renders a menu screen (title +
"Start Game") until the button is clicked; `createMatchSession` (and the
`Date.now()`-seeded run it kicks off) doesn't run until then. `renderFinished`
gained a "Back to menu" button that disposes the session and returns to
this same screen, so a full run has a real beginning and end rather than
just trailing off after `finished`.

**Watching your battle is no longer optional — it's the default path,
with an escape hatch, not the other way around.** `render()` now checks,
on every re-render, whether `state.currentRound` holds a human battle
with a settled `result` that hasn't been shown yet
(`watchedBattleIds: Set<BattleId>`), and if so opens the full-screen
battle watch *automatically* instead of rendering the upgrade/finished
panel — the player sees "Ready" turn directly into their battle playing
out, not a button they have to remember to press. The overlay gained a
"Skip to end" button (`MatchBattlePlayer.skipToEnd`, which already
existed but had no UI hook) for players who don't want to sit through a
long fight, and its former "Close" button is now labelled "Continue" to
read as the next step in a loop rather than dismissing a modal. The
"Watch battle" button on the result screen still exists, relabelled
"Watch again", for anyone who wants to re-watch after continuing.

**A real, working countdown — not cosmetic — now sits on the upgrade
screen**, closing the "you see if you won or lost → timer → next round"
loop the user asked for and the plan's own "provisional 30-second choice
window" / "labelled deterministic fallback" language. `createCountdown`
(`apps/client/src/hud/countdown.ts`) is a 15-second visible countdown; on
expiry it deterministically picks the *first* offered upgrade (not
random — matches "deterministic fallback," and the offer list order
itself is already seeded, so "first" is reproducible) or calls the new
`skip-upgrade` command if there are none. This is a client-side
convenience for a *local, human-plus-bots* match, not the engine-level,
server-authoritative deadline system the plan describes for online play
— that's still deferred (see the engine-slice entry above); this timer
only ever acts on the human's own seat, in the browser, and has no
concept of a shared clock across other sessions.

**Two more real bugs, both found by actually playing the rebuilt loop,
neither reachable from the old text-summary flow:**
- **The "no eligible upgrades" screen's "Continue" button was silently
  dead.** It called `session.confirmReady()`, but `applyConfirmReady`
  only accepts that command during `preparing` — during `upgrade` it was
  rejected every time with no feedback, so clicking it did nothing at
  all. This existed in the first UI pass too but was never exercised
  live, because with only six upgrades and generous stack limits, no
  seat had run out of eligible options within the few rounds tested.
  Fixed by adding a proper `skip-upgrade` command to `packages/run`
  (`commands.ts`) — valid only during `upgrade`, advances
  `decisionRevision` without touching `heroBuilds` — and wiring both the
  button and the new timer's empty-offers branch to call it.
- **A bot with zero eligible upgrades could stall the entire match
  forever, not just that one bot.** `decideBotCommand`'s `upgrade`
  branch returned `null` when a bot had no offers, and `runBotCommands`
  treats `null` as "nothing to submit" — meaning that bot's
  `decisionRevision` never advances, it never reads as "ready," and
  since `upgrade → preparing` requires *every* active seat ready, the
  whole run would hang indefinitely the first time any bot maxed out its
  eligible upgrades. Not hit in the engine-only probe scripts (8-bot
  matches there happened to end via elimination before any single bot
  exhausted its options) or in the first UI pass (short manual sessions,
  same reason) — only surfaced once `skip-upgrade` existed and made it
  possible to even ask "what does a bot with no offers do." Fixed by
  having `decideBotCommand` return a `skip-upgrade` command instead of
  `null` in that case.

**Verified live, extending the earlier session:** the full menu → draft →
watch → result → timer → next-round loop across three rounds, including
a draw (`mutual-elimination`, confirmed no health change to either side)
and a win (confirmed no health change to the winner), "Skip to end"
jumping straight to a battle's final tick, and — the specific case being
guarded against — letting the round-2 upgrade timer run out completely
unattended and confirming the run advanced to round 3 (a new, unrepeated
opponent) entirely on its own.

## Phase 5 (client slice, round 3): a real camera bug, dropping replay, and a second timer

**The user reported the battle-watch view as unplayable — "camera in the
wrong position, I see 1 character for a second but they go off screen."**
Root cause: `#lab-canvas-root canvas` has a CSS rule
(`display: block; width: 100%; height: 100%`) that locks the `<canvas>`
element's *displayed* box to its container regardless of the backing
pixel-buffer size `arena-view.ts` sets (`canvas.width = clientWidth *
devicePixelRatio`, for crisp rendering on Retina screens). The match
view's `.match-battle-watch-canvas` never got the equivalent rule. On a
`devicePixelRatio: 1` screen the two sizes coincide by accident, so this
was invisible in the (dpr-1) browser pane used to verify the round-2
work — it only manifests on an actual Retina display, where the canvas
renders at literally double the container's size with nothing to clip
it, so only the top-left quarter of the arena is ever visible. Fixed by
adding the missing `.match-battle-watch-canvas canvas { display: block;
width: 100%; height: 100%; }` rule (`apps/client/src/style.css`),
mirroring the lab's existing pattern. Verified without a Retina screen on
hand: loaded the fix via HMR, then manually doubled `canvas.width`/
`canvas.height` (exactly what a dpr-2 `resize()` would produce) and
confirmed via `getBoundingClientRect()` that the element's rendered size
stayed locked to the container (1024×768) instead of ballooning to
2048×1536 — the same check would have shown the oversized box before the
fix.

**Recording/replay (the "Deliberately deferred" item from the previous
entry) is explicitly out of scope, on direct user instruction — not just
still-not-built.** The plan lists "replaying a saved run" as a Phase 5
acceptance check, but the user does not want a replay system, so it's
being dropped from this project's scope entirely rather than carried
forward as a gap. Nothing currently depends on `RunCommand` sequences
being recorded, so this has no code impact — it just removes an item
from `docs/phase-status.md`'s deferred/next-task lists.

**The other Phase-5 acceptance-check gap — "a stalled human cannot hold
the round forever" — only had a fix for the `upgrade` phase (the
existing 15-second countdown). The `preparing` phase (the per-round
"Ready" screen) had no timer at all**, so a human who never clicks Ready
could hold up the match indefinitely — confirmed by inspection:
`decideBotCommand`'s `preparing` branch always returns `confirm-ready`
immediately, so bots can never be the blocker, only the human seat can.
Per explicit user instruction ("yes there should be a visible timer
between rounds, maybe like 15 seconds"), added the same
`createCountdown` pattern already used on the upgrade screen to
`renderPreparing`, sharing one renamed `ROUND_TIMER_SECONDS = 15`
constant across both screens rather than two separately-tuned magic
numbers for what's conceptually the same "you get N seconds to decide"
rule. On expiry it calls `confirmReady()` — there's no offer to fall
back to here, just a readiness gate, so unlike the upgrade timer's
"pick the first offer" fallback, this one has nothing to choose. Same
scoping caveat as the upgrade timer: this is a client-side convenience
for the human's own local browser session, not the engine-level,
server-authoritative deadline the plan describes for online play (still
deferred to whenever Phase 6's room-owned clock exists). Verified live:
started a round, took no action, and watched the visible "NEXT IN 14s…"
countdown reach zero and auto-advance straight into the battle-watch
overlay with a correctly-paired opponent — no manual Ready click at any
point.

## Phase 5 review pass (before Phase 6)

**A correction first.** The round-3 report told the user Phase 5's
acceptance checks were "now fully satisfied." They weren't: the draft
screen has no deadline, and `getPlayerView` (plan step 4) had never been
built. Both are now either fixed or recorded in `docs/phase-status.md`
as awaiting a decision. Separately, round 3 blamed a lint failure on an
oxlint bug; the real cause was this machine defaulting to Node 20 when
the project expects Node 22+. (Superseded in Phase 6: `pnpm lint` now
works on Node 20 too — see "`pnpm lint` on any Node" below.)

**`getPlayerView` hides other seats' builds, not just their offers.**
The plan asks for a projection that both the UI and bots read, and for
Phase 6 not to "expose hidden pending picks." Offers are the obvious
secret, but builds are one too: `commit-upgrade` changes a seat's
`heroBuilds` the instant it's accepted, while other seats are still
deciding, so publishing builds from `players` would leak picks before
the lock. The view therefore exposes other seats only as name,
controller kind, health and eliminated. Opponent builds are still
visible where they're genuinely public: `currentRound.battles[*].setup`,
which `enterPreparingPhase` creates only after every upgrade is in. The
run seed is also withheld, since it would let a client predict offers
and battle outcomes. Bots get their controller seed passed in by
`runBotCommands` instead of deriving it from `state.runSeed` themselves,
which is what let `decideBotCommand` stop taking `RunState` at all.

**One decision per seat per phase, enforced by the engine.** Before,
nothing stopped a second `commit-upgrade` once a seat was ready: the
revision check passes because the command carries the *new* revision.
The earlier bot-crash fix (`runBotCommands` skipping ready seats) had
patched this in the bot controller rather than in the engine. Now
`applyCommand` rejects any command from an already-ready seat as
`already-decided`. That rules out changing your mind before the barrier
too, which matches the plan's "preserve committed choices" wording and
keeps upgrades from stacking. The checks now run in one fixed order
(actor → phase → revision → already-decided → offer legality), with
each command's phase in a single `COMMAND_PHASE` table instead of
repeated per function. The phase check has to come before
already-decided: stale readiness thresholds from the previous phase
would otherwise report `already-decided` for what is really a
`wrong-phase` command. Duplicate offer IDs in a draft are rejected as
`duplicate-offer`.

**The eliminated player's last battle is remembered by the session, not
the engine.** Once the human is eliminated, nothing waits on them, so
`settle()` resolves the rest of the match in a single call, and the
final `RunState` holds only the last round. Two fixes were possible:
stop settling when the human is eliminated (a paused-match state the
UI would need to handle, and which Phase 6's server wouldn't do
anyway), or have `MatchSession` record the human's most recent resolved
battle as it passes through each `pumpRun` result. The second is
smaller and matches what a spectator-less eliminated player can
actually see. The auto-watch now keys off that remembered battle rather
than `currentRound`. The round summary uses it only when its round
matches the current one, so a bye round never shows an earlier round's
result.

**The round timer is carried by `phaseEpoch`.** Every `render()` used
to rebuild the countdown at a fresh 15s, and "Watch again" (which opens
an overlay without re-rendering) left the old one running behind it.
Now stopping a timer records its remaining seconds under the current
`phaseEpoch`, and starting one resumes from that if the epoch matches.
"Watch again" pauses the deadline instead of extending or forfeiting it,
and any future same-phase re-render can't reset it. Pausing is fine
locally because nobody else is waiting on the human; Phase 6's
server-owned deadline won't pause, so the overlay will need to show it
then.

**Regression evidence.** Before any change, a probe recorded 75
fingerprints: final phase, round count, winners, and every seat's
health and full build. That covered 8-bot and 5-bot all-bot matches
plus a scripted-human match, 25 seeds each. After the changes the
output was byte-identical, so routing bots through `getPlayerView` and
adding the new command checks changed no legal outcome.

## HUD restyle: Tailwind v4 and a Dota Underlords look

**Tailwind v4 with a CSS-first theme, not utility classes everywhere.**
The user asked for an Underlords-style HUD and floated Tailwind with a
custom config. In v4 the "config" is the `@theme` block in
`apps/client/src/style.css`: every colour, font and seat/role accent is
a named token there (`--color-night-*`, `--color-gold-*`,
`--color-seat-1..8`, `--color-role-*`, `--font-display`, `--font-label`),
wired in through `@tailwindcss/vite` in a new `apps/client/vite.config.ts`.
It's `@theme static` so tokens referenced only from custom CSS or inline
`style` still get emitted, since Tailwind otherwise drops unused theme
variables. Components are named classes (`.seat-card`, `.round-plate`,
`.brush-banner`, `.action-button`, `.unit-card`) defined against those
tokens, not long utility strings in TypeScript. Every element here is
built with `createElement`, so readable class names keep the DOM code
and browser probes legible, and a restyle stays a CSS change. Tailwind's
reset also retires the hand-written `[hidden]` override the old
`.match-root` needed, because its reset forces `display: none !important`
on `[hidden]`.

**Fonts are Lilita One (display) and Barlow Condensed 600/700 (labels),
self-hosted via `@fontsource`.** Chosen by rendering eight candidates
side by side against the reference screenshot's "FIGHT!" / "RULEBOOK"
lettering; Lilita One was the closest heavy, slightly rounded match.
Self-hosted so the game never depends on a font CDN.

**The match screen is one persistent layout, mirroring the reference:**
player rail left (seat-coloured portrait squares with dark silhouettes
and big heart counts, "YOU" gold and this round's opponent red),
stone round plate top-right (the countdown lives in it now, as the big
number, turning red for the last 3 seconds), your team's tiles on the
right (role icon plus one lit pip per upgrade stack), phase content in
the centre, and one round primary action button bottom-right (Confirm,
Ready, Continue, Menu). One primary action per screen; upgrade cards
act on click, so that screen has no action button. The menu is its own
layer: a brush-stroke title block, a "Battle lab" link, placeholder key
art (the three role shapes glowing), and a brush-stroke "FIGHT!". The old
always-visible "lab" link inside the match is gone. `main.ts` disposes
the match scene on leaving `#match`, so that link silently threw away
your run; the lab is reachable from the menu instead.

**The battle-watch overlay and the lab share the restyled HUD pieces**
(status plate, event feed, unit inspector, transport bar, tuning
drawer), so the lab got the same look rather than staying on the old
monospace chrome. Canvas rendering (`unit-view.ts`, `arena-view.ts`,
`battle-view.ts`) is untouched, per the user's "the actual game doesn't
need updating yet".

**Two small bugs surfaced by the restyle:** the event feed's lines were
being squeezed by flexbox to fit its height cap (8 px tall for 14 px
text; it was already slightly overlapped before), now `flex: none` so
old lines clip and fade instead; and the upgrade screen at 800×600 is
taller than the stage, where plain `justify-content: center` pushed the
banner's top out of scroll reach. It's now `safe center` plus a
short-viewport spacing tweak. Checked at 800×600, 1024×768 and
1440×900.

**Old names in earlier entries.** The dated entries above describe the
UI as it was at the time. After this restyle:
- `.match-battle-watch-canvas canvas` (the Retina camera fix) is now
  `.watch-canvas canvas`, same rule.
- The `.match-root[hidden]` override is retired in favour of Tailwind's
  reset.
- The "standings strip" is the seat rail.
- The "Skip to end" button is "Skip".
- The "Next in Ns" countdown text is the round plate's number.

**"Watch again" removed, on user instruction.** Your battle still plays
automatically, once, before each result screen; the button to replay it
from the upgrade and finished screens is gone. The round-timer pause
built for it in the Phase 5 review pass went with it. Nothing else
opened the battle overlay mid-phase, so the timer now simply starts at
15 seconds with each phase (`Countdown.remainingSeconds` and the
per-`phaseEpoch` carry were deleted rather than left unused).

## Round view: the player rail stays up, and you can watch anyone's battle

**Asked for directly:** keep the player rail visible during battles and
click players to watch their game. This also settles plan step 7 ("you
may watch another public battle").

**One shared clock per round, not one playback per battle.** The plan
has all duels run simultaneously. Battles still resolve instantly in the
engine, so the client re-simulates any battle from its public `setup`
(`recordBattle`, lazily and cached per battle) and shows each at the
same round tick (`round-playback.ts`, replacing `match-battle-player.ts`).
Switching players therefore means seeing their fight *now*, not
restarting it, and your battle ending early leaves the others still live
to click into. "Skip" jumps the whole round to its end.

**No engine change was needed.** `getPlayerView` already passes every
battle's setup through. Those are locked, public battle states, as
recorded in the review pass.

**Guarding against spoilers is the main rule.** Seats are only clickable
inside the round view, after results exist. During `preparing` the
*next* round's setups already exist, so a click there could simulate and
reveal an unplayed result. Inside the round view, a seat's hearts and
eliminated state show pre-round values (post-settlement health plus one
if they lost this round) until that seat's own battle ends on the
shared clock.

**The spectated side is the clicked player's.** `createBattleView`'s
`friendlyTeamId` is whoever you clicked, so their units are blue and
their opponent's red. Passing the human's ID for a bot-vs-bot battle
would paint both teams red, the same class of bug as the earlier
both-purple one. Verified by counting canvas pixels: a spectated winner
showed 162 blue pixels and 0 red or purple; a spectated loser showed 177
red pixels (the surviving winner) and 0 blue.

**`MatchSession` keeps the latest round the human took part in, not just
their battle.** When the human is eliminated, `settle()` finishes the
match in one call, and `currentRound` ends up holding only the *final*
round. `ResolvedRound` snapshots that round's battles, its bye, and the
public seats as they stood right after it settled, so the elimination
round stays fully browsable.

**The battle fills the screen, with the HUD on top.** The first version
inset the board between the rails. The user rejected that ("everything
is layered on top of the game, not outside"), so the canvas is
full-screen again. At full screen the left team's spawn points sit under
the player rail, so `createArenaView` / `createBattleView` gained an
optional `ViewportInsets`. The camera fits the arena inside the area the
HUD leaves clear (`BATTLE_HUD_INSETS` in `match-scene.ts`: 208 px left
for the rail, 96 px right for the team tiles, 76 px top for the plate),
while the floor grid still paints edge to edge. The lab passes no
insets, so it renders exactly as before. The Retina sizing rule now
lives on `.battle-canvas canvas`.

**Rounds are timed and advance themselves, on user instruction** ("each
round should have a timer and it's a draw if no one dies, I don't like
having to hit Continue all the time"). No engine change: a battle still
ending with both teams alive at its 45-second `tickLimit` was already a
`draw` with reason `timeout`. What changed is how the HUD presents it.
During a battle the round plate shows *real* seconds left
(`RoundPlayback.secondsLeft`, the time limit divided by the 2× playback
speed, so about 23), where it used to show game seconds falling at
double speed, and it pulses for the last 3. Once every battle in the
round has ended, a 3-second "Round over" countdown runs on the same
plate and the round view closes itself. The Continue button is gone
from battles, and "Skip" still jumps straight to the end of the round.
Timeout draws now say so ("time ran out" on the result banner, "Time's
up · draw" in the battle header), so a draw isn't a mystery. With the
preparing and upgrade timers, a match now runs with no clicks at all
after the draft, verified by waiting through upgrade → preparing →
battle unattended. The playback loop runs on `requestAnimationFrame`,
so a backgrounded tab pauses combat playback, which is normal game
behaviour. In the tool's hidden browser pane that meant verifying with a
timer-driven stand-in for animation frames on the test page only.

## Board grid, placement and a Three.js renderer

**Asked for directly** (2026-09-22): a 3D, angled, Underlords-style view;
an Underlords-style grid where you place your own heroes; three heroes
for now with room to grow. The plan for the whole detour is
`docs/board-and-renderer-plan.md`.

**Three.js, not Godot, and not the plan's Phaser.** The engine is
deterministic TypeScript that runs in the browser now and on the server
in Phase 6. Godot can't run it: we'd either port the engine and keep two
copies agreeing tick for tick, or bridge two runtimes. Three.js is only
a drawing layer over the same battle data, and the Tailwind HUD layers
over its canvas unchanged. Phaser, which the plan names, is 2D. The
current drawing code is small (about 440 lines behind `BattleView`'s
`update`/`dispose`), so the swap is contained.

**The grid is for placement; movement stays continuous.** An 8×8 board
of 10-unit cells (80×80 world units). Snapping movement to cells would
rewrite targeting and movement for a look the camera mostly hides;
placement is where the grid changes decisions. The engine itself is
unchanged apart from carrying `arenaColumns`/`arenaRows` into its state
and snapshots for the renderer: a battle still only sees spawn points.

**Formations are in own-half coordinates, rotated 180° for team B.**
Row 0 is the front line at the centre, row 3 the back. Rotating (not
mirroring) matches Underlords: both players see their board from the
same side, with their own left on the left.

**Battle setups are built when the battle starts, not when preparing
starts.** They used to be created on entering `preparing`, which was
harmless while nothing could change during it. With placement, a setup
made at that point would miss the player's final formation, and
publishing it would leak each opponent's formation as it stood. During
`preparing`, `RoundBattle.setup` is `null`; `enterBattlePhase` builds
every setup from the seats as they stand, then records the battles.
`run-match` setups are now `rulesetVersion` 2.

**Placing heroes is not a decision.** Readiness is
`decisionRevision > threshold`, so a command that bumped the revision
would mark the seat ready. `place-heroes` checks the revision but
doesn't bump it, and it always carries the *whole* formation, so the
last one received wins even if messages arrive out of order (a
move-or-swap delta wouldn't be safe that way). It is rejected once the
seat is ready (`already-decided`), which is what locks the formation.
A seat with a bye already counts as ready, so it can't rearrange that
round; left as is rather than special-cased.

**Bots place, then ready.** A bot's target formation is the default
rows with its columns shuffled by its controller seed. `decideBotCommand`
compares that target with its current formation and returns
`place-heroes` until they match, then `confirm-ready`. Since placing
doesn't make a seat ready, `runBotCommands` now lets each bot issue up
to four commands per pass instead of one; otherwise every preparing
phase would need an extra settle step per bot.

**The default formation is by basic-attack range alone.** Heroes whose
basic attack reaches at most 1.5 cells go on the front row, the rest on
the back, centre-out. The first version also sent anything with an
ally-targeting ability to the back row, and measurement showed that
flipped a core result: Mend reaches only 8 units, so a support in the
back row can't heal the bruiser, and three bruisers beat a mixed team
300 of 300 (it was the other way round, 300 of 300, before the board).
The formation probe settled it: the mixed team wins 100 of 100 with the
support on the front row next to the bruiser, or with everyone on the
back row, and loses 100 of 100 with the support behind. So placement
now decides fights, which is the point, and the default needs to be a
sensible one.

Before and after the board, same probe (300 seeds per matchup, plus 100
all-bot 8-seat runs):

| Measure | Before (100×60 strip) | After (8×8 board) |
| --- | --- | --- |
| mixed vs mixed | 300 mutual wipeouts, mean 379 ticks | 300 mutual wipeouts, mean 413 ticks |
| mixed vs three bruisers (either side) | mixed 300/300, 303 ticks | mixed 300/300, 412 ticks |
| three bruisers mirror | 300 mutual wipeouts, 392 ticks | 300 mutual wipeouts, 484 ticks |
| three rangers vs three bruisers | rangers 300/300, 425 ticks | rangers 300/300, 320 ticks |
| all-bot runs: draws | 68 of 2124 battles (3.2%) | 32 of 2146 (1.5%) |
| all-bot runs: mean fight length | 345 ticks | 337 ticks |

No hero numbers were retuned. Mirror matches still end symmetrically,
so the south/north rotation adds no side bias.

## Three.js renderer and the placement board

The Stage 2 and 3 build of `docs/board-and-renderer-plan.md`. Everything
here is client-only; no engine or run code changed.

**One WebGL renderer per page mode, reused for everything.**
`createBoardStage` (`apps/client/src/game/views/board-stage.ts`) owns the
renderer, scene, camera, lights, board and a DOM overlay. The match scene
makes one inside its persistent battle layer and reuses it for the
placement board and every battle, including every switch between
players' battles; the lab makes its own once. Battle and formation
views only add and remove their own objects. Browsers cap live WebGL
contexts, and the old code rebuilt its canvas on every battle switch.
Verified: 5 rounds with 40 player switches left exactly one canvas and
six health bars per battle, with no errors.

**The camera.** Perspective, 30° field of view, pitched 56° down, fixed
yaw. It sits on the watched player's side: south for team A, north for
team B (a 180° turn, lights turning with it), so the team you watch is
always nearest you, as in Underlords. Checked by watching a battle as
"you" and then as the opponent: each time the watched team was blue and
nearest the camera. The board is framed inside the HUD-clear area:
a binary search on distance fits the board's projected corners (plus
hero height) inside the viewport minus `ViewportInsets`, then a view
offset centres it there.

**Placeholder heroes are tabletop miniatures.** Each hero is a few
primitives on a team-coloured base (`hero-figures.ts`): a broad armoured
bruiser, a hooded ranger with a crossbow, a robed support with a staff.
Animations are procedural (idle bob, run bounce, attack lunge, cast
glow, hit flash, fall and sink on death). The `HeroFigure` interface is
what a loaded `.glb` will implement, so real models replace these
without touching the battle view.

**Health bars and damage numbers are DOM, not WebGL.** They sit in the
stage's overlay and are placed each frame by projecting the hero's head.
Crisp text and the HUD's fonts and tokens for free; six bars cost
nothing.

**No look-ahead yet.** Hits land on the engine's tick. Ranged hits
launch a 0.16 s projectile when the damage happens and show the hit
when it arrives; chained bolts draw an arc from the previous target.
Starting swings early from the recording is still possible later (see
the earlier note on Phase 6).

**Placing heroes happens on the same board.** During `preparing` the
big versus portraits are gone: a compact "You vs Bot N · Drag heroes to
place them" header sits over the full board, your heroes stand on your
half, and dragging one onto another cell of your half moves it (onto a
hero swaps them). Each drop sends the whole formation. Verified: a
ranger dragged forward started the battle on that cell.

**The preparing timer now survives re-renders.** Every placement
re-renders the screen, and `render()` used to restart the 15-second
countdown each time. Timers are now keyed by `phaseEpoch`; a re-render
in the same phase keeps the running one. Verified by dragging at 15 s
and seeing 5 s left ten seconds later.

**Two bugs found while testing, both fixed:**
- *A pre-existing crash in the round view.* The first animation frame's
  timestamp can be earlier than the `performance.now()` read just
  before it, so the playback clock could go below zero and read frame
  −1, which threw and stopped that round's animation loop. It showed as
  an intermittent frozen timer and the "reading 'snapshot'" errors seen
  in earlier sessions. `RoundPlayback.advance` ignores negative steps and
  `frame` clamps its index. The round view also caps a frame at 0.1 s,
  so returning to a backgrounded tab resumes a local battle instead of
  skipping to its end. (Online, the replay deliberately jumps forward
  to the server's clock instead; see Phase 6.)
- *Stray damage numbers over the player rail.* While the battle layer is
  hidden its size is 0, and the stage recorded a 1×1 viewport; with the
  HUD insets, a 1×1 fit centres everything at (232, 100), where the stray
  numbers appeared on the first frame after the layer came back. The
  stage now ignores zero sizes and re-measures whenever a board is
  shown. Verified: 49 numbers in a full battle, none off the board.

**Bundle size.** Three.js took the client bundle to 632 kB (164 kB
gzipped); with the Colyseus SDK and protocol from Phase 6 it's 892 kB
(243 kB gzipped). Both trip Vite's 500 kB advisory warning. Left as is:
it's one page, and splitting it would only move the same bytes.

## Phase 6: online mixed lobbies

**Asked for directly** ("do phase six for me now"). One Colyseus room
(`match`, `packages/server-runtime/src/rooms/match-room.ts`) hosts a
whole eight-seat run; the run engine from Phase 5 is the authority.

**Battles are resolved at the lock and replayed by every client, not
stepped on a room clock.** The plan (section 13, steps 6–7) has the
room step four battles at 30 Hz and publish unit states at 10 Hz. The
engine is deterministic, battle setups are public once locked, and the
client already replays any battle from its setup on one shared round
clock (`round-playback.ts`). So the server does what the local game
does: `enterBattlePhase` records all four battles at once (2–5 ms
measured), publishes setups and results, and then **holds** the run for
exactly the replay length plus the 3-second end pause
(`roundHoldSeconds` in `packages/run/src/pacing.ts`, shared by server
and client) before moving on. Every browser replays in step, starting
from the server's phase start time so a late joiner or reconnect lands
at the right moment. Consequences, accepted for the prototype:
- A modified client could compute a result before its replay ends. That
  is a spoiler only: every choice for the round is already locked.
- "Simulation time" is measured as resolve time per round, not cost per
  tick, and no unit states cross the wire at all.

**The hold comes after settlement, not before.** The run is held in
`round-result`, where health is already settled. The client's player
rail was built for exactly that (it adds a heart back for a loser until
their fight ends on screen); holding before settlement would have
double-counted.

**Private and public data go out on different channels.** Colyseus schema
state (`MatchState`) carries only the lobby roster (names, bot or human,
connected, host), phase, epoch and deadline. Each human gets a `view`
message with `getPlayerView` for their own seat, the same projection
the local game and the bots use, so private offers and other seats'
pending choices never reach anyone else. A view is 3–8 KB. Clients send
`sync` once their handlers are registered: messages sent during the join
itself arrive before the client can listen for them.

**Commands are validated twice.** zod schemas in the new
`packages/protocol` check message format at the boundary; malformed
messages never reach the run. The room parses with `safeParse` itself
rather than Colyseus 0.18's `validate()`, because `validate()`
disconnects the sender (close code 4002, which the SDK won't
auto-reconnect), and that seat would then forfeit. Then the room
takes the actor from its own session-to-seat map (a message has no
`playerId` field at all), checks run ID and phase epoch, and passes a
`RunCommand` with the client's expected revision to `applyCommand`.
Each seat remembers its last 64 acknowledgements, so a resent command ID
gets its original result instead of being applied twice.

**Joining and starting.** Eight seats start as bots; a joining human
takes the lowest bot seat (synchronously, so two joins can't share one),
and the first human is host. At start the room goes *private*, not
*locked*: Colyseus refuses `joinById` on locked rooms, which would also
block reconnects, while private rooms simply drop out of matchmaking.
Any fresh join after start is rejected in `onJoin`.

**Views go only to the players whose view changed.** Each seat
remembers the last view it was sent; a command republishes only views
that differ, so one player's placement drags reach nobody else (a
review probe had 200 placements produce 200 views, 419 KB, at every
other human). A client can still ask for a fresh copy with `sync`, and
it does so after any rejected command, so a stale local board corrects
itself. During the post-round hold the published deadline is the hold's
end, which the client uses for its "Round over" countdown; a late or
skipping client therefore waits only for what's left of the hold, and
the upgrade screen always opens with its full time.

**The lobby host moves on a drop, not just on a leave.** A host whose
connection drops before start hands the role to a connected human at
once, instead of blocking Start for the 30 s grace.

**Deadlines belong to the server.** Draft 30 s (online only; the local
game still has no draft timer, still awaiting a decision), preparing
15 s, upgrade 15 s. When one passes, every human who hasn't decided gets
`decideFallbackCommand`: the baseline bot's choice for draft and
upgrade, but only *Ready* for preparing, since the bot's placement
policy would rearrange a human's heroes. The client shows the server's
deadline instead of its own countdown.

**Reconnects and forfeits.** A dropped connection keeps its seat for
30 s via Colyseus `allowReconnection`; the page keeps its reconnection
token in `sessionStorage` and resumes on load. Two tabs opened
separately are two players; a tab *duplicated* from another copies its
`sessionStorage`, resumes the same seat and takes it over. Navigating
away inside the page (Back to the lab, say) now *suspends* the
connection instead of leaving, so the same grace applies and coming
back resumes; only Leave or Menu leave for real. An invite link for the
room you're already in does nothing; one for another room asks first. When the grace runs out, or a player leaves after
start, the seat is marked `forfeited`: from then on it plays by the
fallback policy, keeps a pairing only if the current round's pairing
was already made, is never paired again, and is eliminated at the next
settlement (health 0), never twice. (The first version re-paired
forfeited seats every round, where an autopiloted team could still
knock out a live player; caught in review and fixed in
`pairablePlayerIds`.) That made the old
`computeWinners` gap reachable (every survivor eliminated in one
settlement), so it now follows the plan: those seats share the win,
preferring ones that didn't forfeit.

**One SDK trap, found live.** `ColyseusSDK.reconnect(token, "match")`
type-checks (an overload takes a room name) but throws a "DEPRECATED"
error at runtime whenever the second argument is a string, so the first
browser build silently failed every resume and fell back to the menu.
The mocha test didn't catch it because it called `reconnect(token)`.
The client now passes the room name only as a type argument:
`sdk.reconnect<typeof MATCH_ROOM_NAME>(token)`.

**Refactor checked for behaviour.** `runBotCommands` now shares its loop
with the fallback path. 150 all-bot runs gave identical results with
the old loop and the new one.

## `pnpm lint` on any Node

**Asked for directly** ("you must get pnpm lint working"). `pnpm lint`
failed on this machine's default Node (20.19): oxlint loads
`oxlint.config.ts` and the anti-slop plugin (`tools/oxlint/anti-slop/*.ts`)
with a plain `import()`, and Node 20 can't import TypeScript. Earlier
passes ran lint under Node 24 by hand, which hid the failure from anyone
using `pnpm lint` directly.

The script is now `NODE_OPTIONS=--import=tsx oxlint`: `tsx` (already a
root devDependency) registers a TypeScript loader before oxlint's
JavaScript side starts, so the config and plugin load on Node 20, and
it's harmless on Node 22+, which strips types natively. Verified on
20.19.0 and 24.5.0: both exit 0 on the clean tree, and under 20.19.0 the
plugin rules really ran (a scratch file's `require-readable-spacing`
errors were reported and failed the command). Converting the config to
JSON was the alternative, but the plugin itself is TypeScript, so a
loader was needed either way.

**Braces are required everywhere** (asked for directly: "we need {}
around if statements, for loops, etc... I don't like inline").
`oxlint.config.ts` enables `curly: ["error", "all"]`, so `if`, `else`,
`for`, `while` and `do` bodies must be blocks. The existing code had no
violations; a scratch file with a braceless `if` and `for` was flagged
on both and failed `pnpm lint`, so the rule is live.

## Phase 6 review pass (two review agents)

A server/engine reviewer and a client reviewer read the work
independently and confirmed findings with probes. Fixed:

- **Forfeited seats were paired again** (major): see "Reconnects and
  forfeits" above. Probe after the fix: 0 re-pairings, 0 stalled runs
  and 0 wins for the forfeited seat across 600 runs forfeiting in
  draft or upgrade.
- **Leaving the match screen forfeited instantly** (major): now suspends.
  Verified in the browser: online, drafted, went to the lab for 2 s,
  came back to the same seat, team and phase.
- **Skip online left a dead "Resolving" screen** (major): the round-over
  countdown now follows the server's hold. Verified: after Skip, 1 s of
  "Round over", then the upgrade screen with a full 15 s.
- Malformed messages disconnecting their sender; placements broadcast
  to everyone; the lobby host drop; skip/catch-up spawning dozens of
  effects in one frame (effects are skipped when the battle view snaps);
  "Fight!" still clickable while connecting; a placement dropped after
  Ready; Confirm on the draft sendable twice; online timers firing
  their own fallback commands after the server's; the lab still
  simulating while hidden behind the match; no `touch-action` on the
  board; a new GPU buffer for target lines every frame; unclear join
  errors ("That lobby is full", "That match has already started").
- Deadline fallbacks now cover bot seats too, so a rejected bot command
  can't stall a phase.
- Tests: a vacuous assertion replaced with an exact public-key check, a
  deadline-sensitive test given slack, and `pnpm test` now rebuilds the
  server's workspace dependencies first. New tests for each server fix
  above (13 match tests, all passing on Node 20.19 and 24.5).

Recorded, not fixed:

- **Bots are predictable to a modified client.** Battle seeds are public
  and derived from a 31-bit run seed; brute-forcing it (about 2.5 min)
  lets a client predict every bot's formation and upgrades. Fix when it
  matters: salt battle and controller seeds with a server-only secret.
- Session IDs are in the public lobby state; not exploitable, since
  reconnecting needs the separate reconnection token.
- A client that drops again while its reconnection is still in progress
  goes straight to `onLeave` and forfeits without a second grace
  (Colyseus behaviour).
- Online, the finished screen doesn't say who knocked you out if you
  spectated later rounds (it looks only at the latest round).

## Heroes, combos and builds: the first slice (2026-09-22)

The design is `docs/heroes-and-builds-design.md`. Its §17 has what's
built, the tuned numbers and the survey snapshot.

- **The new heroes live in their own catalogue.** `firstSliceCatalogue`
  holds the four heroes plus the items and runes, and the match uses
  `gameCatalogue` (currently the first slice). The legacy ranger, support
  and bruiser content still backs the battle lab. Every engine change is
  additive and switched on by content, so the 15 legacy event digests
  (duel, three-vs-three and three-bruisers, over seeds 1, 2, 3, 7 and
  42) are byte-identical. They were checked again after the last engine
  change.
- **Numbers are ×10** (hits of 40–60 on 1500–2200 HP), so damage ranges
  are whole numbers and crits read as big.
- **Run rules default to health 13 and max loss 3, not the approved 12
  and 4.** At 12/4, 61% of eliminated seats were out before round 9, so
  they never saw legendaries; at 13/3 that falls to 44%, and runs still
  end at a median of 14 rounds. The table is in the design doc's §17.
  This is awaiting the user's call, and reverting is two numbers in
  `DEFAULT_RUN_RULES`.
- **Overtime is a draw.** The battle cap rose to 60 s with no escalating
  damage, on the user's instruction. Timeouts are 2.8% of bare 3v3
  battles, all Bulwark-heavy.
- **Item picks never fail.** A picked item goes to the stash even when
  the stash is full, so a reward decision can't deadlock. The stash cap
  is enforced on moves, not on picks.
- **Equipment commands don't bump the decision revision.** Readiness is
  `decisionRevision > threshold`, so moving an item doesn't un-ready
  anyone. In preparing, equipment is locked once you're ready. Choosing
  an offer bumps the revision.
- **The caster shield keeps the larger amount.** The survey showed Echo
  on Bulwark at −4.9 points: the echo's weaker Challenge overwrote the
  first cast's bigger shield. Now a recast keeps whichever is larger.
- **Pending impacts store their radius.** The client draws Meteor's
  landing marker from `snapshot.impacts`. The radius after Widen exists
  only on the compiled ability, so the engine copies it onto the pending
  impact. This is state only and adds no events, so the digests are
  unchanged.
- **The loadout rail only lights heroes that can take the piece.** The
  browser check found Chain silently refused on Pyromancer: Meteor is an
  area signature, and Chain fits target, projectile and link signatures.
  The client now asks `runeCanGoOn` and `hasFreeItemSlot` and dims the
  other heroes.
- **HP bar ticks scale with max HP.** The 25-HP tick was sized for
  100-HP heroes. At ×10, a 54 px bar got 62–88 ticks, each under 1 px
  wide. Their 1 px separators covered the whole bar in a 75% dark
  overlay, so the bars looked black. A tick is now 25, 50, 100, 250, 500
  or 1000 HP, whichever is the smallest that gives at most 12 ticks.
  That's 250 for the new heroes (6–9 ticks) and 25 for the lab heroes,
  which is unchanged.
- **The lint cleanup:** open `Record<string, …>` lookup tables (hero
  glyphs, status glyphs, figure builders) became `switch` functions, per
  `anti-slop/no-known-value-widening`.
- **Recorded, not fixed:**
  - Bare 3v3 compositions are very predictable: 100 of 210 matchups are
    hard counters after confirmation.
  - Aegis on Duskblade is worth +21.7 points.
  - Thunder Maul and Pocket Sand barely help on some heroes.

  The user asked to know about these, not to have them fixed.

## Tempo and the reward screen (2026-09-23)

**Match replays run at 1×, not 2×** (`PLAYBACK_SPEED` in
`packages/run/src/pacing.ts`). The user asked for this directly: "I
can't really follow what's going on … people need to walk a lot slower,
attack slower." The 2× dates from the Phase 5 client, when rounds were
kept short. At 2× a 26 s median fight went by in 13 s, and a Duskblade
attacked every 0.43 s.

- **Server and client stay in step.** Both read the same constant: the
  client's replay clock, and the server's round hold through
  `roundHoldSeconds`. The server tests scale the hold by 0.01, so their
  run time doesn't change.
- **The cost is wall-clock time.** A round now holds for 2 s + the
  longest battle + 3 s, so rounds take noticeably longer.

**The sim is slower too.** Attacks are 1.4× slower and hit 1.4× harder,
walking is about 0.7× as fast, and mana per attack is 21 (set per hero in
content, so the engine default and the legacy digests are untouched).

- **Numbers tuned to attack cadence moved with it:**
  - Frost Bolt's slow and Deep Freeze's window;
  - burn's duration;
  - Frost Brand now triggers every 3rd hit instead of every 4th;
  - the taunt and shield durations, and the Shield Bash and Flame Ward
    cooldowns;
  - Spiked Plate's thorns and Grudge's ramp.
- **The first survey after the pass** put Pyromancer at 59.5% and
  Duskblade at 42.5%:
  - Pyromancer rose because longer burns from Meteor spread more total
    damage;
  - Duskblade fell because a diver suffers most from slower walking.
- **Fixed** with burn at 8 per second and a Duskblade touch-up (walk
  2.5 cells/s, hits 73–90). A 1,600-battle probe then put all four
  heroes at 48–52% per copy. The review later showed per-copy rates
  always average 50% and hide imbalance (see "Review fixes").
- **The better measure is one-swap:** teams that differ by exactly one
  hero. It gave Bulwark 46.7%, Frostweaver 51.0%, Duskblade 52.9% and
  Pyromancer 49.4% across all teams.
- **Among teams with no duplicates, the team with Duskblade wins 84%.**
  With four heroes, Duskblade is the only Cunning hero. A team without
  it loses Shatter and Crush, so this is a roster gap, not a stats
  problem. It gets balanced when the other six heroes land.
- **Signature timing is unchanged** (first cast about 5.6 s).
- **Combos went from 4.8 to 3.9 per fight**, which is fewer but still
  inside the 2–6 target. That fits "things need to be more meaningful."

**The reward screen follows the Underlords reference the user shared.**

- **One decision at a time** in a compact panel, instead of every
  decision stacked on a full screen. Dots show how many are left.
- **The board stays visible behind it**: the player's own formation,
  locked, under a dim-and-blur layer.
- **Each offer is a wide row** with a big round icon ringed in its
  rarity colour, a corner badge for its kind, a rarity or tier tag, then
  a large name and the description. The combo gain chips and, for runes,
  the heroes it fits sit under the description.
- **A timer bar** under the list follows the phase countdown and doesn't
  restart between decisions.
- **The deadline fallback** still resolves every outstanding decision.
- **Icons are placeholders:** one silhouette per item and rune (also used
  on the team rail) until the art in `missing_assets.md` entries 15–18
  arrives.

**Not done this turn, on purpose:**

- **One of each hero per team.** Recommended, since duplicates can't
  help Tier II combos and triple Bulwark caused the timeouts. But with
  four heroes, uniqueness caps a team at four and every seat ends up
  with the same four by round 3, so it lands with the other six heroes.
- **The other six heroes and their names and portraits:** waiting for
  the user's go-ahead.

## No backwards compatibility: the placeholder heroes are gone (2026-09-23)

The user doesn't want anything kept alive for compatibility ("i hope we
arent trying to do backwards compatibility"). There were no players,
saves or old clients to protect. The only "legacy" was the three
Phase 2 placeholder heroes and the code that existed just to keep them
behaving exactly as before.

**Deleted:**

- **The placeholder content:** the ranger, support and bruiser heroes;
  their abilities (strike, bolt, mend); their six upgrades; the mend
  reaction; and the old `catalogue`.
- **The old reaction system:**
  - `ReactionDefinition` and `catalogue.reactions`;
  - `grantsReactionId` and the `reaction-shield-amount` stat;
  - `battle/reactions.ts` and its per-tick queue.
- **The old chain lightning:** the `chain-damage` effect,
  `battle/chain.ts`, the `applyLegacyChain` ordering shim and the
  `ability-chain-bounces` stat. The Chain rune has its own
  implementation.
- **Other old-only mechanics:** the slowed-target damage bonus, the
  `prerequisiteUpgradeIds` graph (talents use `requiresAnyOf` and
  `excludes`), and the plain "upgrade" category with
  `generateUpgradeOffers`.
- **The survey's `--catalogue live|first-slice` switch**, and the
  client's fallback lookup into the old catalogue.
- **The old figures and icons**, and their role colours. An unknown hero
  id now throws instead of quietly drawing the old bruiser.

**Kept, because the new heroes use it:**

- slows, shields, heals and statuses;
- the `reaction` hit flag (rule 5) and the `reaction-budget-exceeded`
  event, which the triggered-cast queue raises.

**Renamed:** `SingleTargetEffectDefinition` became the one
`EffectDefinition`. `firstSliceCatalogue` is just `gameCatalogue`, the
only catalogue.

**The lab and `scripts/simulate.ts` use the new heroes:**

- **Duel:** Duskblade against Bulwark.
- **Three vs three:** Bulwark, Frostweaver and Duskblade against Bulwark,
  Pyromancer and Duskblade, so all three combos appear.
- **The Tuning panel** lists each hero's talents by tier and enforces
  their requirements.
- **A new determinism baseline** replaces the 15 old digests: the two
  scenarios over seeds 1, 2, 3, 7 and 42, recorded twice and identical.

## Review fixes (2026-09-23)

Two review agents read the engine, content, survey, run, protocol,
server and client. Fixed:

- **Derived hits applied the attacker's damage multiplier twice.** This
  covered Interpose's share and every splash (Shatter shards, Tier II
  Overload, Worldbreaker). Those hits are now marked `alreadyScaled`.
- **Item copy limits were never enforced.** Three Vampiric Fangs gave
  45% lifesteal. `itemCanGoOn` now checks `maxStacks` everywhere an item
  can move: commands, reward auto-placement, bots and the rail. The
  engine's equipment check reports `item-over-stack-limit`.
- **Primer overwrote the signature's own condition,** which killed
  Frostweaver's Shatters and Duskblade's Crushes. It now fits only
  signatures that don't apply a condition (Bulwark and Pyromancer).
- **The trait strip paired appliers with detonators by hero id,** but the
  battle pairs by unit. It now pairs by unit. Tier II still needs two
  different heroes on each side.
- **Echo could land on an unit made untargetable after the cast.** It
  now retargets.
- **Echo and Retaliate recasts re-applied full-strength burns and a
  second burning zone.** Scaled recasts now repeat the hit only.
- **DoTs kept ticking after an Aegis revive cleared them.**
- **Challenge counted its shield per enemy in range,** not per taunt
  landed.
- **Retaliate counted shield-absorbed damage as HP lost.**
- **The survey's hero flag could never fire.** The per-copy win rate
  always averages 50%. The flag now uses a one-swap head-to-head: teams
  that differ by exactly one hero, which averages 50% across heroes.
- **Other survey fixes:**
  - the hard-counter headline no longer counts mirror matchups, and it
    names the confirmation cap;
  - confirmation uses fresh seeds;
  - combos are now counted.
- **The watch rail showed the wrong health during a knockout.** The client
  now remembers each seat's health from the last preparing view.
- **"Unequip" showed with a full stash.**
- **Clients on a different protocol version could join and then sit
  idle.** Now refused with "The game was updated · reload the page".

**Awaiting the user's decision:**

- **Every seat's full build reaches every client after each round.**
  Replays and "watch any battle" re-simulate from the battle setups, and
  those carry items, runes and talents. That's Underlords-style
  scouting, but it breaks the "private to its owner" invariant agreed
  with the Phase 1 session. The options are to accept it as scouting or
  to stop sending other battles' setups.
- **The run seed can be brute-forced from any battle seed** (about 4
  minutes in JS). It then reveals every seat's future offers and
  pairings. The fix: derive seeds with a keyed hash over a server-only
  secret. This was already recorded as "fix when it matters", and the
  review showed the offers leak as well.

## Run rules back to health 12, max loss 4 (2026-09-23)

The 13/3 override was measured at the old tempo. Re-measured after the
tempo pass (200 bot runs each), 13/3 pushed the median run to the
15-round cap. Runs were ending on the cap, not on eliminations. The code
is back to the user's decided 12/4: a median run of 13 rounds, with 41%
of eliminated seats lasting to round 9. 12/3 (14 rounds, 51%) is offered
as the alternative. The table is in the design doc's §17.

## Run rules: health 13, max loss 3, the user's choice (2026-09-23)

After the re-measured table, the user chose 13/3 ("we can change the
tempo to 13.3"), so the code runs it again. The median run reaches the
15-round cap, and 59% of eliminated seats last to round 9. This is the
decision now, no longer an override.


## Teleport beat before each fight (2026-09-23)

The user asked for a short phase after the placement timer runs out:
"your heroes teleport to the person's board or they teleport to you".

- **Who travels.** Team A is home, team B travels. Sides already swap
  every round, so every player alternates. If you're home, faint beams
  charge on the far half while your heroes stand still, then the
  opponent's heroes drop in. If you're away, your heroes are pulled up
  into beams, a white-out flash swaps boards, the home team is already
  standing there, and yours drop in beside them. Both players see the
  arrivals at the same moment.
- **Timing lives in the rules package.** `TELEPORT_SECONDS` (2 s) in
  `packages/run/src/pacing.ts` is added to `roundHoldSeconds`, so the
  server holds `round-result` 2 s longer. The client's round watch keeps
  one clock: the teleport owns its first 2 s and playback is
  `clock − 2 s`. Driving playback off the same clock stops the online
  catch-up from jumping past the beat. Skip moves the clock past the
  teleport too.
- **Drawing.** `apps/client/src/game/views/teleport-view.ts`. Every
  pose is a pure function of the clock, so switching focus mid-teleport,
  joining late or skipping all land on the right frame. The recording is
  built when the teleport mounts, so its cost doesn't land on the first
  fight frame.
- **Labels.** The round plate reads "Teleport". The header names whose
  board it is ("Your board" / "Bot 3's board"), not "Away", because the
  seat rail already uses "Away" for disconnected players.
- **Reduced motion** keeps the beams and the glow and drops the stretch,
  the lift and the flash.
- **Board stage.** The camera now glides (0.5 s) when only the HUD insets
  change, so placement → battle framing no longer jumps by about 27 px.
  A side flip at the same moment is invisible because the board is
  symmetric. `setExposure` drives the flash; `dispose` resets it.
- **Verified.** Home case in the real app (a local match stepped with a
  virtual clock): plate, header, beams, arrivals and a seamless hand-off
  to the fight. Away case only in an isolated harness, with the same
  view code. Server tests pass on Node 20 and 24.

## Board themes exploration (2026-09-23)

The user asked for nicer surroundings in a separate screen first: "a
cartoony Dota Underlords kind of vibe… some kind of story… palm trees
around and some boxes… give me a few variations".

- **Screen.** `#env` (one page, per the earlier decision), linked from
  the menu as "Board themes". Four themes: Smugglers' Cove, Sunken
  Temple, Frostpeak Garrison and Sunscorch Bazaar. The user called the
  old plain board ugly, so it's no longer offered. Each restyles the
  board (tiles, frame, caps, plinth) and the light and fog, then dresses
  the surroundings with props built from primitives, with small
  animations (water, fronds, flags, fire, snow, fireflies). No art
  assets are involved.
- **Framing.** Game view uses the battle HUD insets. "HUD" draws where
  the real rails and header sit, since most of the scenery lives in the
  margins the HUD partly covers. "Wide" pulls back to show the whole
  diorama.
- **Engine changes, all additive.** `BoardStage.setTheme(StageTheme)`;
  `DEFAULT_STAGE_THEME` is the base look a theme resets to when it's
  disposed. Fog is now measured from the camera's fitted distance
  (`fogBeyond`/`fogDepth`), so the wide view doesn't wash out.
- **Your board, saved and used in matches.** Clicking a card saves that
  theme to localStorage (`jev-game.board-theme`, default Cove) and marks
  it with a check. A `#env/<id>` link only previews a theme without
  saving it. Matches dress the board with your theme during placement,
  rewards and fights on your side, and the battle lab (`#lab`) uses it
  too. A fight on an opponent's board gets a theme derived from their
  player id, picked from the three you didn't choose, so the swap at the
  teleport flash is visible. Picks aren't sent to the server yet, so
  online opponents see a derived theme for your board rather than your
  pick. `missing_assets.md` entry 9 (board and environment art) still
  applies.
- **Measuring it.** The lab's "Stats" button shows FPS, frame time
  (average and worst), draw calls, triangles and GPU geometries, textures
  and shaders (`BoardStage.stats()` reads `renderer.info`). "Leak test"
  visits every theme once to warm up, switches through all of them four
  more times, and compares GPU geometries and textures before and after.
  Measured at game framing, 1440×900, shadows included: the plain board
  is 122 draw calls and 7k triangles. The themes are 558–661 draw calls
  and 32–42k triangles. Draw calls are the cost to watch; merging static
  props per material would cut them before a theme ships. The leak test
  holds flat (225 → 225 geometries, 4 → 4 textures). It does catch a
  real leak: with disposal removed on purpose it read 224 → 3,337. FPS
  can only be judged in a normal browser window, because the Claude
  Browser pane throttles frames.

## All ten heroes, names and lore (2026-09-23)

The user asked for Dota-style names, a lore doc ("how everyone works
together and a bit of a story"), and the other six heroes. They also
asked to wait for the full roster before any serious balance work.

**Names and lore:**
- `docs/lore.md` covers the world, the three currents behind the
  combos, how the rules read in fiction, ten heroes with stories and
  voice notes, rivalries, and summons.
- The display names are Anvil, Morrow, Gorrak, Vesper, Cinder, Rime,
  Moira, Nettle, Sexton and Brassjack.
- Code ids stay the class names (`bulwark` and so on), as Dota keeps
  internal names.
- Real Dota names and near-misses were avoided on purpose (Broodmother,
  Clockwerk, Dawnbreaker).
- "Jev" is left open in the lore: the archived game called the heroes
  Jevs, but here the Jevs are the AI commander seats.

**New engine features, all switched on only by content** (the lab
pair replayed identically after they landed):

- **Summons:**
  - A `summon` effect, and heroes with `summon: true`: thralls, the Bone
    Golem, turrets.
  - Spawns queue and join at the end of the tick in a fixed order, with
    ids from `nextEntityId`.
  - `maxActive` dismisses the oldest summon. Stacking summon buffs
    (`empower-summons`, keyed so talents add up).
  - A bout ends when a team's last hero falls; summons don't count, and
    neither do loss costs or the survey's hero tallies.
- **Harvest counts hero deaths only.** Counting every death gave 653
  golems in 400 probe fights, and up to 84 units in one fight. Hero
  deaths only: 85 golems.
- **Links (Shared Fate):** a `bind` effect with a link status. HP lost by
  one bound enemy is dealt to the others as armor-ignoring echo hits,
  which can't echo again. Siphon mana and Death Knell hang off the link.
- **Whirlwind is a channel,** not a zone. Its pulses resolve with cast
  flags on purpose, so Gorrak (Might) can detonate Disoriented. Zone
  pulses use reaction flags and couldn't.
- **Poison's "4 stacks Disorient"** is an explicit exception to rule 5.
  The condition is applied when the stack count crosses the threshold,
  whatever the hit flags. That's a threshold, not a chain reaction, so
  it can't loop.
- **Others:**
  - ally effects and ally zones (Consecrate's heals);
  - Last Rites, a save after Aegis on the same path, so on-kill passives
    don't fire for a saved unit;
  - Hex, a control that also shrinks the figure;
  - an `ability-healing` stat (heals had no scaling stat);
  - `setEffects`, `setMaxTargets` and `setChannel` ability changes;
  - `maxTargets`, `consumesTarget`, and the new targeting policies
    (highest mana, biggest shield, own summon);
  - Bloodlust and Overclock attack speed, Cleave, Withering, Martyrdom,
    summon-on-death.
- **Divers aim at heroes first.** `lowest-hp-enemy` prefers enemy heroes
  in reach and only falls back to summons, so Shadowstep and Leap don't
  waste themselves on thralls and turrets.

**One of each hero per team:**
- Draft offers are distinct.
- Recruit offers skip heroes you have.
- The survey builds teams from combinations of different heroes.

**Capstones simplified** where the §4 design needed a system of its
own: Army of the Dead, Bone Colossus's runes, Ill Omen, Mass Hex,
Fortress path-blocking and Gadgeteer's inherited runes. The list is in
the design doc's §18.

**Numbers:** the §14 first pass, scaled like the first four heroes, with
no tuning.
- A 400-fight stress probe with random different-hero teams and random
  talent paths: 0 crashes, every new mechanic firing.
- Median fight 25.8 s, 2.25% timeouts.

**Two fixes from the first full-roster survey:**

- **Morrow's heals had been scaled ×2.1 with HP instead of ×1.4 with
  damage.** She won 92% of one-swap matchups. Her heals were halved and
  her HP set to 2100, giving 77%. This is a sanity fix; the balance pass
  is still to come.
- **Summons spawned behind their owner.** Facing assumed the first unit
  was on the south side. It now comes from which half of the board the
  summoner stands on. Brassjack went from 19% to 36% one-swap.

**Runes that would do nothing are no longer offered.**

- **Echo and Retaliate** need a signature that still does something when
  recast at a fraction. Recasts skip summons, poison and channels, so
  these runes don't fit Gorrak, Nettle, Sexton or Brassjack.
- **Widen** now also widens Whirlwind.
- **Primer** also treats poison's Disorient threshold as the signature's
  own condition, so it no longer fits Nettle.
- **Checked:** a summon-heavy battle (Sexton, Brassjack and Moira with
  talents, against Gorrak, Nettle and Morrow) replays byte-identically
  across processes. Online clients re-simulate from setups, so this is
  what keeps them in sync.


## Phase 7, first slice: the Jev package (2026-09-23)

**The official TypeSafe API, not the archive's Cloudflare route.**
Why: the plan says to use the TypeSafe SDK and its official contract.
`@typesafe-ai/sdk` 0.6.0 exists, and the docs give
`POST https://api.typesafe.ai/v1/systemone` with `TYPESAFE_API_KEY` and
model `jev-latest` (jev-1.13.0 today). The archive called `typesafe/jev`
through Cloudflare's `/ai/run` endpoint. That's a separate access path,
and the archive holds only `.env.example`, no credentials. One transport,
in `provider/client.ts`, behind a `JevProvider` interface. A Cloudflare
transport is a single file if the user only has that token.

**No SDK retries; a 5 s timeout per request.** The SDK retries 408, 429
and 5xx twice by default and waits 10 s per attempt. The plan wants no
automatic retry and a provisional 5 s timeout, so the provider sets
`retry: { maxRetries: 0 }` and `timeout: 5000`. A failure falls back for
that one seat.

**Zod validates the SDK's answer.** The SDK parses JSON but doesn't check
it. `parse-response.ts` checks the envelope and the choice answer, and
that the choice is one of the offered keys.

**Readable option keys, facts computed in code.** Option keys are sent to
the model, so they read like `whetstone_on_morrow` or `recruit_cinder`,
and code maps them back to offer IDs. Following the jev-1.13
"jaggedness" notes (literal reading, no arithmetic, small state), each
option says what it does. Combo and attunement changes are computed with
`computeTeamTraits`, for example "This lights the Shatter combo". Reward
options are previewed with `applyCommand` on the real state, so only
legal options are offered. Legality stays in `run`.

**Fallback is the baseline bot, per seat, labelled.** Any provider error,
invalid answer, unknown option, illegal command or missed deadline falls
back to `decideBotCommand` for that seat only. Its record says
`source: "fallback"` with the reason. A draft falls back for the rest of
its picks after the first failure, so a slow provider can't eat the
whole 30 s window. The offline stub is labelled `offline`, never `jev`.

**A driver keyed by run, epoch, seat and revision.** At most one job runs
per seat. A result is applied only if the run, epoch and revision still
match. A job cancelled because the state moved on still reports its
records, marked `superseded`, and is never applied. The driver doesn't
re-ask a question whose answer it has delivered but the owner hasn't
applied yet. The first probe asked twice and threw 44 answers away as
stale.

**Draft and reward only; preparing stays on the baseline policy.**
Formation, equipping from the stash and readiness still use
`decideBotCommand`: `runBotCommands` plays `"jev"` seats in the preparing
phase and skips them in draft and reward. The plan starts Jev with hero and
upgrade picks; formation comes later if it proves worth a question.

**A `"jev"` controller kind in `run`.** `runBotCommands` skips `"jev"`
seats in draft and reward, where the driver answers, and plays their
preparing phase with the baseline policy. The deadline fallback
(`runFallbackCommands`) still covers every seat, so a slow Jev can't stall
a phase.

## Solo play goes through the server (2026-09-23)

**"Fight!" opens a private solo room; the in-browser match is deleted.**
Why: the user wants Play to mean playing against Jev, and the Jev key has
to stay on the server. We considered keeping the browser simulation and
only asking the server for bot decisions. That would make the server trust
the browser's account of the game to build Jev's questions, and it would
be an open endpoint for spending the key. With the server running the
whole match, the rules, records and replays stay in one place, and the
Phase 6 room already did nearly all of it. A solo room is private, starts
on the first join, and fills every other seat with a `"jev"` seat. The
cost is that "Fight!" needs the game server running; `pnpm dev` starts it.

**Seat names say what is really playing.** "Jev N", "Stub N" (offline
stub) or "Bot N" (no provider). A stub is never presented as Jev.

**Tests pin the baseline bots.** `match.test.ts` calls
`configureJevProvider({ kind: "none" })` first, so a developer's real key
can never be spent by the test suite. The solo test switches to the
offline stub and restores the baseline bots afterwards.

## Jev through Cloudflare, chosen from the environment (2026-09-23)

**Two transports behind one `JevProvider`.** The user's credentials are a
Cloudflare account ID and API token, the same route the archive used. So
`provider/cloudflare.ts` sits beside the TypeSafe SDK transport and shares
its answer validation (`choiceFromEnvelope`). `providerFromEnvironment`
picks TypeSafe when `TYPESAFE_API_KEY` is set, otherwise Cloudflare when
both Cloudflare variables are set, otherwise baseline bots.
`JEV_PROVIDER` can force any of them. Same limits either way: no retries,
a 5 s timeout, concurrency 4.

**The model goes in the request body.** Tried both on 2026-09-23:
`POST /accounts/{id}/ai/run` with `model` in the body returned 200;
`/ai/run/typesafe/jev` returned 400 "No route for that URI".

## The dev server is pinned to port 2567 (2026-09-23)

**`apps/server`'s `dev` script sets `PORT=2567`.** Why: the user's VS Code
terminal had `PORT=3000` in its environment. Colyseus's `listen()` obeys
`PORT`, so the server came up on 3000 while the client looks on 2567, and
"Fight!" failed. The unreachable-server case also showed the wrong message,
"Couldn't join that match": in a browser the SDK throws a `ServerError`
with no numeric code on a network failure. The client now reports any
failure without a numeric code as "Couldn't reach the game server · is it
running?"

## The rest of the runes and items (2026-09-23)

**All of §5 and §6 is built:** 13 more runes (19 in all) and 12 more items
(27 in all), including the first two cursed items. The full list and every
place the build differs from the design is in
`docs/heroes-and-builds-design.md` §19. The main calls:

- **Simplify rather than change a core model.** Prism of Three makes this
  hero's hits count as every current, instead of letting enemies hold
  three conditions at once. The one-condition-per-target model, and every
  display built on it, stays as it is.
- **Rule 5 still holds for every free cast.** Twincast, Opener, Last
  Word and Tandem use the same flags as Echo and Retaliate. Crown of
  Echoes is the only exception. Its flags keep `reaction: true`, so an
  echo can never schedule another echo.
- **HP costs aren't damage.** Overcharge, Blood Contract and Soulbound
  Blade emit a new `hp-paid` event instead of `damage-dealt`. That keeps
  self-inflicted HP out of damage totals, lifesteal, Retaliate and the
  survey's damage credit. The client shows it as a small dark-red number.
- **Fits are narrowed by behaviour, not just tags.** `runeFitsHero` now
  rejects any pairing where the rune would do nothing. The probe checks
  every rune on every hero it fits.
- **Tandem fires on any allied combo, once every 3 s.** Both 2-cell range
  versions were tried and measured, and each left three or more heroes
  where the rune never fired.

**The battle lab takes any teams and full loadouts.** A "custom teams"
scenario lets you put 1 to 5 of the ten heroes on each side. Team A's
picker now covers items and rune sockets as well as talents. The duel
and three-vs-three presets are unchanged and still match the baseline.
The scenario export format moves to version 3, which adds the teams; it
doesn't read version 2 (no backwards compatibility).

**The survey's pieces tier is now too big to run casually.** It tests
every piece on every hero, in every team with that hero, against every
team. With ten heroes and the old 81 upgrades it was already about a
million matchups. With all 106 it is 1.87 million, or 15 million battles
at 4 seeds. Light surveys use the teams and runs tiers
(58,080 battles). The pieces tier needs sampling before it's useful again.

## Right-hand HUD: damage meter, combos, items and real tooltips (2026-09-23)

The user shared two Dota Underlords screenshots and asked for: "top
right i wanna see like damage done graph, optionally can swap to like
damage taken, healing done, etc", "we need proper tooltips so badly… i
need to hover over items and see exactly what it does… i need to hover
over our combos", and for the items and combos panels to look like the
reference. Separately: "remove the event log for now also its too
spammy".

- **One right-hand column** (`.team-rail`, 212 px). During fights it
  shows DAMAGE, then COMBOS, then ITEMS for the team being watched,
  built from that battle's setup, so switching focus to another fight
  shows their build. While planning it shows your COMBOS and ITEMS.
  Placement and battle board insets widened to 244 px on the right to
  match. Skip moved into the bottom-right corner that Ready uses while
  planning. The column scrolls when its content doesn't fit (see the
  laptop pass below).
- **COMBOS.** A grid of badges like the reference's alliances: the three
  combos always, plus any attunement with at least one hero. A lit badge
  takes the combo's colour, and Tier II adds a gold ring and a "II" tag.
  Pip bars show heroes that set up the mark and heroes that detonate it,
  two of each for Tier II; attunements show three. Hovering the header
  lists all six with their effects, which mirrors the reference's second
  image.
- **ITEMS.** Per-hero rows (portrait, round item sockets, diamond rune
  sockets, talent bars), with the stash last. We kept per-hero rows
  rather than the reference's flat grid. The flat grid works in
  Underlords because you drag items onto figures on the board. Ours
  would need picking in the formation view and would hide free slots.
  Pick-up-then-click-a-hero is unchanged, and a glowing empty socket
  now takes the click too.
- **Tooltips** (`hud/tooltip.ts`).
  - One body-level card, opened with
    `attachTip(element, { key, side, live, render })`. It replaces
    `title=` for game info.
  - It appears after 160 ms, or instantly while you move from one tip to
    the next. It follows re-renders by key or by what's under the
    pointer, and live tips refresh four times a second.
  - Keyboard focus and Escape work, and a long press shows it on touch.
  - It flips and clamps to stay inside the viewport. Tips inside the
    column anchor to the column's edge (`data-tip-edge`) so they never
    cover it.
  - Numbers, conditions and schools are highlighted in the text.
- **Tooltip copy** lives in `hud/tips.ts`, and every number comes from
  game constants (`TICK_RATE`, cell size, the combo and attunement
  constants), so tips follow balance changes.
  - Items and runes: rarity, the authored description, stacking from
    `maxStacks`, combo links read from the data (sets up or detonates),
    which of your heroes a rune fits, and where the piece sits.
  - Combos, rebuilt after the user found the first version "very wordy"
    with weak hierarchy. It now reads top to bottom: name and tier tag;
    a one-line recipe (`[Staggered 3 s] → [Arcana hit]`); one short
    line per tier with the current tier highlighted; Setup and Detonate
    rows (pips plus hero chips); one next-step line. No paragraphs.
  - Heroes: a card modelled on Underlords' unit panel, which the user
    shared.
    - Name band, then a portrait area with school and condition badges.
      It shows the hero glyph until portraits arrive (missing_assets
      #18).
    - A green HP bar, and a stat column: damage range, attack rate, DPS,
      armor, crit. The stats come from `compileBuild`.
    - The signature with its mana cost, then an icon strip of items,
      runes and talents.
    - The card lives in `hud/hero-card.ts` (classes `.unit-card*`). The fight's unit inspector
      (`hud/unit-inspector.ts`, bottom left in matches and in the battle
      lab) now uses the same card instead of the old debug text.
    - The inspector card is built once per selected unit. Each frame it
      updates only the HP bar (red for enemies, with a shield segment),
      the mana bar, the status chips with seconds left, the stats and
      damage dealt, and a "Fallen" overlay on death. Hovering an item
      icon in it opens that item's tooltip.
  - Also covered: attunements (the bonus shown large), talent bars,
    empty sockets, the stash, reward gain chips, rune-fit chips, recruit
    rows and the reward step dots.
- **Damage meter** (`hud/damage-meter.ts`).
  - Four views: damage dealt, damage taken, healing done and shields
    given. Dealt and taken include damage shields absorbed; otherwise
    shielded tanks read as taking nothing.
  - Summons count for the hero that raised them. Hits on summons aren't
    anyone's "taken".
  - Rows re-sort with a slide. Hovering a row gives a live breakdown by
    source (by attacker for taken), plus crits and combos.
  - The chosen view is remembered (`jev-game.meter-metric`).
  - Mounting a battle (focus switch, end of the teleport) recounts from
    the recording, then each frame's events are added.
- **Verified in a live match.**
  - After Skip, the running totals equal a from-scratch recount on all
    four views.
  - In every fight without summons, team A's dealt equals team B's
    taken (4 of 4 pairs).
  - Summoners' breakdowns list their summons ("Thrall", "Turret").
- **Event log** removed from matches until it comes back in a quieter
  form. `hud/event-log.ts` stays because the battle lab's debug feed
  still uses it.
- **Laptop pass (2026-09-24).** On the user's laptop (about 1512×760)
  the user reported: "its a bit condensed", "tooltips sometimes dont go
  away", and "add a Y overflow on dps so it doesnt go down too far".
  - **Draft cards overlapped.** The hover card's classes were
    `.hero-card*`, the same names the draft's offer cards use, so the
    card's 252 px width landed in the draft's 150 px columns.
    - The card's classes are now `.unit-card*`. `.hero-card` is the
      draft card again.
    - Draft columns now scale with `clamp(150px, 12vw, 184px)`.
  - **Tooltips.**
    - Moving from a tip onto the board or panel padding never hid it:
      the Escape-suppression check treated "nothing hovered" as the
      suppressed element.
    - Safety net: every 100 ms the tip checks what's under the pointer.
      It switches or hides if its anchor has moved away (a scrolled
      column, re-sorted meter rows). It hides when its anchor stops
      rendering. A keyboard-focus tip only follows the focused element.
    - Chrome fires `pointerover` on the parent when the element under
      the pointer is re-rendered, so `pointerover` also checks the point
      itself. Picking up an item keeps its tip open with the new hint.
  - **Damage meter.** Rows scroll inside the section. Three are visible
    (five on screens 900 px tall or more), and the bottom edge fades
    while more rows are hidden.
  - **Combos.** Two columns, each badge the combo or school name above
    horizontal pips. This replaces three columns of icons with vertical
    pips.
  - **Reward screen.** Its `max-height: 820px` compaction never applied,
    because the base rules came after it in the file. It now sits below
    them, and four offers fit in 760 px without scrolling.
  - **Fight column** may run 8 px lower (`calc(100% - 148px)`), so three
    heroes fit at 720 px tall. With four or five heroes it scrolls on
    short screens.
  - Checked at 1512×760, 1440×780, 1366×768 and 1280×720 across draft,
    placement, battle and rewards.

## 3D model pipeline (2026-09-23)

The user asked for a framework for our 3D models: Blender files in
source control, organised scenes, a storage convention and efficient
loading. The day's Blender work (the low-poly Anvil with seven clips, the
high-detail Anvil and Gorrak, and the flat and painted style tests) existed only
in an unsaved Blender session and in session temp folders. All of it
now lives under `art/`. The guide is `docs/models.md`.

- **One `.blend` per asset, named by the game id.** The files live at
  `art/models/<kind>/<id>.blend`.
  - The alternative was one big file. Git LFS stores a whole copy of a
    binary on every change, so one file would re-store every hero on
    each edit. It would also block two people (or two sessions) working
    on different heroes, and the game loads one `.glb` per asset anyway.
  - The one scene that used to hold everything was split by a script
    that read a data-API dump of the live session. Nothing was saved
    through the live bridge, which crashed Blender once before.
- **A fixed layout inside each file.** Collection `<id>` is exactly
  what ships; `stage` is a game-angle camera, a light and contract
  guides that are never exported.
  - The build finds the export by name, so no configuration drifts.
  - The collection also carries Blender's own collection exporter with
    the pipeline's settings, so exporting from the Blender UI matches
    the CLI.
- **Explorations are kept separate.** `art/explorations/` holds
  experiments that don't ship. Every file under `art/models/` must
  export cleanly.
- **Generators are kept as recipes.** `art/generators/` holds the build
  scripts from both sessions, so none of them vanish with a temp folder
  again. The props builder nearly did. The `.blend` files remain the
  source of truth.
- **LFS for source art only.** `.blend`, and images and FBX under
  `art/`, go to LFS. Runtime `.glb` and audio stay in plain git: they're
  small, and the build and any deploy need them without LFS. Nothing
  was committed; the working tree holds three other sessions' uncommitted
  work.
- **Compression by Blender, checks with gltf-transform.**
  - Blender 5.2 writes `EXT_meshopt_compression` itself: Anvil went
    from 966 KB to 280 KB.
  - The client decodes with three.js's bundled meshopt decoder, so the
    client gains no dependency.
  - The checker reads files with `@gltf-transform/core` and
    `extensions` plus `meshoptimizer` (root dev dependencies).
    `@gltf-transform/functions` was left out because it pulls in sharp,
    a native image library, for texture work we don't do yet.
- **`models:check` enforces entry 8's contract as errors.**
  - Triangles, bones, textures, footprint and floor.
  - Exactly one white `team` material.
  - Required clips within their length ranges.
  - Every catalogue entry has a file.
  - Draw calls are reported but not budgeted: Anvil's eight materials
    measured the same draw calls as his placeholder, so a limit waits
    for data.
- **The loader works for placeholder heroes too.**
  - `createHeroFigure` keeps its signature. It returns a model figure
    only when that hero's model is loaded.
  - Model figures copy the placeholder's height, base, lunge, flash and
    cast glow, so the battle, placement, teleport and environment views
    are untouched.
  - Loading never blocks the first screen. A figure created before
    its model arrives starts as the placeholder and swaps itself in
    place.
  - A failed load keeps the placeholder.
  - The icons session pointed out that a blocking preload of the full
    roster would be 3–4 MB before first paint.
- **Two three.js pitfalls, found in the stress lab.**
  - `SkeletonUtils.clone` gave each of Anvil's eight material parts its
    own skeleton copy: eight bone textures per figure, and nothing freed
    them on dispose. The ×32 crowd reached 403 textures and kept them
    after the crowd was gone.
  - The library now re-links the parts to one skeleton per copy and
    frees its bone texture when the figure goes.
  - After the fix, textures are 3 plus one per figure, and twelve ×32
    rebuilds show no growth.
- **Measured.**
  - One Anvil costs 18 draw calls with shadows, the same as his
    placeholder.
  - The ×32 crowd is 484k triangles against the placeholders' 60k.
  - The cove board alone is about 574 draw calls, so instancing
    environment props would save more than slimming heroes.
  - Real frame rates still need a visible tab on the weakest target
    machine.

## Icon pipeline and the full icon set (2026-09-23)

The user asked for painted icons in a mature cartoon style (Dota
Underlords, Dungeon Defenders), and for the client not to load more than
it needs. Every item (27), rune (19) and talent (60) now has painted
art, made with gpt-image-2.5 through Cloudflare Workers AI at medium
quality. The guide is `docs/icons.md`.

- **The style came from two rounds of feedback.**
  - The first Aegis and Frost Brand were glossy "premium mobile" art,
    and the user rejected them. A painted take with a subtle dark
    outline beat a 3D-rendered one.
  - The user then found some icons hard to read at 64 px. Dark objects
    sank into the disc (Kingmaker Banner, Glass Idol), and a smoke cloud
    swallowed its bomb (Vanishing Act). Every later prompt ends with a
    readability clause, and the rest of the set reads at 64 and 32 px.
    The first eight weren't redone, at the user's call.
  - The first Glass Idol came out as a seated Buddha-like statue. It was
    redone as an invented imp, and the style guide now rules out
    real-world religious figures.
- **Masters in LFS, small WebPs at runtime.** 512 px PNG masters live
  under `art/icons/` (34 MB, LFS). `pnpm icons:build` writes 192 px WebP
  at quality 85 to `apps/client/src/assets/icons/`: 7–14 KB each, 1 MB
  for all 106, against 65–115 KB each as 256 px PNGs.
  - 192 px covers the largest use, the 62 px reward disc, on a 3×
    screen.
  - `pnpm icons:check` enforces the size, alpha, a 20 KB budget and real
    content ids.
  - `art/icons/prompts.json` records the exact prompt behind each
    master.
- **Found by a glob, not a catalogue.** Unlike models and audio, the
  client finds icons with an eager `import.meta.glob` of URLs. There's
  no catalogue to drift, no 404 for missing art, URLs are
  content-hashed, and each icon costs about 50 bytes of bundle.
  `?no-inline` keeps even a tiny icon out of the JS (tested with a
  216-byte probe).
- **Loaded on demand.** Nothing preloads. An icon downloads the first
  time the reward panel, an item socket or a tooltip draws it. The main
  bundle grew by 0.4 KB gzipped.
- **Rune sockets keep their SVG glyphs.** Every rune shares the same
  pale stone tablet, so at the 12 px diamond painted runes can't be told
  apart, and the glyphs can. Rune art shows in the reward disc and the
  tooltips.
- **Replaced item glyphs are deleted** from `icons.ts`. Talents fall
  back to the star only for ids without art.
- **Also found while measuring load.**
  - The client shipped as one 343 KB gzipped chunk that included the dev
    labs. A separate task split them out; by the end of this work the
    main chunk measured 118 KB gzipped.
  - A blocking hero-model preload, which the models session has since
    made non-blocking.
- Nothing was committed.

## Gorrak's game model (2026-09-23)

The user asked to fix Gorrak and get him into the game with real
textures. The high-detail Gorrak had 168k triangles, 69 draw calls, no
`team` material, axes reaching 0.94 m, and only idle and whirlwind clips.
The recipe is `art/generators/build_ravager.py`, described in
`docs/models.md`.

- **Baked from the high-detail model, not rebuilt.**
  - Each part keeps its shape, simplified to a per-part triangle budget.
    Decals and small details go into the texture instead.
  - It keeps the high-detail rig and rest pose, so all the tested posing
    code (arm aiming, axe grips, leg IK) still applies to the new clips.
  - Result: 7,524 triangles, 3 draw calls and 18 bones, against the
    placeholder's roughly 40 draw calls.
- **One painted texture.**
  - The painted shader from the style test is baked from the
    high-detail surface onto the low-poly UVs, with a direct low-poly
    bake filling any texels the projection misses.
  - Stored as a 1024 px JPEG at quality 90, packed in the `.blend`. That
    makes the `.glb` 737 KB; WebP would roughly halve it.
- **Footprint measured at 1.8 m, with written allowances.**
  - The game rescales every hero to its board height, so the check now
    scales each model to 1.8 m before measuring. Anvil still passes.
  - Gorrak's broad shoulders and axes measure 0.77 m, so he has a 0.8 m
    allowance recorded with its reason in `contract.ts`.
  - Re-posing his rest pose instead would have broken the posing
    constants every clip depends on.
- **A `channel` clip and `HeroFigure.setChanneling`.**
  - Whirlwind is a 2 s channel. The battle view already spins the figure
    during a channel, but figures only ever received `cast`, so a model
    would have spun in its idle pose.
  - The battle view now reports channelling, and model figures loop
    `channel` while it's set. Gorrak's is the arms-out spin pose with no
    root rotation.
  - `cast` stays a generic 0.9 s wind-up, because Leap fires it too.
- **The cyclone is drawn in code.** The Blender cyclone depends on
  per-object alpha and additive blending, which glTF can't carry.
  - `game/views/cyclone-effect.ts` rebuilds it in three.js: 16 spiral
    wind streaks and a dust ring with additive blending. The geometry is
    shared; each figure owns only its two materials.
  - It fades in over 0.25 s while the figure channels and fades out over
    0.45 s after. It costs two draw calls, only while visible.
  - The catalogue turns it on per model: `channelEffect: "cyclone"` on
    `ravager`.
- **Verified.**
  - `models:build ravager` gives 0 errors and 0 warnings.
  - Every clip stays above the floor, loops close to 0 mm, and `death`
    ends lying flat.
  - In `#models`, all clip states render and the ×32 crowd measures 998
    draw calls, against 1,958 for placeholders.
  - A battle lab fight with two Gorraks and two Anvils ran to the end
    through whirlwinds, with no errors. A mid-whirlwind capture shows
    the arms-out pose spinning inside the cyclone.
  - The `#models` leak test with 32 Gorraks, cyclones included, reported
    no leak (geometries 210 → 210, textures 36 → 36).


## Hero portraits (2026-09-24)

The user wanted heroes to feel like named characters, not symbols.
Every hero now has a painted portrait bust and a head crop, made the
same way as the icons (gpt-image-2.5 through Cloudflare, medium
quality). They replace the glyph wherever it's big enough to read.
`docs/icons.md` has the template and the steps.

- **Tested on three before the rest.**
  - Anvil, Rime and Vesper were checked in every HUD spot at real size.
    Busts read well at 62 px and up; at 42 and 28 px only a crop zoomed
    onto the head reads; at 18 px nothing does.
  - That gave the split: a bust (`heroes`, 320 px) and a head crop
    (`faces`, 128 px, cut from the bust master). The glyph stays in the
    18 px name chips, the small corner badges on reward rows and the
    main menu emblems.
  - The first Rime came out prettier and glossier than the chunky Anvil
    and Vesper. The template gained a "characterful face, never
    glamorous" sentence, and she was redone with the rest.
- **Distinct at small sizes.** Each hero has one oversized feature,
  mostly on the head: helm, sun-disc halo, horns, hood, flame hair and
  fireball, ice crown, embroidered blindfold, leaf hat, stovepipe hat,
  goggles.
  - Moira's portrait has no hood, although her 3D look line in
    `missing_assets.md` entry 8 still has one: a hooded violet witch
    read as Vesper. The models session was told.
  - Gorrak's portrait follows his 3D model. Anvil's matches his too.
- **Two new kinds in the icon pipeline.** `heroes` and `faces` sit next
  to items, runes and talents in `art/icons/`, with per-kind sizes and
  budgets in `scripts/icons/contract.ts`: portraits 17–38 KB against a
  40 KB budget, faces 5–9 KB against 12 KB, about 330 KB for all
  twenty. The face crop boxes are recorded in `prompts.json`. The client
  finds them with the same glob and loads them on demand; the main chunk
  is unchanged at 118 KB gzipped.
- **Where they show.**
  - The bust is used on the draft cards, the recruit reward disc, and
    the hero tooltip card and unit inspector.
  - On the tooltip card and inspector it's drawn at a fixed 180 px
    (144 px live), centred, rather than cover-cropped to the band's
    full width. That crop cut off Nettle's and Sexton's eyes under their
    hats. The school and condition badges
    moved to the band's bottom-left so they don't cover the face.
  - The face is used in the ITEMS panel, the damage meter, the reward
    role chips and the tooltip header icons.
- Nothing was committed.

## Cinder's game model and spell visuals (2026-09-24)

The user asked to start the Pyromancer as the next hero, signed off her
look from a painted preview, then asked for her to be added in. On seeing
her, they asked why her spells had no animation or design.

- **Two scripts, shared kits.** The bake and clip code moved out of
  Gorrak's recipe into `art/generators/bake_kit.py` and `clip_kit.py`.
  Gorrak's rebuild was checked against the old script: the same
  triangles, UV islands, bake coverage and clip checks. The texture
  differs only by the GPU bake's noise, which also shows between two
  runs of the unchanged script.
- **Portrait over placeholder.** Cinder follows her painted portrait
  (copper hair, dark coat, scarf, flame in her left hand), not the
  placeholder's wizard hat.
- **Team colour on small parts.** The contract makes `team` plain white
  with no texture, so the scarf, its tail and the cuffs carry it, and the
  shoulder mantle is painted cloth.
- **Face quality.** The first bake's face was rough: hair locks were
  projected onto the skin, and the face had a sliver of the texture. The
  kit gained options for isolated bake groups, per-material texture
  space, a soft skin paint and smooth skin weights. The hidden scalp was
  deleted.
- **Size in game.** Her placeholder is 10.4 units tall because of its
  hat, so her model would have stood taller than Gorrak. The catalogue's
  new `boardHeight` sets her to 8.3. The shipped heroes don't share one
  scale either (Anvil is enlarged about 17% more than Gorrak), which is
  left as it is.
- **Spell visuals.**
  - Signature abilities now get code-drawn visuals, keyed by ability id
    in `spell-visuals.ts`. The battle view falls back to the generic
    effects for everything else.
  - Meteor draws a rock that streaks down onto the hit, with a growing
    ground shadow, then a blast and burning ground.
  - Flame Ward is a ring of fire that races outward. Firebolt is a
    fireball.
  - The rock and burning ground come from snapshot state, so seeks and
    resets rebuild them.
  - Meteor and Flame Ward share one `cast` pose, because a figure has a
    single cast clip.
  - The battle view used to play `cast` for ranged basic attacks. Firebolt
    would have shown her arms-up Meteor pose, with the cast glow, every
    two seconds. Every basic attack now plays `attack`. Ranged placeholders
    (Rime, Moira and the rest) lunge on their basic attacks instead of
    glowing.
- **Verified.**
  - `pnpm models:check` passes for all 5 models with 0 errors and 0
    warnings. Lint and typecheck pass.
  - In a battle-lab fight (Cinder and Anvil against four), Meteor fell,
    landed and burned with no console errors, and a mid-fight reset left
    nothing behind.
  - A Cinder-alone fight against two melee heroes triggered Flame Ward.

## Draft screen: the offered heroes on your arena (2026-09-24)

The user asked to redo "Draft your team" in the style of the HUD work, with
a better background and the actual models instead of still pictures. The
card grid on a flat purple backdrop is gone.

- **Where it happens.** The draft uses the same 3D stage as placement and
  battles, dressed with your saved board theme. The five offered heroes
  stand in a shallow arc across the middle of the board, facing the camera.
  - Heroes with a game model (Anvil, Gorrak, Cinder) show it with their
    idle loop. The others use their battle placeholder, so the draft always
    matches what fights look like.
  - They rise out of the board one after another when the draft opens.
- **Camera shots** (`board-stage.ts`). `frame(shot)` takes a pitch, a
  look-at point and a box to fit. `frame(null)` returns to the usual board
  framing, and the camera glides between them, pitch and target included.
  - The draft uses an 18° pitch, down from 56°. At that angle all four
    themes still look finished, with props and sky behind the heroes. At
    12° the cove and frost horizons show.
  - Leaving the draft glides back into the placement view.
- **Nameplates** (`hud/draft.ts`, positioned by `game/views/draft-view.ts`).
  Each hero gets one button covering the model and a plate under it, laid
  out in the stage overlay every frame.
  - The plate shows the name, archetype and reach, then two rows: which
    combo the hero **sets up** (condition colour) and which it
    **detonates** (school colour). The combo names match the COMBOS panel.
  - Once you have picks, a plate shows **+ Overload** style chips when
    drafting that hero would switch a combo on or raise its tier. This
    reuses the reward screen's gain chips and tooltips.
  - Hovering shows the same hero card tooltip as the HUD, with "Click to
    draft", "Drafted · click to send back" or "Team full" as the hint.
- **Picking.**
  - A picked hero steps forward, gets a blue base and a numbered badge,
    casts once and then loops its victory clip. `setCelebrating` on
    `HeroFigure` was added by the 3D models session for this.
  - When three are picked, the rest dim and their bases grey out. Clicking
    a picked hero sends it back.
  - Hovering lifts the plate, glows the model and turns its base gold.
  - After Confirm, the unpicked heroes sink into the board and a "Team
    locked in" banner shows until everyone has drafted.
- **Right-hand column during the draft.** YOUR TEAM shows three slots that
  fill with portraits as you pick, above the same COMBOS panel as the rest
  of the match, so combos light up as the picks come together.
- **Removed:** `heroOfferCard`, `.offer-grid` and the draft's `.hero-card*`
  styles.
- **Verified.**
  - Played at 1512×760 and 1280×720 in the cove and frost themes, with real
    clicks and hovers: pick, send back, the three-pick cap, hover cards,
    gain chips and the glide into placement.
  - All four themes were checked at 12° and 20° in a camera test first.
  - The lock-in banner and picks were checked in the DOM only. In a solo
    match the bots have already drafted, so the phase moves on the moment
    you confirm and the sink animation barely shows.
  - The environment lab and battle framing are unchanged. Lint and
    typecheck pass on Node 20 and Node 24.

## Fewer damage numbers, a white damage trail and HP tick lines (2026-09-24)

The user found the damage numbers cluttered and asked for "just important
things", plus the Dota 2 health bar where the lost chunk turns white and
drains after a short delay.

- **Why.** A census of 80 simulated battles (3v3 and 5v5, half with items)
  counted about 309 numbers per battle, 11 a second, with about 10 on screen
  at once and spikes past 100. Basic attacks were 34%, echo and reaction
  hits 15%, poison and burn ticks 19%, small spell hits 10%, small heals 6%
  and shield absorbs 4%.
- **What still shows a number** (`landHit` and `healBurst` in
  `battle-view.ts`):
  - **Combos:** one callout, the combo name over the damage, in the
    condition's colour. It replaces the separate "OVERLOAD!" label and
    number.
  - **Crits:** gold with "!", and bigger when the hit is 20% or more of max
    HP.
  - **Big hits:** a single hit worth 20% or more of a hero's max HP. Hits on
    summons don't count, since any hit is big against a skeleton.
  - **Big heals:** green "+N" when a heal is 15% or more of max HP.
  - Hit totals include damage the shield took, because shield numbers no
    longer show on their own.
- **What doesn't:** basic attacks, smaller spell hits, echoes, DoT ticks,
  shield absorbs, blood-price HP costs and small heals. The health bar's
  white trail shows them instead.
- **Result.** The same census gives about 18 numbers per battle, 0–2 on
  screen and at most 10 in a burst of simultaneous combos. In the browser
  harness a lab 3v3 showed 24 numbers in 31 s and a Morrow team 6 in 22 s.
  These are lower bounds, because the harness skips event batches when the
  clock jumps.
- **White damage trail** (`game/views/health-trail.ts`). Each plate's bar
  has a white layer under the fill.
  - When HP drops, the white layer holds where the HP was, 0.4 s after the
    last hit and never more than 1 s after the chunk began. It then drains
    with an ease-out.
  - Heals raise the fill instantly and never show white ahead of it. Seeks
    and rewinds snap the trail.
  - The fill's 120 ms width transition is gone, so the bar drops
    immediately and the trail does the smoothing.
  - In the browser, single hits held for 400–416 ms and 15% chunks cleared
    in about 800 ms. Across 13 heals, none showed white ahead of the fill.
- **Tick lines: one per 250 HP, drawn only on the fill.** The user said the
  bars felt inverted: fewer HP should mean fewer lines.
  - The 2026-09-23 rule picked the smallest step giving at most 12 ticks.
    With today's HP that gave a 480 HP Thrall 9 lines against 5–8 for
    1,500–2,200 HP heroes, and a hero pushed past 3,000 HP would drop from
    11 lines to 6.
  - Every unit now gets a line every 250 HP, so more max HP always means
    more lines: a Thrall has 1, a Turret 2 and Anvil 8.
  - The lines are part of the fill's background, sized against the whole
    bar with container units, so they stay put as HP drops. The white trail
    and the empty track have none, so a wounded unit visibly loses lines.
  - Checked at 5× in the browser: Anvil at full HP showed 8 lines, a Thrall
    at 81% showed 1 and a hero at 16% showed none.
- **Not changed:** the selected-unit card's HP bar. Its shield segment is
  already near-white, so a white trail there would read as shield.
- **Removed:** the absorbed, DoT, echo, burn, poison, HP-cost and combo
  label number styles, the `combo-callout` keyframes, `hpPerSegment` and
  the bar's `::after` tick overlay.

---

## The stone-arena sound set and hero voice lines (2026-09-24)

The user hated the first sounds ("like collecting gold in an arcade
game"), picked the stone-arena style from a four-style audition, and
asked for sound effects and voice lines everywhere.

- **Style.** Every prompt names a physical sound and ends with "big and
  deep, echoing through a vast stone arena, no voice". Arcade words
  (mallet, chime, sparkle, plucked, playful) are banned. Details are in
  `docs/audio.md`.
- **Coverage.** 62 sounds replace the seven old placeholders:
  - every ability has its own cast and hit sounds (`sound-map.ts`);
  - summons have spawn and death sounds, and combos, crits, big hits,
    shields, meteor falls, teleport beats, the draft, rewards and every
    match moment have their own sounds.
  - The three condition-apply sounds from the old asset list were
    dropped. Conditions land on almost every hit, and the ability sounds
    already cover the moment.
- **Voice lines.** Ten ElevenLabs library voices, one per hero, with five
  lines each: pick, two cast lines, death and win.
  - A pure director (`line-policy.ts`) allows one line at a time.
  - Pick and win interrupt; cast and death lines need gaps and play less
    often for enemies.
  - A Scribe transcript confirmed all 50 lines say their scripts.
- **Engine change.** Each channel now has its own 16-voice pool, and a
  full pool always steals the oldest voice instead of dropping the new
  sound. Before this, a busy fight could silently drop a voice line or
  the round-won stinger. `"skip"` now only means "don't restart this
  sound over itself".
- **Picking takes without listening.** Nobody listened during
  generation.
  - Takes were chosen by loudness and spectrogram.
  - Three sounds whose takes were near-silent (hit-blade, shield-up,
    teleport-in) were re-prompted, and three others switched to their
    second take.
  - Raw takes live in `art/audio/` (LFS) with `takes.json`, so an
    alternate is one reprocess away.
- **Checked in the browser.**
  - A lab 3v3 made 247 sound requests with none missing.
  - A solo match on an offline server made 491 requests: 465 played, 26
    were same-frame duplicates dropped by cooldown, and none was dropped
    for being unloaded or over the limit.
  - 16 voice lines played with no overlap except intended interrupts.
- **Removed:** `attack-swing.mp3`, `hit-impact.mp3`, `spell-cast.mp3`,
  `heal.mp3` and `missing_assets.md` entries 4, 14, 19, 20 and 23.

## Main menu: your arena and three heroes behind it (2026-09-24)

The user asked for a more interesting main menu background. It was a flat
purple gradient with a faint floor grid, and three glowing hero glyphs
stood in for key art.

- **Your arena behind the menu.** The menu uses the same 3D stage as the
  draft, placement and battles, dressed with your saved board theme, so a
  pick under Board themes changes the menu too.
  - Gorrak, Anvil and Cinder, the heroes with game models, stand on the
    board right of the menu links, playing their idle loops.
  - Like the draft lineup, they wait up to 1.5 s for their models, then
    rise out of the board one after another.
- **Camera** (`game/views/menu-view.ts`).
  - A 12° shot is aimed at the three heroes and fitted right of the links
    and above the Fight! button. It sways ±16° around them over 56 s.
  - `BoardStage.setOrbit(radians)` turns the camera around the framed
    target without refitting. The menu view resets it on dispose.
  - The draft found cove and frost horizons at 12°. Aimed at the heroes,
    all four themes still show props and sky across the whole sway.
- **Readability.** An `is-menu` scrim on the battle layer darkens the left
  under the links, the top, and the bottom under Fight!, with a soft
  vignette. It works like the draft's `is-drafting` scrim.
- **Reduced motion.** The camera holds still, and the heroes appear in
  place instead of rising, as in the teleport view.
- **Leaving the menu.** Any match screen disposes the menu view, and the
  stage returns to the usual board framing. Fight! glides from the menu
  shot into the draft on the same arena.
  - The menu also clears the reward screen's `is-dimmed` blur. Losing the
    connection during rewards leaves it on, which never showed while the
    menu hid the layer.
- **Removed:** the menu's hero glyph emblems (`menuEmblem` and
  `.menu-art*`) and `missing_assets.md` entry 6, the menu key art. The
  live heroes stand in that spot now.
- **Verified** in headless Chromium with software WebGL.
  - All four themes at 1440×900, with the camera pinned at both ends of
    the sway. The cove at 1280×720, 1920×1080, 1024×768 and 2560×1080.
  - Menu → Play online → Leave three times: live WebGL buffers, textures
    and programs returned to the same counts on every menu visit.
  - Fight! into the draft, Board themes → Frostpeak → Menu, and Battle
    lab and back, with no console errors.
  - With reduced motion, the framing at 5 s and 45 s matched.
  - Lint, typecheck and the client build pass. The main chunk grew by
    0.3 KB gzipped, and the hero models were already preloaded.
