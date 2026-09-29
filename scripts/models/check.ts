import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gameCatalogue } from "@jev-game/content";
import type { SignatureKind } from "@jev-game/game";
import {
  BODIES,
  BODY_IDS,
  CLIP_NAMES,
  CLIPS_URL,
  HERO_MODELS,
  MODELS_ROOT,
  POSED_CLIPS,
  PROP_IDS,
  PROPS,
  RIG_BONES,
  SHARED_CUES,
  TEXTURE_IDS,
  TEXTURES,
} from "../../apps/client/src/game/models/catalogue.js";
import type { GestureCue, ModelFile } from "../../apps/client/src/game/models/catalogue.js";
import { readGltf, requireAccessor } from "./gltf.js";
import type { GltfDocument } from "./gltf.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const PUBLIC_ROOT = join(REPO_ROOT, "apps", "client", "public");

const OUTPUT_ROOT = join(PUBLIC_ROOT, MODELS_ROOT);

const KIB = 1024;

const BODY_BUDGET = 600 * KIB;

const PROP_BUDGET = 100 * KIB;

const TEXTURE_BUDGET = 64 * KIB;

const CLIPS_BUDGET = 1536 * KIB;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const THROWING_SIGNATURES: ReadonlySet<SignatureKind> = new Set(["rampage"]);

const RIG_BONE_NAMES: ReadonlySet<string> = new Set(RIG_BONES);

const problems: string[] = [];

const expectedFiles = new Set<string>();

function kib(bytes: number): string {
  return `${(bytes / KIB).toFixed(1)} KB`;
}

function listFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);

    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function presentWithinBudget(url: string, budget: number): boolean {
  const path = join(PUBLIC_ROOT, url);
  expectedFiles.add(path);

  if (!existsSync(path)) {
    problems.push(`${url} is missing; run pnpm models:import`);

    return false;
  }

  const size = statSync(path).size;

  if (size > budget) {
    problems.push(`${url} is ${kib(size)}, over its ${kib(budget)} budget`);
  }

  return true;
}

function checkUntextured(url: string, document: GltfDocument): void {
  if (
    document.json.images !== undefined ||
    document.json.textures !== undefined ||
    document.json.samplers !== undefined
  ) {
    problems.push(`${url} embeds images; textures must stay in ${MODELS_ROOT}/textures`);
  }
}

function checkMaterials(url: string, document: GltfDocument, file: ModelFile): void {
  const materials = document.json.materials ?? [];

  for (const material of materials) {
    const texture = material.extras?.["texture"];

    if (texture !== undefined && texture !== file.texture) {
      problems.push(
        `${url} material "${material.name}" names texture "${texture}", expected "${file.texture}"`,
      );
    }
  }

  if (!materials.some((material) => material.extras?.["texture"] === file.texture)) {
    problems.push(`${url} has no material painted with "${file.texture}"`);
  }
}

function checkBody(url: string, document: GltfDocument): void {
  const [skin, ...extraSkins] = document.json.skins ?? [];
  const nodes = document.json.nodes ?? [];

  if (skin === undefined || extraSkins.length > 0) {
    problems.push(`${url} must have exactly one skin`);

    return;
  }

  const jointNames = new Set(skin.joints.map((joint) => nodes[joint]?.name));

  if (jointNames.size !== RIG_BONES.length || RIG_BONES.some((bone) => !jointNames.has(bone))) {
    problems.push(`${url} skin does not bind exactly the Rig_Medium bones`);
  }

  for (const node of nodes) {
    if (node.mesh !== undefined && node.skin !== 0) {
      problems.push(`${url} mesh node "${node.name}" is not bound to the rig`);
    }
  }

  for (const mesh of document.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (
        primitive.attributes["JOINTS_0"] === undefined ||
        primitive.attributes["WEIGHTS_0"] === undefined
      ) {
        problems.push(`${url} mesh "${mesh.name}" has vertices without skin weights`);
      }
    }
  }

  if (document.json.animations !== undefined) {
    problems.push(`${url} carries animations; clips belong in ${CLIPS_URL}`);
  }
}

