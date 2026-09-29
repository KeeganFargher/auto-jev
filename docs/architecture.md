# Architecture

Snapshot after the Bone & Banner pivot (2026-09-28, `docs/pivot-plan.md`).
Prefer the lockfile and actual package.json files over this document if
they disagree — this is a map, not the territory. The tree before the
pivot is kept at the `pre-pivot` git tag.

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
packages/content           — depends on packages/game
packages/run               — depends on packages/game, packages/content
packages/protocol          — depends on packages/run (types), zod
packages/jev               — depends on packages/game, content, run, zod,
                               @typesafe-ai/sdk; server-only
packages/server-runtime    — depends on packages/content, jev, protocol, run
apps/server                — depends on packages/server-runtime; its tests
                               also use jev, protocol and run
apps/client                — depends on packages/game, content, run, protocol;
                               type-only packages/server-runtime/contract
```

No app imports another app, directly or transitively. `apps/client` never
depends on `apps/server`. Enforced by `oxlint.config.ts`'s per-directory
`overrides` (`no-restricted-imports`), not just convention; `packages/game`
additionally has its own override blocking Node built-ins, Colyseus and any
`@jev-game/*` import, so it can't quietly acquire a dependency either.
`apps/client` is also barred from importing `@jev-game/jev`, so the Jev
provider and its credentials can't reach the browser bundle.

**`apps/client` imports only types from `packages/server-runtime`.**
`apps/client/src/network/connect-room.ts` builds its
`ColyseusSDK<GameServer>` from the `/contract` type export, which is how
`room.state` and the typed `view` / `ack` messages reach the client
(server messages are declared by the room's
`Client<{ messages: ServerMessages }>`). `@jev-game/server-runtime` is a
client devDependency for that reason only.

| Package                            | Job                                                                                                                                                                                                                                                                                                 | Publishes                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `@jev-game/game`                   | Pure battle engine: ticks, targeting, movement, attacks, launches and landings, setup states, the five signatures, combo chains, results and recording. No workspace or Node/browser/Colyseus imports, enforced by lint.                                                                            | `dist/` (ESM + `.d.ts`)                                                            |
| `@jev-game/content`                | The five heroes and the Training Dummy, the board arena, formations, lab presets and teams, and catalogue validation                                                                                                                                                                                | `dist/` (ESM + `.d.ts`)                                                            |
| `@jev-game/run`                    | A match: the lobby, the draft (each seat picks 3 of the 5 heroes, mirrors allowed), formations, round pairings, battle setups, health and the winner. No levels, recruits or rewards.                                                                                                               | `dist/` (ESM + `.d.ts`)                                                            |
| `@jev-game/protocol`               | The zod-checked messages between client and server, and the room name (`match`)                                                                                                                                                                                                                     | `dist/` (ESM + `.d.ts`)                                                            |
| `@jev-game/jev`                    | Jev players: the TypeSafe provider (`@typesafe-ai/sdk`, no retries, 5 s timeout), an offline stub, a concurrency limiter, observations, the draft question, decision records, and a seat driver that keeps one job per seat and rejects stale results. `probe.ts` plays headless runs. Server-only. | `dist/` (ESM + `.d.ts`)                                                            |
| `@jev-game/server-runtime`         | The actual `defineServer(...)` result, the one room (`MatchRoom`, with its state, command handler, timings, seat registry and Jev provider), and a type-only `/contract` export (`GameServer = typeof server`) for client-side SDK inference                                                        | `dist/` (ESM + `.d.ts`); `./contract` subpath is types-only, no `import` condition |
| `@jev-game/server` (`apps/server`) | Environment/startup wrapper only: `listen(server)`. No room/route logic lives here. `test/match.test.ts` plays matches through the real room.                                                                                                                                                       | N/A (deployable app)                                                               |
| `@jev-game/client` (`apps/client`) | Vite app, single page: a Three.js board renderer under a React/Tailwind HUD, serving the battle lab (`#lab`), the environment lab (`#env`) and matches that run on the game server (`#match`: "Fight!" is a solo room against Jev seats, "Play online" is the shared lobby)                         | N/A (static build)                                                                 |

## The battle engine

`packages/game` runs a fight to the end with no clock, no DOM and no
network, so the server, `pnpm simulate`, the Jev probe and the client all
run the same code. The design is in `docs/pivot-plan.md` §4 and §5.

- **Ticks.** `createBattle` builds the state from a setup; `stepBattle`
  advances it one tick at 30 ticks per second (`TICK_RATE`), and a fight
  stops at 60 s (`BATTLE_TIME_LIMIT_SECONDS`). Every random choice comes
  from the seeded `random/rng.ts`, so a seed replays exactly.
  `scripts/sim-hash.ts` hashes the engine's sources, and
  `packages/protocol`'s typecheck prints the hash.
- **Physics.** Custom and deterministic, not a physics library.
  `launch.ts` throws units on arcs, `motion.ts` flies and skids them
  under `GRAVITY`, and `landing.ts` resolves touchdowns, including
  bowling into the units a body lands on.
- **Setup states.** A unit can be airborne, floating (in a bubble),
  downed, burning or primed (carrying a lit fuse). `bubbles.ts` owns Big
  Bubble and the Safety Bubble passive, and `fire.ts` owns fuses,
  burning and spreading fire.
- **Signatures.** `battle/signatures/` holds one module per hero:
  Hammerfall, Rampage, Short Fuse, Big Bubble and Yank. Each plans a cast
  (`CastPlan`: target, point, and whether the target is in a state the
  signature wants), using `prediction.ts` to lead moving and flying
  targets.
- **Combos.** A signature that lands on a state another hero set up
  records a combo link (`chain.ts`). Links in a team's chain raise that
  team's damage (`chainDamageMultiplier`) until the chain expires.
- **Recording and presentation.** `recording.ts` runs a battle and
  keeps its frames and events. `presentation.ts` stretches the timeline
  around the big beats in `beats.ts` (casts, the hammer, explosions,
  yanks, crits, combos), so the client can slow down for them while the
  simulation stays on ticks.

## The server type boundary

`packages/server-runtime/src/app.config.ts` holds the real `defineServer(...)`
call (rooms, routes, express middleware). `contract.ts` re-exports
`type GameServer = typeof server`. `apps/client` imports only that type:

```ts
import type { GameServer } from "@jev-game/server-runtime/contract";
const client = new ColyseusSDK<GameServer>(endpoint);
```

Verified empirically (not assumed from docs):

- Declaration emission survives `tsc` cleanly — `dist/app.config.d.ts` names
  a concrete `Server<{ match: RegisteredHandler<MatchRoom> }, ...>` type,
  not `any`. With `--skipLibCheck false`, the only errors surfaced live
  inside `@colyseus/core`'s and `@colyseus/sdk`'s own shipped `.d.ts`
  files (a missing `debug` types package; an internal `HTTP.d.ts`
  generic-constraint quirk), not in anything we own — `skipLibCheck: true`
  is hiding upstream noise, not our own problems.
- **Caveat:** joining an invalid room name does **not** itself produce a
  compile error. `ColyseusSDK.joinOrCreate` has three overloads; the
  literal-keyed one (`R extends keyof ServerType['~rooms']`) correctly
  rejects an unknown name, but a looser fallback overload
  (`roomName: string`, unconstrained `RoomType`) then matches, silently
  returning `Room<any, any>`. So the type contract's real guard is "use the
  room correctly and get full inference," not "typo the room name and get a
  compile error". The client joins through `MATCH_ROOM_NAME` from
  `packages/protocol` for that reason. This is a property of the installed
  `@colyseus/sdk@0.18.2`, not something `packages/server-runtime` can fix
  from this side.

## Build strategy

Compiled workspace packages, not source-only exports:

- Every package builds with `tsc` to its own `dist/`, and its
  `package.json` `exports` point there (`server-runtime` additionally
  exposes `./contract` as types-only).
- `apps/server`'s `tsc` output is plain Node-resolvable JS, so
  `node dist/index.js` runs.
- **Root `pnpm build` must be used**, not `pnpm --filter @jev-game/server
build` alone — `pnpm -r --if-present build` builds dependencies before
  dependents because pnpm's recursive commands follow the workspace
  dependency graph. Building only `apps/server` on a clean checkout will
  fail to resolve its workspace dependencies at runtime.
- `pnpm -r typecheck` relies on the same graph ordering: the packages'
  own `typecheck` scripts are real builds (`tsc -p tsconfig.json`, not
  `--noEmit`), so their `dist/*.d.ts` exist by the time a dependent
  package's `tsc --noEmit` runs later in the same `pnpm -r typecheck`
  invocation. `apps/server` and `apps/client` (leaves — nothing depends on
  their output) keep plain `tsc --noEmit`, plus their test tsconfigs.
- `apps/server`'s dev script watches compiled package output explicitly:
  `tsx watch --include '../../packages/**/dist/**/*.js' src/index.ts` (`tsx`
  excludes `dist` by default), so a package's own `tsc --watch` rebuilding
  its `dist/` restarts the server, and Vite reloads the client.
