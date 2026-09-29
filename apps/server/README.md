# Server

This app only starts and stops the process. The server definition (the `match` room,
`defineServer(...)`, `/monitor` and `/playground`) lives in
[`packages/server-runtime`](../../packages/server-runtime). That package can then give the client
a type-only `/contract` export without pulling `colyseus` into the browser bundle. The browser client
is [`apps/client`](../client).

## Usage

```
pnpm build
pnpm --filter @jev-game/server start
```

`pnpm dev` from the repo root builds every package, then watches them all. It runs the client
and this server (port 2567) together. Outside production, http://localhost:2567/playground and
`/monitor` are served too.

Build the whole workspace with `pnpm build`, not only this app. Every package it runs on
(`game`, `content`, `run`, `protocol`, `jev`, `server-runtime`) is consumed from its own `dist/`.

## The match room

- There are eight seats. The first human to join hosts, and the host starts the match. A `solo`
  room starts as soon as its one human joins. Bots hold every seat without a human.
- Joining sends `protocolVersion` and `simHash`. The client replays battles itself, so a client
  whose protocol or simulation differs from the server's is refused with 4426. Other refusals:
  4403 once the match has started, and 4409 when every seat is taken.
- The phases are draft, then preparing and round-result repeating until the run is finished. Draft
  and preparing have deadlines. When one passes, every seat that hasn't decided gets the fallback
  command: its selection topped up at random, or the formation it already has.
- A round-result is held while the battles play out. The hold ends early once every connected
  human has sent `watched`.
- A dropped client keeps its seat for 30 seconds. After that the seat is forfeited, and it is
  eliminated at the next settlement.

### Jev seats

When a Jev provider is configured (see `.env.example`), bot seats become Jev seats. Jev drafts
their teams one pick at a time, and they place their heroes like the baseline bots do. Without a
provider, bot seats play the baseline bot. `JEV_PROVIDER=offline` uses a local stub that picks at
random. It is labelled "Stub", never "Jev".

## Scripts

- `pnpm --filter @jev-game/server dev`: watch mode, also watching every package's `dist/`
- `pnpm --filter @jev-game/server start`: run `dist/index.js` (run `pnpm build` first)
- `pnpm --filter @jev-game/server test`: build the packages, then run the mocha room tests
- `pnpm --filter @jev-game/server typecheck`: check `src` and `test`

## Files

- `src/index.ts`: calls `listen()` on server-runtime's `defineServer(...)` result
- `test/match.test.ts`: boots the real server and plays real clients against it
- `ecosystem.config.cjs`: pm2 configuration, used when deploying to Colyseus Cloud
