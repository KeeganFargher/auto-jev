import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SkinnedMesh,
  Vector3,
  type ColorRepresentation,
  type Material,
  type Object3D,
} from "three";
import { HEAD_JOINT, LEGS, SPINE } from "./anatomy.js";
import { vesperGeometry } from "./body.js";
import { createCrest } from "./crest.js";
import { createEyeMaterial, detailKit } from "./details.js";
import { createFurMaterial } from "./fur.js";
import { createRig } from "./rig.js";

export interface VesperPose {
  bob: number;
  surge: number;
  pitch: number;
  roll: number;
  arch: number;
  sit: number;
  limp: number;
  headPitch: number;
  headYaw: number;
  tailLift: number;
  tailSwing: number;
  tailPhase: number;
  breath: number;
  flame: number;
  blink: number;
  readonly feet: Vector3[];
}

export interface Vesper {
  readonly root: Group;
  readonly pose: VesperPose;
  readonly surfaces: readonly MeshStandardMaterial[];
  readonly triangles: number;
  update(deltaSeconds: number): void;
  mouth(out: Vector3): Vector3;
  setCastsShadow(castsShadow: boolean): void;
  setTeamColor(color: ColorRepresentation): void;
  setFlash(amount: number): void;
  setGhost(fill: Material, depth: Material, order: number): void;
  dispose(): void;
}

export const REST_FEET: readonly Vector3[] = LEGS.map((leg) => leg.paw.clone());

const HEAD_SCALE = 1.15;

const MOUTH = new Vector3(0, -0.12, 1.06);

const EYE_SOCKET = new Vector3(0.25, 0.21, 0.69);

const EYE_FACING = new Vector3(0.46, 0.06, 0.89);

const EYE_SIZE = new Vector3(0.13, 0.054, 1);

const EYE_SLANT = 0.3;

const FANG = new Vector3(0.1, -0.15, 1.0);

const NOSE = new Vector3(0, 0.15, 1.09);

const NOSE_SIZE = new Vector3(0.12, 0.07, 0.075);

const COLLAR_AT = new Vector3(0, 2.6, 1.62);

const COLLAR_AXIS = new Vector3(0, 0.48, 0.82).normalize();

const TOES: readonly (readonly [number, number])[] = [
  [-0.15, 0.16],
  [-0.055, 0.24],
  [0.055, 0.24],
  [0.15, 0.16],
];

const TOE_SCALE = 1.12;

const Z_AXIS = new Vector3(0, 0, 1);

const PAD = new Color("#2a2034");

const CLAW = new Color("#dcc8ff");

const CLAW_GLOW = new Color("#7c3cf0");

const FANG_COLOR = new Color("#f1eaf2");

const WHISKER = new Color("#efe5ff");

const FLASH = new Color("#b58cff");

function restPose(): VesperPose {
  return {
    bob: 0,
    surge: 0,
    pitch: 0,
    roll: 0,
    arch: 0,
    sit: 0,
    limp: 0,
    headPitch: 0,
    headYaw: 0,
    tailLift: 0,
    tailSwing: 0.35,
    tailPhase: 0,
    breath: 0,
    flame: 0.7,
    blink: 0,
    feet: REST_FEET.map((foot) => foot.clone()),
  };
}

function trianglesOf(mesh: Mesh): number {
  const index = mesh.geometry.index;

  return index === null ? mesh.geometry.getAttribute("position").count / 3 : index.count / 3;
}

