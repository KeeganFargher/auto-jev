import {
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  type ColorRepresentation,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { createRng, nextFloat } from "@jev-game/game";

export interface SurfaceOptions {
  emissive?: ColorRepresentation;
  glow?: number;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  twoSided?: boolean;
  smooth?: boolean;
  tinted?: boolean;
  map?: Texture;
}

export type Animator = (seconds: number) => void;

export interface Disposable {
  dispose(): void;
}

export interface PropKit {
  surface(color: ColorRepresentation, options?: SurfaceOptions): MeshStandardMaterial;
  solid(geometry: BufferGeometry, material: Material, x?: number, y?: number, z?: number): Mesh;
  group(...children: Object3D[]): Group;
  keep<T extends Disposable>(resource: T): T;
  random(): number;
  between(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  animate(animator: Animator): void;
  tick(seconds: number): void;
  dispose(): void;
}

function surfaceKey(color: ColorRepresentation, options: SurfaceOptions): string {
  return [
    new Color(color).getHexString(),
    options.emissive === undefined ? "" : new Color(options.emissive).getHexString(),
    options.glow ?? 1,
    options.roughness ?? 0.82,
    options.metalness ?? 0,
    options.opacity ?? 1,
    options.twoSided ?? false,
    options.smooth ?? false,
    options.tinted ?? false,
    options.map?.uuid ?? "",
  ].join("|");
}

export function createPropKit(seed: number): PropKit {
  const rng = createRng(seed);
  const surfaces = new Map<string, MeshStandardMaterial>();
  const resources = new Set<Disposable>();
  const animators: Animator[] = [];

  function random(): number {
    return nextFloat(rng);
  }

  return {
    surface(color, options = {}) {
      const key = surfaceKey(color, options);
      const cached = surfaces.get(key);

      if (cached !== undefined) {
        return cached;
      }

      const opacity = options.opacity ?? 1;

      const created = new MeshStandardMaterial({
        color,
        roughness: options.roughness ?? 0.82,
        metalness: options.metalness ?? 0,
        flatShading: !(options.smooth ?? false),
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
        side: options.twoSided === true ? DoubleSide : FrontSide,
        vertexColors: options.tinted ?? false,
        map: options.map ?? null,
      });

      if (options.emissive !== undefined) {
        created.emissive.set(options.emissive);
        created.emissiveIntensity = options.glow ?? 1;
      }

      surfaces.set(key, created);

      return created;
    },

    solid(geometry, material, x = 0, y = 0, z = 0) {
      resources.add(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      return mesh;
    },

    group(...children) {
      const created = new Group();

      if (children.length > 0) {
        created.add(...children);
      }

      return created;
    },

    keep(resource) {
      resources.add(resource);

      return resource;
    },

    random,

    between(min, max) {
      return min + (max - min) * random();
    },

    pick(items) {
      return items[Math.floor(random() * items.length)]!;
    },

    animate(animator) {
      animators.push(animator);
    },

    tick(seconds) {
      for (const animator of animators) {
        animator(seconds);
      }
    },

    dispose() {
      for (const resource of resources) {
        resource.dispose();
      }

      for (const material of surfaces.values()) {
        material.dispose();
      }

      resources.clear();
      surfaces.clear();
      animators.length = 0;
    },
  };
}
