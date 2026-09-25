import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
} from "three";
import { HEX_PUFF, HEX_SPARKS, STUFFING } from "./fate-visuals.js";
import { createFigureBase, type FigureBase } from "./figure-base.js";
import type { ParticleSystem } from "./particles.js";

export interface HexedUnit {
  readonly unitId: string;
  readonly position: Vector3;
  readonly yaw: number;
  readonly teamColor: ColorRepresentation;
}

export interface HexCritters {
  readonly root: Group;
  transform(unitId: string, delaySeconds: number): void;
  update(hexed: readonly HexedUnit[], deltaSeconds: number): void;
  figureScale(unitId: string): number;
  clear(): void;
  dispose(): void;
}

type Phase = "waiting" | "in" | "hexed" | "out";

interface Critter {
  readonly unitId: string;
  readonly root: Group;
  readonly poppet: Group;
  readonly base: FigureBase;
  readonly patch: MeshStandardMaterial;
  phase: Phase;
  clock: number;
  hop: number;
  unhexed: number;
  wander: number;
  readonly position: Vector3;
}

interface PoppetKit {
  readonly geometries: BufferGeometry[];
  readonly materials: MeshStandardMaterial[];
  readonly burlap: MeshStandardMaterial;
  readonly limb: MeshStandardMaterial;
  readonly stitch: MeshStandardMaterial;
  readonly button: MeshStandardMaterial;
  readonly yarn: MeshStandardMaterial;
  readonly steel: MeshStandardMaterial;
  readonly bead: MeshStandardMaterial;
  readonly head: BufferGeometry;
  readonly body: BufferGeometry;
  readonly arm: BufferGeometry;
  readonly leg: BufferGeometry;
  readonly stitchBar: BufferGeometry;
  readonly buttonDisc: BufferGeometry;
  readonly buttonRim: BufferGeometry;
  readonly binding: BufferGeometry;
  readonly loop: BufferGeometry;
  readonly pin: BufferGeometry;
  readonly pinHead: BufferGeometry;
  readonly patch: BufferGeometry;
}

const POPPET_SCALE = 1.9;

const BASE_SCALE = 0.62;

const IN_SECONDS = 0.3;

const SHRINK_SECONDS = 0.12;

const OUT_SECONDS = 0.22;

const REGROW_SECONDS = 0.3;

const AUTO_SECONDS = 0.45;

const HOPS_PER_SECOND = 1.7;

const HOP_UNITS = 1.1;

const HIDDEN_SCALE = 0.001;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOutBack(value: number): number {
  const t = clamp01(value);
  const overshoot = 2.2;

  return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

function buildKit(): PoppetKit {
  const burlap = new MeshStandardMaterial({ color: "#c9a36b", roughness: 0.92 });
  const limb = new MeshStandardMaterial({ color: "#a8834f", roughness: 0.92 });
  const stitch = new MeshStandardMaterial({ color: "#2a0620", roughness: 0.8 });
  const button = new MeshStandardMaterial({ color: "#1b1320", roughness: 0.35, metalness: 0.25 });

  const yarn = new MeshStandardMaterial({
    color: "#c0136a",
    roughness: 0.7,
    emissive: new Color("#5a0a3a"),
    emissiveIntensity: 0.6,
  });

  const steel = new MeshStandardMaterial({ color: "#d9dbe4", roughness: 0.25, metalness: 0.85 });

  const bead = new MeshStandardMaterial({
    color: "#ff6ad9",
    roughness: 0.3,
    emissive: new Color("#ff3fb4"),
    emissiveIntensity: 0.7,
  });

  const head = new SphereGeometry(0.95, 14, 12);
  head.scale(1, 0.94, 0.9);
  const body = new SphereGeometry(0.82, 12, 10);
  body.scale(1, 1.08, 0.86);
  const arm = new CapsuleGeometry(0.2, 0.42, 4, 8);
  const leg = new CapsuleGeometry(0.26, 0.3, 4, 8);
  const stitchBar = new BoxGeometry(0.34, 0.07, 0.06);
  const buttonDisc = new CylinderGeometry(0.22, 0.22, 0.08, 14);
  buttonDisc.rotateX(Math.PI / 2);
  const buttonRim = new TorusGeometry(0.2, 0.035, 5, 16);
  const binding = new TorusGeometry(0.86, 0.085, 6, 22);
  binding.rotateX(Math.PI / 2);
  const loop = new TorusGeometry(0.22, 0.07, 5, 12);
  const pin = new CylinderGeometry(0.03, 0.03, 1.2, 6);
  const pinHead = new SphereGeometry(0.15, 10, 8);
  const patch = new BoxGeometry(0.46, 0.4, 0.06);

  return {
    geometries: [head, body, arm, leg, stitchBar, buttonDisc, buttonRim, binding, loop, pin, pinHead, patch],
    materials: [burlap, limb, stitch, button, yarn, steel, bead],
    burlap,
    limb,
    stitch,
    button,
    yarn,
    steel,
    bead,
    head,
    body,
    arm,
    leg,
    stitchBar,
    buttonDisc,
    buttonRim,
    binding,
    loop,
    pin,
    pinHead,
    patch,
  };
}

function place(
  parent: Group,
  geometry: BufferGeometry,
  surface: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(geometry, surface);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);

  return mesh;
}