- `tsconfig.base.json` (declaration, strict, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, etc.) is extended by the packages, which override
  `module`/`moduleResolution` to `NodeNext` and add `outDir`/`rootDir`.

## Known pre-existing quirks fixed opportunistically

- `apps/server`'s `test` script passed `mocha --import tsx`, which mocha's
  yargs-based CLI parser mis-parses as a boolean `--import` flag with `tsx`
  as a stray positional (confirmed via `DEBUG=mocha:cli:mocha`) — the
  positional after `--import` then gets swallowed as fake `--import`'s
  _value_, and Node tries to run the next token as its main script. Needs
  `--import=tsx` (explicit `=`).

## Client structure

The client is a React 19 app (`main.tsx` mounts `app/app.tsx` in
`StrictMode`) with a three.js board behind it. Folders under `apps/client/src/`:

- `app/` is the shell: `routes.ts` turns the URL hash into a `Route`
  (`#lab`, `#match`, `#join/<room>`, `#env/<theme>`), `navigation.ts` counts
  `hashchange` events, `GameProvider`/`useGame()` hand the audio engine,
  graphics settings and navigation store to everything below, and
  `ErrorBoundary` shows any render-time failure and resets on the next
  navigation.
- `features/<screen>/` holds one folder per screen (`battle-lab`,
  `environment-lab`, `match`, `settings`). Screens are lazy-loaded from
  `app/app.tsx`.
