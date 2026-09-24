import { join } from "node:path";
import { REPO_ROOT, checkModels, listSources, repoPath, runtimePath, type AssetFile } from "./assets.js";
import { findBlender, markedLines, runBlender } from "./blender.js";

const EXPORT_SCRIPT = join(REPO_ROOT, "art", "pipeline", "export.py");

const requested = new Set(process.argv.slice(2));

const sources = listSources().filter((source) => requested.size === 0 || requested.has(source.id));

if (sources.length === 0) {
  console.error(
    requested.size === 0 ? "no .blend files under art/models" : `no art/models file named ${[...requested].join(", ")}`,
  );
  process.exit(1);
}

const blender = findBlender();

const built: AssetFile[] = [];

let failed = false;

for (const source of sources) {
  const output = runtimePath(source.kind, source.id);
  process.stdout.write(`exporting ${repoPath(source.path)} → ${repoPath(output)} … `);
  const run = runBlender(blender, [source.path, "--python", EXPORT_SCRIPT, "--", output]);
  const errors = markedLines(run.output, "JEV_EXPORT_ERROR ");

  if (!run.ok || errors.length > 0 || markedLines(run.output, "JEV_EXPORT ").length === 0) {
    failed = true;
    console.log("failed");
    console.log(errors.length > 0 ? errors.join("\n") : run.output.split("\n").slice(-20).join("\n"));
    continue;
  }

  console.log("done");
  built.push({ kind: source.kind, id: source.id, path: output });
}

console.log("");

if (!(await checkModels(built)) || failed) {
  process.exitCode = 1;
}