function buildPoppet(kit: PoppetKit, patch: MeshStandardMaterial): Group {
  const poppet = new Group();

  for (const side of [-1, 1]) {
    place(poppet, kit.leg, kit.limb, side * 0.36, 0.42, 0);
    const arm = place(poppet, kit.arm, kit.limb, side * 0.92, 1.55, 0.05);
    arm.rotation.z = side * 0.95;
  }

  place(poppet, kit.body, kit.burlap, 0, 1.3, 0);
  const lower = place(poppet, kit.binding, kit.yarn, 0, 1.15, 0);
  lower.rotation.z = 0.12;
  const upper = place(poppet, kit.binding, kit.yarn, 0, 1.45, 0);
  upper.scale.setScalar(0.94);
  upper.rotation.z = -0.18;
  place(poppet, kit.patch, patch, 0.28, 1.58, 0.68).rotation.set(-0.15, 0.3, 0.1);
  place(poppet, kit.head, kit.burlap, 0, 2.7, 0);

  for (let index = 0; index < 4; index += 1) {
    place(poppet, kit.stitchBar, kit.stitch, 0, 1.9 - index * 0.28, 0.7).rotation.z = Math.PI / 2;
  }

  place(poppet, kit.buttonDisc, kit.button, -0.36, 2.82, 0.8);
  place(poppet, kit.buttonRim, kit.stitch, -0.36, 2.82, 0.85);

  for (const turn of [Math.PI / 4, -Math.PI / 4]) {
    place(poppet, kit.stitchBar, kit.stitch, 0.36, 2.82, 0.83).rotation.z = turn;
  }

  for (let index = 0; index < 5; index += 1) {
    const x = -0.36 + index * 0.18;
    place(poppet, kit.stitchBar, kit.stitch, x, 2.42 - 0.06 * Math.cos(x * 3.4), 0.84).scale.set(0.4, 1, 1);
  }

  for (const [x, turn] of [
    [-0.22, 0.5],
    [0.05, -0.2],
    [0.28, 0.9],
  ] as const) {
    place(poppet, kit.loop, kit.yarn, x, 3.58, -0.05).rotation.set(0.3, turn, 0);
  }

  const pin = place(poppet, kit.pin, kit.steel, 0.5, 3.3, 0.1);
  pin.rotation.z = -0.75;
  place(poppet, kit.pinHead, kit.bead, 0.88, 3.69, 0.1);

  return poppet;
}