- `state/` is the framework-agnostic `Store<T>`; `useStore` and
  `useStoreSelector` (in `state/use-store.ts`) subscribe React to any store.
  `hooks/` and `ui/` hold the shared hooks and presentational pieces
  (tooltips, icons, rich text).
- `game/` (scenes, views, environments, models) and `session/` (the lab and
  online match sessions) know nothing about React.

A match screen (`features/match/`) splits into `model/` (pure functions over
the session snapshot), `state/` (`createMatchController`, which owns the
running match and is tested with fake services), `hud/` and `modes/`
(components, read through `useMatchState`/`useLive`/`useView`), `stage/`
(boards that portal into the three.js stage) and `damage/` (the damage
meter). `MatchScreen` creates the controller in an effect and disposes it on
cleanup, so it survives StrictMode and Fast Refresh remounts. Failures the
controller meets outside render are stored as `defect` and rethrown by
`useMatchDefect`, which puts them in front of the `ErrorBoundary`.

## Client audio

Everything lives in `apps/client/src/audio/`. One engine (`audio` in
`engine.ts`) owns a single `AudioContext`, created when the page loads.

**Channels.** `master` feeds the speakers, with `music` and `sfx` under
it. Volumes and mute are set on the Audio tab of the settings window
(`features/settings/`, opened from the gear top-right) and saved to
`localStorage` under `jev-game.audio.*`. Sliders use a squared curve, so
50% sounds like half volume. The settings window is a centred modal with a
tab row; to add a tab, add another `SettingsTab` (id, label, icon,
content element) to `SETTINGS_TABS` in `features/settings/settings-tabs.tsx`. The pivot removed
the hero voice lines and, with them, the dialogue channel and its music
ducking.

