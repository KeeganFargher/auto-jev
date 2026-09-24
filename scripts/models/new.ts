import { join } from "node:path";
import { REPO_ROOT } from "./assets.js";
import { findBlender, markedLines, runBlender } from "./blender.js";
import { MODEL_KINDS, isModelKind } from "./contract.js";

const [kind = "", id = ""] = process.argv.slice(2);

if (!isModelKind(kind) || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error(`usage: pnpm models:new <${MODEL_KINDS.join("|")}> <id>   (id in kebab-case, matching the game's id)`);
  process.exit(1);
}

const run = runBlender(findBlender(), ["--python", join(REPO_ROOT, "art", "pipeline", "new_asset.py"), "--", kind, id]);

const created = markedLines(run.output, "JEV_NEW ");

const errors = markedLines(run.output, "JEV_NEW_ERROR ");

if (!run.ok || errors.length > 0 || created.length === 0) {
  console.error(errors.length > 0 ? errors.join("\n") : run.output);
  process.exit(1);
}

console.log(`created ${created.join("")}`);

console.log(`model it inside the "${id}" collection, then run: pnpm models:build ${id}`);

console.log(`and add "${id}" to apps/client/src/models/catalogue.ts so the game loads it`);
