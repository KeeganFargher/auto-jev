import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" }],
  overrides: [
    {
      files: ["apps/client/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@jev-game/server-runtime",
                message:
                  'Import types only from "@jev-game/server-runtime/contract" — the package root pulls in server runtime code.',
              },
              {
                name: "@jev-game/jev",
                message: "Jev runs on the server only; its provider credentials must never reach the browser bundle.",
              },
            ],
            patterns: [
              {
                regex: "(^|/)apps/server(/|$)",
                message: "apps/client must not import apps/server.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["apps/server/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "(^|/)apps/client(/|$)",
                message: "apps/server must not import apps/client.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/game/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              "fs",
              "path",
              "http",
              "https",
              "net",
              "crypto",
              "os",
              "child_process",
              "util",
              "stream",
              "events",
              "url",
              "querystring",
              "zlib",
              "tls",
              "dns",
              "readline",
              "assert",
              "colyseus",
            ].map((name) => ({
              name,
              message: "packages/game must stay pure — no Node built-ins or Colyseus.",
            })),
            patterns: [
              {
                regex: "^node:",
                message: "packages/game must stay pure — no Node built-ins.",
              },
              {
                regex: "^@colyseus/",
                message: "packages/game must stay pure — no Colyseus.",
              },
              {
                regex: "^@jev-game/",
                message:
                  "packages/game must stay pure — no workspace imports (allowed workspace imports: none).",
              },
            ],
          },
        ],
      },
    },
  ],
  rules: {
    curly: ["error", "all"],
    "oxc/no-accumulating-spread": "error",
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
});
