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
`audio.play(id)`. How the files are made is in `docs/audio.md`.

**Battle sounds.** `battle-view.ts` fires each cue at the same moment as
the matching visual, through `game/fx/battle-sounds.ts`. Which sound a
cue plays comes from the tables in `sound-map.ts`:

- `abilitySounds(id)`: an ability's cast and hit sounds, plus any heal,
  falling or landing sound.
- `unitSounds(id)`: a summon's spawn and death sounds. Heroes use
  `death`.
- The combo, crit, shield and teleport sounds.

`pnpm audio:check` fails if an ability or voiced hero has no entry.

- Hits sound when a projectile lands, not when the event arrives. A hit
  worth 20% or more of the target's max HP adds `crit-heavy`, and any
  other crit adds `crit-hit`.
- DoT ticks and reactions are silent.
- A meteor's whistle starts 45% of the way through its fall.
- Teleport beats play only while the teleport runs forward in real time.
- Snaps (skip to end, catching up after a stall) skip event handling
  entirely, so they stay silent.
- A button click is not voiced if another effect started in the last
  30 ms, so a click that triggers its own sound plays once.

**Voice lines.** Each hero has pick, cast, death and win lines
(`voice-lines.ts`), played through `game/fx/hero-voices.ts`. Whether a
line may play right now is decided by `line-policy.ts`, a pure function:

- One line plays at a time. Pick and win lines interrupt by fading out
  the dialogue channel; cast and death lines wait.
- Cast and death lines need gaps since the last line, and play less
  often for enemies.
- Cast lines fire only on signature casts (abilities with a mana cost).

The numbers are in `docs/audio.md`.

**Overlap rules** (`voice-policy.ts`, a pure function):

- `cooldownMs`: a repeat of the same sound inside this window is
  dropped. This stops 8 AoE hits in one frame from stacking.
- `maxVoices`: at most this many copies of one sound play at once.
  `onLimit: "steal-oldest"` fades the oldest copy out over 15 ms, which
  avoids a click. `"skip"` drops the new one instead, so a stinger or
  line never restarts over itself.
- `GLOBAL_VOICE_LIMIT` (16) caps each channel's one-shots. Voice lines
  never compete with effects for slots. When a channel is full, the new
  sound always takes the oldest one's slot. A stinger or line is never
  dropped because a fight is busy.
- Each copy gets a small random pitch and volume change so repeats don't
  sound robotic. Battle sounds are also panned by the unit's position on
  screen.

A sound requested before its file has decoded, or before the page is
unlocked, is dropped rather than queued. A late sound is worse than
none. In dev builds, `window.jevAudio.stats()` shows each sound's
requested, started, skipped and stolen counts.

**Loading.** Sound effects are decoded into memory
(`AudioBuffer`s). Each belongs to a `PreloadGroup`: `boot` loads at
startup, and `battle` and `voices` load when the lab or match scene is
created.
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

The match scene also plays the draft sounds, the last three countdown
seconds, `battle-start` when a battle is joined in its first 6 ticks,
the round result and run result stingers, and reward and recruit
sounds. Music is still a placeholder (`missing_assets.md` entry 7).

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
- **Board height.** A catalogue entry can set `boardHeight`, the on-board
  height in units, when a model shouldn't take its placeholder's height.
  Cinder uses it because her placeholder wears a tall hat. The model
  figure scales to it, and `HeroFigure.height` (health plates, chest
  point) follows it, including after a placeholder swaps to the model.
- **Celebrating.** `HeroFigure.setCelebrating` loops the `victory` clip
  (for the draft lineup). Placeholders ignore it.
