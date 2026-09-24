import { checkModels, listRuntimeModels } from "./assets.js";

const requested = new Set(process.argv.slice(2));

const files = listRuntimeModels().filter((file) => requested.size === 0 || requested.has(file.id));

if (!(await checkModels(files))) {
  process.exitCode = 1;
}
