import {
  AnimationClip,
  Box3,
  Euler,
  InterpolateLinear,
  Mesh,
  MeshStandardMaterial,
  PropertyBinding,
  Quaternion,
  QuaternionKeyframeTrack,
  SkinnedMesh,
  VectorKeyframeTrack,
  type KeyframeTrack,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { HeroDefinitionId } from "@jev-game/game";
import {
  BODIES,
  CLIP_NAMES,
  CLIPS_URL,
  HAND_SLOTS,
  HERO_MODELS,
  POSED_CLIPS,
  PROPS,
  RIG_BONES,
  TEXTURE_IDS,
  type BodyId,
  type BoneTriple,
  type ClipName,
  type HeroModel,
  type PoseKey,
  type PropId,
  type RigBone,
  type TextureId,
  type TintRule,
} from "./catalogue.js";

export interface ModelSource {
  bytes(url: string): Promise<ArrayBuffer>;
  texture(id: TextureId, tint: readonly TintRule[]): Promise<Texture>;
}

export interface HeroTemplate {
  readonly model: HeroModel;
  readonly scene: Object3D;
  readonly height: number;
}

interface TextureRequest {
  readonly id: TextureId;
  readonly tint: readonly TintRule[];
}

type TrackKind = "rotation" | "vector";

interface SampledTrack {
  readonly kind: TrackKind;
  readonly value: number[];
}

type Pose = Map<string, SampledTrack>;

export interface ModelLibrary {
  template(heroId: HeroDefinitionId): HeroTemplate;
  clip(name: ClipName): AnimationClip;
}

let installed: ModelLibrary | null = null;

export function installModelLibrary(library: ModelLibrary): void {
  installed = library;
}

export function installedModelLibrary(): ModelLibrary {
  if (installed === null) {
    throw new Error("Hero models have not finished loading");
  }

  return installed;
}

export function boneName(bone: string): string {
  return PropertyBinding.sanitizeNodeName(bone);
}

const RIG_BONE_SET: ReadonlyMap<string, RigBone> = new Map(RIG_BONES.map((bone) => [bone, bone]));

function textureIdOf(material: Material): TextureId | null {
  const texture: unknown = material.userData["texture"];

  if (texture === undefined) {
    return null;
  }

  const id = TEXTURE_IDS.find((candidate) => candidate === texture);

  if (id === undefined) {
    throw new Error(`Material "${material.name}" names unknown texture "${String(texture)}"`);
  }

  return id;
}

function paint(root: Object3D, textureFor: (id: TextureId) => Texture): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }

    if (!(node.material instanceof MeshStandardMaterial)) {
      throw new Error(`Mesh "${node.name}" does not use a standard material`);
    }

    const id = textureIdOf(node.material);

    if (id === null) {
      return;
    }

    const painted = node.material.clone();
    painted.map = textureFor(id);
    node.material = painted;
  });
}

function modelHeight(body: Object3D): number {
  const bounds = new Box3();

  body.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) {
      return;
    }

    if (node.geometry.boundingBox === null) {
      throw new Error(`Skinned mesh "${node.name}" has no bounds`);
    }

    bounds.union(node.geometry.boundingBox);
  });

  if (bounds.isEmpty()) {
    throw new Error("Body has no skinned meshes");
  }

  return bounds.max.y - bounds.min.y;
}

function required<Key, Value>(entries: ReadonlyMap<Key, Value>, key: Key, what: string): Value {
  const value = entries.get(key);

  if (value === undefined) {
    throw new Error(`Missing ${what} "${String(key)}"`);
  }

  return value;
}

function trackKind(track: KeyframeTrack): TrackKind {
  if (track.getInterpolation() !== InterpolateLinear) {
    throw new Error(`Track "${track.name}" is not linearly interpolated, so it cannot be posed`);
  }

  if (track instanceof QuaternionKeyframeTrack) {
    return "rotation";
  }

  if (track instanceof VectorKeyframeTrack) {
    return "vector";
  }

  throw new Error(`Track "${track.name}" is neither a rotation nor a vector`);
}

function samplePose(clip: AnimationClip, time: number): Pose {
  if (time < 0 || time > clip.duration) {
    throw new Error(`Cannot sample "${clip.name}" at ${time}s, it lasts ${clip.duration}s`);
  }

  const pose: Pose = new Map();

  for (const track of clip.tracks) {
    const kind = trackKind(track);
    const value = Array.from(track.InterpolantFactoryMethodLinear().evaluate(time));
    pose.set(track.name, { kind, value });
  }

  return pose;
}

function posedTrack(pose: Pose, bone: RigBone, property: string, kind: TrackKind): string {
  const name = `${boneName(bone)}.${property}`;
  const track = pose.get(name);

  if (track === undefined || track.kind !== kind) {
    throw new Error(`No ${kind} track "${name}" to pose`);
  }

  return name;
}

function adjustments(
  entries: Readonly<Partial<Record<RigBone, BoneTriple>>>,
): [RigBone, BoneTriple][] {
  const found: [RigBone, BoneTriple][] = [];

  for (const [bone, triple] of Object.entries(entries)) {
    const rig = RIG_BONE_SET.get(bone);

    if (rig === undefined || triple === undefined) {
      throw new Error(`Pose adjusts unknown bone "${bone}"`);
    }

    found.push([rig, triple]);
  }

  return found;
}