function checkProp(url: string, document: GltfDocument): void {
  if (document.json.skins !== undefined || document.json.animations !== undefined) {
    problems.push(`${url} is skinned or animated, which props must not be`);
  }

  if ((document.json.meshes ?? []).length !== 1) {
    problems.push(`${url} must hold exactly one mesh`);
  }
}

function clipDurations(document: GltfDocument): Map<string, number> {
  const nodes = document.json.nodes ?? [];
  const durations = new Map<string, number>();

  for (const animation of document.json.animations ?? []) {
    const name = animation.name ?? "(unnamed)";
    let duration = 0;

    for (const sampler of animation.samplers) {
      if ((sampler.interpolation ?? "LINEAR") !== "LINEAR") {
        problems.push(`${CLIPS_URL} clip "${name}" uses ${sampler.interpolation} interpolation`);
      }

      duration = Math.max(duration, requireAccessor(document, sampler.input).max?.[0] ?? 0);
    }

    for (const channel of animation.channels) {
      const target =
        channel.target.node === undefined ? undefined : nodes[channel.target.node]?.name;

      if (target === undefined || !RIG_BONE_NAMES.has(target)) {
        problems.push(
          `${CLIPS_URL} clip "${name}" animates "${target}", which is not a Rig_Medium bone`,
        );
      }
    }

    durations.set(name, duration);
  }

  const names = [...durations.keys()];

  if (names.join(",") !== CLIP_NAMES.join(",")) {
    problems.push(`${CLIPS_URL} holds [${names.join(", ")}], expected [${CLIP_NAMES.join(", ")}]`);
  }

  return durations;
}

function withPosedClips(packed: ReadonlyMap<string, number>): Map<string, number> {
  const durations = new Map(packed);

  for (const [name, keys] of Object.entries(POSED_CLIPS)) {
    const last = keys.at(-1);

    if (packed.has(name)) {
      problems.push(`Posed clip "${name}" shares its name with a packed clip`);
    }

    if (last === undefined) {
      problems.push(`Posed clip "${name}" has no keys`);

      continue;
    }

    for (const key of keys) {
      const duration = packed.get(key.clip);

      if (duration !== undefined && (key.sample < 0 || key.sample > duration)) {
        problems.push(
          `Posed clip "${name}" samples ${key.clip} at ${key.sample}s, outside its ${duration.toFixed(2)}s`,
        );
      }
    }

    durations.set(name, last.at);
  }

  return durations;
}

function checkGesture(
  label: string,
  cue: GestureCue,
  durations: ReadonlyMap<string, number>,
): void {
  const duration = durations.get(cue.clip);

  if (duration === undefined) {
    return;
  }

  if (cue.from < 0 || cue.from >= cue.strike || cue.strike > duration) {
    problems.push(
      `${label} needs 0 ≤ from < strike ≤ ${duration.toFixed(2)}s, got ${cue.from} → ${cue.strike}`,
    );
  }
}

function checkCues(durations: ReadonlyMap<string, number>): void {
  const used = new Set<string>();

  for (const [name, cue] of Object.entries(SHARED_CUES)) {
    used.add(cue.clip);
    const duration = durations.get(cue.clip);

    if (cue.speed <= 0) {
      problems.push(`Shared cue "${name}" must play forwards`);
    }

    if ("from" in cue && duration !== undefined && (cue.from < 0 || cue.from >= duration)) {
      problems.push(
        `Shared cue "${name}" starts at ${cue.from}s, outside ${cue.clip} (${duration.toFixed(2)}s)`,
      );
    }
  }

  for (const [heroId, model] of HERO_MODELS) {
    used.add(model.idle.clip);

    for (const [gesture, cue] of Object.entries(model.gestures)) {
      used.add(cue.clip);
      checkGesture(`${heroId} ${gesture}`, cue, durations);
    }
  }

  for (const [name, keys] of Object.entries(POSED_CLIPS)) {
    if (!used.has(name)) {
      problems.push(`Posed clip "${name}" is built but no cue plays it`);

      continue;
    }

    for (const key of keys) {
      used.add(key.clip);
    }
  }

  for (const clip of CLIP_NAMES) {
    if (!used.has(clip)) {
      problems.push(`Clip "${clip}" is packed but neither a cue nor a posed clip plays it`);
    }
  }
}

