import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function newestSourceTime(directory: string): number {
  let newest = 0;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      newest = Math.max(newest, newestSourceTime(path));
    } else if (entry.name.endsWith(".ts")) {
      newest = Math.max(newest, statSync(path).mtimeMs);
    }
  }

  return newest;
}

export function stalePackages(repositoryRoot: string, packageNames: readonly string[]): string[] {
  const stale: string[] = [];

  for (const name of packageNames) {
    const sourceDirectory = join(repositoryRoot, "packages", name, "src");
    const builtEntry = join(repositoryRoot, "packages", name, "dist", "index.js");

    if (!existsSync(builtEntry) || newestSourceTime(sourceDirectory) > statSync(builtEntry).mtimeMs) {
      stale.push(name);
    }
  }

  return stale;
}
