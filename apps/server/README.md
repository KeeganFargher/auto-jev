# Welcome to Colyseus!

This project was bootstrapped with [⚔️ `create-colyseus-app`](https://github.com/colyseus/create-colyseus-app/)
and then split apart further. This app is the **environment/startup wrapper
only** — process start and shutdown. The actual server definition (rooms,
routes, `defineServer(...)`) lives in
[`packages/server-runtime`](../../packages/server-runtime), so it can expose
a type-only `/contract` export to the client without pulling the `colyseus`
framework into the browser bundle. The browser client lives in
[`apps/client`](../client), a separate Vite project, and code both sides need
lives in [`packages/shared`](../../packages/shared).

[Documentation](https://docs.colyseus.io/)

## :crossed_swords: Usage

```
pnpm build
pnpm --filter @jev-game/server start
```

Then open http://localhost:2567/playground for the playground, or /monitor for
the monitor. `/` itself is a 404 — there is no client to serve from here.

## Structure

- `src/index.ts`: entry point — calls `listen()` on the server-runtime's `defineServer(...)` result
- `test/Arena.test.ts`: boots the real server and connects a real client
- `loadtest/example.ts`: scriptable client for `npm run loadtest`
- `ecosystem.config.cjs`: pm2 configuration, used when deploying to Colyseus Cloud

Room handlers, `app.config.ts` and the client-facing type contract live in
[`packages/server-runtime/src`](../../packages/server-runtime/src).

## Scripts

- `npm run dev`: run the server in watch mode (`tsx watch src/index.ts`, also watching server-runtime/shared's compiled output)
- `npm start`: run the production build (`node dist/index.js`) — run `pnpm build` first
- `npm test`: run the mocha test suite
- `npm run build`: `tsc` to `dist/`
- `npm run loadtest`: connect N simulated clients with [`@colyseus/loadtest`](https://github.com/colyseus/colyseus-loadtest/)

## What's included

### Monorepo layout

This follows `create-colyseus-app --layout monorepo`, extended with a
compiled-workspace-packages build (see `Jev_Game_Implementation_Plan.md`
section 5 at the repo root): `packages/shared` and `packages/server-runtime`
each emit ESM + declarations to their own `dist/`, and their `package.json`
`exports` point there. This app's `tsc` output is then plain compiled JS with
relative `.js` specifiers that `node dist/index.js` can run directly — no
bundler needed on this side. The frontend imports the backend's _types_ (not
its code) via `packages/server-runtime`'s `./contract` export, a `workspace:*`
devDependency with no `"import"` condition. `packages/shared` is added on top
for the one thing the vanilla layout doesn't need: real code (not just types)
shared by both sides — see "Fixed tick + client prediction".

### Production build

Run `pnpm build` from the repo root (or `pnpm -r --if-present build`): it
builds `packages/shared` and `packages/server-runtime` to their `dist/`
directories before this app's own `tsc`, since pnpm's recursive commands
follow the workspace dependency graph. Skipping straight to `pnpm --filter
@jev-game/server build` on a clean checkout will fail to resolve
`@jev-game/shared` / `@jev-game/server-runtime` at runtime — build the
workspace, not just this app.

Express runs in the same process as this app (owned by
`packages/server-runtime/src/app.config.ts`), so the playground lives at
`/playground` next to `/monitor`.

- https://docs.colyseus.io/server/api

### Fixed tick + client prediction

The room advances on `setFixedTimestep()`: a framework-owned accumulator runs
`step()` a whole number of times per frame, each advancing exactly `1/TICK_RATE`
seconds. A constant `dt` is what makes the client able to replay the same steps
— with `setTimestep()`'s measured delta it could not.

`defineInput(MoveInput, …)` gives each client a server-side input buffer.
`sanitize` clamps every field as it arrives, because nothing off the wire is
trustworthy. The input schema is deliberately flat and carries no `seq`, no `dt`
and no timestamp: the engine's own counter is the sequence, one input advances
exactly one step, and the SDK stamps lag-comp timing on the wire envelope.

`packages/shared/src/movement.ts` holds the one function both sides run. It is
typed structurally so the same code steps a server Schema instance and the
client reconciler's plain predicted copy, and it is pure — no clocks, no
randomness, no reads outside its arguments. Keep it that way, or prediction
and server will disagree. Both `apps/server` and `apps/client` depend on it as
`@jev-game/shared` (`workspace:*`).

For the client-side half of this contract — the reconciler that replays
`stepEntity` on rollback — see `apps/client` and the netcode guide:

- https://docs.colyseus.io/netcode/server-input
- https://docs.colyseus.io/netcode/client-prediction

### Lobby room

A `LobbyRoom` is registered as `lobby`, and the sample room is chained with
`.enableRealtimeListing()` so the lobby receives create/update/dispose events for
it. Clients join the lobby to render a live room browser:

```ts
const lobby = await client.joinOrCreate("lobby");
lobby.onMessage("rooms", (rooms) => {
  /* full list on join */
});
lobby.onMessage("+", ([roomId, room]) => {
  /* added or updated */
});
lobby.onMessage("-", (roomId) => {
  /* removed */
});
```

- https://docs.colyseus.io/matchmaker/lobby

### Reconnection

`Arena.onDrop()` holds a dropped client's seat for 30 seconds via
`allowReconnection()`. The SDK retries automatically with exponential backoff;
`onReconnect()` fires if it gets back in time, `onLeave()` if it does not.

- https://docs.colyseus.io/room/reconnection