**Adding a sound.** Add an entry to `SOUNDS` in `catalogue.ts` with its
channel, preload group, volume and overlap rules, then call
`audio.play(id)`. How the files are made is in `docs/audio.md`.
`pnpm audio:check` fails if an entry points at a missing file, or if a
file under `public/assets/audio` isn't used by any entry.

**Battle sounds.** `battle-view.ts` plays each cue at the same moment as
the matching visual, through `game/fx/battle-sounds.ts`. Which sound a
cue plays comes from `sound-map.ts`:

- `ATTACK_SOUNDS`: each attack kind's swing and hit. Melee swings
  `swing-heavy` and hits `hit-blunt`; projectiles swing `swing-light` and
  hit `hit-blade`. The swing plays on the `attack` event, the hit when the
  damage lands.
- `CAUSE_HIT_SOUNDS`: the hit sound for damage that isn't an attack,
  keyed by the damage's `cause`. Throws, bowling and yanks thump
  (`hit-blunt`). Splash, hammer, blast and burn damage are silent,
  because the impact that caused them already sounds.
- A crit adds `crit-hit`. Any other hit worth `BIG_HIT_FRACTION` of the
  target's max HP adds `crit-heavy`.
- Hammerfall's impact and a Short Fuse explosion play `crit-heavy`, a
  landing plays `hit-blunt`, a throw `swing-heavy`, Yank's pull
  `hit-blade`, a stun `stun` and a death `death`.
- The teleport beats play `teleport-out`, `teleport-in` and
  `teleport-warp`, only while the teleport runs forward in real time.
- Bubbles forming and popping, ignites, Rampage and combo links have no
  sound yet (`missing_assets.md`).
- Snaps (skip to end, catching up after a stall) skip event handling
  entirely, so they stay silent.
- A button click is not voiced if another effect started in the last
  30 ms, so a click that triggers its own sound plays once.

**Overlap rules** (`voice-policy.ts`, a pure function; a "voice" here is
one playing copy of a sound):

- `cooldownMs`: a repeat of the same sound inside this window is
  dropped. This stops a crowd of hits in one frame from stacking.
- `maxVoices`: at most this many copies of one sound play at once.
  `onLimit: "steal-oldest"` fades the oldest copy out over 15 ms, which
  avoids a click. `"skip"` drops the new one instead, so a stinger never
  restarts over itself.
- `GLOBAL_VOICE_LIMIT` (16) caps the one-shots. Each sound has a
  `priority`: swings and hits 0, abilities 1, big impacts 2, stingers
  and UI sounds 3. When the limit is reached, the new sound takes the slot
  of the oldest sound in the lowest tier at or below its own, and is
  dropped if everything playing outranks it. A hit only ever replaces
  another hit, so a busy fight never cuts a big impact short, and a
  stinger is never dropped because a fight is busy.
- Each copy gets a small random pitch and volume change so repeats don't
  sound robotic. Battle sounds are also panned by the unit's position on
  screen.

A sound requested before its file has decoded, or before the page is
unlocked, is dropped rather than queued. A late sound is worse than
none. In dev builds, `window.jevAudio.stats()` shows each sound's
requested, started, skipped and stolen counts.

**Loading.** Sound effects are decoded into memory (`AudioBuffer`s).
Each belongs to a `PreloadGroup`: `boot` loads at startup, and `battle`
loads when the lab or match scene is created. Decoded audio costs about
384 KB per second of stereo sound, so keep effects short. Music is never
decoded. Each track is an `HTMLAudioElement` with `preload="none"`,
streamed with range requests and routed through a
`MediaElementAudioSourceNode`, so a large soundtrack costs almost nothing
until a track plays.

