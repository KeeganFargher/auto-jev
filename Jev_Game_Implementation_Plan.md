# Jev game implementation plan

Version 2 • 21 September 2026

Updated for mixed human and Jev lobbies with eight player seats, simultaneous duels and rotating opponents.

Build a small, inspectable auto battler in stages. The first useful product is a battle laboratory: choose two teams, run a fight, understand the result, change a value and run it again. Grow the engine through those experiments. Only add a system when the next playable experiment requires it.

This is an implementation handoff, not a claim that the repository has been inspected. It is grounded in the supplied client code, the package discussion and the earlier game direction. Phase 1 must reconcile the proposed paths with the actual repository before moving code. Existing working behaviour takes precedence over guessed filenames or package versions.

The combat guidance also incorporates source review of the user-supplied TinyWar and Mana Battle repositories. Section 20 maps actual files to our phases and specifies what to adapt. These are references, not a decision to fork either game.

## 1 Working direction and open decisions

The working concept is a short-run PvP roguelike auto battler played by the user and other humans alongside independent Jev-controlled opponents. A lobby can contain eight players: one human and seven Jev players, two humans and six Jev players, or another mix. Each player owns a separate team, build, run health and choices. Heroes fight automatically; human players actively choose their own heroes and upgrades between rounds. Jev is the TypeSafe model, not the Typesense search engine.

Confirmed round format: eight active players form four simultaneous two-player duels. Everyone watches their own battle, and the pairings change each round. This is not an eight-team free-for-all or a queue where one duel runs while everyone else waits. The individual battle engine remains a two-team simulation; the run engine coordinates the whole lobby. Team size means heroes per player and is independent of the number of player seats.

The hero pool, approximately three starting heroes, later recruitment, economy and number of rounds are still ideas to explore. They are not settled requirements. The existing keyboard movement and prediction example demonstrates networking; it does not establish that the game needs direct movement controls.

| Topic | Starting assumption | Status and point of review |
| --- | --- | --- |
| Platform | Desktop browser, TypeScript, pnpm, Phaser and Colyseus | Retain the existing stack; confirm installed versions in Phase 1 |
| Combat | Automatic movement, targeting, attacks and abilities | Working game direction |
| First arena | One flat 2D rectangular arena, circles for characters | Disposable presentation choice |
| Team size | One versus one first; then experiment with three versus three | Tuning choice, never hard-coded into combat rules |
| Player decisions | Pick heroes and upgrades between battles | Working direction; exact cadence remains open |
| Jev role | Independently control every bot seat, choosing its heroes and upgrades | Required player type; provider integration arrives in Phase 7 |
| Player seats | Up to eight; any mix of human and Jev players | User requirement; one human plus seven bots and two plus six are acceptance cases |
| Round format | Up to four simultaneous duels; opponents rotate each round | Confirmed by the user |
| Human joining | Join available seats before start, with bots filling the remainder | Initial policy; live takeover is an open later choice |
| Simulation | Fixed ticks, seeded randomness, plain data | Architectural commitment |
| Multiplayer | Authoritative server, private rooms first | Architectural commitment; public matchmaking deferred |
| Dependencies | No imports from one app into another app | User constraint |
| Content | Three contrasting heroes and a small upgrade pool | Learning material, not a production roster |
| Economy | No currency in the first playable run | Temporary simplification; review in Phase 8 |
| Run length | Three health per seat; elimination at zero; last survivor or eight-round cap | Provisional numbers and tie rules; lobby format is settled |

Do not build a strategy map, platformer, faction economy or campaign based on the older game project. Reuse suitable art later without importing its systems.

## 2 What the engine is responsible for

`@jev-game/game` owns the rules: battle state, movement, target selection, damage, abilities, effects, random outcomes, upgrades and eventually the run state machine. It must run in Node without a browser and in a local browser laboratory without Colyseus.

It does not open sockets, call Jev, load files, read environment variables, play sound, create Phaser objects or manage a database. An engine action produces data that presentation and transport code can consume.

For example, the engine records that an attack dealt 18 damage at tick 120. The client turns that event into a flash, a sound and a floating number. An animation finishing must never decide when damage is applied.

Use ordinary TypeScript records, arrays and functions. A function may mutate the battle state it explicitly owns. Determinism does not require cloning the entire world every tick. Keep definitions read-only and avoid shared mutable singletons.

Do not start with a generic ECS, scripting language, plugin framework, dependency injection container, event-sourcing database or universal game engine. The first systems only need to express this game's first battles.

## 3 Architecture and package ownership

Create packages when their phase needs them. The full layout below is a destination map, not an instruction to generate empty folders today.

| Package or app | Owns | Allowed workspace imports |
| --- | --- | --- |
| `packages/game` | Pure rules, domain types, seeded RNG, combat and run simulation | None |
| `packages/content` | Concrete heroes, abilities, upgrades, scenarios and rulesets | `game` |
| `packages/protocol` | Wire message validation, wire schemas and public room contracts | `game` where necessary |
| `packages/jev` | Observation construction, provider adapter and decision handling | `game`; no app imports |
| `packages/server-runtime` | Colyseus room implementation, actual server definition, sessions and bot orchestration | `game`, `content`, `protocol`, later `jev` |
| `apps/server` | Environment validation, process start and shutdown | `server-runtime` |
| `apps/client` | Phaser rendering, HUD, local laboratory and network client | `game`, browser-safe `content`, `protocol`; type-only `server-runtime/contract` |

Every arrow implied by the last column means “imports from”. `content` imports definition types from `game`. `game` receives content as an argument and never imports the concrete catalogue. `jev` depends on the game; the game never depends on Jev. All packages are private workspace packages initially.

Some code belongs in a package even if only one app uses it. Here `server-runtime` has a specific job: retain Colyseus inference while respecting the no-app-import rule. Do not extract other app internals without a similarly concrete need.

### The server type boundary

Colyseus documents full inference from the actual server definition type. A handwritten `GameState` alias is not equivalent to that contract [S1]. This plan retains the inference by moving ownership of the implementation, rather than disguising an import back into `apps/server`.

```text
apps/server/src/index.ts
packages/server-runtime/src/app.config.ts
packages/server-runtime/src/contract.ts
packages/server-runtime/src/index.ts
packages/server-runtime/src/rooms/GameRoom.ts
apps/client/src/network/connect-room.ts
```

`app.config.ts` owns the actual `defineServer(...)` result. Its room implementations live in the same package. It must not listen on a port or make external requests on import. `index.ts` exposes the startup function used by the server app. Environment values enter through an explicit validated configuration parameter; provider connections are created during startup or session construction.

The intended type surface is:

```ts
// packages/server-runtime/src/contract.ts
import type server from "./app.config.js";

export type GameServer = typeof server;
```

```ts
// apps/client/src/network/connect-room.ts
import { ColyseusSDK } from "@colyseus/sdk";
import type { GameServer } from "@jev-game/server-runtime/contract";

// Retain the SDK export that the installed version actually supports.
const client = new ColyseusSDK<GameServer>(endpoint);
```