function posedFrame(clips: ReadonlyMap<string, AnimationClip>, key: PoseKey): Pose {
  const pose = samplePose(required(clips, key.clip, "animation clip"), key.sample);
  const turn = new Quaternion();

  for (const [bone, [x, y, z]] of adjustments(key.turn)) {
    const name = posedTrack(pose, bone, "quaternion", "rotation");
    const rotation = new Quaternion().fromArray(required(pose, name, "track").value);
    rotation.multiply(turn.setFromEuler(new Euler(x, y, z)));
    pose.set(name, { kind: "rotation", value: rotation.toArray() });
  }

  for (const [bone, shift] of adjustments(key.shift)) {
    const name = posedTrack(pose, bone, "position", "vector");
    const moved = required(pose, name, "track").value.map((value, axis) => value + shift[axis]);
    pose.set(name, { kind: "vector", value: moved });
  }

  return pose;
}

function posedClip(
  name: string,
  keys: readonly PoseKey[],
  clips: ReadonlyMap<string, AnimationClip>,
): AnimationClip {
  const last = keys.at(-1);

  if (last === undefined || keys[0]?.at !== 0) {
    throw new Error(`Posed clip "${name}" must start with a key at 0s`);
  }

  for (let index = 1; index < keys.length; index += 1) {
    if (keys[index].at <= keys[index - 1].at) {
      throw new Error(`Posed clip "${name}" keys must move forward in time`);
    }
  }

  const poses = keys.map((key) => posedFrame(clips, key));
  const times = keys.map((key) => key.at);
  const tracks: KeyframeTrack[] = [];

  for (const [trackName, { kind }] of poses[0]) {
    if (!poses.every((pose) => pose.has(trackName))) {
      continue;
    }

    const values = poses.flatMap((pose) => required(pose, trackName, "track").value);

    tracks.push(
      kind === "rotation"
        ? new QuaternionKeyframeTrack(trackName, times, values)
        : new VectorKeyframeTrack(trackName, times, values),
    );
  }

  const kept = new Set(tracks.map((track) => track.name));

  for (const key of keys) {
    for (const [bone] of adjustments(key.turn)) {
      requireKept(kept, name, `${boneName(bone)}.quaternion`);
    }

    for (const [bone] of adjustments(key.shift)) {
      requireKept(kept, name, `${boneName(bone)}.position`);
    }
  }

  return new AnimationClip(name, last.at, tracks);
}

function requireKept(kept: ReadonlySet<string>, clip: string, track: string): void {
  if (!kept.has(track)) {
    throw new Error(`Posed clip "${clip}" drops "${track}" because not every key animates it`);
  }
}

export async function loadModelLibrary(source: ModelSource): Promise<ModelLibrary> {
  const loader = new GLTFLoader();
  const models = [...HERO_MODELS];

  const parse = async (url: string): Promise<GLTF> =>
    loader.parseAsync(await source.bytes(url), "");

  const bodyIds = [...new Set(models.map(([, model]) => model.body))];

  const propIds = [
    ...new Set(models.flatMap(([, model]) => model.props.map((mount) => mount.prop))),
  ];

  const textureRequests = new Map<string, TextureRequest>();

  const textureKey = (heroId: HeroDefinitionId, model: HeroModel, id: TextureId): string =>
    model.tint.length > 0 && id === BODIES[model.body].texture ? `${id}@${heroId}` : id;

  for (const [heroId, model] of models) {
    for (const id of [
      BODIES[model.body].texture,
      ...model.props.map((mount) => PROPS[mount.prop].texture),
    ]) {
      const key = textureKey(heroId, model, id);
      textureRequests.set(key, { id, tint: key === id ? [] : model.tint });
    }
  }

  const [bodies, props, clips, textures] = await Promise.all([
    Promise.all(bodyIds.map(async (id) => [id, await parse(BODIES[id].url)] as const)),
    Promise.all(propIds.map(async (id) => [id, await parse(PROPS[id].url)] as const)),
    parse(CLIPS_URL),
    Promise.all(
      [...textureRequests].map(
        async ([key, request]) => [key, await source.texture(request.id, request.tint)] as const,
      ),
    ),
  ]);

  const bodyScenes = new Map<BodyId, GLTF>(bodies);
  const propScenes = new Map<PropId, GLTF>(props);
  const loadedTextures = new Map<string, Texture>(textures);

  const clipsByName = new Map<string, AnimationClip>(
    clips.animations.map((clip) => [clip.name, clip]),
  );

  for (const name of CLIP_NAMES) {
    required(clipsByName, name, "animation clip");
  }

  for (const [name, keys] of Object.entries(POSED_CLIPS)) {
    if (clipsByName.has(name)) {
      throw new Error(`Posed clip "${name}" shares its name with a packed clip`);
    }

    clipsByName.set(name, posedClip(name, keys, clipsByName));
  }

  const templates = new Map<HeroDefinitionId, HeroTemplate>(
    models.map(([heroId, model]) => {
      const textureFor = (id: TextureId): Texture =>
        required(loadedTextures, textureKey(heroId, model, id), "texture");

      const scene = cloneSkinned(required(bodyScenes, model.body, "body").scene);
      paint(scene, textureFor);

      for (const mount of model.props) {
        const slot = scene.getObjectByName(boneName(HAND_SLOTS[mount.hand]));

        if (slot === undefined) {
          throw new Error(`Body "${model.body}" has no ${mount.hand} hand slot`);
        }

        const prop = required(propScenes, mount.prop, "prop").scene.clone();
        prop.scale.setScalar(mount.scale);
        paint(prop, textureFor);
        slot.add(prop);
      }

      return [heroId, { model, scene, height: modelHeight(scene) }];
    }),
  );

  return {
    template(heroId) {
      return required(templates, heroId, "hero model");
    },

    clip(name) {
      return required(clipsByName, name, "animation clip");
    },
  };
}
