import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gameCatalogue } from "@jev-game/content";
import { MUSIC, SOUNDS } from "../../apps/client/src/audio/catalogue.js";
import { ABILITY_SOUNDS, abilitySounds, UNIT_SOUNDS } from "../../apps/client/src/audio/sound-map.js";
import { HERO_LINES, heroLines } from "../../apps/client/src/audio/voice-lines.js";

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

const abilities = Object.values(gameCatalogue.abilities);

const voicedHeroes = Object.values(gameCatalogue.heroes).filter((hero) => hero.archetype !== undefined);

for (const ability of abilities) {
  if (abilitySounds(ability.id) === undefined) {
    problems.push(`ability "${ability.id}" has no entry in ABILITY_SOUNDS (apps/client/src/audio/sound-map.ts)`);
  }
}

for (const hero of voicedHeroes) {
  if (heroLines(hero.id) === undefined) {
    problems.push(`hero "${hero.id}" has no voice lines in HERO_LINES (apps/client/src/audio/voice-lines.ts)`);
  }
}

for (const abilityId of Object.keys(ABILITY_SOUNDS)) {
  if (!Object.hasOwn(gameCatalogue.abilities, abilityId)) {
    problems.push(`ABILITY_SOUNDS has an entry for "${abilityId}", which is not in the catalogue`);
  }
}

for (const heroId of [...Object.keys(HERO_LINES), ...Object.keys(UNIT_SOUNDS)]) {
  if (!Object.hasOwn(gameCatalogue.heroes, heroId)) {
    problems.push(`"${heroId}" has sounds or voice lines but is not a hero in the catalogue`);
  }
}

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
  console.log(`✓ ${abilities.length} abilities mapped, ${voicedHeroes.length} heroes voiced, ${entries.length} audio files present`);
}
