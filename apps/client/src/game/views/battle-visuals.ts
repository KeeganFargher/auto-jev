import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Line,
  Mesh,
  NormalBlending,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type LineBasicMaterial,
  type Material,
} from "three";
import {
  berserker,
  bubbleCleric,
  firebrand,
  harpooner,
  paladin,
  trainingDummy,
} from "@jev-game/content";
import type { BubbleKind, HeroDefinitionId, ProjectilePayload } from "@jev-game/game";
import { effectMaterials, releaseEffectMaterial } from "./effect-materials.js";
import { trailStyle, type HitKind } from "./hit-effects.js";
import { createTrail, type ParticleStyle, type ParticleSystem } from "./particles.js";

export type ShotLook = "firecracker" | "soap" | "knife" | "fuse-bomb" | "hook";

export const SHOT_LOOKS: readonly ShotLook[] = [
  "firecracker",
  "soap",
  "knife",
  "fuse-bomb",
  "hook",
];

export const BUBBLE_KINDS: readonly BubbleKind[] = ["big", "safety"];

export interface HeroLook {
  hit: HitKind;
  shot: ShotLook | null;
}

export interface ShotVisual {
  readonly root: Group;
  place(from: Vector3, to: Vector3, along: number): void;
  dispose(): void;
}

export interface ChainVisual {
  readonly root: Line<BufferGeometry, LineBasicMaterial>;
  stretch(from: Vector3, to: Vector3, sag: number): void;
  dispose(): void;
}

export interface BubbleVisual {
  readonly root: Group;
  place(center: Vector3, radius: number, deltaSeconds: number): void;
  dispose(): void;
}

export interface BubbleTint {
  film: string;
  band: string;
}

interface ShotStyle {
  arcUnits: number;
  tumblePerFlight: number;
  trail: ParticleStyle | null;
  trailSpacing: number;
}

type Part = Mesh<BufferGeometry, Material>;

const HERO_LOOKS: ReadonlyMap<HeroDefinitionId, HeroLook> = new Map([
  [paladin.id, { hit: "blunt", shot: null }],
  [berserker.id, { hit: "blade", shot: null }],
  [firebrand.id, { hit: "strike", shot: "firecracker" }],
  [bubbleCleric.id, { hit: "strike", shot: "soap" }],
  [harpooner.id, { hit: "blade", shot: "knife" }],
  [trainingDummy.id, { hit: "blunt", shot: null }],
]);

const FIRECRACKER_SPARKS: ParticleStyle = {
  blend: "glow",
  from: new Color("#fff3b0"),
  to: new Color("#ff5a1f"),
  brightness: 1.2,
  opacity: 1,
  size: [1.4, 0.3],
  life: [0.14, 0.3],
  speed: [2, 6],
  cone: 0.8,
  spread: 0.2,
  gravity: 6,
  drag: 3,
  stretch: 0.03,
  softness: 0.3,
};

const SOAP_SUDS: ParticleStyle = {
  blend: "glow",
  from: new Color("#ffffff"),
  to: new Color("#9fe8ff"),
  brightness: 0.9,
  opacity: 0.7,
  size: [1.2, 0.2],
  life: [0.2, 0.4],
  speed: [0.5, 2],
  cone: Math.PI,
  spread: 0.4,
  gravity: -2,
  drag: 2,
  stretch: 0,
  softness: 0.8,
};

const FUSE_TRAIL: ParticleStyle = {
  ...FIRECRACKER_SPARKS,
  size: [1.2, 0.2],
  life: [0.1, 0.22],
  speed: [4, 10],
  gravity: 14,
};

const SHOT_STYLES: Readonly<Record<ShotLook, ShotStyle>> = {
  firecracker: { arcUnits: 3, tumblePerFlight: 0, trail: FIRECRACKER_SPARKS, trailSpacing: 0.8 },
  soap: { arcUnits: 1.5, tumblePerFlight: 0, trail: SOAP_SUDS, trailSpacing: 1.4 },
  knife: {
    arcUnits: 0.8,
    tumblePerFlight: Math.PI * 6,
    trail: trailStyle("blade"),
    trailSpacing: 1.1,
  },
  "fuse-bomb": { arcUnits: 7, tumblePerFlight: Math.PI * 2, trail: FUSE_TRAIL, trailSpacing: 0.7 },
  hook: { arcUnits: 0, tumblePerFlight: 0, trail: null, trailSpacing: 1 },
};

export const BUBBLE_TINTS: Readonly<Record<BubbleKind, BubbleTint>> = {
  big: { film: "#9fe8ff", band: "#d8f7ff" },
  safety: { film: "#b8ffd9", band: "#e6fff2" },
};