Example package exports for the compiled runtime package:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./contract": {
      "types": "./dist/contract.d.ts"
    }
  }
}
```

The client declares `@jev-game/server-runtime: workspace:*` as a development dependency for type resolution. The server app declares it as a runtime dependency. The client lint rules permit only a type import from `/contract`; they forbid all other imports from this package and every import from `apps/server`.

This preserves a compile-time dependency on backend types. It does not provide total frontend/backend type independence, and is not a generated standalone protocol. It satisfies the narrower, explicit requirement that apps do not import apps. If complete backend independence becomes a requirement, that is a separate contract-generation decision.

Phase 1 must prove declaration emission and inference with the installed SDK. Fix public type naming or export declarations if TypeScript cannot emit a portable name. Do not solve it with `any`, `as unknown as`, a broad handwritten replacement type, or `skipLibCheck` changes that conceal the problem. This package layout is our recommendation, not an official Colyseus monorepo prescription.

### Three kinds of state

| Kind | Owner | Examples |
| --- | --- | --- |
| Authoritative domain state | `game`, hosted by local laboratory or server | HP, positions, cooldowns, RNG state, round result |
| Wire state | `protocol`, populated by `server-runtime` | Public unit fields, run phase, revision, connection status |
| Presentation state | `apps/client` | Hover, selection, interpolation position, animations, open panels |

Never place a Phaser sprite inside domain state. Never make Colyseus schema classes the only representation of battle state. Never read damage values back out of the HUD. Store derived values only where there is an explicit owner and invalidation rule.

## 4 Files and folders by responsibility

Use existing file naming conventions if they differ consistently. Each file below has a job. Combine very small adjacent helpers where that improves readability; do not split every interface into its own file.

### Root and launchers

```text
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
tsconfig.base.json
README.md
docs/architecture.md
docs/decisions.md
docs/experiments.md
docs/phase-status.md
scripts/simulate.ts
scripts/compare-builds.ts
apps/server/package.json
apps/server/tsconfig.json
apps/server/src/index.ts
apps/server/src/env.ts
apps/client/package.json
apps/client/tsconfig.json
apps/client/vite.config.ts
apps/client/index.html
apps/client/src/main.ts
apps/client/src/style.css
```

`scripts/simulate.ts` is a useful headless game runner, introduced in Phase 2. `compare-builds.ts` is a later experiment tool, not a mandatory first-phase framework. Do not add a separate tools package for these scripts.

### Game package

All paths here are relative to `packages/game/src/`.

| Path | Job | First phase |
| --- | --- | --- |
| `index.ts` | Deliberate public exports | 2 |
| `definitions.ts` | Hero, attack, arena and ability definition types | 2, extended later |
| `ids.ts` | Distinguish definition IDs from unit instance IDs | 2 |
| `random/rng.ts` | Explicit seed and serialisable generator state | 2 |
| `math/vector.ts` | Distance, normalisation and arena clamping actually needed | 2 |
| `battle/state.ts` | Battle and unit instance data | 2 |
| `battle/create-battle.ts` | Validate and instantiate a battle from a setup | 2 |
| `battle/step-battle.ts` | One fixed simulation tick in a documented order | 2 |
| `battle/result.ts` | Active, win, draw or simulation failure | 2 |
| `battle/events.ts` | Typed observable battle events | 2 |
| `battle/targeting.ts` | Legal candidates, target retention and tie-breaking | 2 |
| `battle/movement.ts` | Automatic approach and stop behaviour | 2 |
| `battle/attacks.ts` | Attack timing, range and basic attack proposals | 2 |
| `battle/damage.ts` | Single damage application path | 2 |
| `battle/snapshot.ts` | Read-only export of observable state | 2 |
| `battle/recording.ts` | Versioned setup, events and playback samples | 3 |
| `battle/abilities.ts` | Cast eligibility, targeting and ability scheduling | 3 |
| `battle/effects.ts` | Resolve explicit damage, healing and status effects | 3 |
| `battle/statuses.ts` | Timed statuses, expiry and stacking policies | 3 |
| `battle/triggers.ts` | Bounded deterministic reactions | 4 |
| `builds/state.ts` | Persistent hero build and selected upgrades | 4 |
| `builds/compile-build.ts` | Compile definitions and choices into battle stats | 4 |
| `builds/apply-upgrade.ts` | Validate and change a build | 4 |
| `run/state.ts` | Lobby seats, controller kinds, choices, health, round and phase | 5 |
| `run/pairings.ts` | Deterministic opponent rotation, rematch avoidance and byes | 5 |
| `run/round.ts` | Freeze builds, create concurrent battles and settle the entire round once | 5 |
| `run/standings.ts` | Eliminations, tied placements and match result | 5 |
| `run/player-view.ts` | Own private choices plus allowed public lobby information | 5 |
| `run/commands.ts` | Typed player intentions and rejection reasons | 5 |
| `run/apply-command.ts` | Phase, ownership and revision validation | 5 |
| `run/transitions.ts` | Legal state transitions and round settlement | 5 |
| `run/offers.ts` | Seeded legal offers and exhausted-pool handling | 5 |
| `run/legal-choices.ts` | Legal actions for humans and controllers | 5 |
| `controllers/types.ts` | Game-facing observation and decision interfaces | 5 |
| `controllers/random-controller.ts` | Reproducible baseline choice policy | 5 |
| `controllers/heuristic-controller.ts` | Simple documented baseline priorities | 5 |

Damage formulas belong in `battle/damage.ts`, not a generic maths package. Do not introduce `packages/types`, `packages/utils`, `packages/combat` or `packages/engine` alongside this package.

### Content package

```text
packages/content/src/index.ts
packages/content/src/catalogue.ts
packages/content/src/validate-catalogue.ts
packages/content/src/heroes/bruiser.ts
packages/content/src/heroes/ranger.ts
packages/content/src/heroes/support.ts
packages/content/src/abilities/strike.ts
packages/content/src/abilities/bolt.ts
packages/content/src/abilities/mend.ts
packages/content/src/upgrades/index.ts
packages/content/src/arenas/flat-arena.ts
packages/content/src/scenarios/duel.ts
packages/content/src/scenarios/three-versus-three.ts
packages/content/src/rulesets/prototype.ts
```

Start with only the bruiser, strike, arena and duel. Catalogue validation checks IDs, references and numeric ranges once when content is loaded. The game owns the definition interfaces and semantic rules. The content package owns the actual objects. A definition may contain presentation labels and asset keys, but never a loaded texture, DOM object, function closure or SDK client.

### Client package

All paths below are relative to `apps/client/src/`.

| Path | Job |
| --- | --- |
| `game/create-game.ts` | Configure Phaser and mount the canvas |
| `game/scenes/BattleLabScene.ts` | Laboratory scene lifecycle and orchestration |
| `game/scenes/MatchScene.ts` | Online/local run presentation once runs exist |
| `game/views/UnitView.ts` | One unit's sprite or placeholder, label and health bar |
| `game/views/ArenaView.ts` | Arena boundary and formation markers |
| `game/views/BattleView.ts` | Create, update and dispose all battle views |
| `game/fx/CombatFx.ts` | Translate cosmetic events into effects and sounds |
| `session/types.ts` | Minimal display/read/action boundary used by screens |
| `session/local-session.ts` | Host the same game functions locally |
| `session/online-session.ts` | Map authoritative room data into the display boundary |
| `network/connect-room.ts` | SDK connection and contract import |
| `network/room-events.ts` | Subscription setup, deduplication and disposal |
| `hud/battle-controls.ts` | Start, pause, step, speed and reset in the laboratory |
| `hud/unit-inspector.ts` | Selected unit stats, timers and effects |
| `hud/event-log.ts` | Filterable recent combat events |
| `hud/hero-picker.ts` | Draft interaction |
| `hud/upgrade-picker.ts` | Upgrade interaction |
| `hud/run-summary.ts` | Own round result, remaining health and lobby standings |
| `hud/lobby.ts` | Human joins, bot seats, readiness and match start |
| `hud/pairings.ts` | Current opponent, other pairings and battle progress |
| `hud/jev-decision.ts` | Actual recorded Jev selection and returned uncertainty |
| `dev/scenario-editor.ts` | Lab-only setup changes and scenario import/export |
| `dev/experiment-comparison.ts` | Compare saved results in Phase 8 |

Use ordinary HTML and CSS for the initial laboratory panels alongside the Phaser canvas. Keep an existing UI framework if already present; do not add React just to display a few controls. Phaser owns scene lifecycle and rendering [S2]. Shutdown handlers must dispose subscriptions, DOM listeners, timers and views.

The session boundary should expose only what screens actually need: current view data, a change subscription, legal actions and action submission. Add local stepping controls as a separate laboratory capability. Do not make online sessions pretend to support player-controlled simulation pause.

### Protocol and backend packages

```text
packages/protocol/src/index.ts
packages/protocol/src/version.ts
packages/protocol/src/commands.ts
packages/protocol/src/events.ts
packages/protocol/src/validation.ts
packages/protocol/src/schema/MatchState.ts
packages/protocol/src/schema/UnitState.ts
packages/protocol/src/schema/PlayerSeatState.ts
packages/protocol/src/schema/BattleState.ts

