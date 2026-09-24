# Phase status

## Phase 1 — Stabilise the foundation — done

### What works now

- `pnpm install` (from lockfile, Node >= 22, pnpm 12.5.1).
- `pnpm -r typecheck` — clean across all 4 workspace packages.
- `pnpm lint` (`oxlint`) — clean repo-wide.
- `pnpm build` (`pnpm -r --if-present build`) — clean, dependency-ordered.
- `node apps/server/dist/index.js` after `pnpm build` — **actually starts**
  and serves `/hi`, `/api/hello`, `/playground`, `/monitor`. This did not
  work before Phase 1 (see docs/decisions.md).
- `pnpm --filter @jev-game/server test` (mocha, `@colyseus/testing`) — 2
  passing.
- `pnpm dev` (root) — builds once, then runs `packages/shared` +
  `packages/server-runtime` watchers, `apps/server`'s `tsx watch`, and
  `apps/client`'s `vite` in parallel. Verified live: two browser tabs
  connect to the arena room, see each other, and move (client prediction +
  server reconciliation across the new `server-runtime` package boundary);
  editing `packages/shared/src/constants.ts` while everything is running
  rebuilds it, restarts the server, and reloads the client, with no stale
  Vite pre-bundle cache.

### Changed from the plan's assumed starting point

The plan was written before inspecting this repo. Reconciliation notes:

- The "existing demo" was itself uncommitted, staged scaffolding (a fresh
  `create-colyseus-app --layout monorepo` plus an early, since-removed
  `packages/jev` sketch) — not a settled baseline. It's committed now.
- A `packages/colyseus-contract` package already existed, doing half of what
  the plan calls `server-runtime` (room lives in a package, client
  type-imports it). Renamed and completed rather than built from scratch —
  see `docs/decisions.md`.
- `apps/server`'s production build (`tsc` alone) was silently broken before
  this phase touched anything — not a regression introduced here.

### Known gaps / honestly-recorded limitations

- **Room-name type safety is partial.** `client.joinOrCreate("arena")`
  correctly infers the real `ArenaState`/message types. A *misspelled* room
  name does not itself fail to compile — `@colyseus/sdk@0.18.2`'s overloads
  fall back to an untyped `Room<any, any>` for any string it doesn't
  recognize as a literal key. Detailed in `docs/architecture.md`. Not
  something this package layout can fix; flagging so nobody re-discovers it
  and burns time assuming it's a bug in our setup.
- `packages/jev` was removed, not rebuilt — Phase 7 starts it fresh against
  the plan's actual spec (TypeSafe Choice/Score/Noul).
- No content beyond the pre-existing movement/prediction demo exists yet —
  correct for Phase 1 ("not in this phase: new mechanics").
- TypeScript versions differ across the workspace by design
  (`apps/client` resolves 6.0.3, everything else resolves 5.9.3) — checked
  with `--skipLibCheck false` that this doesn't hide a real declaration
  problem on our side; only pre-existing upstream `.d.ts` noise showed up.

### Commands used to verify this phase

```
npm install -g pnpm@12.5.1 --registry=https://registry.npmjs.org/   # local corepack was broken, see docs/architecture.md
pnpm install
pnpm -r typecheck
pnpm lint
pnpm build
node apps/server/dist/index.js                 # + curl :2567/hi, :2567/api/hello
pnpm --filter @jev-game/server test
pnpm dev                                       # + two browser tabs, + a live edit to packages/shared
```

## Phase 2 — Build the smallest battle and laboratory — done

### What works now

- `packages/game`: pure, dependency-free (per the plan's table — no
  workspace imports) battle engine. Fixed 30 tick/s simulation, mulberry32
  RNG threaded through `BattleState` from creation (unused by any Phase 2
  mechanic yet, but wired so Phase 3 doesn't have to retrofit it), the
  section-6 tick pipeline (target retention, shared-snapshot movement,
  post-movement attack collection, priority-ordered resolution, win/draw/
  timeout evaluation), and a read-only `getBattleSnapshot`.
- `packages/content`: `bruiser` hero, `flat-arena`, a `duel` scenario
  (two mirrored bruisers), a catalogue, and `validateCatalogue`.
- `pnpm simulate duel <seed>` (root script): headless runner. Prints tick
  count, result, an event-count + FNV-1a digest of the full event log, and
  per-unit damage dealt.
- `apps/client/index.html` (`pnpm --filter @jev-game/client dev`, then `/`):
  the battle laboratory, and the app's only page. A full-viewport `<canvas>`
  renders two units with health bars, team colors, a dashed target line, and
  a range ring on the selected unit; the HUD (status, play/pause/step/
  reset/speed 0.5x–4x, hero-stat override inputs applied on next reset,
  never by mutating shared content, a unit inspector, a capped
  prepend-ordered event feed, and a collapsed `tuning` drawer holding seed,
  hero-stat overrides and scenario export/import) is edge-anchored translucent
  chrome floating on top of that same canvas: status pill top centre, feed top
  right, selected-unit card bottom left, transport bar bottom centre, tuning
  bottom right. The canvas paints a grid floor across its whole surface and
  the arena's own boundary is no longer stroked, so there is no frame around
  the play area and the floor continues underneath every HUD panel — verified
  with `getImageData`, not by eye (see `docs/decisions.md`). The Phase-1 movement/prediction demo's page was removed — one HTML
  file, not two (see `docs/decisions.md`); `packages/shared`'s `stepEntity`
  and the server's `Arena` room it demonstrated are unaffected, only the
  client-side demo page is gone.

### Verified, not assumed

- **Determinism, including event order, not just the final result:**
  `pnpm simulate duel 1` run twice produces identical tick count, result,
  and digest. The browser lab reaches the *exact* same terminal tick and
  result at both 1x and 4x speed for the same seed/stats as the headless
  run (297 ticks, mutual-elimination, same per-tick damage log) — confirmed
  by screenshot/log comparison, not just by reading the code.
- **No resolution-order bias:** the mirror duel (two identical bruisers,
  symmetric spawns) ends in a genuine mutual-elimination draw with 100/100
  damage dealt each — not "the first unit in the array always wins." See
  `docs/decisions.md` for the collect-then-resolve mechanics this depends
  on.
- **Edge cases:** same-position spawns don't produce `NaN` (checked
  directly on `unit.position` after several ticks); a zero-speed,
  out-of-range setup correctly times out as a `draw`/`timeout` at its
  configured `tickLimit` rather than hanging.
- **No fabricated victories:** `createBattle` rejects a setup with fewer
  than two distinct team IDs (a bug caught in review before any UI could
  construct one).
- **No duplicate sprites/listeners across resets:** the canvas is cleared
  and fully redrawn from the current snapshot every frame — there's nothing
  per-unit to accumulate, and there's exactly one `click` listener on the
  canvas for the whole battle's lifetime, not one per unit.
- **Content changes need no rendering-code changes:** raising attack damage
  5x (via the lab's override inputs, which build a fresh `Catalogue` rather
  than mutating the shared `bruiser` constant) produces a visibly shorter
  fight (57 ticks vs. 297) with zero changes to any view/HUD file.

### Deliberately deferred (see `docs/decisions.md` for why)

- Phaser — not installed, not needed for Phase 2's acceptance checks; the
  lab renders to a plain `<canvas>` with an HTML/CSS HUD overlay.
- Branded ID types (`HeroDefinitionId`, `UnitId`, …) — plain `string`
  aliases instead; branding needs an unchecked cast that the "no comments"
  rule's lint consequence (`SAFETY:` justification required) forbids.
- A schema library for scenario JSON import — plain coercion instead,
  relying on `validateCatalogue` downstream for real validation.

### Known gaps / minor rough edges

- The controls panel's seed `<input>` doesn't sync from session state after
  an *import* sets a different seed (it does reflect what you type before
  clicking Reset). Cosmetic only — the underlying battle did reset with the
  imported seed, confirmed via the inspector/event log, not the input's
  displayed value.
- `abilities/strike.ts` and a formal `rulesets/prototype.ts` were not
  created — Phase 2 explicitly has "no statuses, casts or reaction queue,"
  so the basic attack lives entirely in `HeroDefinition`'s own fields.
  Phase 3 introduces the ability system properly.
- Phase 1's contract-boundary acceptance checks (two clients connecting,
  a misspelled room name failing to compile) no longer have a demonstration
  site — the client's only networking call site was the movement demo,
  deleted for the one-page consolidation. `packages/server-runtime` and its
  `/contract` export are untouched; `apps/client` just has nothing left that
  imports them. Revisit when the client needs real networking again (Phase 6).

### Phase 1 + 2 review pass

A read-through against the plan's Phase 1 and 2 text turned up one API
footgun and several gaps against the §6 simulation contract. All fixed and
re-verified; full rationale in `docs/decisions.md`. Summary:

- `BattleLabSession` had a getter (`getView()`) with a hidden destructive
  side effect (draining the pending event queue) and two call sites. Split
  into `getView()` (still draining, now one caller) and `peekSnapshot()`
  (non-destructive, used by Export).
- `packages/game` could import Node built-ins, Colyseus and other workspace
  packages without either `typecheck` or `lint` catching it — verified with
  a throwaway probe file before and after. Sealed with an `oxlint`
  `no-restricted-imports` override scoped to `packages/game/**`.
- Attack resolution order was lexicographic by unit ID, not seeded as §6
  requires. Now a Fisher–Yates shuffle of `resolutionPriority`, done once in
  `createBattle` from the battle's own RNG.
- `validateCatalogue` now requires integer HP/damage/attack-interval;
  `applyDamage` rounds its input; the lab's tuning inputs round before
  calling `reset()` so a typed decimal can't throw out of an unguarded
  click handler.
- `createBattle` now rejects an out-of-arena spawn instead of silently
  clamping it on the unit's first move.
