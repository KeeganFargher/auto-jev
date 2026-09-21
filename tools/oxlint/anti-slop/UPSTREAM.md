# Vendored anti-slop Oxlint plugin

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`.

Installed via the repository's bundled `skills/install-anti-slop/scripts/install.mjs`, which copies `skills/install-anti-slop/assets/anti-slop` verbatim to `tools/oxlint/anti-slop/`.

Installed plugin paths:

- `tools/oxlint/anti-slop/index.ts` — generic plugin entry point, registered in [oxlint.config.ts](../../../oxlint.config.ts) as `jsPlugins: [{ name: "anti-slop", ... }]`.
- `tools/oxlint/anti-slop/effect/index.ts` — Effect-specific plugin, **not registered**. This repository has no direct `effect` dependency; only install this if one is added or a maintainer explicitly asks for it.

No intentional deviations from upstream. Nested `vendor/eslint-stylistic/UPSTREAM.md` and `vendor/eslint-stylistic/LICENSE` are preserved unmodified alongside this file.

## Dependencies

`@oxlint/plugins@1.83.0` installed as a workspace-root dev dependency, pinned exactly to match the repository's installed `oxlint@1.83.0` (not upstream's own `1.78.0`, per the install skill's instruction to match the target repo rather than the source's `package.json`).

## Environment note

`oxlint.config.ts` is a TypeScript config file. Oxlint 1.83.0 requires Node.js `^20.19.0 || >=22.18.0` with native type-stripping to load it. This machine's default `nvm` Node (`20.19.0`, alias `default -> 20`) does not support `--experimental-strip-types` and fails with `Unknown file extension ".ts"`. Lint was verified working under `nvm exec 24.5.0` (also available locally: `23.1.0`, `25.9.0`). Anyone running `pnpm lint` under the default Node 20 toolchain will get a hard config-load error, not a silent no-op — but it needs a Node >=22.18 (or a working `--experimental-strip-types` build of 20.19.0) to run at all.

## Updating

Follow `skills/install-anti-slop/references/update.md` (copied alongside this skill) or the source repository's own instructions. Run the target repository's lint and typecheck after any update.
