import { Box3, Mesh, SkinnedMesh, type AnimationClip, type Group, type Object3D, type Skeleton } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import {
  MODELS,
  MODEL_IDS,
  isModelId,
  type ChannelEffect,
  type ModelDefinition,
  type ModelId,
  type ModelKind,
} from "./catalogue.js";

export interface LoadedModel {
  readonly id: ModelId;
  readonly template: Group;
  readonly clips: ReadonlyMap<string, AnimationClip>;
  readonly height: number;
  readonly triangles: number;
  readonly drawCalls: number;
  readonly channelEffect: ChannelEffect | null;
  readonly boardHeight: number | null;
  readonly castBone: string | null;
}

export type ModelState = "unloaded" | "loading" | "ready" | "failed";

interface ModelMeasurements {
  height: number;
  triangles: number;
  drawCalls: number;
}

export interface ModelLibrary {
  preload(kind: ModelKind): Promise<void>;
  load(id: ModelId): Promise<LoadedModel>;
  get(id: string): LoadedModel | null;
  state(id: ModelId): ModelState;
  instantiate(model: LoadedModel): Object3D;
  release(instance: Object3D): void;
}

function measure(template: Group): ModelMeasurements {
  const bounds = new Box3();
  let triangles = 0;
  let drawCalls = 0;
  template.updateMatrixWorld(true);

  template.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }

    object.castShadow = true;
    object.frustumCulled = !(object instanceof SkinnedMesh);
    drawCalls += 1;

    const geometry = object.geometry;
    triangles += Math.floor((geometry.index?.count ?? geometry.getAttribute("position").count) / 3);
    geometry.computeBoundingBox();

    if (geometry.boundingBox !== null) {
      bounds.union(geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    }
  });

  return { height: bounds.isEmpty() ? 0 : bounds.max.y - bounds.min.y, triangles, drawCalls };
}

function shareSkeletons(instance: Object3D): void {
  const skeletons = new Map<Object3D, Skeleton>();

  instance.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) {
      return;
    }

    const rootBone = object.skeleton.bones[0];

    if (rootBone === undefined) {
      return;
    }

    const shared = skeletons.get(rootBone);

    if (shared === undefined) {
      skeletons.set(rootBone, object.skeleton);
    } else {
      object.bind(shared, object.bindMatrix);
    }
  });
}

export function createModelLibrary(): ModelLibrary {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const loaded = new Map<ModelId, LoadedModel>();
  const pending = new Map<ModelId, Promise<LoadedModel>>();
  const failed = new Set<ModelId>();

  async function fetchModel(id: ModelId): Promise<LoadedModel> {
    const definition: ModelDefinition = MODELS[id];
    const gltf = await loader.loadAsync(definition.url);

    const model: LoadedModel = {
      id,
      channelEffect: definition.channelEffect ?? null,
      boardHeight: definition.boardHeight ?? null,
      castBone: definition.castBone ?? null,
      template: gltf.scene,
      clips: new Map(gltf.animations.map((clip) => [clip.name, clip])),
      ...measure(gltf.scene),
    };

    loaded.set(id, model);

    return model;
  }

  function load(id: ModelId): Promise<LoadedModel> {
    const existing = pending.get(id);

    if (existing !== undefined) {
      return existing;
    }

    failed.delete(id);

    const request = fetchModel(id).catch((error: Error) => {
      failed.add(id);
      pending.delete(id);
      console.warn(`model "${id}" failed to load; heroes keep their placeholder`, error);
      throw error;
    });

    pending.set(id, request);

    return request;
  }

  return {
    async preload(kind) {
      await Promise.allSettled(MODEL_IDS.flatMap((id) => (MODELS[id].kind === kind ? [load(id)] : [])));
    },

    load,

    get(id) {
      return isModelId(id) ? (loaded.get(id) ?? null) : null;
    },

    state(id) {
      if (loaded.has(id)) {
        return "ready";
      }

      if (failed.has(id)) {
        return "failed";
      }

      return pending.has(id) ? "loading" : "unloaded";
    },

    instantiate(model) {
      const instance = clone(model.template);
      shareSkeletons(instance);

      return instance;
    },

    release(instance) {
      const skeletons = new Set<Skeleton>();

      instance.traverse((object) => {
        if (object instanceof SkinnedMesh) {
          skeletons.add(object.skeleton);
        }
      });

      for (const skeleton of skeletons) {
        skeleton.dispose();
      }
    },
  };
}

export const models = createModelLibrary();