function checkHeroes(): void {
  const heroes = Object.values(gameCatalogue.heroes);
  const bodies = new Set<string>();
  const props = new Set<string>();

  for (const hero of heroes) {
    const model = HERO_MODELS.get(hero.id);

    if (model === undefined) {
      problems.push(`Hero "${hero.id}" has no model`);

      continue;
    }

    bodies.add(model.body);

    for (const mount of model.props) {
      props.add(mount.prop);
    }

    if (model.gestures.attack === undefined) {
      problems.push(`Hero "${hero.id}" has no attack gesture`);
    }

    if ((hero.signature !== null) !== (model.gestures.signature !== undefined)) {
      problems.push(
        `Hero "${hero.id}" signature gesture does not match whether it has a signature`,
      );
    }

    const throws = hero.signature !== null && THROWING_SIGNATURES.has(hero.signature.kind);

    if (throws !== (model.gestures.throw !== undefined)) {
      problems.push(`Hero "${hero.id}" throw gesture does not match whether its signature throws`);
    }
  }

  for (const heroId of HERO_MODELS.keys()) {
    if (!heroes.some((hero) => hero.id === heroId)) {
      problems.push(`Model for "${heroId}" has no hero in the catalogue`);
    }
  }

  for (const id of BODY_IDS) {
    if (!bodies.has(id)) {
      problems.push(`Body "${id}" is imported but no hero wears it`);
    }
  }

  for (const id of PROP_IDS) {
    if (!props.has(id)) {
      problems.push(`Prop "${id}" is imported but no hero holds it`);
    }
  }
}

for (const id of BODY_IDS) {
  const file = BODIES[id];

  if (presentWithinBudget(file.url, BODY_BUDGET)) {
    const document = readGltf(join(PUBLIC_ROOT, file.url));
    checkUntextured(file.url, document);
    checkMaterials(file.url, document, file);
    checkBody(file.url, document);
  }
}

for (const id of PROP_IDS) {
  const file = PROPS[id];

  if (presentWithinBudget(file.url, PROP_BUDGET)) {
    const document = readGltf(join(PUBLIC_ROOT, file.url));
    checkUntextured(file.url, document);
    checkMaterials(file.url, document, file);
    checkProp(file.url, document);
  }
}

const paintedTextures = new Set([
  ...BODY_IDS.map((id) => BODIES[id].texture),
  ...PROP_IDS.map((id) => PROPS[id].texture),
]);

for (const id of TEXTURE_IDS) {
  const url = TEXTURES[id];

  if (!paintedTextures.has(id)) {
    problems.push(`Texture "${id}" is imported but nothing is painted with it`);
  }

  if (
    presentWithinBudget(url, TEXTURE_BUDGET) &&
    !readFileSync(join(PUBLIC_ROOT, url)).subarray(0, 8).equals(PNG_SIGNATURE)
  ) {
    problems.push(`${url} is not a PNG`);
  }
}

if (presentWithinBudget(CLIPS_URL, CLIPS_BUDGET)) {
  const clips = readGltf(join(PUBLIC_ROOT, CLIPS_URL));
  checkUntextured(CLIPS_URL, clips);
  checkCues(withPosedClips(clipDurations(clips)));
}

checkHeroes();

if (existsSync(OUTPUT_ROOT)) {
  for (const path of listFiles(OUTPUT_ROOT)) {
    if (!expectedFiles.has(path)) {
      problems.push(`${relative(REPO_ROOT, path)} is not in the model catalogue`);
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`✗ ${problem}`);
  }

  process.exitCode = 1;
} else {
  console.log(`✓ ${expectedFiles.size} model files match the catalogue`);
}