const UNIT_BOX = new BoxGeometry(1, 1, 1);

const UNIT_SPHERE = new SphereGeometry(1, 20, 14);

const UNIT_CYLINDER = new CylinderGeometry(1, 1, 1, 10);

const UNIT_CONE = new ConeGeometry(1, 1, 8);

const GLINT = new OctahedronGeometry(1, 0);

const HOOK_CURVE = new TorusGeometry(0.8, 0.16, 6, 14, Math.PI * 1.3);

const BUBBLE_BAND = new TorusGeometry(1, 0.025, 6, 48);

const CHAIN_POINTS = 18;

const INFLATE_SECONDS = 0.3;

const WOBBLE_RATE = 5.5;

const WOBBLE_AMOUNT = 0.035;

const BAND_SPIN = 0.9;

const FORWARD = new Vector3(0, 0, 1);

export function heroLook(heroId: HeroDefinitionId): HeroLook {
  const look = HERO_LOOKS.get(heroId);

  if (look === undefined) {
    throw new Error(`Hero "${heroId}" has no battle look`);
  }

  return look;
}

export function shotLook(payload: ProjectilePayload["kind"], sourceHeroId: string): ShotLook {
  if (payload === "fuse") {
    return "fuse-bomb";
  }

  if (payload === "hook") {
    return "hook";
  }

  const shot = heroLook(sourceHeroId).shot;

  if (shot === null) {
    throw new Error(`Hero "${sourceHeroId}" fires attack projectiles but has no shot look`);
  }

  return shot;
}

function part(
  group: Group,
  geometry: BufferGeometry,
  material: Material,
  scale: Vector3,
  offset: Vector3,
): Part {
  const mesh = new Mesh<BufferGeometry, Material>(geometry, material);
  mesh.scale.copy(scale);
  mesh.position.copy(offset);
  group.add(mesh);

  return mesh;
}

function releaseParts(parts: readonly Part[]): void {
  const materials = new Set<Material>();

  for (const mesh of parts) {
    mesh.removeFromParent();
    materials.add(mesh.material);
  }

  for (const material of materials) {
    releaseEffectMaterial(material);
  }
}

function solid(color: string): Material {
  const material = effectMaterials.solid.take();
  material.color.set(color);

  return material;
}

function flash(color: string, opacity: number): Material {
  const material = effectMaterials.flash.take();
  material.color.set(color);
  material.opacity = opacity;

  return material;
}

function shotParts(look: ShotLook, body: Group): Part[] {
  switch (look) {
    case "firecracker":
      return [
        part(
          body,
          UNIT_CYLINDER,
          solid("#d93a2b"),
          new Vector3(0.35, 1.6, 0.35),
          new Vector3(0, 0, 0),
        ),
        part(
          body,
          UNIT_SPHERE,
          flash("#ffb347", 1),
          new Vector3(0.4, 0.4, 0.4),
          new Vector3(0, 0.9, 0),
        ),
      ];

    case "soap":
      return [
        part(
          body,
          UNIT_SPHERE,
          veil("#bfefff", 0.5),
          new Vector3(1.1, 1.1, 1.1),
          new Vector3(0, 0, 0),
        ),
        part(
          body,
          UNIT_SPHERE,
          flash("#ffffff", 0.9),
          new Vector3(0.25, 0.25, 0.25),
          new Vector3(0.4, 0.4, 0.3),
        ),
      ];

    case "knife":
      return [
        part(body, UNIT_BOX, core("#dfe6f0"), new Vector3(0.18, 1.8, 0.5), new Vector3(0, 0.5, 0)),
        part(
          body,
          UNIT_BOX,
          solid("#5b3b24"),
          new Vector3(0.28, 0.7, 0.34),
          new Vector3(0, -0.7, 0),
        ),
      ];

    case "fuse-bomb":
      return [
        part(body, UNIT_SPHERE, solid("#2b2b33"), new Vector3(1.1, 1.1, 1.1), new Vector3(0, 0, 0)),
        part(
          body,
          UNIT_CYLINDER,
          solid("#8a6a3a"),
          new Vector3(0.2, 0.6, 0.2),
          new Vector3(0, 1.2, 0),
        ),
        part(
          body,
          GLINT,
          flash("#ffd23f", 1),
          new Vector3(0.45, 0.45, 0.45),
          new Vector3(0, 1.6, 0),
        ),
      ];

    case "hook":
      return [
        part(body, HOOK_CURVE, solid("#b8c0cc"), new Vector3(1, 1, 1), new Vector3(0, -0.8, 0)),
        part(
          body,
          UNIT_CYLINDER,
          solid("#8d949e"),
          new Vector3(0.14, 1.8, 0.14),
          new Vector3(0, 0.3, 0),
        ),
        part(body, UNIT_CONE, solid("#d9dee6"), new Vector3(0.3, 0.7, 0.3), new Vector3(0, 1.5, 0)),
      ];
  }
}

