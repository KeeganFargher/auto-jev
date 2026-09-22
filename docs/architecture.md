# Architecture

Snapshot as of Phase 1 (Jev_Game_Implementation_Plan.md). Prefer the lockfile
and actual package.json files over this document if they disagree — this is
a map, not the territory.

## Environment

- Node **>= 22** (apps/server's `engines` field). Verified against 24.5.0.
- pnpm **12.5.1**, pinned via `packageManager` / `devEngines` in the root
  `package.json`. `corepack prepare pnpm@12.5.1 --activate` fails on at least
  one machine tested (corepack 0.31 expects an old `bin/pnpm.cjs` layout that
  pnpm 12's native-binary distribution no longer ships) — install pnpm
  directly instead: `npm install -g pnpm@12.5.1`.

## Package graph

```
packages/game              — no workspace deps (deliberately: pure engine)
packages/shared             — no workspace deps
packages/content            — depends on packages/game
packages/server-runtime    — depends on packages/shared
apps/server                 — depends on packages/shared, packages/server-runtime
apps/client                  — depends on packages/game, packages/content
```

No app imports another app, directly or transitively. `apps/client` never
depends on `apps/server`. Enforced by `oxlint.config.ts`'s per-directory
`overrides` (`no-restricted-imports`), not just convention; `packages/game`
additionally has its own override blocking Node built-ins, Colyseus and any
`@jev-game/*` import, so it can't quietly acquire a dependency either.

**`apps/client` currently has no dependency on `packages/shared` or
`packages/server-runtime`.** It did through Phase 1 (the movement demo used
`ColyseusSDK` against the `/contract` type export, described below). That
demo was deleted when the lab became the app's only page — see
`docs/decisions.md`'s "One HTML page, not two" entry — and nothing replaced
it as a networking call site. The contract boundary below is still real and
still builds; it just has no current consumer to prove it against. Revisit
when the client needs real networking again (Phase 6).

| Package | Job | Publishes |
| --- | --- | --- |
| `@jev-game/game` | Pure battle engine — ticks, targeting, movement, abilities/effects (damage/heal/shield), statuses, results, recording. No workspace or Node/browser/Colyseus imports, enforced by lint. | `dist/` (ESM + `.d.ts`) |
| `@jev-game/content` | Hero/arena/scenario definitions and catalogue validation | `dist/` (ESM + `.d.ts`) |
| `@jev-game/shared` | Code (not just types) needed by both server and client — currently `stepEntity`, arena/tick constants. As of the one-page consolidation, only `apps/server` still imports it. | `dist/` (ESM + `.d.ts`) |
| `@jev-game/server-runtime` | The actual `defineServer(...)` result, room implementations (`Arena`), and a type-only `/contract` export (`GameServer = typeof server`) for client-side SDK inference | `dist/` (ESM + `.d.ts`); `./contract` subpath is types-only, no `import` condition |
| `@jev-game/server` (`apps/server`) | Environment/startup wrapper only: `listen(server)`. No room/route logic lives here. | N/A (deployable app) |
| `@jev-game/client` (`apps/client`) | Phaser-free Vite app, single page: the battle laboratory — see `docs/phase-status.md` | N/A (static build) |

## The server type boundary

Currently unexercised by any client code — see the package-graph note above.
Described here because the mechanism is unchanged and will matter again once
the client reconnects to a live server.

`packages/server-runtime/src/app.config.ts` holds the real `defineServer(...)`
call (rooms, routes, express middleware — moved here from `apps/server` in
Phase 1). `contract.ts` re-exports `type GameServer = typeof server`.
`apps/client` imports only that type:

```ts
import type { GameServer } from "@jev-game/server-runtime/contract";
const client = new ColyseusSDK<GameServer>(endpoint);
```

Verified empirically (not assumed from docs):

- Declaration emission survives `tsc` cleanly — `dist/app.config.d.ts` names
  a concrete `Server<{ arena: RegisteredHandler<Arena>; lobby: ... }, ...>`
  type, not `any`. Re-checked with `--skipLibCheck false`: the only errors
  surfaced live inside `@colyseus/core`'s and `@colyseus/sdk`'s own shipped
  `.d.ts` files (a missing `debug` types package; an internal `HTTP.d.ts`
  generic-constraint quirk), not in anything we own — `skipLibCheck: true`
  is hiding upstream noise, not our own problems.
- `client.joinOrCreate("arena")` correctly infers `room.state` as the real
  `ArenaState` schema (verified: accessing a nonexistent property on it is a
  compile error).
- **Caveat found during Phase 1, contradicting the plan's assumption:**
  `client.joinOrCreate("banana")` (an invalid room name) does **not** itself
  produce a compile error. `ColyseusSDK.joinOrCreate` has three overloads;
  the literal-keyed one (`R extends keyof ServerType['~rooms']`) correctly
  rejects `"banana"`, but a looser fallback overload
  (`roomName: string`, unconstrained `RoomType`) then matches, silently
  returning `Room<any, any>`. So the type contract's real guard is "use the
  room correctly and get full inference," not "typo the room name and get a
  compile error" — a misspelled room name degrades to `any` rather than
  failing loudly. This is a property of the installed `@colyseus/sdk@0.18.2`,
  not something `packages/server-runtime` can fix from this side.

## Build strategy (section 5 of the plan)

Compiled workspace packages, not source-only exports:

- `packages/shared` and `packages/server-runtime` each build with `tsc` to
  their own `dist/`, and their `package.json` `exports` point there
  (`server-runtime` additionally exposes `./contract` as types-only).
- `apps/server`'s `tsc` output is plain Node-resolvable JS —
  `node dist/index.js` now actually runs (it did not before Phase 1: `tsc`
  alone left `@jev-game/shared` / `@jev-game/colyseus-contract` as
  unresolvable bare specifiers, since those packages shipped raw `.ts`
  source with no build step; `apps/server/build/index.js` was a stale
  esbuild artifact from the original scaffold and has been deleted).
- **Root `pnpm build` must be used**, not `pnpm --filter @jev-game/server
  build` alone — `pnpm -r --if-present build` builds dependencies before
  dependents because pnpm's recursive commands follow the workspace
  dependency graph. Building only `apps/server` on a clean checkout will
  fail to resolve its workspace dependencies at runtime.
- `pnpm -r typecheck` relies on the same graph ordering: `packages/shared`'s
  and `packages/server-runtime`'s own `typecheck` scripts are real builds
  (`tsc -p tsconfig.json`, not `--noEmit`), so their `dist/*.d.ts` exist by
  the time a dependent package's `tsc --noEmit` runs later in the same
  `pnpm -r typecheck` invocation. `apps/server` and `apps/client` (leaves —
  nothing depends on their output) keep plain `tsc --noEmit`.
- `apps/server`'s dev script watches compiled package output explicitly:
  `tsx watch --include '../../packages/**/dist/**/*.js' src/index.ts` (`tsx`
  excludes `dist` by default). Verified live: editing
  `packages/shared/src/constants.ts` while `packages/shared`'s and
  `packages/server-runtime`'s own `tsc --watch` are running rebuilds their
  `dist/`, which `tsx watch` picks up and restarts on, and which Vite
  detects too (`[vite] page reload .../packages/shared/dist/constants.js`) —
  no stale pre-bundled dependency cache.
- `tsconfig.base.json` (declaration, strict, `noUncheckedIndexedAccess`,
  etc.) was previously unused by anything. `packages/shared` and
  `packages/server-runtime` now `extends` it, overriding `module`/
  `moduleResolution` to `NodeNext` and adding `outDir`/`rootDir`. Wiring it
  in surfaced one real thing: `noImplicitOverride` was off before, so
  `Arena`'s lifecycle methods (`onCreate`, `onJoin`, ...) didn't need
  `override` — they do now, and have it.
- esbuild has been removed as a dependency of `apps/server` — the compiled-
  workspace approach replaces it, per the plan's "remove esbuild only after
  a clean Node launch works without it."

## Known pre-existing quirks fixed opportunistically

- `apps/server`'s `test` script passed `mocha --import tsx`, which mocha's
  yargs-based CLI parser mis-parses as a boolean `--import` flag with `tsx`
  as a stray positional (confirmed via `DEBUG=mocha:cli:mocha`) — the
  positional after `--import` then gets swallowed as fake `--import`'s
  *value*, and Node tries to run the next token as its main script. Needs
  `--import=tsx` (explicit `=`). Unrelated to the Phase 1 restructure; would
  have failed identically before it.
