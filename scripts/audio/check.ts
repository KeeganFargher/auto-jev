import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { MUSIC, SOUNDS } from "../../apps/client/src/audio/catalogue.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const PUBLIC_ROOT = join(REPO_ROOT, "apps", "client", "public");

const AUDIO_ROOT = join(PUBLIC_ROOT, "assets", "audio");

function listAudioFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);

    if (entry.isDirectory()) {
      return listAudioFiles(path);
    }

    return entry.name.endsWith(".mp3") ? [path] : [];
  });
}

const problems: string[] = [];

const entries: [string, { url: string }][] = [...Object.entries(SOUNDS), ...Object.entries(MUSIC)];

const referenced = new Set<string>();

for (const [id, definition] of entries) {
  const path = join(PUBLIC_ROOT, definition.url);
  referenced.add(path);

  if (!existsSync(path)) {
    problems.push(`"${id}" points at a missing file: ${definition.url}`);
  }
}

for (const path of listAudioFiles(AUDIO_ROOT)) {
  if (!referenced.has(path)) {
    problems.push(`${relative(REPO_ROOT, path)} is not used by any sound or music entry`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`✗ ${problem}`);
  }

  process.exitCode = 1;
} else {
  console.log(`✓ ${entries.length} audio files present`);
}
