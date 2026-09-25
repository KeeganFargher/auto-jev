import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gameCatalogue } from "@jev-game/content";
import type { PassiveDefinition } from "@jev-game/game";
import { MUSIC, SOUNDS } from "../../apps/client/src/audio/catalogue.js";
import {
  ABILITY_SOUNDS,
  abilitySounds,
  EMITTER_SOUNDS,
  FORM_SOUNDS,
  PASSIVE_SOUNDS,
  REACTION_SOUNDS,
  REVIVE_SOUNDS,
  SILENT_SHIELDS,
  UNIT_SOUNDS,
  UPGRADE_IMPACT_SOUNDS,
} from "../../apps/client/src/audio/sound-map.js";
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

function formKeysOf(passives: readonly PassiveDefinition[]): string[] {
  return passives.flatMap((passive) => {
    if (passive.kind === "stacks" && passive.atMax?.form !== undefined) {
      return [passive.atMax.form.key];
    }

    if (passive.kind === "revive" && passive.form !== undefined) {
      return [passive.form.key];
    }

    return [];
  });
}

function passiveNamesOf(passives: readonly PassiveDefinition[]): string[] {
  return passives.flatMap((passive) => ("key" in passive ? [passive.kind, passive.key] : [passive.kind]));
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

  if (abilitySounds(abilityId)?.zone !== undefined && abilities.find((ability) => ability.id === abilityId)?.zone === undefined) {
    problems.push(`ABILITY_SOUNDS gives "${abilityId}" a zone sound, but it leaves no zone`);
  }
}

for (const heroId of [...Object.keys(HERO_LINES), ...Object.keys(UNIT_SOUNDS)]) {
  if (!Object.hasOwn(gameCatalogue.heroes, heroId)) {
    problems.push(`"${heroId}" has sounds or voice lines but is not a hero in the catalogue`);
  }
}

const upgrades = Object.values(gameCatalogue.upgrades);

for (const override of UPGRADE_IMPACT_SOUNDS) {
  const upgrade = upgrades.find((candidate) => candidate.id === override.upgradeId);

  if (upgrade?.abilityChanges?.some((change) => change.abilityId === override.abilityId) !== true) {
    problems.push(`UPGRADE_IMPACT_SOUNDS maps "${override.upgradeId}", which is not an upgrade that changes "${override.abilityId}"`);
  }
}

for (const upgradeId of Object.keys(REVIVE_SOUNDS)) {
  const upgrade = upgrades.find((candidate) => candidate.id === upgradeId);

  if (upgrade?.grantsPassives?.some((passive) => passive.kind === "revive") !== true) {
    problems.push(`REVIVE_SOUNDS maps "${upgradeId}", which is not an upgrade that grants a revive`);
  }
}

for (const abilityId of Object.keys(EMITTER_SOUNDS)) {
  const emits =
    abilities.some((ability) => ability.id === abilityId && ability.emitter !== undefined) ||
    upgrades.some((upgrade) => upgrade.abilityChanges?.some((change) => change.abilityId === abilityId && change.setEmitter !== undefined) === true);

  if (!emits) {
    problems.push(`EMITTER_SOUNDS maps "${abilityId}", which is not an ability that has or gains an emitter`);
  }
}

const passiveNames = new Set([
  ...Object.values(gameCatalogue.heroes).flatMap((hero) => passiveNamesOf(hero.passives ?? [])),
  ...upgrades.flatMap((upgrade) => passiveNamesOf(upgrade.grantsPassives ?? [])),
]);

for (const passive of Object.keys(PASSIVE_SOUNDS)) {
  if (!passiveNames.has(passive)) {
    problems.push(`PASSIVE_SOUNDS maps "${passive}", which is not a passive in the catalogue`);
  }
}

for (const passive of Object.keys(REACTION_SOUNDS)) {
  if (!passiveNames.has(passive)) {
    problems.push(`REACTION_SOUNDS maps "${passive}", which is not a passive in the catalogue`);
  }
}

for (const shieldId of SILENT_SHIELDS) {
  if (!passiveNames.has(shieldId) && !Object.hasOwn(gameCatalogue.abilities, shieldId)) {
    problems.push(`SILENT_SHIELDS lists "${shieldId}", which is neither a passive nor an ability in the catalogue`);
  }
}

const formKeys = new Set([
  ...abilities.flatMap((ability) => (ability.form === undefined ? [] : [ability.form.key])),
  ...Object.values(gameCatalogue.heroes).flatMap((hero) => formKeysOf(hero.passives ?? [])),
  ...upgrades.flatMap((upgrade) => [
    ...formKeysOf(upgrade.grantsPassives ?? []),
    ...(upgrade.passiveChanges ?? []).flatMap((change) => (change.stacks.atMax?.form === undefined ? [] : [change.stacks.atMax.form.key])),
    ...(upgrade.abilityChanges ?? []).flatMap((change) => (change.setForm === undefined ? [] : [change.setForm.key])),
  ]),
]);

for (const key of Object.keys(FORM_SOUNDS)) {
  if (!formKeys.has(key)) {
    problems.push(`FORM_SOUNDS maps "${key}", which is not a form in the catalogue`);
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
