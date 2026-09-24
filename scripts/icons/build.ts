import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { checkIcons, listRuntimeIcons, listSources, readPngInfo, repoPath, runtimePath } from "./assets.js";
import { ALPHA_QUALITY, KIND_CONTRACTS, WEBP_QUALITY } from "./contract.js";

function findCwebp(): string {
  const configured = process.env["CWEBP_PATH"];

  if (configured !== undefined && existsSync(configured)) {
    return configured;
  }

  const located = spawnSync("which", ["cwebp"], { encoding: "utf8" });
  const path = located.stdout.trim();

  if (located.status === 0 && path !== "") {
    return path;
  }

  throw new Error("cwebp not found; install libwebp (brew install webp) or set CWEBP_PATH");
}

const requested = new Set(process.argv.slice(2));

const sources = listSources().filter((source) => requested.size === 0 || requested.has(source.id));

if (sources.length === 0) {
  console.error(requested.size === 0 ? "no .png masters under art/icons" : `no art/icons master named ${[...requested].join(", ")}`);
  process.exit(1);
}

const cwebp = findCwebp();

let failed = false;

for (const source of sources) {
  const master = readPngInfo(source.path);
  const contract = KIND_CONTRACTS[source.kind];

  if (master === null || master.width !== master.height || master.width < contract.runtimeSize || !master.alpha) {
    failed = true;
    console.log(`✗ ${repoPath(source.path)}: ${source.kind} masters must be square PNGs with alpha, ${contract.masterSize} px recommended`);
    continue;
  }

  const output = runtimePath(source.kind, source.id);
  mkdirSync(dirname(output), { recursive: true });

  const size = String(contract.runtimeSize);

  const run = spawnSync(
    cwebp,
    ["-quiet", "-q", String(WEBP_QUALITY), "-alpha_q", String(ALPHA_QUALITY), "-m", "6", "-metadata", "none", "-resize", size, size, source.path, "-o", output],
    { encoding: "utf8" },
  );

  if (run.status !== 0) {
    failed = true;
    console.log(`✗ ${repoPath(source.path)}: cwebp failed\n${run.stderr}`);
    continue;
  }

  console.log(`built ${repoPath(source.path)} → ${repoPath(output)}`);
}

console.log("");

const built = new Set(sources.map((source) => source.id));

if (!checkIcons(listRuntimeIcons().filter((file) => requested.size === 0 || built.has(file.id))) || failed) {
  process.exitCode = 1;
}
