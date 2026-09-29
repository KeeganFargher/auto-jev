import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const SIM_SOURCES = ["packages/game/src", "packages/content/src"];

const OUTPUT = "packages/protocol/src/sim-hash.ts";

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(join(root, directory), { recursive: true, withFileTypes: true });

  return entries.flatMap((entry) =>
    entry.isFile()
      ? [relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/")]
      : [],
  );
}

const files = SIM_SOURCES.flatMap(sourceFiles).sort();

if (files.length === 0) {
  throw new Error(`No simulation sources under ${SIM_SOURCES.join(", ")}`);
}

const hash = createHash("sha256");

for (const file of files) {
  hash.update(`${file}\0`);
  hash.update(`${readFileSync(join(root, file), "utf8").replaceAll("\r\n", "\n")}\0`);
}

const simHash = hash.digest("hex");

const source = `export const SIM_HASH = "${simHash}";\n`;

const outputPath = join(root, OUTPUT);

if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== source) {
  writeFileSync(outputPath, source);
}

console.log(`Sim hash ${simHash.slice(0, 12)} over ${files.length} files`);