**Music.** Scenes call `audio.setMusic(id | null)`. The engine
crossfades over 1 s and remembers the request until the first click or
key press unlocks audio; browsers block audio before that. The match
scene picks its track from `MUSIC_FOR_SCREEN` (menu / planning / battle)
in `syncMusic()`. Leaving the match fades the music out.

The match scene also plays the draft sounds, the last three countdown
seconds, `battle-start` when a battle begins, and the round result and
run result stingers. Music is still a placeholder (`missing_assets.md`).

## Client figures

- **Figures.** `createHeroFigure(heroId)` (`game/views/hero-figures.ts`)
  builds each hero from primitives: `figureBuilder` has one builder per
  content id (the five heroes and the Training Dummy) and throws for any
  other id. They are stand-ins until the KayKit characters are imported
  (`docs/pivot-plan.md` §7.2). There is no model loader until then; the
  old one is at the `pre-pivot` tag. Every figure uses `figure-base.ts`
  (team ring, contact shadow) and the `HeroFigure` interface, so the
  views don't change when the KayKit bodies replace the stand-ins.
- **Looks.** `battle-visuals.ts` gives each hero its hit kind and the
  look of what it throws (`heroLook`, `shotLook`): firecrackers, soap,
  knives, fuse bombs and the harpoon hook. It also draws Big Bubble and the
  Safety Bubble, Yank's chain, and the Hammerfall hammer, whose drop
  follows `hammerPose` (it grows in above the target, slams down on
  impact and fades out).
- **Celebrating.** `HeroFigure.setCelebrating` plays the win pose: for
  a picked hero in the draft lineup, and for the living units of the
  winning team once a battle has a result.
- **Cast socket.** `HeroFigure.castOrigin` is where shots and cast flares
  leave from: a socket at the figure's chest.

## Client rendering

Every screen draws through one `BoardStage` (`game/views/board-stage.ts`):
renderer, camera, lights, board, particles and glow. The views add their
own objects to its scene.

- **Light.** One sun (a directional light) casts the shadows. A
  hemisphere light fills the shaded sides, and a rim light from behind
  separates heroes from the board. Each board theme sets the colours and
  strengths (`StageAtmosphere`).
- **Shadows.** `PCFShadowMap` with a 4-texel blur radius
  (`shadow-quality.ts`). three r186 removed `PCFSoftShadowMap`, and the
  stage used to fall back to hard shadows because of it.
  - Every figure stands on a soft contact shadow and a flat ring in the
    team colour (`figure-base.ts`).
  - All figures share one geometry and the textures. Each figure owns
    only its ring material, which `setTeamColor` recolours.
  - Figures decide which of their parts cast shadows
    (`HeroFigure.setCastsShadow`), so a flat decal never does.
- **Particles.** `stage.particles` (`particles.ts`) has two instanced
  layers in ring buffers:
  - `solid`: alpha-blended, 2,048 particles.
  - `glow`: additive, 4,096 particles.
  - Motion is a closed form evaluated in the vertex shader: speed, drag,
    gravity, size and colour over the particle's life. An emit only
    writes the slots it claims.
  - The system costs two draw calls, and nothing is allocated per effect.
  - `clear()` hides everything; the battle view calls it on reset, seek
    and dispose.
  - `createTrail` spaces particles by distance travelled, so a trail
    looks the same at any frame rate.
  - Use `solid` for anything that has to read on the bright boards
    (sparks, embers, motes, smoke, dust). Additive colour washes to
    white there, so `glow` is for short flashes.
- **Hit effects.** `hit-effects.ts` sprays a burst away from the
  attacker in one of three kinds: strike, blunt or blade. Crits and heavy
  hits spray more. This is cosmetic, so it stays out of the engine.