export function createVesper(): Vesper {
  const geometry = vesperGeometry();
  const kit = detailKit();
  const root = new Group();
  const pose = restPose();
  const rig = createRig();
  const fur = createFurMaterial();
  const crest = createCrest(geometry.crest);
  const eyeMaterial = createEyeMaterial();
  const pads = new MeshStandardMaterial({ color: PAD, roughness: 0.22 });
  const claws = new MeshStandardMaterial({ color: CLAW, emissive: CLAW_GLOW, emissiveIntensity: 0.45, roughness: 0.3 });
  const fangs = new MeshStandardMaterial({ color: FANG_COLOR, roughness: 0.35 });

  const whiskerMaterial = new MeshStandardMaterial({
    color: WHISKER,
    roughness: 0.5,
    emissive: WHISKER,
    emissiveIntensity: 0.25,
  });

  const team = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.35,
    metalness: 0.3,
    emissive: "#ffffff",
    emissiveIntensity: 0.3,
  });

  const body = new SkinnedMesh(geometry.body, fur);
  body.frustumCulled = false;
  root.add(rig.root, body, crest.mesh);
  root.updateMatrixWorld(true);
  body.bind(rig.skeleton);
  const flameBones = geometry.crest.map((flame) => rig.nearestSpine(flame.anchor));
  const flamePoint = new Vector3();

  const skull = new Mesh(geometry.head, fur);
  skull.scale.setScalar(HEAD_SCALE);
  rig.attach(rig.head, SPINE[HEAD_JOINT] ?? new Vector3()).add(skull);
  const accents: Object3D[] = [crest.mesh];
  const eyes: Mesh[] = [];

  for (const side of [1, -1]) {
    const eye = new Mesh(kit.eye, eyeMaterial);

    const facing = EYE_FACING.clone()
      .setX(EYE_FACING.x * side)
      .normalize();

    eye.position.set(EYE_SOCKET.x * side, EYE_SOCKET.y, EYE_SOCKET.z).addScaledVector(facing, 0.015);
    eye.quaternion
      .setFromUnitVectors(Z_AXIS, facing)
      .multiply(new Quaternion().setFromAxisAngle(Z_AXIS, -EYE_SLANT * side));
    eye.scale.copy(EYE_SIZE);
    skull.add(eye);
    eyes.push(eye);

    const fang = new Mesh(kit.fang, fangs);
    fang.position.set(FANG.x * side, FANG.y, FANG.z);
    skull.add(fang);
    accents.push(eye, fang);
  }

  const nose = new Mesh(kit.nose, pads);
  nose.position.copy(NOSE);
  nose.scale.copy(NOSE_SIZE);
  skull.add(nose);
  accents.push(nose);

  for (const whiskerGeometry of kit.whiskers) {
    const whisker = new Mesh(whiskerGeometry, whiskerMaterial);
    skull.add(whisker);
    accents.push(whisker);
  }

  const collar = new Mesh(kit.collar, team);
  const collarSocket = rig.attach(rig.nearestSpine(COLLAR_AT), COLLAR_AT);
  collar.quaternion.setFromUnitVectors(Z_AXIS, COLLAR_AXIS);
  collarSocket.add(collar);
  accents.push(collar);
  const clawMeshes: Mesh[] = [];

  for (const [index, leg] of LEGS.entries()) {
    const paw = rig.paws[index];

    if (leg.hind || paw === undefined) {
      continue;
    }

    for (const [dx, dz] of TOES) {
      const base = new Vector3(leg.paw.x + dx * TOE_SCALE, 0.1, leg.paw.z + 0.04 + dz * TOE_SCALE + 0.07);
      const claw = new Mesh(kit.claw, claws);
      claw.rotation.set(-0.15, dx * 1.6, 0);
      rig.attach(paw, base).add(claw);
      clawMeshes.push(claw);
    }
  }

  const solid: Mesh[] = [body, skull, ...clawMeshes];
  let triangles = 0;

  root.traverse((node) => {
    if (node instanceof Mesh) {
      triangles += trianglesOf(node);
    }
  });

  return {
    root,
    pose,
    surfaces: [fur],
    triangles,

    update(deltaSeconds) {
      rig.pose(pose);

      for (const [index, flame] of geometry.crest.entries()) {
        const bone = flameBones[index];

        if (bone !== undefined) {
          crest.place(index, rig.carry(bone, flame.anchor, flamePoint));
        }
      }

      crest.commit();
      crest.update(deltaSeconds, pose.flame);

      for (const eye of eyes) {
        eye.scale.y = EYE_SIZE.y * Math.max(0.05, 1 - pose.blink);
      }
    },

    mouth(out) {
      skull.updateWorldMatrix(true, false);

      return skull.localToWorld(out.copy(MOUTH));
    },

    setCastsShadow(castsShadow) {
      for (const mesh of solid) {
        mesh.castShadow = castsShadow;
      }
    },

    setTeamColor(color) {
      team.color.set(color);
      team.emissive.set(color);
    },

    setFlash(amount) {
      fur.emissive.copy(FLASH).multiplyScalar(amount);
    },

    setGhost(fill, depth, order) {
      const bodyTwin = new SkinnedMesh(body.geometry, depth);
      bodyTwin.frustumCulled = false;
      bodyTwin.renderOrder = order;
      root.add(bodyTwin);
      bodyTwin.bind(rig.skeleton, body.bindMatrix);

      for (const mesh of [skull, ...clawMeshes]) {
        const twin = new Mesh(mesh.geometry, depth);
        twin.renderOrder = order;
        mesh.add(twin);
      }

      for (const mesh of solid) {
        mesh.material = fill;
        mesh.castShadow = false;
        mesh.renderOrder = order + 1;
      }

      for (const accent of accents) {
        accent.visible = false;
      }
    },

    dispose() {
      root.removeFromParent();
      rig.skeleton.dispose();

      crest.dispose();

      for (const material of [fur, eyeMaterial, pads, claws, fangs, whiskerMaterial, team]) {
        material.dispose();
      }
    },
  };
}
