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
packages/run                — depends on packages/game, packages/content
packages/protocol           — depends on packages/run (types), zod
packages/jev                — depends on packages/game, content, run, zod,
                               @typesafe-ai/sdk; server-only
packages/server-runtime    — depends on packages/shared, game, content, run, protocol
apps/server                 — depends on packages/shared, packages/server-runtime
apps/client                  — depends on packages/game, content, run, protocol;
                               type-only packages/server-runtime/contract
```

No app imports another app, directly or transitively. `apps/client` never
depends on `apps/server`. Enforced by `oxlint.config.ts`'s per-directory
`overrides` (`no-restricted-imports`), not just convention; `packages/game`
additionally has its own override blocking Node built-ins, Colyseus and any
`@jev-game/*` import, so it can't quietly acquire a dependency either.
`apps/client` is also barred from importing `@jev-game/jev`, so the Jev
provider and its credentials can't reach the browser bundle.

**`apps/client` imports only types from `packages/server-runtime`.** Since
Phase 6, `apps/client/src/network/connect-room.ts` builds its
`ColyseusSDK<GameServer>` from the `/contract` type export, which is how
`room.state` and the typed `view` / `ack` messages reach the client
(server messages are declared by the room's
`Client<{ messages: ServerMessages }>`). `@jev-game/server-runtime` is a
client devDependency for that reason only.

| Package | Job | Publishes |
| --- | --- | --- |
| `@jev-game/game` | Pure battle engine — ticks, targeting, movement, abilities/effects (damage/heal/shield), statuses, results, recording. No workspace or Node/browser/Colyseus imports, enforced by lint. | `dist/` (ESM + `.d.ts`) |
| `@jev-game/content` | Hero/arena/scenario definitions and catalogue validation | `dist/` (ESM + `.d.ts`) |
| `@jev-game/shared` | Code (not just types) needed by both server and client — currently `stepEntity`, arena/tick constants. As of the one-page consolidation, only `apps/server` still imports it. | `dist/` (ESM + `.d.ts`) |
| `@jev-game/jev` | Jev players (Phase 7): the TypeSafe provider (`@typesafe-ai/sdk`, no retries, 5 s timeout), an offline stub, a concurrency limiter, observations, draft and reward questions, decision records, and a seat driver that keeps one job per seat and rejects stale results. `pnpm --filter @jev-game/jev probe` plays headless runs. Server-only. | `dist/` (ESM + `.d.ts`) |
| `@jev-game/server-runtime` | The actual `defineServer(...)` result, room implementations (`Arena`), and a type-only `/contract` export (`GameServer = typeof server`) for client-side SDK inference | `dist/` (ESM + `.d.ts`); `./contract` subpath is types-only, no `import` condition |
| `@jev-game/server` (`apps/server`) | Environment/startup wrapper only: `listen(server)`. No room/route logic lives here. | N/A (deployable app) |
| `@jev-game/client` (`apps/client`) | Vite app, single page: a Three.js board renderer under a DOM/Tailwind HUD, serving the battle lab (`#lab`) and matches that run on the game server (`#match`: "Fight!" is a solo room against Jev seats, "Play online" is the shared lobby) — see `docs/phase-status.md` | N/A (static build) |

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

## Client audio

Everything lives in `apps/client/src/audio/`. One engine (`audio` in
`engine.ts`) owns a single `AudioContext`, created when the page loads.

**Channels.** `master` feeds the speakers, with `music`, `sfx` and
`dialogue` under it. Music goes through an extra "duck" gain that drops
to 35% while any dialogue sound plays and comes back after it ends.
Volumes and mute are set on the Audio tab of the settings window
(`hud/settings/`, opened from the gear top-right) and
saved to `localStorage` under `jev-game.audio.*`. Sliders use a squared
curve, so 50% sounds like half volume. The settings window is a centred modal
with a tab row; to add a tab, pass another `SettingsTab` (id, label,
icon, content element) to `mountSettingsWindow` in `main.ts`.

**Adding a sound.** Add an entry to `SOUNDS` in `catalogue.ts` with its
channel, preload group, volume and overlap rules, then call
`audio.play(id)`. Battle sounds go through `game/fx/battle-sounds.ts`,
which maps battle cues (swing, cast, hit, heal, death) to sound ids.
`battle-view.ts` fires each cue at the same moment as the matching
visual. Hits sound when a projectile lands, not when the event arrives.
Snaps (skip to end, catching up after a stall) skip event handling
entirely, so they stay silent.

**Overlap rules** (`voice-policy.ts`, a pure function):

- `cooldownMs`: a repeat of the same sound inside this window is
  dropped. This stops 8 AoE hits in one frame from stacking.
- `maxVoices`: at most this many copies play at once.
  `onLimit: "steal-oldest"` fades the oldest copy out over 15 ms, which
  avoids a click. `"skip"` drops the new one instead.
- `GLOBAL_VOICE_LIMIT` (16) caps all one-shots together.
- Each copy gets a small random pitch and volume change so repeats don't
  sound robotic. Battle sounds are also panned by the unit's position on
  screen.

A sound requested before its file has decoded, or before the page is
unlocked, is dropped rather than queued. A late sound is worse than
none. In dev builds, `window.jevAudio.stats()` shows each sound's
requested, started, skipped and stolen counts.

**Loading.** Sound effects are decoded into memory
(`AudioBuffer`s). Each belongs to a `PreloadGroup`: `boot` loads at
startup, and `battle` loads when the lab or match scene is created.
Decoded audio costs about 384 KB per second of stereo sound, so keep
effects short. Music is never decoded. Each track is an
`HTMLAudioElement` with `preload="none"`, streamed with range requests
and routed through a `MediaElementAudioSourceNode`, so a 50 MB
soundtrack costs almost nothing until a track plays. As the asset list
grows, add groups (per hero, per board theme) rather than loading
everything up front.

**Music.** Scenes call `audio.setMusic(id | null)`. The engine
crossfades over 1 s and remembers the request until the first click or
key press unlocks audio; browsers block audio before that. The match
scene picks its track from `MUSIC_FOR_SCREEN` (menu / planning / battle)
in `syncMusic()`. Leaving the match fades the music out.

Placeholder and missing files are tracked in `missing_assets.md` entries
4, 7, 14, 19 and 20.

## Client 3D models

`apps/client/src/models/` follows the audio layout:

- **Catalogue.** `catalogue.ts` lists every model's URL and kind.
- **Library.** `models` in `library.ts` owns one `GLTFLoader` with
  three.js's bundled meshopt decoder. It loads each file once and hands
  out `SkeletonUtils` copies that share geometry, clips and one skeleton
  per copy.
- **Loading.** `main.ts` mounts the first screen, then loads the hero
  models in the background; nothing waits on them.
- **Figures.** `createHeroFigure(heroId)` (`game/views/hero-figures.ts`)
  returns a model-backed figure (`model-figure.ts`) when that hero's
  model is loaded. Otherwise it returns the placeholder, which swaps
  itself for the model when the load finishes. Both share
  `figure-base.ts` and the `HeroFigure` interface, so the views never
  know which one they have.
- **Copies.** A model figure clones only the materials it recolours or
  flashes. It releases its skeleton's bone texture on dispose.
- **Channels.** `HeroFigure.setChanneling` is called by the battle view
  wherever it already spins a channelling unit. Model figures loop their
  `channel` clip while it's set, plus the catalogue's `channelEffect`
  (`cyclone-effect.ts` for Gorrak). Placeholders ignore it.
- **Dev lab.** `#models` is the model lab: clips on demand, a crowd
  button that cycles ×16 and ×32 stress crowds, a placeholder comparison and the stats panel with a
  leak test. In dev builds, `window.jevModels` exposes the library.

The sources, the export (`pnpm models:build`) and the contract check
(`pnpm models:check`) are described in `docs/models.md`.
