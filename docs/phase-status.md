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

### Next concrete task

Phase 3: distinct roles and an ability system (bruiser/ranger/support,
strike/bolt/mend, statuses, recording). Not started. Per the plan, wait for
sign-off on this phase before starting it.
