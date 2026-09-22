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

### Next concrete task

Phase 2: the smallest battle and laboratory (`packages/game`, headless
`scripts/simulate.ts`, `BattleLabScene`). Not started. Per the plan, wait for
sign-off on this phase before starting it.