export function createHexCritters(particles: ParticleSystem): HexCritters {
  const root = new Group();
  const kit = buildKit();
  const critters = new Map<string, Critter>();
  const pending = new Map<string, number>();
  const hexedSince = new Map<string, number>();
  const heart = new Vector3();
  const up = new Vector3(0, 1, 0);

  function spawn(unit: HexedUnit): Critter {
    const patch = new MeshStandardMaterial({ color: unit.teamColor, roughness: 0.8 });
    const poppet = buildPoppet(kit, patch);
    const base = createFigureBase();
    base.paint(new Color(unit.teamColor), false);
    base.root.scale.setScalar(BASE_SCALE);
    const holder = new Group();
    holder.add(base.root, poppet);
    holder.position.copy(unit.position);
    poppet.scale.setScalar(HIDDEN_SCALE);
    root.add(holder);

    const critter: Critter = {
      unitId: unit.unitId,
      root: holder,
      poppet,
      base,
      patch,
      phase: "in",
      clock: 0,
      hop: Math.random(),
      unhexed: 0,
      wander: 0,
      position: unit.position.clone(),
    };

    critters.set(unit.unitId, critter);
    heart.copy(unit.position).setY(3);
    particles.emit(STUFFING, heart, up, 6);

    return critter;
  }

  function remove(critter: Critter): void {
    critter.root.removeFromParent();
    critter.base.dispose();
    critter.patch.dispose();
    critters.delete(critter.unitId);
  }

  function release(critter: Critter): void {
    critter.phase = "out";
    critter.clock = 0;
    heart.copy(critter.position).setY(3);
    particles.emit(HEX_PUFF, heart, up, 12);
    particles.emit(HEX_SPARKS, heart, up, 14);
    particles.emit(STUFFING, heart, up, 8);
  }

  function animate(critter: Critter, unit: HexedUnit | undefined, deltaSeconds: number): void {
    critter.clock += deltaSeconds;

    if (unit !== undefined) {
      critter.position.copy(unit.position);
      critter.root.rotation.y = unit.yaw + 0.35 * Math.sin(critter.wander);
    }

    critter.root.position.copy(critter.position);
    critter.hop += deltaSeconds * HOPS_PER_SECOND;
    critter.wander += deltaSeconds * (0.8 + 0.6 * Math.sin(critter.hop * 0.7));
    const air = Math.sin((critter.hop % 1) * Math.PI);
    const landing = Math.max(0, 1 - air * 5);
    const lean = (Math.floor(critter.hop) % 2 === 0 ? 1 : -1) * 0.16 * air;
    let size = POPPET_SCALE;

    if (critter.phase === "in") {
      size *= easeOutBack(critter.clock / IN_SECONDS);

      if (critter.clock >= IN_SECONDS) {
        critter.phase = "hexed";
      }
    } else if (critter.phase === "out") {
      size *= Math.max(HIDDEN_SCALE, 1 - clamp01(critter.clock / OUT_SECONDS) ** 2);
    }

    critter.poppet.position.y = air * HOP_UNITS;
    critter.poppet.rotation.set(0, 0, lean);
    critter.poppet.scale.set(
      size * (1 + 0.1 * landing - 0.04 * air),
      size * (1 - 0.14 * landing + 0.1 * air),
      size * (1 + 0.1 * landing - 0.04 * air),
    );
  }

  return {
    root,

    transform(unitId, delaySeconds) {
      if (!critters.has(unitId)) {
        pending.set(unitId, Math.max(0, delaySeconds));
      }
    },

    update(hexed, deltaSeconds) {
      const present = new Map<string, HexedUnit>();

      for (const unit of hexed) {
        present.set(unit.unitId, unit);
        hexedSince.set(unit.unitId, (hexedSince.get(unit.unitId) ?? 0) + deltaSeconds);
      }

      for (const unitId of hexedSince.keys()) {
        if (!present.has(unitId)) {
          hexedSince.delete(unitId);
          pending.delete(unitId);
        }
      }

      for (const [unitId, unit] of present) {
        const critter = critters.get(unitId);

        if (critter !== undefined) {
          if (critter.phase === "out") {
            critter.phase = "in";
            critter.clock = IN_SECONDS * 0.5;
          }

          continue;
        }

        const wait = pending.get(unitId);

        if (wait !== undefined) {
          const left = wait - deltaSeconds;

          if (left <= 0) {
            pending.delete(unitId);
            spawn(unit);
          } else {
            pending.set(unitId, left);
          }
        } else if ((hexedSince.get(unitId) ?? 0) >= AUTO_SECONDS) {
          spawn(unit);
        }
      }

      for (const critter of critters.values()) {
        const unit = present.get(critter.unitId);

        if (unit === undefined && critter.phase !== "out") {
          release(critter);
        }

        animate(critter, unit, deltaSeconds);

        if (critter.phase === "out" && critter.clock >= Math.max(OUT_SECONDS, REGROW_SECONDS)) {
          remove(critter);
        }
      }
    },

    figureScale(unitId) {
      const critter = critters.get(unitId);

      if (critter === undefined) {
        return 1;
      }

      if (critter.phase === "in") {
        return Math.max(HIDDEN_SCALE, 1 - clamp01(critter.clock / SHRINK_SECONDS));
      }

      if (critter.phase === "out") {
        return Math.max(HIDDEN_SCALE, easeOutBack(critter.clock / REGROW_SECONDS));
      }

      return HIDDEN_SCALE;
    },

    clear() {
      for (const critter of critters.values()) {
        remove(critter);
      }

      pending.clear();
      hexedSince.clear();
    },

    dispose() {
      for (const critter of critters.values()) {
        remove(critter);
      }

      root.removeFromParent();

      for (const geometry of kit.geometries) {
        geometry.dispose();
      }

      for (const material of kit.materials) {
        material.dispose();
      }
    },
  };
}
