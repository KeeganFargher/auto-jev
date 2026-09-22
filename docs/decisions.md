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