packages/server-runtime/src/index.ts
packages/server-runtime/src/app.config.ts
packages/server-runtime/src/contract.ts
packages/server-runtime/src/rooms/GameRoom.ts
packages/server-runtime/src/rooms/session-registry.ts
packages/server-runtime/src/rooms/publish-state.ts
packages/server-runtime/src/rooms/handle-command.ts
packages/server-runtime/src/rooms/room-clock.ts
packages/server-runtime/src/controllers/run-controller.ts
packages/server-runtime/src/controllers/decision-scheduler.ts
packages/server-runtime/src/controllers/seat-controllers.ts
```

Keep the current demo room's real filename in Phase 1 if different. Most of these files arrive in Phase 6. The room is an adapter: it receives intentions, advances the domain game and publishes allowed state. Combat calculations stay in `game`.

### Jev package

```text
packages/jev/src/index.ts
packages/jev/src/observations/build-observation.ts
packages/jev/src/decisions/choose-hero.ts
packages/jev/src/decisions/choose-upgrade.ts
packages/jev/src/provider/client.ts
packages/jev/src/provider/parse-response.ts
packages/jev/src/decision-record.ts
```

Create it in Phase 7. Domain observation types live in `game`; Jev's provider request and response types stay here. The server scheduler owns deadlines and stale-result rejection. The provider adapter owns HTTP/provider details. Keep provider credentials and calls entirely server-side.

## 5 Build and development rules

The earlier advice that shared packages never need development commands was too broad. Under a compiled-package workflow, shared packages must rebuild when their source changes. Choose one coherent build strategy and verify it from a clean checkout.

For this plan, use compiled workspace packages:

1. Each package emits ESM JavaScript and declarations into its own `dist` directory.
2. Package exports point at `dist`, with explicit subpaths where needed. Do not expose arbitrary source wildcards.
3. Server and server-side packages use TypeScript settings appropriate for Node ESM, normally `NodeNext`. Relative source imports use `.js` specifiers so emitted code resolves in Node. The client uses Vite's bundler-oriented TypeScript configuration [S3].
4. A package's `rootDir` is its own `src`; `include` does not pull sibling sources into its output tree. Separate existing test/load-test typechecking where necessary instead of expanding the production build root.
5. Run dependency-ordered builds before starting parallel watchers. Declare all workspace dependencies explicitly with `workspace:*`. pnpm uses the dependency graph to order recursive work [S4].
6. The server production launcher runs JavaScript using Node. It must not rely on TypeScript files behind package exports. Development uses `tsx watch` and package compiler watchers. Colyseus's setup guide also documents a TypeScript compilation step for production [S5].
7. Ensure server watching includes compiled workspace dependencies: `tsx` normally excludes `dist` [S6]. For the current layout, a candidate command is `tsx watch --include '../../packages/**/dist/**/*.js' src/index.ts`. Confirm the installed version supports it and verify a content edit restarts the server. Confirm the client also receives updated package code through Vite; correct dependency optimisation if it caches linked output.

Example script responsibilities, adapted to the actual installed tools:

| Location | Script | Responsibility |
| --- | --- | --- |
| Root | `build` | `pnpm -r --if-present build` in dependency order |
| Root | `dev` | Complete initial build, then `pnpm -r --parallel --if-present dev` |
| Root | `typecheck` | Check every workspace package, with dependency declarations available |
| Root | `lint` | Existing strict linter and dependency restrictions |
| Packages | `build` | `tsc -p tsconfig.json` |
| Packages | `dev` | `tsc -p tsconfig.json --watch` |
| Server app | `dev` | `tsx watch` with workspace output watching |
| Server app | `build` | `tsc -p tsconfig.json` |
| Server app | `start` | `node dist/index.js` |
| Client app | `dev` | `vite` |
| Client app | `build` | Typecheck, then `vite build` |

Do not copy dependency versions from the old chat. Preserve the lockfile and compatible installed versions. Inspect a bundler's actual purpose before removing it. If it currently compensates for source-only workspace exports, fix those exports and the build order before deleting the bundle step.

An unbundled deployment must include the built workspace packages and their production dependencies. `apps/server/dist` by itself is not a complete release. Do not add Turborepo, a publishing pipeline or a declaration bundler without a demonstrated need.

## 6 Simulation contract

### Stable public operations

These names describe our API, not an existing framework API. Introduce them only as needed.

```ts
createBattle(setup, catalogue): BattleState
stepBattle(state, catalogue): BattleStep
getBattleSnapshot(state): BattleSnapshot
compileBuild(build, catalogue): CompiledBuild
createRun(setup, catalogue): RunState
applyRunCommand(state, command, catalogue): CommandResult
```

`stepBattle` advances exactly one configured tick. It mutates only the provided state and returns the tick's ordered events plus status. It performs no I/O. The caller decides whether to run one tick, advance real time or run as fast as possible. Catalogue and ruleset versions are fixed for a battle.

Initial fields:

| Type | Required concepts |
| --- | --- |
| `BattleSetup` | Ruleset ID/version, seed, arena ID, team builds and spawn positions |
| `BattleState` | Tick, tick limit, unit instances, RNG state, pending actions/effects, battle status |
| `UnitState` | Unique instance ID, hero definition ID, team ID, position, HP, compiled stats, target, next attack tick |
| `BattleStep` | Tick, ordered event list and current result/status |
| `BattleEvent` | Battle ID, monotonic sequence, tick, event type and relevant actor/target/amount fields |
| `BattleSnapshot` | Serializable observable state; no live mutable references |
| `BattleResult` | Winner team or draw reason, duration, per-unit contribution; a separate failure case |

Use `HeroDefinitionId` for “bruiser” and `UnitId` for “the second bruiser on team B”. Multiple copies of the same hero must work. Use `null` explicitly for a target that can legitimately be absent; do not make required input fields optional and silently default them.

### Initial numeric and ordering policies

Start at 30 simulation ticks per second, a 45-second battle limit and a flat arena expressed in world units. These are proposed experiment defaults, not measured optimal values. Rendering frequency and server patch frequency are independent.

Durations are integer ticks. HP and damage are integer amounts, with rounding specified in the calculation function. Positions can initially be finite JavaScript numbers; reproducibility is required within the pinned engine/runtime combination. Do not promise bit-identical floating-point simulation across all future platforms. Authoritative state remains the server's job.

The first tick pipeline is:

1. Stop immediately if the battle is already terminal; otherwise increment the simulation tick.
2. Expire statuses whose end tick has been reached and resolve scheduled periodic effects due this tick.
3. Mark deaths caused by those effects; dead units do not produce new actions.
4. Capture the eligible units in a stable order and select or retain legal targets.
5. Compute movement proposals from that shared position snapshot, then apply them together.
6. From the post-movement snapshot, collect attacks and casts that are ready and in range.
7. Resolve collected actions in a documented priority order. Initially allow an attack already collected this tick to resolve even if its source is killed earlier in this resolution stage. A target already dead is skipped; no automatic retarget within the same action.
8. Process permitted reactions through a bounded queue, then finalise deaths.
9. Evaluate win, simultaneous defeat or time-limit draw. Emit terminal events exactly once.
10. Return events in `(tick, sequence)` order. Clear only transient per-tick buffers.

The simultaneous collection policy allows mutual kills and avoids a blanket “first array element always attacks first” rule. Remaining resolution ties use a seeded priority order established at battle creation. Swapping teams in comparison runs will expose any residual side advantage. Document any policy change as a rules version change.

Stage the pipeline: Phase 2 has no statuses, casts or reaction queue. Add those steps only in the corresponding later phase.

Other explicit rules:

- A unit retains a living legal target until that target dies or the targeting rule requires a change. Do not switch every tick simply because two distances differ slightly.
- Equal-distance targeting resolves by stable instance ID initially. Zero-distance movement returns a zero vector, never division by zero.
- Phase 2 allows unit overlap. Stop within attack range and clamp to arena bounds. Collision separation and obstacles require a later experiment, not speculative pathfinding work.
- Randomness enters through the battle RNG. Never use `Math.random`, `Date.now`, render delta, wall-clock timers or network arrival order in combat rules.
- RNG state is saved with snapshots needed for resimulation. Combat, offers and bot policies use separate deterministic streams so a new upgrade roll does not shift combat randomness.
- A timer becoming due is based on the tick comparison, not `setTimeout`. Cooldowns are at least one tick.
- Healing clamps to maximum HP. Damage records actual HP lost separately from shield absorption and overkill.
- All units dead is a draw. Battle timeout is a draw initially. A corrupt state or exhausted safety budget is a simulation failure, not a draw or a fabricated victory.
- The caller must bound work even if the game never resolves naturally. No infinite `while (!winner)` loop.

## 7 Phase roadmap

| Phase | What you can do at the end | Main question answered |
| --- | --- | --- |
| 1 | Run and build the existing demo with explicit boundaries | Can we change the project reliably? |
| 2 | Watch and inspect a reproducible duel | Is the basic battle readable? |
| 3 | Compare three heroes with different abilities | Do roles and positioning matter? |
| 4 | Build combinations of upgrades | Are build choices interesting? |
| 5 | Play a local eight-seat run against seven baseline bots | Do rotating opponents and build choices make a good loop? |
| 6 | Two humans and six baseline bots complete one shared run | Do mixed seats and simultaneous battles work online? |
| 7 | One human plus seven Jev players, or two humans plus six | Do independent Jev opponents make interesting choices? |
| 8 | Run focused experiments and retain the best variation | Which game do we actually want? |
| 9 | Share a stable private playtest build | Can someone else play without assistance? |

Phase numbers describe dependencies, not fixed-duration sprints. Later phases are provisional. Do not automatically continue into the next phase before its gameplay question has been reviewed. A completed phase can lead to another experiment in the same phase instead of more infrastructure.

## 8 Phase 1 Stabilise the foundation

**Deliverable:** the existing demo still works, clean builds work, app imports are removed and the repository has a documented dependency map. Keep this phase small; do not spend a week on build tooling before a battle exists.

**Read before changing:** root scripts, workspace manifest, lockfile, every current package manifest and tsconfig, server startup/configuration, room implementation, client connection code and the `stepEntity` shared function. Record actual versions and existing commands in `docs/architecture.md`.

**Implementation order**

1. Run the current development and production build commands. Record the working baseline and existing failures separately. Do not upgrade frameworks as part of the restructure.
2. Create `packages/server-runtime` and move the current room and actual server definition there. Fix imports within that package. Keep the server app as the environment/startup wrapper.
3. Add the narrow `/contract` type export and migrate the client's server type import. Preserve the existing `ColyseusSDK` usage if it is supported by the installed version.
4. Adopt or repair the coherent workspace build flow from section 5. Remove esbuild only after a clean Node launch works without it.
5. Keep the current movement demo accessible through a clearly labelled development entry. Do not leave its keyboard handlers active in the future battle screen.
6. Keep `packages/shared` temporarily if moving it would break the baseline. In Phase 2, relocate functions with a real new owner; remove unused demo code rather than establishing a permanent catch-all package.
7. Enforce import rules through the repository's strict existing linter. Include relative paths as well as package specifiers. Ensure `game` cannot import browser, Node, Colyseus or Jev modules when it is introduced.
8. Write run/build instructions and a brief decision record for the runtime package and compiled workspace strategy.

**Acceptance checks**

- A fresh dependency install using the lockfile, full build and production Node start succeed with generated output initially removed.
- Two clients still connect to the existing demo and move correctly.
- Editing a shared implementation rebuilds it and updates both affected processes. Confirm this with a visible behaviour change, then revert that temporary change.
- The client infers the real room state and message contract. A temporary deliberate invalid room name or payload causes a type error; remove the probe after checking.
- The production client module graph contains no server-runtime JavaScript, Jev client, server transport or Node built-ins. Check build/module output, not only that a minified text search found nothing.
- No app imports another app, directly or through a package that imports an app back.

**Not in this phase:** new mechanics, a database, a production deployment, a new test framework or a complete folder scaffold.

**Review:** are the development commands and dependency rules understandable enough to use without revisiting this discussion?

## 9 Phase 2 Build the smallest battle and laboratory

**Deliverable:** two circles automatically approach, attack, die and produce a result. The same scenario runs headlessly. This is the first engine milestone.

**Create:** the Phase 2 `game` files; the initial bruiser/strike/arena/duel content; `BattleLabScene`, `BattleView`, `UnitView`, `ArenaView`, local session, battle controls, inspector and event log; `scripts/simulate.ts`.

**Reference reading:** Mana's `CombatSimulation.ts` and `math/Random.ts`; TinyWar's `mechanics/movement.rs`. Follow section 20's adaptation notes. Do not import their complete engines.

**Implementation order**

1. Define the minimal battle types and immutable content definition types. Require valid finite values, non-empty teams, unique unit IDs, valid spawns and referenced content IDs at battle creation.
2. Implement seed/state handling and the small vector functions. Record the RNG algorithm/version so a future change cannot silently invalidate a saved scenario.
3. Create a unit instance from its hero definition. Definitions remain unchanged across resets.
4. Implement target acquisition, direct movement, attack range, cooldown, damage, death and terminal conditions in that order. Use the tick policy in section 6.
5. Implement `createBattle`, `stepBattle` and snapshots. The headless runner accepts a scenario ID and seed and prints the winner, tick count and damage summary.
6. Add the browser laboratory. Draw teams with different colours, unit names, target lines and health bars. Draw range only for the selected unit so the view stays legible.
7. Add play, pause, single tick, reset, seed input and speed selection. Speed changes the number of fixed steps consumed, never the rule delta. Bound per-frame work so the browser remains responsive.
8. Expose initial HP, damage, range, attack interval and movement speed as validated lab setup inputs. Edits apply on the next reset, not midway through an active battle.
9. Add selectable units and a recent event log showing who hit whom and for how much. Cap the on-screen log; do not render an unbounded list.
10. Add scenario export/import containing setup, versions and seed. Do not export credentials, sockets or live class instances.

**Suggested starting content:** equal bruisers with 100 HP, 10 damage, a one-second attack interval and identical range/speed. These values make the first outcome easy to follow, not balanced.

**Acceptance checks**

- The same setup and seed repeated at normal speed, fast speed and in the headless runner has the same terminal result and event sequence within the pinned build.
- Pause stops simulation, a single step advances one tick, and reset returns to exactly the original setup.
- Opponents at the same position do not produce `NaN`. Dead units do not acquire new actions.
- Zero movement and out-of-range opponents eventually reach the configured timeout draw.
- Both teams can die on the same tick under the chosen policy; result settlement happens once.
- Change damage in content and observe a predictable shorter fight. No Phaser or room code needs a rules change.
- Repeat resets without accumulating duplicate sprites or event listeners.

**Do not add:** critical hits, armour, mana, projectiles, collision avoidance, equipment, a skill tree or network prediction. One attack and one arena are enough.

**Discovery session:** compare slower heavy hits with faster light hits while holding approximate DPS constant. Observe whether attack timing and target intent are visible. Keep the version that makes the battle understandable.

**Decision before Phase 3:** retain or change the basic pace and visual scale. Record observations, not “the combat feels bad” without an example scenario.

## 10 Phase 3 Add distinct roles and an ability system

**Deliverable:** three versus three can contain a bruiser, ranged attacker and support, each visibly changing the fight. You can inspect why an ability fired and what it changed.

**Create or extend:** `definitions`, `battle/abilities`, `effects`, `statuses`, `recording`, the three hero definitions, strike/bolt/mend, the larger scenario and client combat effects.

**Reference reading:** Mana's `CombatLogger.ts`, `StatusEffectSystem.ts` and `CombatPlaybackController.ts`; TinyWar's `mechanics/combat.rs`. Separate an action starting from its authoritative impact and from the animation used to display it.

**Implementation order**

1. Make the basic attack use the same damage resolver that abilities will use. Keep “basic attack” versus “ability” as explicit source metadata.
2. Define a small discriminated union of effect kinds: direct damage, direct healing and applying a named timed status. Use exhaustive switches. Do not implement arbitrary nested expressions or user-written code in content.
3. Implement automatic cast eligibility: alive, not disabled, cooldown due and a legal target exists. For a hero with multiple ready abilities, definition order is the initial priority. Abilities resolve before its basic attack; by default it does one of these per tick.
4. Add a ranged bolt with immediate authoritative damage. Its visual projectile can travel, but cannot decide hits. Real projectile travel is a later mechanic only if dodging/interception matters.
5. Add healing that selects the living ally with the lowest HP fraction. Full-health teams do not waste the heal or begin its cooldown. It cannot revive dead units.
6. Add one shield status with a remaining absorption amount and expiry tick. Reapplication initially replaces its value and refreshes duration. Record this policy in its definition.
7. Add a slow only if needed to demonstrate timed stat changes. Compute effective speed from active modifiers; do not repeatedly multiply and mutate base speed each tick.
8. Support explicit target policies such as nearest enemy and lowest-health ally. Keep tie-breaking stable and document whether range is measured centre-to-centre.
9. Expand events with ability activation, shield absorption, healing, status applied/expired and death. Include source unit, ability ID, tick and parent event where relevant.
10. Add a recording containing versioned setup, ordered events and periodic display snapshots. Use it to replay presentation. A log of damage alone cannot reconstruct movement. Keep state snapshots as data copies, not references that mutate later.
11. Add stats to the inspector and distinct cast cues to the renderer. Placeholder shapes are sufficient.

12. If an attack needs a visible wind-up, introduce `releaseTick` and `recoveryUntilTick` as engine-owned action state. Emit action-start and impact events. At the release tick, apply an explicit rule for a dead/out-of-range target, initially cancel without retargeting and consume the cooldown. A source killed during a multi-tick wind-up cancels; this differs deliberately from an already-collected same-tick attack. Add `battle/scheduled-effects.ts` only when a delayed impact is actually introduced. Represent pending effects as data, with tick, sequence, source, target and effect payload, never serialised function closures.

**Ability definition example, illustrative rather than an SDK API**

```ts
const mend = {
  id: "mend",
  cooldownTicks: 90,
  targetPolicy: "lowest-hp-fraction-ally",
  range: 8,
  effects: [{ kind: "heal", amount: 20 }],
} satisfies AbilityDefinition;
```

**Acceptance checks**

- Adding a second definition of an existing effect kind does not require changing the tick loop.
- Heals never exceed maximum HP; shield damage is not counted as HP damage; expired shields no longer absorb.
- Two copies of a support hero have independent cooldowns and targets.
- An invalid definition fails at catalogue/setup validation with its content ID and field.
- Resetting does not retain buffs, cooldowns or shields from the previous battle.
- Recorded playback shows the same visible result without rerunning Jev or relying on animation completion.
- Six actors remain visually understandable. If overlap makes it unreadable, experiment with deterministic separation before adding more actors.

**Do not add:** dozens of effects, a generic spell editor, obstacle pathfinding or a second physics simulation in Phaser.

**Discovery session:** compare three bruisers against bruiser/ranger/support, then swap sides and formation. Determine whether mixed roles and starting positions create understandable advantages. If they do not, revise these mechanics before adding a larger roster.

## 11 Phase 4 Make upgrades change the way builds play

**Deliverable:** choose upgrades, run a battle and compare a build with its previous version. At least two combinations produce a clearly different behaviour, not merely larger numbers.

**Create:** `builds/state`, `compile-build`, `apply-upgrade`, bounded triggers, upgrade definitions and the upgrade picker. Add exactly as much effect support as the chosen upgrades require.

**Reference reading:** Mana's `TriggerSystem.ts`, `effects/dealDamage.ts` and the work/log budgets in `CombatRunner.ts`. Adopt explicit event provenance and termination rules before adding reactive upgrades.

**Implementation order**

1. Separate a persistent `HeroBuild` from a disposable battle unit. A build stores hero definition ID and upgrade selections/stacks. Battle HP, positions and cooldowns are created afresh each battle.
2. Compile a build from base definitions plus ordered upgrades. Never modify shared hero definitions or apply modifiers to already-modified stats during reset.
3. Adopt a documented stat rule: `(base + sum of flat bonuses) * (1 + sum of percentage bonuses)`, then round and clamp according to the stat. Attack rate modifiers change rate; derive an interval of at least one tick. Do not let “10% faster” have two meanings in different files.
4. Define eligibility by tags, prerequisites and stack limits. Generate legal offers from the same function used to validate selections. Return an explicit error for an invalid choice.
5. Add six starting upgrades: more maximum HP, faster attacks, stronger shield, extra lightning bounce, healing that also grants a shield, and bonus basic-attack damage against slowed targets. Add lightning chain and slow mechanics only when these examples need them.
6. Implement reactions through a queue, not recursive calls. Every reaction has a root action ID and depth. Default generated effects cannot retrigger the same trigger chain. Add a finite depth and total-effects budget; exceeding it ends the lab scenario with a diagnostic and aborts an online battle without changing run health.
7. For chain lightning, track visited target IDs per cast, use stable target ordering and allow at most one hit per target unless a later explicitly named rule changes it.
8. Show base and final stats, selected upgrades and their mechanical effects. Use shared calculation functions to produce previews so the HUD does not invent its own formulas.
9. Save the setup before a choice, then compare the upgraded build against the same opponents and seeds. Include swapped-side runs when evaluating a close comparison.

10. Separate combat accounting from trigger eligibility. Reaction damage still counts towards reported damage even when it cannot trigger another reaction. Default `on-hit` reactions occur after the triggering impact. A shield that protects against the triggering hit requires a separate, explicitly named pre-damage trigger phase. Document and inspect this ordering rather than hiding it inside one effect function.

**Acceptance checks**

- Applying and resetting the same upgrade selection yields the same compiled stats each time.
- Incompatible upgrades are absent from offers and rejected if submitted directly.
- A maximum-stack upgrade cannot be applied again through duplicate requests.
- A reaction cycle terminates under the explicit safety policy, with the offending chain visible in diagnostics.
- Two copies of a hero can have different upgrades without affecting each other.
- A new ordinary numerical upgrade is a content change. A genuinely new effect kind is an engine change with an example scenario.

**Do not add:** arbitrary scripting, hundreds of upgrades, crafting or permanent account progression.

**Discovery session:** try strong combinations deliberately. Ask whether the surprising result can be explained from the selected upgrades. Do not remove an entertaining powerful combination merely to make every option numerically equal. Fix unexplained bugs and choices that are never useful first.

**Decision before Phase 5:** keep a small set of upgrades worth choosing between. If every choice is obviously “take more damage”, add a real trade-off before building a run around it.

## 12 Phase 5 Create a complete local lobby run

**Deliverable:** you select your own team and upgrades and complete a run in an eight-seat lobby against seven independent baseline bots. Four duels run simultaneously at the start; opponents rotate between rounds. No provider access is required yet. The interface labels these as baseline bots, not Jev.

**Create:** the `run` files including pairings, round settlement, standings and player-view; game-facing controller interfaces; random/heuristic controllers; lobby, pairings, draft and result HUD; `MatchScene`; prototype ruleset.

### Distinguish a player from a unit and a connection

A `PlayerSeat` has a stable player ID, display name, controller kind, team build, run health, readiness, participation status and decision revision. A hero instance belongs to that seat's team. A browser connection is a separate mapping to a human-controlled seat. Bots do not need browser sessions or pretend WebSocket clients.

Keep `RunState.players` keyed by player ID and `RoundState.battles` keyed by battle ID. Each pairing contains two player IDs, not “me” and “the enemy”. The browser's own player ID determines which battle is its default view. Controller implementations and provider clients live outside serialisable domain state.

A battle knows its two team IDs. It does not know the other lobby participants or decide who they fight next. The run creates battle setups, collects results and settles standings.

### Starting experiment rules

- Lobby capacity is eight, configurable for smaller development sessions. At least one human is required in the normal play flow; zero-human runs are a developer evaluation mode.
- Human seats are assigned first and the remaining seats are filled with baseline bots. Freeze seat ownership and controller assignments when the match starts.
- Each player receives five hero offers and chooses three. With the initial three-archetype catalogue, entries can repeat, with unique offer instance IDs. Start with independent offers per seat, not a shared finite hero pool.
- Three active hero slots determine initial positions. A player's team size is not the lobby size.
- Every seat starts with three run-health points. A duel loss costs one; a draw costs neither. Zero health eliminates the seat after the round is settled.
- Surviving players receive an upgrade choice after each non-final round. Offers are private; eligibility and reduced-pool behaviour are explicit. There is no shop, currency, reroll or recruitment yet.
- All active seats make their preparation choices concurrently. A round starts once their decisions are committed and they are ready, or the preparation deadline resolves outstanding choices. Use a provisional 30-second choice window, with longer timing allowed for the initial three-pick draft.
- The human's UI always controls the human's seat. It never auto-submits a Jev decision for that seat. If a human misses a deadline, preserve committed choices and apply a labelled deterministic fallback only for outstanding required choices.
- Four duels start together when eight players are active. A finished duel shows its result while other battles finish; it does not independently advance its two players to a new round.
- Restore battle HP/cooldowns each round; preserve builds, health, opponent history and accepted decisions.
- Last surviving seat wins. If everyone remaining is eliminated in the same settlement, those final seats share the final placement and the match is a draw. At the provisional eight-round cap, highest remaining run health among survivors wins; equal highest health gives a shared win. Elimination in the same round gives tied placement initially.

These numerical rules are tuning defaults. Human participation, independent bot seats, simultaneous duels and opponent rotation are requirements.

### Pairings and rotation

Implement `createPairings(activePlayerIds, history, pairingSeed)` as a pure function. With eight players, four pairings must cover every player exactly once. Never select a human's opponent separately and then forget to schedule the Jev-versus-Jev battles.

Use a deterministic circle schedule while the full starting roster remains unchanged: shuffle seats once using the pairing seed, keep one fixed, rotate the remainder and pair opposing positions. With eight seats, a seven-round cycle visits every opponent once without a repeat. Seed or alternate which seat becomes team A to avoid permanent side assignment.

After eliminations change the roster, choose a deterministic matching over surviving seats. For this small lobby, enumerate possible complete pairings, rank by fewest immediate rematches, then fewest total previous encounters, and break ties using stable seeded order. Persist history after settlement. A repeat is allowed when no better schedule exists, especially with only two survivors. Do not build a generic tournament service.

For an odd survivor count, give one seat a bye: choose from those with the fewest prior byes, avoid consecutive byes where possible, then use seeded tie-breaking. A bye receives no battle win and loses no health but receives the ordinary next-round upgrade opportunity. Show it as a bye, not a simulated victory. This is an initial fairness policy; ghost teams are a later experiment.

Each actual pairing receives its own battle ID and independent deterministic seed derived from the run seed, round and canonical pairing identity using a documented stable derivation. One battle's extra random calls must not change another battle. Offer generation also has per-seat streams.

### State machine and simultaneous settlement

`lobby` assigns seats. `draft` gathers private choices. `preparing` publishes pairings, accepts legal formation/build choices and tracks readiness. At the barrier, freeze all builds and create the battle states. `battle` advances every unfinished duel in a stable order; there are no build edits. Once all pairings have a result, `round-result` settles each battle ID exactly once, applies all health changes together, then computes eliminations and the overall result. Survivors enter `upgrade`, then `preparing`; a completed match enters `finished`.

Use deadlines rather than waiting forever for a result-screen acknowledgement. Eliminated players are removed from decision barriers and may spectate or leave. Laboratory reset creates a fresh run ID. It does not rewind one player's seat inside the existing run.

A simulation failure is not a loss. Initially abort the whole lobby match with diagnostics and no round-health settlement if one battle cannot produce a valid result. Do not partially settle the other duels and leave standings inconsistent.

### Implementation order

1. Define seat, round, pairing and standings types. Add `phaseEpoch` for shared phase changes and a separate `decisionRevision` per seat. Another seat picking an upgrade must not invalidate your outstanding choice.
2. Implement pure pairing generation and produce a printable eight-player schedule before adding UI. Add odd-roster and eliminated-roster handling.
3. Define accepted commands and structured rejection reasons. Match phase, actor ownership, offer ID and the actor's decision revision must all be valid at application time.
4. Implement private offers and `getPlayerView(run, playerId)`. Both human UI and bot observations use this projection, never unrestricted run state.
5. Create one battle per pairing from frozen builds. Tick all unfinished battles and aggregate their results. Keep settlement separate from individual battle completion.
6. Add random and heuristic controllers with independent seat state/RNG. Controllers return legal choice IDs and never mutate state directly.
7. Build a screen showing your team/choices, the lobby roster and standings, your current opponent, preparation timer and round progress. Render your battle by default. After it ends, you may watch another public battle without obtaining control of either seat.
8. Record seat assignments, pairings, per-battle seeds, accepted commands, controller decisions and settled results. Export any battle to the laboratory.
9. Complete a local eight-seat match, then repeat with smaller lobbies to exercise odd counts and the final two survivors.

### Acceptance checks

- One human and seven baseline bots can finish a match without editing code.
- Round one creates exactly four battles; all eight players appear exactly once.
- With no eliminations, all seven possible opponents appear before the schedule repeats.
- Pairings never include an eliminated seat, self-match or duplicate seat. Byes are visible and rotate under the stated rule.
- The user makes their own draft/upgrade choices and sees them on their own heroes.
- Bots have distinct player IDs, builds, health and histories. Identical selected upgrades are allowed, but mutable state must not be shared.
- Duplicate battle-complete events cannot subtract health twice. All round eliminations happen after collective settlement.
- A fast fight cannot advance its participants while a slow fight remains active. A stalled human cannot hold the round forever.
- Replaying a saved run uses recorded choices, reproduces the pairings and opens the selected battle correctly.

**Discovery session:** check whether the next opponent is clear, whether rotating matchups encourage different upgrades, and whether waiting for the longest duel is acceptable. Experiment with the common battle limit before replacing simultaneous rounds with a different format.

## 13 Phase 6 Run mixed human and bot lobbies online

**Deliverable:** two humans in separate browser sessions join one lobby with six baseline bots and complete rotating simultaneous rounds. One human plus seven bots and up to eight humans use the same run architecture. Jev replaces baseline controllers in Phase 7.

**Create or extend:** match/seat/battle wire schemas, protocol messages, `GameRoom`, command handler, session registry, publication mapping, room clock, seat-controller registry and online session adapter.

### Networking policy

One Colyseus room represents the whole lobby run, not one room per duel. It hosts up to four isolated battle states. A connection maps to a stable human seat; bot seats have server-side controllers and consume no client slots. Distinguish lobby capacity from connected-client capacity. Defer arbitrary extra spectators; eliminated participants can remain in their original seats as spectators.

The server owns offers, pairings, clocks, battle outcomes and standings. Humans send discrete intentions. They never submit trusted player identity, damage, winner or another seat's choice. Automatic combat does not require local movement prediction; the previous `Predict` demo remains a separate development reference [S7].

### Implementation order

1. Extend the existing runtime package and inferred contract. Use an eight-seat `RunState` as the authority.
2. Add lobby create/join/start. Before start, a newly joining human atomically takes an available bot-reserved seat. For example, one human plus seven reserved bots becomes two plus six. Concurrent joins cannot claim the same seat. The host starts the match; lock the roster then.
3. Start with join-before-start semantics. A newcomer cannot silently take over a Jev build halfway through a run. Live takeover is an explicit later feature. Reconnecting to an already-owned human seat remains supported.
4. Validate wire shape, then domain legality. Use command ID, run ID, expected phase epoch and expected decision revision. Derive actor ID from the connection's server-side seat assignment.
5. Keep bounded acknowledgements. Duplicate command IDs get their original result; stale decisions are rejected. A bot's command enters the same domain validation path with its server-assigned actor identity.
6. Drive all battles from a room-owned fixed-step clock, initially 30 ticks/second. Step unfinished battle IDs in stable order with separate RNG. Limit catch-up work, keep owed simulation time and report overload instead of changing rule delta or silently dropping steps.
7. Publish durable state at an initial ten updates/second: roster, public builds, health, pairings, phase/deadline, battle IDs/ticks, unit states and results. For the first eight-seat prototype, sending all public battle states is acceptable if measured payloads remain small. Optimise subscriptions later if necessary.
8. Tag cosmetic events with battle ID, tick and sequence. Each browser renders its own duel by default and discards or stores other cosmetic events without creating four sets of unnecessary particles. Durable state reconstructs a screen after missed events.
9. Send private offers only to their owning human connection. Bot offers stay server-side. Publicly revealed builds become visible at the documented lock boundary. Do not expose hidden pending picks or Jev's private observations in the shared schema.
10. Add a provisional 30-second reconnect grace period. Battles continue; if a decision deadline arrives during absence, use the documented fallback for the missing choice. After grace expires, mark the seat for forfeit. Preserve any already-frozen pairing through that round, then eliminate the forfeiting seat at the settlement barrier. Do not remove an actor midway through a battle or duplicate elimination penalties.
11. Cancel obsolete controller jobs on phase change, elimination and room disposal. Never cancel every bot job merely because an unrelated human disconnects. Dispose timers and subscriptions with the room.
12. Show waiting, reconnection, eliminated/spectating and match-ended states clearly. Server restarts may end prototype runs; persistence is a separate later requirement.

### Acceptance checks

- One human plus seven baseline bots, two humans plus six bots, and eight human sessions use the same room/run representation.
- Two simultaneous joins cannot share a seat; after-start newcomers cannot steal a seat.
- Each human controls only their own team and sees the correct duel and private offers.
- Every client sees identical public pairings, health and standings after collective settlement.
- Refresh restores the same player seat. It neither duplicates a hero nor starts a new lobby match.
- Stale/duplicate/malicious commands cannot change another player's build or settle a battle twice.
- Eliminated or disconnected seats do not keep readiness barriers open indefinitely.
- Measure simulation time, wire payload and memory for four simultaneous three-versus-three battles, then for two such rooms. Report observations, not an assumed production capacity.

**Do not add:** ranked queues, global matchmaking, Redis, permanent accounts, rollback, lag compensation or mid-match bot takeover.

**Review:** validate the mixed-seat run before replacing baseline bots with a remote provider. Local pairing or synchronisation bugs must be distinguishable from Jev request failures.

## 14 Phase 7 Integrate independent Jev players

**Deliverable:** you play your own seat against seven Jev-controlled seats, or another human joins before start and the game runs with two humans and six Jev players. Jev-versus-Jev duels happen alongside the human duels and affect the same standings. A completed run replays without new provider calls.

TypeSafe exposes Choice, Score and Noul over supplied state. Choice returns an option with a distribution and confidence; Score evaluates an ordered rubric; Noul returns a zero-to-one value with no separate confidence field [S8]. Do not assume a chat-completion API or fabricate a `jev.choose` method from illustrative examples.

### What Jev controls and what the human controls

| Decision or operation | Human seat | Jev seat | Authority |
| --- | --- | --- | --- |
| Hero pick | User selects an offered hero | Choice selects one legal offer | Domain command validation |
| Upgrade pick | User selects an offered upgrade | Choice selects one legal offer | Domain command validation |
| Formation if enabled | User chooses legal slots | Choice selects a legal formation candidate | Domain command validation |
| Readiness | User confirms or deadline applies | Controller marks ready when required choices finish | Run phase barrier |
| Movement, targeting and attacks | Automatic hero behaviour | The same automatic hero behaviour | Deterministic battle engine |
| Damage, cooldowns, health and winner | No direct control | No direct control | Deterministic engine and round settlement |
| Opponent rotation and eliminations | No direct control | No direct control | Run scheduler |

The initial game is an auto battler: you actively play the draft/build/upgrade decisions and watch their consequences in combat. This plan does not assume direct keyboard combat. Mid-battle actions remain an optional experiment if you later want more direct agency.

Seven Jev players can use the same model and provider credentials. They need separate player-specific observations, decisions and state, not seven separately trained models. The model has no assumed persistent memory: every request must contain the relevant current context. Optional play styles can later differ through controller policy, but initial identical policies are acceptable because offers, opponents and builds differ.

### Observation and decision flow

For each seat that needs a choice: project the allowed player view, compute exact useful facts, enumerate legal choice IDs, ask Jev, validate the returned ID against the current decision, then apply the ordinary player command. A successful selection changes only that seat and increments its decision revision. Subsequent dependent picks use a new observation.

An observation includes own roster/upgrades/health, own current offers, round, current opponent's revealed build, public standings and a concise personal recent-battle summary. It excludes other seats' private offers, hidden pending picks, secret RNG state and unrevealed future outcomes. Use the same visibility rules as the human UI. Give descriptions of game mechanics alongside identifiers.

Compute numeric upgrade deltas and other deterministic facts in code. Mark approximations such as DPS as estimates. Do not label model confidence as the probability of winning a battle. Jev never computes authoritative damage or legal actions.

### Implementation order

1. Inspect the installed TypeSafe SDK and official API contract. Keep the concrete request in `provider/client.ts`, with response validation in `parse-response.ts`. The rest of the application uses the domain controller interface.
2. Integrate one Jev seat's upgrade selection against baseline bots. Then add drafting. Finally replace all reserved bot seats with independent Jev controller instances in the normal lobby mode. Do not claim seven Jev opponents while six still use baseline policies.
3. Registry entries are keyed by player ID and own their pending decision, history summary and fallback state. Keep shared provider access stateless with respect to player identity.
4. Key jobs by run ID, round ID, phase epoch, player ID, decision kind and the seat's decision revision. Permit at most one outstanding request for a seat's current decision.
5. Start with a configurable global concurrency limit of four and a fair queue across seats/rooms. Seven bot picks should overlap within the limit, not wait serially for seven full request timeouts. Separate per-request timeout from the absolute phase deadline: queue time counts against the latter. If the phase deadline passes, queued jobs also fall back instead of extending the round.
6. Start with a provisional five-second request timeout and no automatic retry. A provider error, invalid result or missed deadline uses a legal heuristic fallback for that seat only. Log and display the fallback honestly. It does not convert the whole lobby to another mode or stall all humans.
7. Before accepting any answer, check its run, epoch, seat participation and decision revision and validate the choice against the live legal set. Discard stale results after a human takeover in a future feature, elimination, reset or phase change.
8. Sequential picks for one seat must see its updated build. Independent questions for one observation may be batched [S8]. Do not place all players' private state in one shared-state request to save calls; start with isolated observations per seat.
9. Apply request/usage budgets per seat and per match, plus process-wide concurrency limits. Example planning arithmetic: seven bots times three separate draft picks gives 21 successful draft requests; one upgrade pick per bot over seven further decision windows adds at most 49, before eliminations. That is up to 70 requests under that scenario, not a fixed cost or latency claim. Measure actual provider usage and use the selected provider's pricing.
10. Record player ID, observation/schema version, phase epoch, decision revision, model, options, returned answer/distribution/confidence where applicable, measured duration, usage, accepted command and fallback reason. Keep secrets out of records.
11. Record accepted commands for replay. Provider output can change between calls; a replay must not ask Jev to make the choice again. Log the model/version and policy so separate evaluation runs remain interpretable.
12. Show public chosen builds after lock and per-seat thinking/ready/fallback status. Keep detailed private decision traces developer-only during live play; reveal appropriate detail after the match. Never leak an opponent's hidden options or future intention through the spectator/debug interface. Any explanatory prose must be labelled as a separate explanation, not invented Jev reasoning.

### Additional primitives when needed

Choice is sufficient for the first functioning player. Add Score when comparing a defined dimension such as synergy, and Noul for a narrow judgement such as whether a build is too dependent on one damage source. Exact legality, affordability and rule checks remain deterministic code. Use extra questions only when their output changes a decision you can evaluate.

### Acceptance checks

- Complete one-human/seven-Jev and two-human/six-Jev matches. Jev-versus-Jev pairings resolve and influence standings even when no human is watching them.
- All seats have independent builds, observations and history. No shared mutable bot state or uncontrolled cross-seat context leakage exists.
- User clicks control their own seat. No remote model is called to replace a completed human choice.
- A fast bot answer can apply while another remains pending. Unrelated seat decisions do not invalidate each other.
- At most the configured number of provider calls are active; queued and active jobs obey the phase deadline.
- Provider outage resolves affected choices through labelled legal fallbacks without blocking the round.
- Late replies cannot alter a new round, eliminated seat or finished match.
- Private offers, raw bot observations and credentials are absent from other players' wire views and from the browser bundle.
- Replaying the recorded match causes zero provider calls and reproduces recorded pairings, choices and outcomes.
- Evaluate against baseline controllers using paired seeds/side swaps. Report per-seat and whole-match results separately; do not count seven bot seats as seven independent matches.

**Do not add:** model calls inside the simulation tick, generated spells, model-authored damage rules or fabricated explanations. First make eight independent player seats reliable and enjoyable.

**Review:** are Jev opponents recognisably building towards something? Does the preparation timer fit human decisions and bot latency? Is opponent rotation clear? Improve observations, decision cadence or UI before adding more AI question types.

## 15 Phase 8 Discover the game through controlled experiments

**Deliverable:** an evidence-backed choice of the next game direction, plus a short list of rejected alternatives. This phase can repeat indefinitely in small cycles.

Create `scripts/compare-builds.ts` and the small comparison view only once manual experiments become too slow. Feed them the same public engine API. Record content/rules versions, seed set and hardware/runtime for performance measurements.

Choose one experiment at a time:

| Experiment | Smallest implementation | Observe before deciding |
| --- | --- | --- |
| One, three or five heroes | Three scenario presets and appropriate starting slots | Readability, decision load, role clarity and battle duration |
| Recruitment | One between-round choice to add/replace a hero with an explicit capacity rule | Whether new heroes enrich the build or dilute attachment |
| Simple economy | A run currency, priced offers and one explicit buy command | Whether saving/spending creates a decision worth the added UI |
| Rerolls | One limited reroll resource, replace-offer command and deterministic offer stream | Whether it creates planning or merely fixes poor offers |
| Formation | A few legal discrete positions before battle | Whether positioning visibly changes outcomes |
| Battlefield collision | Deterministic separation for current small unit counts | Whether clarity improves without frustrating movement |
| More explosive combinations | Two targeted trigger upgrades with clear limits | Whether surprising outcomes remain understandable |
| Shorter battles | A ruleset changing HP/damage, with all else fixed | Watching time, information loss and run pace |
| Mid-battle agency | One explicit optional intervention in a separate ruleset | Whether interaction improves the game enough to justify changing playback/network assumptions |
| Jev as adviser | Surface its suggested upgrade without applying it | Whether the comparison is a compelling use case |

Do not implement all rows. For each experiment, write a hypothesis, change one major variable, play a small comparable set of runs, retain useful scenario seeds and write the decision. Restore or delete unsuccessful experimental mechanics instead of leaving permanent feature flags everywhere.

`docs/experiments.md` entry template:

```text
Question
Hypothesis
Rules and content versions
Scenario and seed set
What changed
Observed player behaviour
Relevant numbers
What was confusing or enjoyable
Decision and reason
Next smallest experiment
```

Useful numbers: battle duration, run duration, time choosing versus watching, upgrade pick counts, use of rerolls, timeouts, Jev latency/fallbacks and per-battle simulation time. Ask players what they thought would happen and whether the outcome made sense. Do not substitute win-rate spreadsheets for observing whether anyone wants another run.

Profile before optimising. For a small roster, straightforward target scans are acceptable. If a measured hot path grows, optimise that path. If simulations begin blocking the room process, move batches to a worker with a defined data boundary. Do not create ECS storage or workers merely because the word “engine” suggests them.

**Exit decision:** select the team size, player decisions, rough run length and level of randomness worth polishing. Update the next phase to reflect that choice. No old folder or unused mechanic gets to decide the product direction.

## 16 Phase 9 Prepare a private playtest

This phase is conditional on finding a loop worth sharing. It is not permission to build a production live service.

**Deliverable:** a friend can open a link, start or join a run, understand the decisions, recover from ordinary connection problems and finish without a developer explaining every step.

**Implementation order**

1. Replace the most confusing placeholders with consistent portraits, icons and effects. Make team and targeting information work without colour alone. Add clear ability descriptions and optional reduced motion/audio controls.
2. Check loading, reconnect, timeout, full-room, provider-fallback and incompatible-version screens. Explain an ended match if the server restarted.
3. Gate all mutation-capable lab controls to development. A URL parameter must not grant production authority.
4. Build a reproducible deployable server package including built workspace dependencies. Verify a clean launch and client build from the lockfile.
5. Add explicit protocol/build versions to the connection path. Reject incompatible clients with an instruction to refresh. Keep a battle's rules/content fixed for its duration.
6. Configure the actual host, secure connections, provider secrets and allowed client origins. Verify practical room, message and provider-work limits for that host.
7. Collect a minimal playtest report: run/version ID, whether the run completed, failure reason and optional user notes. Avoid collecting unnecessary personal information.
8. Confirm shutdown disposes rooms and pending decisions cleanly. Record a known-good release and rollback procedure.

**Acceptance checks:** complete one run from a fresh browser, one with a disconnected/reconnected participant, one during a provider failure and one with two simultaneous eight-seat rooms. Include one-human/seven-Jev and two-human/six-Jev seat mixes. Check that the release has no developer-only control path. Run existing relevant checks; do not build a broad new test infrastructure solely for this milestone.

Persistent accounts, ranked ladders, payments, a content editor and multi-region infrastructure require separate product requirements.

## 17 Verification and implementation discipline

The plan defines acceptance checks, not a request to create a new automated test suite. Preserve and run relevant existing tests. Respect the user's preference not to add tests unless requested. Use typechecking, the strict linter on changed files, headless scenario runs and explicit manual demonstrations to verify each phase. Turn a repeated expensive regression into a discussion about a targeted automated check rather than inventing coverage targets.

For every implementation task:

1. Read the current phase, related existing code and applicable repository instructions.
2. State the intended visible result and exact files being changed. Work on one behaviour at a time.
3. Preserve existing working paths until the replacement works. Avoid broad renames mixed with rules changes.
4. Validate external input and content at entry boundaries. Use domain legality checks when applying commands. Do not silently substitute defaults for required missing values.
5. Add JSDoc to public functions describing ownership/mutation, inputs, results and rejection/failure behaviour.
6. Keep all new behaviour reachable through a lab scenario or a playable screen. Unused configurable subsystems do not count as completed gameplay.
7. Run the relevant typecheck and strict lint checks. Demonstrate the phase acceptance cases and record any limitation honestly.
8. Update `docs/phase-status.md` with completed work, commands used, remaining issues and the next concrete task.
9. Update the decision/experiment log only when a real decision was made. Keep it short enough to remain useful.
10. End the phase with a runnable checkpoint and the discovery question. Wait for the gameplay review before implementing the next phase's speculative systems.

**Task sizing:** a phase is several small implementation changes, not one enormous agent prompt. A sensible Phase 2 sequence is battle types/content, headless duel, movement/targeting, renderer, controls, then inspector/export. Each change should have an observable result.

**Definition of done:** the phase's usable behaviour works, the named acceptance checks have been demonstrated, relevant existing checks pass, no dependency rule is violated, and the remaining uncertainty is written down. A folder tree, a set of interfaces or a collection of TODOs is not completion.

## 18 First instructions to give the implementing agent

The following is a task brief for Phase 1. Do not instruct an agent to implement the whole document at once.

> Read Jev_Game_Implementation_Plan.md and implement Phase 1 only. First inspect the current repository and report its actual package graph, installed framework versions and working run/build commands. Preserve the existing demo. Keep apps/client and apps/server independent by moving the actual Colyseus server definition and room implementation into a private server-runtime package, with a narrow type-only contract export for client inference. Prove that inferred room and message types survive declaration emission and that no server JavaScript enters the client build. Establish one working compiled-workspace development and production build flow, including dependency watching. Use the current strict linter, add no new test framework, and do not add game mechanics or empty future-phase scaffolding. Finish with the acceptance results, changed files, remaining issues and the exact commands I can run. Do not start Phase 2 yet.

The first gameplay target after that foundation is equally concrete:

> I can open a battle laboratory, run the same seeded duel in the browser and headlessly, pause it, advance one tick, inspect a unit, change an attack value, reset and understand the new result.

Build towards that target before debating the final roster, economy or every possible combat feature.

## 19 Technical references

These sources ground framework behaviour. The phase sequence, folder layout, combat policies and numerical defaults are project recommendations. Documentation was checked on 21 September 2026; the installed lockfile remains the authority for exact callable APIs.

- **S1** [Colyseus TypeScript SDK](https://docs.colyseus.io/getting-started/typescript). Server-type inference, type-only imports and alternative room typing.
- **S2** [Phaser scenes](https://docs.phaser.io/phaser/concepts/scenes). Scene organisation and lifecycle.
- **S3** [TypeScript compiler options for modules](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html). Select module resolution to match the consuming runtime or bundler.
- **S4** [pnpm recursive commands](https://pnpm.io/cli/recursive) and [workspaces](https://pnpm.io/workspaces). Workspace dependencies and recursive execution.
- **S5** [Colyseus TypeScript server setup](https://docs.colyseus.io/recipes/setup-server-from-scratch-typescript). Development runner and production compilation.
- **S6** [tsx watch mode](https://tsx.is/watch-mode). Default exclusions and explicit includes.
- **S7** [Colyseus client prediction](https://docs.colyseus.io/netcode/client-prediction). Input prediction/reconciliation for direct-control scenarios.
- **S8** [TypeSafe primitives](https://docs.typesafe.ai/primitives) and [introduction](https://docs.typesafe.ai/introduction). Structured decisions and independent questions over supplied state.

## 20 Combat reference implementations

Both repositories were read through GitHub at the revisions below. The review covered selected combat, movement, random, logging, playback and licence files; neither game was built or played for this review. Conclusions about usefulness are code-review judgements, not benchmark results.

| Reference | Reviewed revision | Use in this project |
| --- | --- | --- |
| [TinyWar](https://github.com/tvdboom/tinywar/tree/d8a06bbefba0c1900c60ca8edf49c6328dad348b) | `d8a06bbefba0c1900c60ca8edf49c6328dad348b` | Automatic engagement, movement/separation and legible attack timing |
| [Mana Battle](https://github.com/lfarroco/mana-game/tree/eec8c1be86fba8cc76ef0ba188af011d208001ee) | `eec8c1be86fba8cc76ef0ba188af011d208001ee` | Pure TypeScript combat, events, playback, statuses and reaction safeguards |

### Mana Battle as the primary structural reference

Its documented architecture separates combat simulation in `core/` from Phaser playback. Reading the runner, simulation wrapper and playback controller supports that separation. Its game is a trigger-based board/core battle, so its targeting and win conditions do not directly describe moving heroes in an arena.

| Source to read | Concrete observation | Adaptation and phase |
| --- | --- | --- |
| [CombatSimulation.ts](https://github.com/lfarroco/mana-game/blob/eec8c1be86fba8cc76ef0ba188af011d208001ee/core/src/Combat/CombatSimulation.ts) | Builds disposable combat state, runs a bounded loop and collects a recording | Separate persistent builds from battle instances; expose a headless runner in Phase 2 |
| [Random.ts](https://github.com/lfarroco/mana-game/blob/eec8c1be86fba8cc76ef0ba188af011d208001ee/core/src/math/Random.ts) | Seeded operations return the next seed explicitly | Choose and version a small RNG; keep state advancement explicit in Phase 2 |
| [CombatRunner.ts](https://github.com/lfarroco/mana-game/blob/eec8c1be86fba8cc76ef0ba188af011d208001ee/core/src/Combat/CombatRunner.ts) | Separates due events, unit charging, statuses, reactions and outcome evaluation; caps work and logs | Use a documented tick pipeline and separate duration/work/log limits in Phases 2 to 4 |
| [CombatLogger.ts](https://github.com/lfarroco/mana-game/blob/eec8c1be86fba8cc76ef0ba188af011d208001ee/core/src/Combat/CombatLogger.ts) | Typed cast, hit, status and outcome records carry relevant IDs and values | Use an event union and causal metadata in Phase 3; add movement samples for our moving arena |
| [StatusEffectSystem.ts](https://github.com/lfarroco/mana-game/blob/eec8c1be86fba8cc76ef0ba188af011d208001ee/core/src/Combat/StatusEffectSystem.ts) | Status ticks log HP and shield changes, including damage absorbed by shields | Ensure status effects and ordinary hits use the same damage path and publish complete state changes in Phase 3 |
| [TriggerSystem.ts](https://github.com/lfarroco/mana-game/blob/eec8c1be86fba8cc76ef0ba188af011d208001ee/core/src/TriggerSystem/TriggerSystem.ts) | Dispatches effect kinds, resolves targets and filters eligible reactions | Start with a small effect union and explicit predicates in Phase 4; do not port its whole vocabulary |
| [dealDamage.ts](https://github.com/lfarroco/mana-game/blob/eec8c1be86fba8cc76ef0ba188af011d208001ee/core/src/TriggerSystem/effects/dealDamage.ts) | Distinguishes cast from deferred hit; reaction provenance prevents retaliation loops | Add serialisable scheduled impacts only when needed; preserve trigger provenance and specify pre/post-damage timing |
| [CombatPlaybackController.ts](https://github.com/lfarroco/mana-game/blob/eec8c1be86fba8cc76ef0ba188af011d208001ee/phaser/src/Screens/Battleground/Phases/Combat/CombatPlaybackController.ts) | Schedules recorded presentation events and limits cosmetic work per frame | Keep playback separate; reduce decorative effects under load without dropping authoritative results |

Important deliberate differences:

- Mana's simulation wrapper uses a millisecond frame increment and later sorts logs. We use integer simulation ticks plus a monotonic event sequence. Ordering should be correct when events are emitted.
- Its deferred hits store executable closures. Ours use serialisable data so recordings and snapshots can preserve pending work.
- Its outcomes refer to player/CPU cores, and its special runaway policy can resolve as a loss or both surviving. Ours use team IDs and distinguish a valid draw from a simulation failure. A missing outcome must not silently become a loss.
- Its simulation advances the session seed through combat. We use separate streams for combat, offers and controller choices so one system's random calls do not disturb another's.
- Its reaction-sourced damage suppresses some tracking to prevent feedback. We separately define “counts in the damage report” and “can fire another reaction”, so the combat summary remains accurate.
- Fully simulating a fight and then playing a recording is useful for our laboratory and comparisons. Phase 6 deliberately starts with live server stepping and published state because that fits the existing Colyseus baseline. Do not mix the two authorities. A later server-precomputed playback mode must keep settlement authoritative, handle reconnect/versioning, and cannot let a client's playback-finished message decide the winner.

### TinyWar as a movement and engagement reference

TinyWar uses Rust and Bevy. Its code is useful for reviewing combat behaviour, but direct code transfer into this TypeScript simulation would require a deliberate translation.

| Source to read | Concrete observation | Adaptation and phase |
| --- | --- | --- |
| [movement.rs](https://github.com/tvdboom/tinywar/blob/d8a06bbefba0c1900c60ca8edf49c6328dad348b/src/core/mechanics/movement.rs) | Movement selects attack/heal interactions, uses nearby tile buckets and applies separation when units overlap | Use simple legal targeting in Phase 2; revisit deterministic separation in Phase 8 if overlap is a real problem |
| [combat.rs](https://github.com/tvdboom/tinywar/blob/d8a06bbefba0c1900c60ca8edf49c6328dad348b/src/core/mechanics/combat.rs) | Damage calculation is identifiable separately from message-based application; supports distinct projectile modes | Retain one damage resolver; use explicit source/target and impact events in Phases 2 and 3 |
| [effects.rs](https://github.com/tvdboom/tinywar/blob/d8a06bbefba0c1900c60ca8edf49c6328dad348b/src/core/mechanics/effects.rs) | Visual effect messages lead to particles and sounds, including handling an entity that is not yet present | Keep cosmetic dispatch separate; buffer briefly or discard stale visual events according to explicit client rules |

TinyWar's `resolve_attack` responds to animation cycle completion. Do not port that authority relationship. Represent wind-up/release/recovery in domain ticks and make animation follow those events. This keeps browser speed, missing sprites and disabled effects from changing the fight.

Its movement code uses Bevy transforms/sprites and frame delta, and its nearby-cell collection involves hash-based iteration. Translate useful policies into our pure fixed-tick functions, with explicitly stable candidate ordering. Do not assume an implementation becomes deterministic merely because one overlap direction is calculated from an entity ID.

Physical/magic damage, resistance, penetration, lanes, bases and continuous spawning are examples of that game's design. They are not requirements for ours. If an armour experiment becomes useful, compare a simple documented mitigation formula, but keep constants and minimum damage as tuning choices rather than importing TinyWar's balance wholesale.

### Code reuse record

The reviewed root [TinyWar licence](https://github.com/tvdboom/tinywar/blob/d8a06bbefba0c1900c60ca8edf49c6328dad348b/LICENSE) and [Mana licence](https://github.com/lfarroco/mana-game/blob/eec8c1be86fba8cc76ef0ba188af011d208001ee/LICENSE) both state MIT. If implementation copies or substantially adapts code, retain the applicable copyright and permission notice with the project and record source repository, commit, file and destination in `docs/third-party.md`. Check any file-specific notice before reuse. This review does not establish rights for every separately sourced art or audio asset.

For each borrowed pattern, the implementing agent should write one short entry: what was read, which behaviour is useful, what we changed for our architecture, where it is implemented and which lab scenario demonstrates it. Reference repositories are evidence to reason from, not specifications that overrule this plan.
