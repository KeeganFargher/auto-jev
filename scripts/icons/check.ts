import { checkIcons, listRuntimeIcons } from "./assets.js";

const requested = new Set(process.argv.slice(2));

const files = listRuntimeIcons().filter((file) => requested.size === 0 || requested.has(file.id));

if (!checkIcons(files)) {
  process.exitCode = 1;
}
