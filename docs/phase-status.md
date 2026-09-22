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
lobby against seven baseline bots). Per the plan, wait for the discovery
session above (and its review) before starting it, the same gate that was
explicitly waived for both Phase 3 and Phase 4 so far.