- `BattleResult` now carries per-unit `damageDealt`; `BattleSnapshot` now
  carries a cloned copy of the RNG state. Both were named as required §6
  concepts and were missing. `scripts/simulate.ts` reads `damageDealt` off
  the result instead of re-deriving it from the event log.
- `kind: "failure"` was declared but unreachable; added a non-finite-state
  check as the one corrupt-state backstop §6 actually asks for.
- Scenario import silently overwrote the version field it claimed to
  validate; it now reads and checks it, and rejects anything but `1`.
- Removed `apps/client`'s unused `@colyseus/sdk` / `@jev-game/shared` /
  `@jev-game/server-runtime` dependencies (no source imports any of them
  after the one-page consolidation).

### Commands used to verify this phase

```
pnpm install
pnpm -r typecheck
pnpm lint
pnpm build
pnpm simulate duel 1                      # run twice, compare digest
pnpm --filter @jev-game/client dev        # + / in two browser sessions,
                                           #   play/pause/step/reset/speed/select/
                                           #   override/export/import, at 1x and 4x
```

## Phase 3 — Add distinct roles and an ability system — done

### What works now

- Three heroes: `bruiser` (melee `strike`), `ranger` (ranged `bolt`, no
  melee fallback), `support` (heal+shield `mend`, falls back to `strike`
  when no ally needs it). Every hero has a `basicAttackId` plus an ordered
  `abilityIds` list; a unit tries its abilities in priority order each tick
  and falls back to its basic attack, at most one action per tick.
- A small effect union (`damage`, `heal`, `shield`) shared by abilities and
  the basic attack — `battle/effects.ts` is the single dispatcher, so a new
  ability needs a content entry, not a tick-loop change.
- `mend` grants a heal *and* a shield in one ability (two effects on one
  `AbilityDefinition`) — the plan names shield as a separate implementation
  step but the starter content list is fixed at three named abilities
  (`strike`/`bolt`/`mend`); bundling shield onto mend exercises the status
  mechanism without inventing a fourth ability file. **Superseded in Phase
  4:** `mend` is heal-only now: the plan's own Phase 4 upgrade list assumes
  a heal-only base with an upgrade that grants the shield back, so this
  Phase 3 shortcut was undone. See the Phase 4 section below.
- `apps/client`'s lab defaults to a `three-vs-three` scenario (2 bruisers +
  2 rangers + 2 support, mirrored formations) with `duel` still selectable;
  a scenario `<select>` replaced the old hero-stat-override inputs (cut —
  see Deliberately deferred).
- Units render as distinct shapes by role (circle/triangle/diamond), with a
  persistent ring for an active shield and a fading ring at the impact point
  for damage/heal/shield casts (orange/green/blue).
- The unit inspector shows HP, speed, current movement target, shield
  amount + ticks remaining, and every ability's cooldown state
  (`ready` or ticks remaining) — replacing the old flat dmg/rng stat chips
  that no longer map to anything on `UnitState`.
- The event feed describes `cast`, `damage-dealt` (with shield-absorbed
  noted inline), `healing-done`, `shield-applied`, `status-expired`,
  `cast-fizzled` (a proposed action whose target died earlier the same
  tick — the cooldown is still consumed, but it's now visible instead of
  silent) and `death` in plain text.
- Catalogue validation rejects an ability whose effect kind doesn't match
  its target policy (e.g. a `damage` effect on an ally-targeting ability),
  not just malformed numbers.
- `packages/game/src/battle/recording.ts` (`recordBattle`) and
  `apps/client/src/session/local-session.ts` (incremental accumulation)
  both produce a `BattleRecording` — sampled every tick, available once a
  battle ends. A "Replay" control in the lab swaps the live session for a
  `createPlaybackSession(recording, scenario)` that implements the exact
  same `BattleLabSession` interface, so the existing scene/view/HUD stack
  renders a completed battle without rerunning the simulation.