- **Cast socket.** `HeroFigure.castOrigin` is where projectiles and cast
  flares leave from. It's the catalogue's `castBone` when a model names
  one (Cinder's `flame` bone), otherwise the chest.
- **Spell visuals.** `game/views/spell-visuals.ts` maps ability ids to
  code-drawn visuals. The battle view asks it at five points, and an
  ability without an entry keeps the generic effect:
  - pending impacts (Meteor's falling rock and ground shadow, timed from
    ticks so it lands on the hit at any playback speed);
  - impact landings (the blast);
  - zones (burning ground);
  - casts (Flame Ward's ring of fire);
  - projectiles (Firebolt's fireball).
  Rocks and burning ground are rebuilt from the snapshot's impacts and
  zones, so seeks and resets never leave them behind.
- **Dev lab.** `#models` is the model lab: clips on demand, a crowd
  button that cycles ×16 and ×32 stress crowds, a placeholder comparison and the stats panel with a
  leak test. In dev builds, `window.jevModels` exposes the library.

The sources, the export (`pnpm models:build`) and the contract check
(`pnpm models:check`) are described in `docs/models.md`.

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
- **Hit effects.** `hit-effects.ts` maps ability ids to what they hit
  with: blunt, blade, fire, frost, dark, thorn, rivet, holy, or strike
  for anything unlisted.
  - Each kind has a burst that sprays away from the attacker, larger for
    crits and heavy hits.
  - Each kind also has a bolt tint, a trail and a release flare at the
    cast socket.
  - This is cosmetic, so it stays out of the engine.
- **Effect materials.** `effect-materials.ts` pools the materials of
  every short-lived effect by kind: glow, flash, flame, trail, scorch,
  core, rock and arc.
  - An effect takes one with `effectMaterials.<kind>.take()` and hands
    it back with `releaseEffectMaterial`. Nothing disposes them.
  - Why: three deletes a shader when its last material is disposed, so
    effects that made and disposed their own materials recompiled their
    shaders on every cast, and each compile stalled a frame.
  - The stage draws one tiny mesh of each kind for a single frame
    (`warmEffectMaterials`) when it starts, when the graphics settings
    change and when the board theme changes. The shaders compile then, in
    the same pipeline the fight uses.
  - A shader variant also depends on the geometry: three r186 keys it on
    whether the geometry has normals. Every effect mesh has normals and
    arc lines have none, like the warm-up's. A test checks every effect
    against the warm-up.
  - The additive double-sided kinds set `forceSinglePass`. Otherwise
    three draws a transparent double-sided mesh twice, back faces then
    front, and rebuilds its shader key for each pass. Added light doesn't
    depend on draw order.
- **Battle effects.** `battle-effects.ts` draws the battle view's combo
  bursts, impact flashes, bolts, arcs and ground markers. Rings of one
  proportion share a geometry, and arc lines reuse theirs.
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
  - Placeholder heroes merge their parts per material; the turret's
    rotor merges on its own.
- **No layout reads per frame.** The stage caches its size. `screenPan`
  gives a point's audio pan without reading layout, and `showBoard`
  returns early when nothing changed, so views may call it every update.
- **Glow.** `stage-glow.ts` renders through an `EffectComposer`:
  - the scene, into a half-float target with 4× MSAA;
  - `UnrealBloomPass`, with a threshold of 1.05 in linear HDR;
  - `OutputPass`, which applies the ACES tone mapping and exposure.
  Lit surfaces stay below the threshold, so only emissive things and
  spell cores bloom.
- **Graphics settings.** `graphics/settings.ts` saves them to
  `localStorage` under `jev-game.graphics.*`. The Graphics tab
  (`hud/settings/graphics-tab.ts`) edits them, and every stage applies
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
  - which figure parts cast shadows, and cast sockets;
  - the particle ring buffer, cone sampling, expiry and clear;
  - trails;
  - settings parsing and resolution;
  - the frame sampler;
  - the effect material pool, and the warm-up covering every effect;
  - hit effects and spells reusing their materials;
  - static merging (placement, shadows, animated and mirrored props) and
    merged heroes;
  - HUD text written only when it changes.
  `pnpm --filter ./apps/client typecheck` checks the tests too.
