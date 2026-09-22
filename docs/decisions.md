# Decisions

Short entries, only for things actually decided. See `docs/experiments.md`
(from Phase 8 onward) for gameplay experiments.

## Phase 1

**Renamed `packages/colyseus-contract` to `packages/server-runtime`, and
moved `apps/server/src/app.config.ts` into it.**
Why: the plan's package table gives `server-runtime` the job of owning "the
Colyseus room implementation, actual server definition, sessions and bot
orchestration," with a narrow `/contract` type-only export — not a package
that only holds room classes while the real `defineServer(...)` stays in
`apps/server`. The pre-existing `colyseus-contract` package already did the
"room lives in a package, client imports its type only" half of this; moving
`app.config.ts` in completes it, and is what makes
`client.joinOrCreate("arena")` (no explicit `<Arena>` generic) type-check the
room name against the server's real definitions instead of trusting a
hand-passed type argument.

**Removed `packages/jev` (uncommitted Cloudflare-`ai/run`-based decision
engine sketch) instead of adapting it.**
Why: it predates `Jev_Game_Implementation_Plan.md` and doesn't match its
Phase 7 design (TypeSafe's Choice/Score/Noul primitives, a different
provider contract, different file layout). It was also unreferenced by any
other code and was the sole reason `pnpm lint` failed repo-wide. Handled by
first committing the working baseline (so the sketch stays recoverable in
git history) per the user's explicit choice, then deleting it. Phase 7 will
build the real thing from the plan's spec, not from this leftover.

**Compiled workspace packages, not source-only `exports`.**
Why: `apps/server`'s `tsc` build was already broken for production use
before this phase — `node dist/index.js` couldn't resolve
`@jev-game/shared` / `@jev-game/colyseus-contract`, both of which exported
raw `.ts` source. Section 5 of the plan specifies exactly this fix
(`dist/`-pointing `exports`, dependency-ordered builds). Verified rather
than assumed: a real `node dist/index.js` now serves `/hi` and `/api/hello`;
before the fix it threw `ERR_MODULE_NOT_FOUND` immediately. See
`docs/architecture.md` for the mechanics (typecheck/build ordering, watch
mode, the `noImplicitOverride` fallout).

**Enforced the app/package import boundary with `oxlint` `overrides`, not
just convention.**
Why: the plan calls for "client lint rules [that] permit only a type import
from `/contract`" — a real, ongoing guarantee needs a linter rule, not a
comment. `no-restricted-imports` (already available in this oxlint version)
blocks `apps/client` from importing the bare `@jev-game/server-runtime`
specifier (only `/contract` is allowed) and blocks both `apps/client` and
`apps/server` from importing each other via relative paths.

**Left `apps/server`'s test and loadtest scripts in `apps/server`, only
updating their imports.**
Why: moving them into `packages/server-runtime` would be a bigger diff for
no behavioral gain in Phase 1 — apps are allowed to import types/values from
packages (that's normal), just not from each other. Revisit only if
`server-runtime` grows its own test suite independent of `apps/server`.