function veil(color: string, opacity: number): Material {
  const material = effectMaterials.veil.take();
  material.color.set(color);
  material.opacity = opacity;

  return material;
}

function core(color: string): Material {
  const material = effectMaterials.core.take();
  material.color.set(color);

  return material;
}

export function createChainVisual(color: string): ChainVisual {
  const geometry = new BufferGeometry();
  const positions = new Float32BufferAttribute(new Float32Array(CHAIN_POINTS * 3), 3);
  positions.setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", positions);
  const material = effectMaterials.arc.take();
  material.blending = NormalBlending;
  material.color.set(color);
  material.opacity = 0.95;
  const root = new Line(geometry, material);
  root.frustumCulled = false;
  const point = new Vector3();

  return {
    root,

    stretch(from, to, sag) {
      for (let index = 0; index < CHAIN_POINTS; index += 1) {
        const along = index / (CHAIN_POINTS - 1);
        point.lerpVectors(from, to, along);
        positions.setXYZ(index, point.x, point.y - sag * 4 * along * (1 - along), point.z);
      }

      positions.needsUpdate = true;
    },

    dispose() {
      root.removeFromParent();
      releaseEffectMaterial(material);
      geometry.dispose();
    },
  };
}

export function createShotVisual(
  particles: ParticleSystem,
  look: ShotLook,
  from: Vector3,
): ShotVisual {
  const style = SHOT_STYLES[look];
  const root = new Group();
  const body = new Group();
  root.add(body);
  const parts = shotParts(look, body);

  const trail =
    style.trail === null ? null : createTrail(particles, style.trail, style.trailSpacing, from);

  const chain = look === "hook" ? createChainVisual("#8d8d96") : null;
  const ahead = new Vector3();
  const heading = new Vector3();

  if (chain !== null) {
    root.add(chain.root);
  }

  function spot(start: Vector3, end: Vector3, along: number, out: Vector3): Vector3 {
    return out
      .lerpVectors(start, end, along)
      .setY(out.y + style.arcUnits * 4 * along * (1 - along));
  }

  return {
    root,

    place(start, end, along) {
      const clamped = Math.min(1, Math.max(0, along));
      spot(start, end, clamped, body.position);
      spot(start, end, Math.min(1, clamped + 0.02), ahead);
      heading.subVectors(ahead, body.position);

      if (heading.lengthSq() > 1e-6) {
        body.quaternion.setFromUnitVectors(FORWARD, heading.normalize());
        body.rotateX(Math.PI / 2 + style.tumblePerFlight * clamped);
      }

      trail?.follow(body.position);
      chain?.stretch(start, body.position, 0.6 * (1 - clamped));
    },

    dispose() {
      releaseParts(parts);
      chain?.dispose();
      root.removeFromParent();
    },
  };
}

export function createBubbleVisual(kind: BubbleKind): BubbleVisual {
  const tint = BUBBLE_TINTS[kind];
  const root = new Group();

  const parts = [
    part(root, UNIT_SPHERE, veil(tint.film, 0.22), new Vector3(1, 1, 1), new Vector3()),
    part(
      root,
      UNIT_SPHERE,
      flash("#ffffff", 0.8),
      new Vector3(0.08, 0.08, 0.08),
      new Vector3(-0.45, 0.55, 0.45),
    ),
  ];

  const band = new Mesh<BufferGeometry, Material>(BUBBLE_BAND, glowMaterial(tint.band, 0.5));
  root.add(band);
  parts.push(band);
  let age = 0;

  return {
    root,

    place(center, radius, deltaSeconds) {
      age += deltaSeconds;
      const inflate = Math.min(1, age / INFLATE_SECONDS);
      const swell = 1 - (1 - inflate) * (1 - inflate);
      const wobble = Math.sin(age * WOBBLE_RATE) * WOBBLE_AMOUNT;
      root.position.copy(center);
      root.scale.set(
        radius * swell * (1 + wobble),
        radius * swell * (1 - wobble),
        radius * swell * (1 + wobble),
      );
      band.rotation.set(Math.PI / 2 + Math.sin(age * 0.7) * 0.35, age * BAND_SPIN, 0);
    },

    dispose() {
      releaseParts(parts);
      root.removeFromParent();
    },
  };
}

function glowMaterial(color: string, opacity: number): Material {
  const material = effectMaterials.glow.take();
  material.color.set(color);
  material.opacity = opacity;

  return material;
}