- **Effect materials.** `effect-materials.ts` pools the materials of
  every short-lived effect by kind.
  - An effect takes one with `effectMaterials.<kind>.take()` and hands
    it back with `releaseEffectMaterial`, which throws if the material
    wasn't taken. Nothing disposes them.
  - Why: three deletes a shader when its last material is disposed, so
    effects that made and disposed their own materials recompiled their
    shaders on every cast, and each compile stalled a frame.
  - The stage draws one tiny mesh of each kind for a single frame
    (`warmEffectMaterials`) when it starts, when the graphics settings
    change and when the board theme changes. The shaders compile then, in
    the same pipeline the fight uses.
  - A shader variant also depends on the geometry: three r186 keys it on
    whether the geometry has normals. Every effect mesh has normals and
    chain lines have none, like the warm-up's. A test checks every effect
    and visual against the warm-up.
  - The additive double-sided kinds set `forceSinglePass`. Otherwise
    three draws a transparent double-sided mesh twice, back faces then
    front, and rebuilds its shader key for each pass. Added light doesn't
    depend on draw order.
- **Battle effects.** `battle-effects.ts` draws impact flashes,
  explosions, bubble pops, dust, embers, fuse sparks, stun stars, heal
  motes, death dust and ground markers. Rings of one proportion share a
  geometry.
- **Static merging.** `merge-static.ts` merges the static meshes under a
  root into one mesh per material and shadow setting, in the root's
  space. Transparent meshes keep their own draw so three still sorts
  them.
  - Environments merge when they mount (`kit.mergeStatic`). An animator
    names what it moves: `kit.animate(targets, animator)`. The targets are
    left alone, and each target's own parts merge inside it, so a swaying
    palm is one draw per material.
  - An animator may only change its targets themselves: their
    transform, geometry or material. Fire names its flame and core, not
    the group around them.
  - Primitive heroes merge their parts per material.
- **No layout reads per frame.** The stage caches its size. `screenPan`
  gives a point's audio pan without reading layout, and `showBoard`
  returns early when nothing changed, so views may call it every update.
- **Glow.** `stage-glow.ts` renders through an `EffectComposer`:
  - the scene, into a half-float target with 4× MSAA;
  - `UnrealBloomPass`, with a threshold of 1.05 in linear HDR;
  - `OutputPass`, which applies the ACES tone mapping and exposure.
    Lit surfaces stay below the threshold, so only emissive things and
    effect cores bloom.
- **Graphics settings.** `graphics/settings.ts` saves them to
  `localStorage` under `jev-game.graphics.*`. The Graphics tab
  (`features/settings/graphics-tab.tsx`) edits them, and every stage applies
  them live:
  - Resolution: 100%, 75% or 50% of the device pixel ratio, which is
    still capped at 2.
  - Shadows: Soft, or Simple, which stops the sun casting. Simple
    changes `castShadow` on the light because three rebuilds materials
    when the shadow-casting lights change, but not when
    `shadowMap.enabled` flips.
  - Glow: on or off.
  - Frame stats: on or off.
- **Frame stats.** `stage-monitor.ts` shows FPS, average and worst frame
  time, draw calls, triangles, live particles and the pixel ratio in the
  bottom-left corner, on every screen.
  - `renderer.info` resets just before each render, so the counts cover
    every pass of a frame.
  - Frame listeners, like the labs' stats panels, read the whole
    previous frame.
- **Tests.** `pnpm --filter ./apps/client test` runs `node:test` through
  `tsx` on the parts that don't need WebGL. It covers:
  - shadow quality;
  - which figure parts cast shadows, cast sockets and figure batching;
  - the particle ring buffer, cone sampling, expiry and clear;
  - trails;
  - settings parsing and resolution;
  - the frame sampler;
  - the effect material pool, and the warm-up covering every effect and
    visual;
  - battle effects and visuals handing their materials back, and the
    hammer's drop;
  - static merging (placement, shadows, animated and mirrored props);
  - the sound overlap rules;
  - HUD text written only when it changes.
    `pnpm --filter ./apps/client typecheck` checks the tests too.
