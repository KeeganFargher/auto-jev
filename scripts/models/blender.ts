import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export interface BlenderRun {
  ok: boolean;
  output: string;
}

const MAC_BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender";

export function findBlender(): string {
  const configured = process.env["BLENDER_PATH"];

  if (configured !== undefined && existsSync(configured)) {
    return configured;
  }

  if (existsSync(MAC_BLENDER)) {
    return MAC_BLENDER;
  }

  const located = spawnSync("which", ["blender"], { encoding: "utf8" });
  const path = located.stdout.trim();

  if (located.status === 0 && path !== "") {
    return path;
  }

  throw new Error("Blender not found; install Blender 5.2 or set BLENDER_PATH");
}

export function runBlender(blender: string, args: readonly string[]): BlenderRun {
  const run = spawnSync(blender, ["--background", "--factory-startup", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  return { ok: run.status === 0, output: `${run.stdout}${run.stderr}` };
}

export function markedLines(output: string, marker: string): string[] {
  return output.split("\n").flatMap((line) => (line.startsWith(marker) ? [line.slice(marker.length).trim()] : []));
}