- `pnpm simulate <duel|three-vs-three|three-bruisers> <seed>` — the third
  scenario (all-bruiser mirror of `three-vs-three`'s formation) exists
  specifically for the discovery-session comparison below, headless only.

### Verified, not assumed

- **Same-seed reproducibility unchanged by the new pipeline stages:** `pnpm
  simulate three-vs-three 1` run twice produces identical tick count,
  result and digest — this is a real check (it would have caught the
  Phase 1+2 lexicographic-resolution-order bug this project already fixed
  once). It is **not** a check that the pipeline is free of new
  order-dependence: every shipped scenario is a mirrored, symmetric
  matchup, and 200 sampled seeds per scenario all land on identical tick
  counts and `draw: mutual-elimination` — the RNG's only consumer
  (`shufflePriority`) has no shipped scenario where it could visibly change
  an outcome. See `docs/decisions.md`'s "Phase 3 review pass" entry.
- **Two independent live-vs-standalone targeting/damage paths agreed, once
  fixed.** Before the review-pass fix, movement/HUD (`resolveTarget`,
  retaining) and ability resolution (`resolveAbilityTarget`, freshest
  nearest-enemy, no retention) could name different targets — measured at
  20% of casts in one `three-vs-three` run. `resolveAbilityTarget`'s enemy
  branch now calls `resolveTarget` directly, so there is exactly one
  enemy-targeting decision per unit per tick, not two that happen to agree
  most of the time.
- **A same-hero mirror match now actually produces a mirror result.**
  `pnpm simulate three-bruisers <any seed>` used to end in a deterministic
  *win*, always for the same team, regardless of seed — a same-hero mirror
  probe (this project's own established bias-detector) failing its own
  test. Root cause was a floating-point knife-edge: a unit's distance to
  its target could round to a hair over its ability's range on one side of
  a mirror and a hair under on the other, permanently stranding the
  "over" unit within its stop-movement radius but outside its own
  attack-range check — unable to move (already "arrived") or act ("not
  quite there"), forever. Fixed with a shared range-tolerance helper (see
  `docs/decisions.md`'s "Phase 3 review pass"). Re-verified across seeds
  1–5: exact mirror damage totals every time, `draw: mutual-elimination`
  at tick 392.
- **Heals never exceed max HP** — checked directly on `unit.hp` after every
  tick of a full `three-vs-three` battle, not just at the healer's call site.
- **Shield mechanics, checked in isolation** (not just observed in a full
  battle, since a shield that gets fully depleted by damage clears itself
  through a different code path than a shield that survives to its own
  timer): a shield absorbs up to its amount and any excess spills to HP in
  the same hit; a depleted shield clears immediately; an *undamaged* shield
  survives untouched tick-by-tick until exactly its `expiresAtTick`, not one
  tick early or late; reapplying a shield replaces its amount and refreshes
  its duration rather than stacking. The first full `three-vs-three` run
  happened not to exercise the time-based expiry path at all (every shield
  in that seed got damage-depleted first) — caught by testing the mechanism
  directly instead of trusting one battle's coverage.
- **Two copies of a hero have independent state:** a second `support` unit
  added to the 3v3 setup has its own `abilityCooldowns` map and its own
  `targetUnitId`; forcing one's cooldown doesn't touch the other's.
- **An invalid definition fails at catalogue validation naming the content
  ID** — a non-integer hero stat is rejected by `validateCatalogue` with the
  hero's own ID in the message.
- **A fresh battle retains nothing from the last one** — after a `3v3` run
  accumulates shields and non-zero cooldowns, a new `createBattle` call
  (what `reset()` does) starts every unit with `shield: null` and every
  ability at cooldown `0`.
- **Recorded playback reconstructs the exact same terminal result without
  rerunning the simulation** — checked at the session level: a live session
  stepped to completion, its recording handed to `createPlaybackSession`,
  and the playback stepped to its own end independently. Final tick, final
  `BattleResult`, and the full ordered event list all matched the live
  run exactly. The DOM-level "click Replay, watch it play" path was
  exercised structurally (scenario import already dispose-and-remounts the
  scene the same way `handleReplay` does; only one `<canvas>` element ever
  exists no matter how many times the session is swapped) rather than by
  manually stepping a full battle to completion through the browser tool.
- **Six actors stay visually understandable at a glance** — confirmed in
  the browser: bruiser/ranger/support read as distinct shapes per team
  colour, the ranger's long engagement ring and target line make its
  kiting role legible, and a support's shield ring and heal/shield cast
  cues make its role visible without needing the inspector open.
- **`packages/game` is still pure** — `pnpm -r typecheck` and `pnpm lint`
  both stayed clean through this phase; the Phase 1+2 review's
  `packages/game/**` import seal (no Node, no Colyseus, no `@jev-game/*`)
  was never touched and nothing in this phase needed to touch it.

### Deliberately deferred (see `docs/decisions.md` for why)

- **The lab's per-hero stat override inputs are gone, not extended.** They
  don't generalise cleanly once a scenario has three different heroes with
  independent stats — overriding "max HP" for every hero in the catalogue
  at once defeats the point of role differentiation. Replaced with scenario
  selection; ability/hero tuning for the discovery session below happens by
  editing `packages/content` directly and reloading.
- Section 10's optional step 12 (multi-tick wind-up: `releaseTick` /
  `recoveryUntilTick`, cancel-on-death-during-wind-up) — the plan frames it
  as conditional ("if an attack needs a visible wind-up"); nothing in this
  phase's acceptance checks needs it, and every ability resolves same-tick
  for now.
- A fourth ability file for shield — see "What works now" above; folded
  into `mend` instead.
- `battle/triggers.ts` (bounded reactions) — explicitly Phase 4 in the
  plan's own file table.

### Known gaps / minor rough edges

- Recorded playback samples every tick (not a coarser interval) — fine at
  this unit count and battle length; revisit if a much longer or larger
  battle makes a full-resolution recording expensive to hold in memory.
- The Replay and Step buttons have no enabled/disabled state — clicking
  Replay before a battle ends is a silent no-op, and clicking Step after a
  battle ends is now also a no-op (fixed in the review pass: it used to
  append a duplicate terminal frame to the recording) rather than either
  being visibly disabled. Would need `battle-controls.ts` to receive live
  view updates, which it currently doesn't (it's fire-and-forget event
  wiring, unlike the `update()`-driven inspector/event-log/status).
- Control glyphs, including the new replay icon, are unicode placeholders —
  logged in `missing_assets.md`.
- **Support units rarely reach the ally they're trying to heal.** Movement
  only ever chases the nearest enemy; `getEngageRange` uses the basic
  attack's range even when a shorter-ranged, ally-targeting ability
  (`mend`, range 8 vs. `strike`'s 10) is what the unit is actually trying
  to use. Measured: 8 of a support's 12 `mend` casts in one `three-vs-three`
  run were self-heals. Not fixed — it needs a decision about how a support
  should actually behave (break formation for a wounded ally? only past
  some HP threshold? never?), not a one-line range change. See
  `docs/decisions.md`'s "Phase 3 review pass" entry.

### Commands used to verify this phase

```
pnpm -r typecheck
pnpm lint
pnpm build
pnpm simulate duel 1                      # run twice, compare digest
pnpm simulate three-vs-three 1            # run twice, compare digest
pnpm simulate three-bruisers 1            # discovery-session comparison
pnpm --filter @jev-game/client dev        # + / in the browser: select/step/
                                           #   play/pause/reset/speed/scenario/
                                           #   export/import/replay
```

### Discovery session (per the plan, before Phase 4)

Not yet run by a human, and its scope turned out narrower than first
written here. Both shipped scenarios are mirrored, symmetric matchups
(three-bruisers-vs-three-bruisers, three-mixed-vs-three-mixed) — there is
no scenario where mixed roles actually *fight* three identical bruisers, so
`pnpm simulate three-bruisers 1` vs `pnpm simulate three-vs-three 1` cannot
answer "do mixed roles create an understandable advantage over three
identical bruisers." What it *can* still usefully compare: fight duration
(bruiser mirror now ends at tick 392, mixed mirror at tick 829 — mixed
roles take over twice as long to resolve a mirror match, post the review
pass's targeting and range-boundary fixes; see `docs/decisions.md`) and
each run's own damage distribution. Whether that's "an understandable
difference" worth a human eyeballing before Phase 4 is still a legitimate,
smaller question — just not the one originally written here. A true
advantage comparison would need an asymmetric scenario (three mixed vs.
three bruisers on the same side count), not currently in the content
package.

Damage-dealt breakdown from `pnpm simulate three-vs-three 1`, re-run after
the review pass's fixes (both the targeting-retention fix and the
range-boundary fix changed this run's numbers from what was first recorded
here — this is the current, verified figure, not the original one):
`A-1`/`B-1` (bruiser) 50, `A-2`/`B-2` (ranger) 190, `A-3`/`B-3` (support,
via its `strike` fallback — see the support-melee gap above) 120. The
ranger's long range still clearly dominates raw damage output at these
numbers, which is itself worth a second look before Phase 4 touches
build-driven stat changes. Note this run's damage is now itself an exact
mirror (`A-1` = `B-1`, etc.) since it's a symmetric matchup with no
surviving order-dependence — a useful sanity check in its own right.

**Superseded in Phase 4:** this 379/829-tick and 50/190/120 breakdown was
measured against Phase 3's `mend` (heal+shield in one ability). Phase 4
moved the shield out of `mend`'s base kit and into an upgrade, which
changes these numbers materially — see the Phase 4 section below for the
current baseline. This section is left as an accurate record of what
Phase 3 actually shipped, not updated in place.

This discovery session was still not run by a human before Phase 4
started; Phase 4 began on explicit instruction rather than after that
review. The scope-narrowing observation above (no scenario has mixed
roles actually fight three identical bruisers) is still true and still
open.

## Phase 4 — Make upgrades change the way builds play — done

### What works now

- `packages/game/src/builds/`: `HeroBuild` (persistent: hero ID + ordered
  upgrade selections with stack counts) is now the only thing that
  survives between battles. `compileBuild(build, catalogue)` is the single
  function that turns a build into concrete per-unit numbers — max HP,
  basic-attack cooldown, chain-lightning bounce bonus, a slowed-target
  damage-bonus fraction, and any granted reactions (with their own
  compiled amounts) — using one documented formula,
  `(base + flat) * (1 + percent)`, everywhere. `create-battle.ts` calls it
  once per unit and never reads hero/ability stats out of the catalogue
  directly again.
- `apply-upgrade.ts`: `isUpgradeEligible` (hero restriction, prerequisite
  upgrades, stack limit), `generateUpgradeOffers` (filters the whole
  catalogue through that same function — offers and validation can't
  drift apart), and `applyUpgrade` (throws a named error for an illegal
  choice rather than silently no-opping).
- A real reaction system: `battle/reactions.ts`'s `processReactionQueue`
  drains a queue (not recursion), each job carrying a root action sequence
  and a depth, bounded by `MAX_REACTION_DEPTH` (4) and
  `MAX_REACTIONS_PER_TICK` (16). Exceeding either aborts the battle as a
  `failure` result with a `reaction-budget-exceeded` diagnostic event
  naming the offending chain, rather than looping or throwing.
- A real chain-lightning effect: `chain-damage` (`battle/chain.ts`) hits a
  primary target then bounces to the nearest *other* living enemy within
  range, tracking visited targets so no unit is hit twice by the same
  cast, with quantized-distance target selection so two geometrically
  mirrored casts can never pick different bounce targets over
  floating-point noise (see `docs/decisions.md` — this reuses the exact
  bug class the Phase 3 range-boundary fix addressed, guarded against up
  front this time instead of discovered after shipping).
- A `slow` status, structurally identical to `shield` (one expiry
  comparison, run in the same per-tick pass) — reduces
  `moveSpeedUnitsPerSecond` by a multiplier for a fixed duration.
- Six upgrades in `packages/content/src/upgrades/`: `more-max-hp` (any
  hero, stacks 3), `faster-attacks` (any hero, stacks 2),
  `extra-lightning-bounce` (ranger only, stacks 2),
  `healing-that-also-shields` (support only, grants the `mend-shield`
  reaction), `stronger-shield` (support only, requires
  `healing-that-also-shields`, stacks 2), `bonus-damage-vs-slowed`
  (bruiser only — deliberately, see `docs/decisions.md`).
- `mend` (`packages/content/src/abilities/mend.ts`) is heal-only now;
  `bolt` deals `chain-damage` and applies `slow` to its primary target.
- `apps/client/src/hud/upgrade-picker.ts`: a checkbox picker in the
  existing tuning drawer, one section per hero on **team A** for the
  current scenario (`duel` → bruiser only, `three-vs-three` → all three).
  Team B always stays at its stock build, so every Reset is a direct
  upgraded-vs-baseline comparison. Eligibility re-evaluates on every
  toggle (a prerequisite-gated upgrade greys in/out live, not just at
  Reset time).
- `unit-inspector.ts` shows an active `slow` status (percent + ticks
  remaining) alongside `shield`, and lists a selected unit's upgrades
  (`upgradeId x stacks`) when it has any.

### Verified, not assumed

- **The build-compile refactor alone changes nothing when a build has no
  upgrades.** Before any upgrade or reaction code was written,
  `pnpm simulate duel 1`, `three-vs-three 1`, and `three-bruisers 1` were
  re-run against the `HeroBuild`/`compileBuild` plumbing and reproduced
  their already-committed Phase 3 numbers exactly (297 / 829 / 392 ticks,
  identical event digests). This is what makes the numbers below
  attributable to the upgrades, not to the refactor underneath them.
- **A percent modifier onto a zero-base stat is silently inert — found by
  diffing, not by inspection.** `bonus-damage-vs-slowed` originally used a
  `percent` modifier; a probe comparing a bruiser's total `strike` damage
  with and without the upgrade selected showed *no difference at all*
  (50 vs. 50 across identical hit counts). `compileBuild`'s own output
  confirmed the compiled bonus was exactly `0`. Root cause and fix in
  `docs/decisions.md`.
- **Chain-lightning bounce selection is mirror-stable.** A probe ran
  `three-vs-three` across 5 seeds and compared `A-2`'s sequence of bounce
  targets against `B-2`'s (with team labels swapped) — identical every
  seed. Also confirmed `bolt` actually chains (12 of 18 casts in one run
  hit more than one target) and never hits the same target twice in one
  cast.
- **The reaction-budget safety path actually aborts, checked directly, not
  just by reading `processReactionQueue`.** A synthetic queue of 20 jobs
  (16 legal, 4 at an excessive depth) fed straight into
  `processReactionQueue` outside of any battle processed exactly 16 and
  then correctly reported the depth-exceeded diagnostic instead of
  continuing or throwing.
- **The shield-on-heal reaction fires in the live browser client, not just
  headless.** Checking `healing-that-also-shields` + `stronger-shield` on
  the support and running `three-vs-three` in the browser produced
  `A-3 healed A-1 for 20` immediately followed by
  `A-3 shielded A-1 for 23` in the event feed — matching the headless
  probe's math (`15` base `* 1.5` from one `stronger-shield` stack) — and
  the un-upgraded team B support only ever logged a bare heal.
- **One upgrade pair turned a guaranteed mirror draw into an outright
  win.** With no upgrades, `three-vs-three` seed 1 is a symmetric draw by
  construction. With `healing-that-also-shields` + `stronger-shield` on
  team A's support only, the same matchup ended `team A wins` at tick 295
  — a result-*kind* change, not just a bigger damage number, which is the
  bar the plan's Phase 4 deliverable actually sets.
- **A synergy upgrade with no partner present does nothing and breaks
  nothing.** Selecting `bonus-damage-vs-slowed` in a `duel` (bruiser vs.
  bruiser, neither kit has a slow source) produced an identical 10-for-10
  damage exchange to the unupgraded case and no console errors — correct
  behaviour for a cross-unit synergy upgrade with nothing to synergize
  with in that matchup, not a bug.
- **Eligibility re-evaluates live in the browser, not just in the
  function.** `stronger-shield`'s checkbox starts disabled in the picker
  and becomes checkable the instant `healing-that-also-shields` is
  checked — confirmed by screenshot before and after, not just by reading
  `isUpgradeEligible`.

### Deliberately deferred (see `docs/decisions.md` for why)

- `bonus-damage-vs-slowed` is restricted to `bruiser` in eligibility,
  rather than offered to every hero. It only ever reads the single-target
  `damage` effect path; `bolt`'s damage goes through the separate
  `chain-damage` path and never consults it, so offering it to a ranger
  would be a checked, always-inert choice.
- The picker exposes each upgrade as a single on/off toggle even where
  `maxStacks` is 2 or 3 — stacking beyond one pick is fully supported by
  the engine (verified directly through `compileBuild`: `more-max-hp` at
  3 stacks, `stronger-shield` at 2) but has no stepper control in this
  lab UI. A stack-count control belongs to Phase 5's real lobby picker.
- Upgrade selections are not part of the scenario export/import JSON —
  they live only in the picker's in-memory state for the page session.
- The reaction-budget safety path has no shipped content that can
  actually trigger it (the only reaction's generated effect, `shield`, is
  not itself a heal, so it can't retrigger `after-heal-effect`). Verified
  synthetically instead of by a real battle outcome — see above.
- The plan's "aborts an online battle without changing run health" half
  of the reaction-budget requirement isn't built: there is no online
  battle or run-health concept until Phase 5/6.

### Known gaps / minor rough edges

- `mend`'s rebalance to heal-only changes the Phase 3 discovery-session
  baseline materially: `three-vs-three` seed 1 now ends at tick 379 (was
  829) with a `50 / 170 / 90` damage split (was `50 / 190 / 120`) — a
  15-point shield reapplied roughly every 90 ticks across every
  unmodified support was absorbing a meaningful share of chip damage.
  `duel` (297 ticks) and `three-bruisers` (392 ticks) are unaffected
  (neither scenario uses a support).
- `healing-that-also-shields`'s value is entangled with the still-open
  Phase 3 support-positioning gap: the upgrade only pays off when `mend`
  lands on an ally, and the support's last-measured self-heal rate was 8
  of 12 casts. Whether the upgrade reads as strong or weak in practice
  can't be judged in isolation from that positioning question.
- Control glyphs are still unicode placeholders (unchanged from Phase 3;
  logged in `missing_assets.md`).

### Phase 4 review pass

An independent Opus review of this phase's diff found one real bug and
several worth a decision. Full rationale in `docs/decisions.md`. Summary:

- `createHeroBuild` accepted any upgrade IDs with no eligibility check at
  all — `heroId`, `maxStacks` and prerequisites were only enforced by
  `applyUpgrade`, which nothing called. Fixed: it now folds each ID
  through `applyUpgrade` in order, so an illegal build can no longer be
  constructed through this function. Every call site
  (`duel.ts`/`three-versus-three.ts`/`upgrade-picker.ts`) now passes a
  `Catalogue`.
- `validateCatalogue` gained a prerequisite-graph check (self-reference,
  cycles, cross-hero prerequisites) and now caps `slowFraction` below
  `1.0` (a full root was reachable content, not just a floating-point
  accident). The self-reference case doubled as a real client bug: the
  picker's deselect cascade had no recursion guard and would stack
  overflow on a cyclic prerequisite — fixed with a visited set.
- `compileBuild`'s basic-attack-cooldown division was unguarded against a
  compiled rate of `0` or below (→ `Infinity` cooldown, a permanently
  disabled ability). Now clamped to `[1, DEFAULT_TICK_LIMIT]`.
- Effects no longer apply to a target that already died earlier in the
  same cast (`bolt`'s `slow` no longer fires on a target its own
  `chain-damage` just killed), and `applyDamage` now clears a unit's
  `shield`/`slow` the instant it dies, so a corpse can't keep reporting a
  live status for the rest of the battle. This trimmed `three-vs-three`
  seed 1's event count from 153 to 149 (spurious post-mortem events
  removed); ticks/result/damage totals are unchanged.
- Two items were confirmed as intentional and documented rather than
  changed: a reaction-granted shield overwrites rather than stacks (same
  rule as every other shield reapplication), and a source that dies later
  in the same tick after its heal already resolved still lands the
  reaction shield it queued.

### Commands used to verify this phase

```
pnpm -r typecheck
pnpm lint
pnpm build
pnpm simulate duel 1                      # re-confirms 297 ticks, unaffected
pnpm simulate three-vs-three 1            # 379 ticks now, was 829
pnpm simulate three-bruisers 1            # re-confirms 392 ticks, unaffected
pnpm --filter @jev-game/client dev        # + / in the browser: tuning drawer,
                                           #   per-hero upgrade checkboxes,
                                           #   prerequisite greying, reset,
                                           #   play, event feed, unit inspector
```

### Discovery session (per the plan, before Phase 5)

Not yet run by a human. Two upgrade combinations were deliberately tried
and both produced an explicable, non-numeric behaviour change rather than
just bigger numbers: the shield-on-heal pair turned a guaranteed draw into
a win (see above), and chain lightning plus its bounce upgrade visibly
spreads `bolt`'s damage across multiple enemies instead of stacking it on
one target. Whether the *current six* upgrades are "a small set worth
choosing between" (the plan's decision-before-Phase-5 bar) — as opposed to
some being an obvious always-take — has not been evaluated by a human yet.

### Next concrete task

Phase 5: a complete local lobby run (pick a team and upgrades, eight-seat
lobby against seven baseline bots). Started, engine slice only — see below.

## Phase 6 — Run mixed human and bot lobbies online — DONE (prototype)

Started on explicit instruction after the board track. Rationale for
every choice, including the one deliberate departure from the plan
(battles resolved at the lock and replayed by clients, not stepped at
30 Hz), is in `docs/decisions.md` ("Phase 6: online mixed lobbies").

### What works now

- `pnpm --filter ./apps/server dev` (or the `server` launch config) runs
  the Colyseus server on port 2567 (`PORT` overrides it). Verified on
  Node 20.19: a Node 20 SDK client joined, hosted, started and received
  its draft view. In the client menu, **Play online**
  joins an open lobby or creates one; the lobby shows all eight seats,
  an invite link (`#join/<roomId>`), and a **Start** button for the
  host. Bots fill every seat nobody took.
- New `packages/protocol`: zod schemas for everything a client sends
  (`command`, `start`, `sync`, join options) and types for what the
  server sends (`view`, `ack`).
- `MatchRoom` (`packages/server-runtime/src/rooms/`): seat registry,
  command handler with remembered acknowledgements, server-owned
  deadlines with human fallbacks, a round hold that paces replays,
  reconnect grace, forfeits.
- Client: `session/online-session.ts` implements the same
  `MatchSession` interface as the local game, so the whole match screen
  (draft, placement, round replays, rail, upgrades) works unchanged
  online. New states: lobby, "waiting for the other players",
  "Eliminated · spectating", and a reconnecting / connection-lost
  banner. Your seat survives a page refresh.
- Run engine additions: `forfeitSeat`, `decideFallbackCommand` /
  `runFallbackCommands`, shared pacing constants, `you.ready` in the
  player view, and the shared-placement rule for simultaneous
  knockouts.

### Verified, not assumed

`apps/server/test/match.test.ts` (run with `pnpm --filter ./apps/server
test`; passes on Node 20.19 and 24.5 — the test supplies a WebSocket from
`ws` when Node has none; each test file runs in its own mocha process
because Colyseus can't boot twice in one), all passing:

- Two simultaneous joins get different seats; the first is host; bots
  hold the other six.
- After start, joining by ID is refused and matchmaking opens a fresh
  room. Only the host can start.
- Each human sees only their own offers; drafting another seat's offers
  is rejected (`unknown-offer`); another seat's public entry has exactly
  the five public fields. Other seats' builds and formations become
  visible only in battle setups, which exist from battle start.
- A duplicate command ID returns the original acknowledgement; stale
  epoch and stale revision are rejected; malformed messages (a string
  where offer IDs go, an invented `win-battle` intent, a smuggled
  `playerId`) are dropped by the schema and change nothing, and the
  sender stays connected.
- A dropped connection reconnects into the same seat with its drafted
  team intact.
- A seat whose grace runs out is forfeited, is left out of the next
  round's pairings, and is eliminated (health 0) at the next settlement.
- A host who drops in the lobby hands the role on at once; the new host
  can start.
- Twenty placement changes by one player send no view to the other.
- Two humans and six bots play to the end; both clients agree on every
  seat's health, eliminations, winners and every round's pairings.
- Eight humans fill every seat of one run; a ninth is turned away.
- Live: two browsers (one of them the user's) plus a scripted SDK
  player joined one lobby and played a full match together; every
  phase used the server's timing (30 s draft, 15 s preparing and
  upgrade) and the match finished with a winner on every client.
- Live, in the browser: a page reload resumes the same seat in the same
  room (the browser's unload counts as a drop, so the 30 s grace
  applies); a round replay starts from the server's clock and the
  upgrade countdown picks up the server's remaining time; leaving
  clears the saved seat; the local match still plays as before.

Measurements (four simultaneous three-versus-three battles per round,
test timings sped up; in-process test server on an M-series Mac):

| Measure | Observed |
| --- | --- |
| Resolving a round's four battles | 2.2–4.7 ms |
| `view` message per client | 3.3 KB typical, 7.7 KB largest |
| Heap growth over one full match | +2–6 MB across runs (garbage-collection noise dominates) |
| Two full rooms at once | +1.4–4.7 MB heap across runs, 2.2–4.6 ms per round resolve each |

These are observations from one machine, not a capacity claim.

### Known gaps

- The local game still has no draft timer (online has 30 s).
- A tab in the background stops animating; online, its replay snaps
  forward to the server's clock when it comes back (more than 1 s
  behind), so it can't eat into the next deadline.
- There is no in-match "leave" button; closing the tab forfeits after
  the 30 s grace. The finished and eliminated screens have one.
- Persistence: a server restart ends every match (by design for now).
- Bots are predictable to a modified client that brute-forces the run
  seed from public battle seeds (see "Phase 6 review pass" in
  `docs/decisions.md`).
- A duplicated browser tab copies the saved seat and takes it over.

## Board and renderer track — IN PROGRESS

A detour between Phase 5 and Phase 6, on user instruction: an 8×8
Underlords-style board where you place your heroes, and a Three.js
renderer with an angled camera. Plan and stages:
`docs/board-and-renderer-plan.md`; rationale and before/after
measurements: `docs/decisions.md` ("Board grid, placement and a
Three.js renderer").

- **Done:** the grid board and formations in the engine and run
  (`packages/game/src/board/cells.ts`, `packages/content/src/formations.ts`,
  the `place-heroes` command, setups built at battle start, bots placing
  then readying).
- **Done:** a Three.js renderer (`apps/client/src/game/views/board-stage.ts`,
  `battle-view.ts`, `hero-figures.ts`) replacing the 2D canvas in both
  the lab and matches: angled camera on the watched player's side, a
  tiled 8×8 board with brass corners, placeholder miniatures per hero,
  floating health and shield bars, damage and heal numbers,
  projectiles and chain arcs, shield bubbles, slow rings, death sink,
  click to inspect with a range ring. `arena-view.ts` and `unit-view.ts`
  are gone.
- **Done:** placement (`formation-view.ts`): during `preparing` your
  heroes stand on your half and you drag them between cells; the
  battle starts from that formation.
- **Done (2026-09-23):** the model pipeline (`docs/models.md`). Blender
  sources live in `art/models/` under Git LFS, and `pnpm models:build`
  exports them with meshopt compression and checks the contract. The
  client loads models in the background without blocking the first
  screen. `createHeroFigure` returns a model-backed figure, or a
  placeholder that swaps itself for the model when the load finishes. The `#models` lab shows clips
  and crowd stress stats. Anvil is the first real model in battles.

### Verified, not assumed

- Before/after battle outcomes for the board change (table in
  `docs/decisions.md`).
- Lab: select a unit (gold ring, range ring, inspector), run to a mutual
  wipeout, reset — all six heroes back with their bars.
- Match: draft → drag a hero → battle starts from the dragged cell;
  5 rounds with 40 player switches, one canvas, six bars per battle, no
  errors; the camera turns to whichever player is watched.
- Placement: dropping onto a teammate swaps the two; dropping onto the
  enemy half snaps the hero back.
- Lab on the board: duel and three-vs-three scenarios, reset and replay
  (2 and 6 health bars respectively, no errors).
- `pnpm simulate` on the board, seed 1: duel 272 ticks,
  three-vs-three 413, three-bruisers 484, all mutual wipeouts with
  mirror-exact damage. **Tick counts quoted in the Phase 2–4 sections
  (297 / 379 / 392 and the damage breakdowns) were measured on the old
  100×60 arena and no longer reproduce.**
- `pnpm -r typecheck`, `pnpm lint`, `pnpm build` clean (bundle-size
  advisory only).
- Models (2026-09-23): `pnpm models:build` exported Anvil, the crate and
  the barrel with 0 errors and 0 warnings. A three-vs-three lab battle
  ran to the end with Anvil's model and no console errors. All eight
  clip states (idle, run, attack, cast, hit, death, sunk, revived) were
  captured in `#models`. The ×32 leak test reported no leak
  (geometries 213 → 213, textures 35 → 35).

### Known gaps

- Anvil and Gorrak have real models; every other hero is still a
  placeholder shape. Gorrak's whirlwind plays his `channel` clip and a
  code-drawn cyclone.
- A seat with a bye can't rearrange that round (it already counts as
  ready).
- The 15-second preparing timer now also covers placement.
- Hits show on the engine's tick; swings and projectiles don't start
  early yet.

## Phase 5 — Create a complete local lobby run — IN PROGRESS

Started on explicit instruction. This entry covers the headless engine
plus a playable client UI on top of it. Still open: a real formation
choice, a real heuristic bot, and two items awaiting a user decision (a
draft-screen timer, watching other battles) — see "Deliberately
deferred" and "Awaiting a decision" below, and `docs/decisions.md` for
the full rationale behind each design choice. Replay is out of scope on
user instruction.

### What works now

- New package `packages/run`: `RunState`/`PlayerSeat`/`RoundState`/
  `RoundBattle` types, a pure `createPairings(activePlayerIds, history,
  pairingSeed)` (deterministic circle-method round-robin for an
  unchanged roster, ranked perfect-matching fallback with bye handling
  once eliminations change the roster), `applyCommand` (four command
  kinds: `commit-draft`, `commit-upgrade`, `skip-upgrade`,
  `confirm-ready`, validated in a fixed order — actor, phase, decision
  revision, one-decision-per-phase, then offer legality — and returning
  a structured rejection reason instead of throwing), private per-seat
  hero and upgrade offer generation, per-round battle orchestration
  (`enterBattlePhase`/`settleRound`), and seeded random-bot controllers.
- `getPlayerView(state, playerId)`: the one projection both the human
  UI and the bots read. It carries your own builds, revision and
  private offers. Its `players` map has only public fields (name,
  controller kind, health, eliminated) for every other seat, so a pick
  made mid-upgrade-phase can't leak, and it never includes other seats'
  offers or the run seed. Opponent builds *are* visible through
  `currentRound.battles[*].setup` once the battle starts — deliberately,
  since the plan treats locked battle state as public. (Setups used to
  be created on entering `preparing`; since the board track they are
  built at battle start and are `null` while players place heroes.) Neither the client nor
  `decideBotCommand` reads raw `RunState` any more.
- `pumpRun(state, catalogue)` drives every automatic phase transition
  (`lobby → draft`, `battle → round-result`, `round-result → upgrade`)
  until blocked on a player command or the match is `finished`;
  `runBotCommands` submits every non-human seat's decision for the
  current phase in one pass.
- Four independent seed streams (`derivePairingSeed`, `deriveBattleSeed`,
  `deriveOfferSeed`, `deriveControllerSeed`), all derived from the run
  seed plus a purpose/scope tuple — no shared RNG stream between
  simultaneous battles or between seats' offer/bot randomness.
- A playable client UI (`apps/client`, reachable at `#match`; `#lab` or
  any other hash stays on the battle lab). It's styled after Dota
  Underlords (see `docs/decisions.md`'s "HUD restyle" entry). There's a
  main menu (brush-stroke title, a "Battle lab" link, and a "FIGHT!"
  button), then one persistent match layout:
  - a player rail on the left: every seat with a seat-coloured portrait,
    name and heart count; you outlined gold, this round's opponent red;
    eliminated seats greyed with an "OUT" tag.
  - a stone round plate top-right: round, phase, and the countdown as
    its big number.
  - your team's tiles on the right: a role icon and one lit pip per
    upgrade stack.
  - phase content in the centre: 5 hero cards to draft 3, a versus
    screen, result banners, upgrade cards grouped per hero.
  - one round action button bottom-right: Confirm, Ready, Continue or
    Menu.

  `MatchSession` (`apps/client/src/session/match-session.ts`) wraps the
  engine and auto-resolves bot turns and automatic phases after every
  human action.
- The loop is: menu → draft → **a 15-second Ready countdown that
  auto-confirms if you don't click** → **you automatically watch your own
  battle play out**, full-screen, with the HUD layered on top as in the
  reference screenshot. The round plate counts the battle's time limit
  down in real seconds (about 23 at 2× playback); any fight still going
  at 0 is a draw (the engine's existing `timeout` rule, now spelled out
  as "time ran out"). When every fight has ended, the plate shows
  "Round over 3·2·1" and the game moves on by itself, with no Continue
  button → a Victory/Defeat/Draw banner → the upgrade window (same 15s
  timer; it auto-picks the first offer or skips) → next round with a
  different pairing → ... → finished → back to menu. Watching is
  the default path, not an opt-in button. If you're eliminated, you
  still watch the battle that eliminated you, then land on a crimson
  "Eliminated — Round N · lost to Bot X" banner with the run's winner.
  There is no "Watch again": your battle plays once, automatically,
  before its result screen. The lab is reachable from the menu only.
- **Watching other players' battles.** All of a round's battles play on
  one shared clock (`apps/client/src/session/round-playback.ts`). While
  the round plays, the player rail stays on screen and every seat that
  fought is clickable. Clicking one switches the board to their battle
  at the same moment, from their side: they're blue and their opponent
  red, and the header reads "BOT 4 vs BOT 7". Each seat shows LIVE until
  its battle ends, then WON, LOST or DRAW. Hearts show the pre-round
  value until that seat's own battle ends, so the rail never spoils a
  fight you haven't watched. On a bye you start on another battle. Seats
  aren't clickable outside the round view, in particular not while
  preparing, since the next round's setups already exist and simulating
  one would reveal its result. If you're eliminated, the session keeps
  that whole round (every battle plus the seats as they stood), so you
  can still browse it even though the rest of the match resolves
  instantly.
  Mid-match there is deliberately no lab link, because leaving `#match`
  discards the run.

### Verified, not assumed

- **The pairing schedule is exactly correct, checked directly, before
  anything was built on top of it (per the plan's own explicit
  ordering).** An 8-player, 7-round schedule covers all 28 possible pairs
  exactly once with zero repeats, for two different seeds. A 6-player,
  5-round schedule covers all 15 pairs exactly once. A shrinking roster
  (8→7→5→3→2 across successive rounds) gives the bye to a *different*
  player each time one was needed. A 10-round bye simulation on a
  5-player roster produces a perfectly even 2-byes-each distribution
  with zero consecutive repeats.
- **A full 8-bot match runs end to end with no human input**, through
  every phase (`lobby → draft → preparing → battle → round-result →
  upgrade → ...`), to a single-winner `finished` state. Round 1 produces
  exactly 4 battles covering all 8 players with no bye, matching the
  acceptance check verbatim.
- **Re-running the same run seed produces bit-for-bit identical
  results** — same winner(s), same final run-health distribution for
  every seat, confirming the four independent seed streams don't
  desync bot decisions or battle outcomes between two otherwise-identical
  runs.
- **The round cap and shared-win rules both fire correctly**: a
  round-cap of 2 forces `finished` after exactly 2 rounds with every seat
  still at full health *sharing* the win (a real three-way tie observed,
  not just a theoretical code path).
- **A 2-player roster** (the final-duel case, no pairing algorithm
  needed) and **a 5-player roster** (odd every round, exercises the bye
  path every single round) both complete correctly to a single winner.
- **A simulation failure aborts the whole match, not just one battle** —
  `settleRound` checks every battle in the round for a `failure` result
  before applying any health change; confirmed by construction and
  documented in `docs/decisions.md` (not separately battle-tested here,
  since no shipped content can currently produce a battle failure — see
  Phase 4's own reaction-budget-exceeded discussion for why).
- **The client UI was exercised live in the browser, not just read.** A
  full human draft, a resolved round-1 battle against a correctly-paired
  opponent, an on-demand replay (real tick-by-tick playback, working unit
  selection, a live event feed), an upgrade pick that correctly gated
  `stronger-shield` behind `healing-that-also-shields`, four full rounds
  including a loss, a win, and a bot's elimination rendering correctly in
  the standings strip, and zero repeated opponents across those four
  rounds. Two real bugs were found this way and fixed — see
  `docs/decisions.md`'s "Phase 5 (client slice)" entry: bots being asked
  to re-decide an already-committed upgrade pick (crashed on an uncaught
  exception; fixed both at the root — `runBotCommands` now skips
  already-ready seats — and defensively — `applyCommitUpgrade` now
  returns a rejection instead of throwing), and a CSS specificity bug
  where `.match-root`'s own `display: flex` silently defeated the
  `hidden` attribute when switching back to the lab.
- **The rebuilt "watch your battle, then a real timer" loop was verified
  live across three rounds**, including deliberately letting the
  upgrade timer run out completely unattended and confirming the run
  advanced on its own to a fresh, unrepeated opponent — not just checking
  that the timer element renders. A draw and a win were both confirmed to
  leave both sides' run-health unchanged. Found two more real bugs doing
  this, both invisible to the original text-summary flow: a dead
  "Continue" button when no upgrades are offered (there was no command
  for "I have nothing to pick, advance me" — added `skip-upgrade`), and a
  bot that runs out of eligible upgrades could have stalled the *entire
  match* forever, not just its own turn (`runBotCommands` treated "bot
  has nothing to submit" as fine, but nothing was actually submitted, so
  that seat could never read as ready). See `docs/decisions.md`'s "Phase
  5 (client slice, round 2)" entry.
- **A real Retina-display bug (camera appearing to cut off units almost
  immediately) was reported, reproduced by reasoning + a targeted DOM
  check (not by eye — this dev environment's browser pane is dpr-1), and
  fixed.** The battle-watch canvas was missing the CSS rule that locks
  its displayed size to its container regardless of the higher-resolution
  pixel buffer `arena-view.ts` allocates for crisp rendering; without it,
  a `devicePixelRatio: 2` screen renders the canvas at literally double
  its container's size with nothing to clip it, so only the top-left
  quarter of the arena is ever visible. See `docs/decisions.md`'s "Phase
  5 (client slice, round 3)" entry.
- **The preparing ("Ready") screen now has the same 15-second visible,
  auto-confirming countdown as the upgrade screen**, closing the "a
  stalled human cannot hold the round forever" acceptance check for the
  phase that previously had no deadline at all (bots always ready
  instantly, so only the human seat could block it). Verified live:
  reached a fresh round, took no action, and watched the countdown expire
  and advance straight into the battle-watch overlay unattended.

### Deliberately deferred (see `docs/decisions.md` for why)

- **Engine-level, server-authoritative deadlines.** Both the upgrade and
  preparing screens now have a real, working 15-second countdown that
  forces a decision, but it's a client-side convenience scoped to the
  human's own local browser session — there's still no shared-clock,
  multi-session deadline concept at the `RunState`/engine level, which is
  what the plan means for online play. `readyThresholdByPlayer` remains
  the hook for building that properly, whenever Phase 6's room-owned
  clock exists.
- **A real formation choice during `preparing`** — currently a pure
  readiness gate with a fixed default spawn layout, not a player choice.
- **A real heuristic bot** — `heuristic-bot` is currently identical in
  behaviour to `random-bot`.

### Awaiting a decision

Both were plan items that went unbuilt *and* unrecorded until the
Phase 5 review pass below surfaced them.

- **A timer on the draft screen.** Preparing and upgrade have one; draft
  doesn't, so a human can sit on it indefinitely. Locally that only
  blocks the human themselves (bots draft instantly). The plan wants a
  deadline here too, with a longer window than later rounds.
- ~~Watching other battles~~ built on user instruction, see "What
  works now". Still not built: a standalone round overview outside the
  battle view (who's playing whom before the round starts, "Round N of
  8").

### Explicitly out of scope, on user instruction

- **A replay system.** The plan lists "replaying a saved run" as a Phase
  5 acceptance check, but the user does not want one — dropped from this
  project's scope entirely, not just still-unbuilt. Nothing records a
  `RunCommand` sequence, and nothing should.

### Phase 5 review pass

An Opus review before Phase 6 confirmed five real defects, each by probe
script or live browser run rather than by reading; all fixed and
re-verified. Full rationale in `docs/decisions.md`. Summary:

- **You never saw the battle that eliminated you** (42 of 44 eliminated
  runs in a 60-seed probe). Once eliminated, the human stops blocking any
  barrier, so the session resolved the rest of the match in one call and
  the final state held only the last round — Ready went straight to
  "Match finished, Winner: bot-3". `MatchSession` now remembers your most
  recent resolved battle; it auto-plays, and a new eliminated screen
  names the round and opponent. Verified live: eliminated in round 4,
  watched that battle, landed on "You were eliminated — Round 4: You
  lost to Bot 3", "Watch again" replayed it.
- **"Watch again" cost you your upgrade.** The countdown kept running
  behind the replay overlay and auto-picked for you. The timer now
  pauses when the overlay opens and resumes with the same remaining
  time, keyed by `phaseEpoch`. Verified live: 10s before a 17s rewatch,
  10s after, still on the upgrade screen; it then expired normally.
  *Superseded:* the "Watch again" button was later removed on user
  instruction, and this timer pause with it.
- **The engine accepted one draft offer three times** (three bruisers
  from one offer). Now rejected as `duplicate-offer`.
- **The engine accepted a second decision in the same phase** — with a
  second human still deciding, the first could take two upgrades in one
  round. Now rejected as `already-decided`. Both this and the previous
  item were unreachable through the UI but would have been reachable by
  any Phase 6 client.
- **`getPlayerView` didn't exist** (plan step 4) — see "What works now".
- Polish: opponents and winners show display names ("Bot 5", not
  `bot-5`), and upgrade cards say which copy of a duplicated hero they
  apply to ("bruiser #1" / "bruiser #2").
- **Both teams drew in the same purple in match battles.** Unit colour
  keyed off team IDs literally named `"A"`/`"B"`, but match teams are
  player IDs (`"you"`, `"bot-4"`), so every unit fell through to a
  fallback colour, and the inspector showed every unit as blue.
  `createBattleView` and `createUnitInspectorView` now take a
  `friendlyTeamId`: your side is blue and everyone else red, whichever
  side of the arena you spawn on. The lab passes `"A"`, so it looks
  exactly as before. Verified live in both modes, including clicking a
  red enemy and a blue friendly unit in the inspector.
- **Regression check:** a 75-run fingerprint (8-bot and 5-bot all-bot
  matches, plus a scripted-human match, 25 seeds each) captured before
  any change was byte-identical after, so routing the bots through
  `getPlayerView` and the new command checks changed no legal outcome.
- **A bye seat's preparing screen no longer offers Ready or a timer.**
  A bye seat has no readiness threshold, so it already reads as ready
  and `already-decided` would reject its Ready — a dead button. Not
  reachable locally (a 200-seed, 7-seat probe passed through 163 human
  byes and never left the human on that screen, since bots ready
  instantly), but a second human deciding in Phase 6 would strand a bye
  seat there. It now just says it's waiting for the other battles.

### Known gaps

- `computeWinners` returns no winners if every survivor is eliminated
  in the same settlement, where the plan says those seats share the
  final placement. Unreachable under the current rules: every battle has
  at most one loser and draws cost nothing, so someone always survives a
  round. It becomes reachable if a draw ever costs health.
- `MatchSession.settle` caps its loop at 100 steps and stops silently
  if it ever hits that. The longest real path (the human eliminated in
  round 1, bots finishing an 8-round match) needs about 16 steps.

### Commands used to verify this phase (so far)

```
pnpm -r typecheck
pnpm lint
pnpm build
pnpm --filter @jev-game/client dev   # + open /#match in the browser:
                                      #   draft, ready, watch battle, upgrade,
                                      #   across several rounds; #lab still works
```

Headless engine verification was done with throwaway probe scripts
(written, run, then deleted, per established practice) — `packages/run`
itself has no `pnpm simulate`-style entry point since there's no
scenario-file concept at the run level; the client is the entry point.

### Next concrete task

Superseded: Phase 6 is built (see its section above). It kept battles
resolving at the lock instead of stepping them on a room clock; the
reasoning is in `docs/decisions.md`. The draft-timer question is still
open for the local game.

## Heroes, combos and builds — first slice — BUILT (awaiting review)

### What works now

- **Heroes:** Bulwark, Frostweaver, Duskblade and Pyromancer, with
  signatures, utilities, passives and six talents each.
- **Pieces:** 15 items and 6 runes.
- **Combos and traits:** Staggered, Brittle and Disoriented, with Overload,
  Shatter and Crush, Tier II and attunement.
- **The run:** a reward phase on the fixed round track, with items (3
  slots plus a stash), rune sockets, tiered talents, recruit or train,
  loser bonus offers and surprise rarities. Bots and deadline fallbacks
  answer every decision. The rules default to health 13 and max loss 3, the
  user's choice on 2026-09-23.
- **Protocol v2** carries `choose-offer`, `move-item`, `socket-rune` and
  `discard-item`.
- **Client:** the trait strip, the loadout rail (only heroes that can
  take the selected piece light up), reward cards with combo gain chips,
  and figures for the new heroes.
- **Battle presentation:** a mana bar, a condition badge with a countdown
  ring, a buff/debuff status row, condition rings, crit, combo and DoT
  numbers, combo callouts and bursts, and Meteor's landing and burn
  zones.
- **`pnpm survey`:** a headless balance survey. It runs sanity, teams,
  pieces and full-run tiers, and writes its report to `reports/survey/`.

### Verified, not assumed

- **15 legacy event digests are byte-identical** to the baseline taken
  before any engine change.
- **Browser (local match against 7 bots):**
  - draft, preparing, battle and rewards all work;
  - an item was taken into the stash and equipped;
  - Chain was dimmed on Bulwark and lit on Duskblade and Frostweaver,
    then socketed on Duskblade.
- **One observed fight** produced:
  - 3 OVERLOAD!, 6 CRUSH! and 4 SHATTER! callouts;
  - 16 crit numbers and 15 condition badges (all three conditions);
  - status chips for knocked-down, frozen, taunted and untargetable.
- **Burn stacks** showed as a "3" on the chip in an earlier fight.
- **Online, against a real server:** lobby, draft, preparing, battle,
  rewards and the round 2 talent milestone all worked.
  - `choose-offer` put the picks in the stash, `socket-rune` put Chain
    on Frostweaver (Pyromancer was dimmed), and `move-item` put
    Whetstone on Pyromancer.
  - The fight showed 36 burn numbers (10, 20 and 30 as stacks built),
    Shatter callouts, burn, frozen, invulnerable and untargetable chips,
    and Meteor's burning ground.
  - No server errors.
- **Survey (quick, 20 seeds, 200 runs):**
  - hero win rates 46.9–52.7%;
  - fight median 26.0 s, 90th percentile 44.3 s;
  - all 200 runs finish (median 14 rounds);
  - eliminations at a median of round 9.

### Known gaps

- The other six heroes and their primitives (summons, links, poison,
  heal over time).
- Scouting the next opponent.
- First-slice scenarios in the battle lab.
- Art and audio from `missing_assets.md` 11–14.
- At narrow widths (about 720 px), the battle feed overlaps the board's
  right edge, and the stash controls overlap the reward cards. It's fine
  at desktop width.
- Survey flags to know about: bare-team compositions decide a lot, Aegis
  on Duskblade is +21.7, and 2.8% of fights time out.
- **Dead units' plates now hide.** `.unit-plate[hidden]` had no
  `display: none`, so dead units' plates stayed on screen. This is
  visible in the lab as well as in matches.

### Commands used to verify

```
pnpm lint
pnpm -r typecheck
pnpm --filter @jev-game/client typecheck
pnpm typecheck:scripts
pnpm build
pnpm --filter @jev-game/server test
npx tsx scripts/simulate.ts <duel|three-vs-three|three-bruisers> <1|2|3|7|42>
pnpm survey --seeds 20 --runs 200
```

## Tempo, reward screen, cleanup and review — 2026-09-23

### What changed

- **Slower, weightier fights.**
  - Replays now run at 1× instead of 2×.
  - Attacks are 1.4× slower and hit 1.4× harder; walking is about 0.7×.
  - Everything tied to attack cadence was rescaled with them.
- **An Underlords-style reward screen.** One decision at a time over the
  visible, dimmed board, with big round icons in rarity rings, rarity or
  tier tags, large names, and a timer bar. The team rail uses the same
  per-item glyphs.
- **No backwards compatibility.**
  - The placeholder heroes and every engine path that existed only for
    them are deleted (see `docs/decisions.md`).
  - The lab and `simulate.ts` run the new heroes.
  - The lab's Tuning panel lists talents by tier.
- **Review fixes:** 15 defects fixed from two review agents, listed in
  `docs/decisions.md`.
- **The survey's hero flag now uses one-swap win rates.**
- **Art requests** for item, rune and talent icons and hero portraits
  were `missing_assets.md` 15–18. All have since been delivered; see
  `docs/icons.md`.

### Verified, not assumed

- **In the browser (local match):**
  - the new reward steps (item, rune, talent tiers) walk through one at
    a time;
  - the timer bar doesn't restart between steps;
  - the fallback took the first offer when time ran out;
  - it lays out correctly at 1024×768 and 1440×900;
  - the rune rows show which heroes each rune fits.
- **At 1× replay speed:** the round clock falls 10 s in 10 real seconds,
  and the whole board produced 2.6 hit numbers per second, most of them
  60–90.
- **Lab:** the new 3v3 plays. The Tuning panel's tier locks and
  untick cascade work.
- **Review probes re-run after the fixes:**
  - Interpose's share and the Shatter shards are no longer
    double-scaled;
  - Echo retargets away from an untargetable unit;
  - there's no second zone on an echoed Meteor;
  - no DoT ticks after a revive;
  - Challenge shields only for taunts that landed;
  - triple items are rejected;
  - Primer fits only Bulwark and Pyromancer.
- **New determinism baseline:** duel and three-vs-three over seeds 1, 2,
  3, 7 and 42, recorded twice, identical.
- **Gate:**
  - `pnpm lint` passes;
  - the client and scripts typecheck;
  - `pnpm build` succeeds;
  - server tests pass (2 + 13).

### Known gaps

- **Balance can't be judged on four heroes.** Duskblade is the only
  Cunning hero, so any team with it wins 84% against the one team
  without it. The fix is the other six heroes, not stat tuning.
- **Two review findings wait on the user:** builds are visible to every
  client after each round, and the run seed can be brute-forced.
- **Glyphs stand in for icon art** until `missing_assets.md` 15–18 is
  delivered.
- **The narrow-width overlaps** noted earlier are unchanged.

### Commands

```
pnpm lint
pnpm build
pnpm --filter @jev-game/client typecheck
pnpm typecheck:scripts
pnpm --filter @jev-game/server test
npx tsx scripts/simulate.ts <duel|three-vs-three> <seed>
pnpm survey --seeds 20 --runs 200
```

## All ten heroes, names and lore — 2026-09-23

### What works now

- **Ten playable heroes** with Dota-style names, each with a basic
  attack, a signature, a utility, a passive and six talents:
  - **Anvil, Morrow, Gorrak** (Might);
  - **Vesper, Nettle, Brassjack** (Cunning);
  - **Cinder, Rime, Moira, Sexton** (Arcana).
- **Three summons:** thralls and the Bone Golem (Sexton), and turrets
  (Brassjack).
- **New engine features:**
  - summons, links (Shared Fate) and channels (Whirlwind);
  - ally heals and healing ground;
  - Last Rites, Hex, and poison that Disorients at 4 stacks;
  - Withering, Bloodlust, Overclock and Cleave;
  - new targeting policies, and stacking summon buffs.
- **One of each hero per team:** the draft offers distinct heroes, and
  recruit offers skip heroes you already have.
- **`docs/lore.md`:** the world, how the heroes fit together, and their
  stories and voices.
- **Battle view:**
  - Whirlwind spins the figure, and Hexed units shrink;
  - linked and channeling status chips;
  - plague green and hallowed gold ground;
  - a burst when a summon appears;
  - small, muted echo numbers.

### Verified, not assumed

- **New features before new content:** the duel and 3v3 lab pair
  replayed byte-identically to the baseline.
- **400-fight stress probe** (random different-hero teams, random talent
  paths): 0 crashes. Every mechanic fired: summons, dismissals, links and
  echoes, Hex, channels, poison Disorients, Last Rites, Martyrdom,
  harvest golems, Cleave, Death Knell. Median fight 25.8 s, 2.25%
  timeouts.
- **Server tests pass** (2 + 13) with the ten-hero catalogue and distinct
  offers.
- **Light survey** (4 seeds, 58k battles, 100 runs):
  - 100 of 100 runs finish, none stall, no failures;
  - fights: 29.5 s median, 3.2% timeouts;
  - one-swap after the Morrow sanity fix: Morrow 77%, Nettle 74%, Cinder
    66%, Rime, Anvil, Gorrak and Vesper 48–51%, Brassjack 36%, Sexton
    35%, Moira 15%.
- **The lab pair still replays identically** after all the new
  features and fixes.

### Known gaps

- **No balance work yet,** by request. Numbers are scaled first passes.
- **Figures and glyphs** for the six new heroes and the summons are
  placeholders; the art is requested in `missing_assets.md` 8 and 18.
- **Capstone simplifications** are listed in the design doc's §18.


## Phase 7 — Integrate independent Jev players — IN PROGRESS

### What works now

- **`packages/jev`** (server-only; lint bars `apps/client` from importing
  it):
  - `provider/`: the TypeSafe transport (`@typesafe-ai/sdk`, no retries,
    5 s timeout), zod answer validation, a labelled offline stub, a
    concurrency limiter (default 4), and settings from the environment
    (`TYPESAFE_API_KEY`, `JEV_MODEL`, `JEV_TIMEOUT_MS`, `JEV_CONCURRENCY`,
    `JEV_PROVIDER=offline`).
  - `observations/`: the game rules, combo rules, round, health,
    standing, team with talents, items and runes, stash, current
    synergies, the last three results, and opponents' health. A question
    measured 2.9 to 3.4 KB, roughly 750 to 850 tokens.
  - `decisions/`: draft picks (one question per pick, each seeing the
    earlier picks and what the new hero would light) and reward choices
    (every legal offer and hero placement, previewed with `applyCommand`).
  - `decision-record.ts`: per-decision records (seat, epoch, revision,
    model, options, choice, probabilities, confidence, latency, tokens,
    fallback reason) and a replay log of accepted commands.
  - `driver.ts`: one job per seat, phase-deadline aborts, stale and
    superseded rejection.
- **`pnpm --filter @jev-game/jev probe`**: headless runs with N Jev seats
  against baseline bots. It replays each run from its log and compares the
  final state. `--provider offline|faults|typesafe`, `--jev-seats`,
  `--runs`, `--offline-delay-ms`, `--draft-seconds`, `--reward-seconds`,
  `--records out.jsonl`, `--show-question`.

### Verified, not assumed

- **Offline, 1 Jev seat, 3 runs:** all finish; 100 decisions, 100
  provider calls, 0 stale; every replay identical with 0 provider calls.
- **Offline, 7 seats, 2 runs:** peak concurrency 4 of 4; 389 decisions,
  0 stale; replays identical.
- **Injected faults through the real SDK** (HTTP 500, 429, malformed
  body, unknown option, hang past the timeout): each lands in its own
  fallback reason (`http-error`, `rate-limited`, `invalid-response`,
  `unknown-option`, `timeout`); every run finishes; replays identical.
- **Slow provider past tight deadlines** (400 ms answers, 1 s draft,
  0.5 s reward): 146 `deadline` fallbacks and 7 `superseded` draft jobs,
  none applied late; the run finishes; replay identical.
- `pnpm lint`, the workspace typecheck and the server tests (2 + 13) pass
  on Node 20.19.

### Wired into play (2026-09-23)

- **"Fight!" plays against Jev through the server.** It opens a solo
  match room (`{ solo: true }`): the room is private, starts as soon as
  you join, and fills the other seven seats with `"jev"` seats. "Play
  online" still opens the shared lobby, and Jev fills the empty seats
  there too. The in-browser match (`createMatchSession`) is deleted.
- **Seat names show what's actually playing:** "Jev N" with a key,
  "Stub N" with `JEV_PROVIDER=offline`, and "Bot N" (baseline bots) when
  neither is set. The server logs which one it's using at the first match.
- **The room runs the driver.** It syncs after every state change and
  applies outcomes with stale checks. A rejected or empty outcome falls
  back for that seat straight away instead of waiting for the deadline.
  Deadline fallbacks still cover every seat. Decision records are kept on
  the room (`jevRecords`), and fallbacks are logged as `[jev] ... fell
  back: <reason>`.
- **"Thinking" tag:** the room publishes each seat's `thinking` flag, and
  the player rail tags a seat "Thinking" while its question is out.
- **Skip ends the shared hold.** When your replay ends or you press Skip,
  the client sends `watched`. The room ends the round-result hold once
  every connected human has watched that epoch. Solo Skip now reaches
  rewards in about 1 s instead of about 35 s. Online, the hold still waits
  for everyone.
- `PROTOCOL_VERSION` is 3, because the lobby schema gained `thinking`,
  join options gained `solo`, and there's the new `watched` message.
- **Verified:**
  - A new server test plays a solo room with seven offline-stub seats to
    the end: 200 decisions, 184 answered, 15 deadline fallbacks at the
    test's 0.3 s reward window.
  - All 17 server tests (2 + 15) pass on Node 20.19, including a hold
    test: solo ends the hold right after `watched`, and with two humans it
    waits for the second.
  - In the browser, Skip reached rewards in 1.1 s.
  - In the browser (offline stub), "Fight!" went through draft, preparing,
    a battle, the round result, and item and rune rewards, with no
    fallbacks logged.

### Real Jev, through Cloudflare (2026-09-23)

- **Transport:** the user's account runs Jev on Cloudflare Workers AI.
  `provider/cloudflare.ts` posts `{ model: "typesafe/jev", input: { state,
  questions } }` to `/accounts/{id}/ai/run`. The model has to go in the
  body; `/ai/run/typesafe/jev` returns "No route for that URI". The answer
  comes back wrapped as `result.result`, validated with zod.
- **Settings:** `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` live in
  `apps/server/.env.development` (gitignored). A `TYPESAFE_API_KEY` wins if
  both are set; `JEV_PROVIDER=typesafe|cloudflare|offline` forces one.
- **One Jev seat vs seven baseline bots, one full run:**
  - 40 decisions, all answered by jev-1.13.0, no fallbacks;
  - latency: median 0.54 s, 95th percentile 3.1 s, max 3.5 s;
  - about 1,350 input tokens per question;
  - the replay was identical from the log alone;
  - it drafted Anvil, Cinder, Morrow (two Staggered setters and an Arcana
    detonator, which lights Overload), then recruited Sexton (a second
    Arcana detonator). Median confidence 0.40.
- **In the browser, with seven real Jev seats:** "Fight!" showed "Jev 2" to
  "Jev 8"; every seat showed "Thinking" in the draft and in the rewards;
  play reached rewards; the server logged no fallbacks.
- **Cloudflare fault injection** (`--provider faults-cloudflare`): HTTP
  500, 429, malformed body, unknown option and a hang each map to their
  own fallback reason.

### Not done yet

- **"Fight!" needs the game server running** (`pnpm dev` starts both).
  With it down you get the usual "Couldn't reach the game server" notice.
- **No evaluation against baseline yet** (paired seeds and side swaps,
  per the plan). One real run is an anecdote, not a result.
- **Cloudflare pricing and rate limits for `typesafe/jev` are unknown.**
  TypeSafe's own list price is $0.042 per million input tokens, but the
  Cloudflare route may be billed differently.
- **Formation stays on the baseline policy.**
- **Fault-mode records** use the model name `fault-injection`, so they
  can't be mistaken for real Jev answers.
- **Solo play uses the online timers:** 30 s draft, 25 s preparing, 20 s
  rewards and 35 s milestone rewards. Jev seats need deadlines either way;
  whether a solo human should get longer or no timers is the user's call.
- **Decision records live only in memory** (`MatchRoom.jevRecords`) and
  are lost when the room closes.
- **Room-level replay isn't checked;** only the probe checks replays.

## Runes, items and the lab — 2026-09-23

### What works now

- **19 runes and 27 items,** the whole of design §5 and §6. New:
  - **Runes:** Fork, Twincast, Split, Empower, Linger, Opener, Last Word,
    Tandem, Resonance, Haste, Overcharge, and Primer: Brittle and
    Disoriented.
  - **Items:** Sparkflint, Venom Vial, Sentinel Ward, Blight Ward, Soul
    Lantern, Prism of Three, Crown of Echoes, Blood Contract, Heart of the
    Swarm, Obsidian Mirror, and the cursed Soulbound Blade and Glass Idol.
  - The table and every simplification are in design doc §19.
- **Engine hooks:**
  - Fork branches along rays from the first enemy hit (`unitsInRay`).
  - Twincast draws RNG only when the rune is present.
  - Opener staggers by unit.
  - Last Word casts from the corpse (`fromCorpse`).
  - Tandem has a per-unit cooldown.
  - Resonance and Prism widen detonation.
  - Mirror re-casts the ability with the holder as the source.
  - Sentinel Ward springs on blink moves.
  - Heart of the Swarm hands items to summons.
  - HP payments emit `hp-paid`.
- **Cursed items:** shown with a violet ring and a "Cursed" tag on the
  reward and loadout panels.
- **Battle lab:** a "custom teams" scenario (1 to 5 of all ten heroes a
  side), and team A picks items and runes as well as talents.
- **Icons:** placeholder glyphs for the new pieces at first. The
  painted icons have since been delivered; see `docs/icons.md`.

### Verified, not assumed

- The lab pair (duel and three-vs-three, seeds 1, 2, 3, 7, 42) matches
  `determinism-baseline` exactly.
- Every rune changes the fight on every hero it fits, and every new item
  does for every hero tried.
- 600 random fights with every piece in the pool: 0 failures, at most 3
  triggered casts in a tick.
- The five §7 builds fire in scripted fights (counts in design doc §19).
- A fight with most of the new mechanics replays identically across
  processes.
- **Browser:** a custom 3-v-5 lab fight with Fork, Split, Heart of the
  Swarm and Obsidian Mirror equipped from the new picker ended on tick
  561, the same tick as the headless replay of that setup. The Mirror
  threw Plague Cloud back, Fork hit 10 times off 2 Lances, and all 6
  thralls carried the Whetstone.
- **Checks:** `pnpm -r typecheck` and scripts typecheck clean; lint clean
  on every file this touched; server tests 2 and 15 passing.

### Not done yet

- **No balance pass.** Numbers are first guesses, checked for "does
  something", not for strength.
- **The survey's pieces tier needs sampling:** with ten heroes it was
  already about a million matchups. With every piece it is 1.87 million
  (15 million battles at 4 seeds). See `docs/decisions.md`.
- **Icon art** for the 25 new pieces.
