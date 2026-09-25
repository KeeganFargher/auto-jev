import { AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, TorusGeometry, Vector3 } from "three";
import type { ParticleStyle, ParticleSystem } from "./particles.js";
import { createTubeBatch } from "./thread-tube.js";

export interface Tie {
  linkId: number;
  unitId: string;
  chest: Vector3;
  crown: Vector3;
  puppet: boolean;
}

export interface FateThreads {
  readonly root: Group;
  update(ties: readonly Tie[], deltaSeconds: number): void;
  clear(): void;
  dispose(): void;
}

interface Edge {
  readonly from: Vector3;
  readonly to: Vector3;
  readonly phase: number;
  readonly puppet: boolean;
}

interface Snap {
  readonly from: Vector3;
  readonly to: Vector3;
  age: number;
}

interface Knot {
  readonly core: Mesh;
  readonly glow: Mesh;
  age: number;
  seen: boolean;
}

const THREAD_COLOR = new Color("#e45cff");

const CORE_COLOR = new Color("#8a0f55");

const PUPPET_COLOR = new Color("#ffc6ff");

const WOOD_COLOR = new Color("#5a3b22");

const RINGS = 26;

const SIDES = 5;

const MAX_EDGES = 24;

const MAX_PUPPETS = 8;

const BRAID_RADIUS = 0.26;

const BRAID_TURNS_PER_UNIT = 0.22;

const STRAND_RADIUS = 0.2;

const SHEATH_RADIUS = 0.62;

const SAG_PER_UNIT = 0.08;

const WAVE_UNITS = 0.45;

const WAVE_SPEED = 3;

const GROW_SECONDS = 0.35;

const SPOKE_SECONDS = 0.8;

const SNAP_SECONDS = 0.28;

const CINCH_SECONDS = 0.28;

const KNOT_RADIUS = 1.9;

const STRING_HEIGHT = 8;

const SHOULDER_SPREAD = 1.4;

const BAR_HALF = 2.2;

const BAR_SWAY = 0.6;

const UP = new Vector3(0, 1, 0);

const SNAP_FIBRES: ParticleStyle = {
  blend: "solid",
  from: new Color("#c0136a"),
  to: new Color("#3a0626"),
  brightness: 1,
  opacity: 0.95,
  size: [1, 0.4],
  life: [0.6, 1.1],
  speed: [3, 8],
  cone: Math.PI,
  spread: 0.6,
  gravity: 16,
  drag: 2,
  stretch: 0.06,
  softness: 0.3,
};

const SNAP_SPARKS: ParticleStyle = {
  blend: "glow",
  from: new Color("#fbe3ff"),
  to: THREAD_COLOR,
  brightness: 1,
  opacity: 1,
  size: [1.2, 0.25],
  life: [0.2, 0.4],
  speed: [10, 22],
  cone: Math.PI,
  spread: 0.3,
  gravity: 6,
  drag: 3.5,
  stretch: 0.05,
  softness: 0.3,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOut(value: number): number {
  return 1 - (1 - clamp01(value)) ** 3;
}

export function createFateThreads(particles: ParticleSystem): FateThreads {
  const coreSurface = new MeshBasicMaterial({ color: CORE_COLOR, transparent: true, opacity: 0.95, depthWrite: false });

  const glowSurface = new MeshBasicMaterial({
    color: THREAD_COLOR,
    transparent: true,
    opacity: 0.45,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  const puppetSurface = new MeshBasicMaterial({
    color: PUPPET_COLOR,
    transparent: true,
    opacity: 0.9,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  const woodSurface = new MeshBasicMaterial({ color: WOOD_COLOR });
  const knotCoreSurface = new MeshBasicMaterial({ color: CORE_COLOR, side: DoubleSide });

  const knotGlowSurface = new MeshBasicMaterial({
    color: THREAD_COLOR,
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });

  const knotGeometry = new TorusGeometry(KNOT_RADIUS, 0.12, 6, 28);
  const knotGlowGeometry = new TorusGeometry(KNOT_RADIUS, 0.3, 6, 28);
  const cores = createTubeBatch(coreSurface, { tubes: MAX_EDGES * 2 + 8, rings: RINGS, sides: SIDES });
  const sheaths = createTubeBatch(glowSurface, { tubes: MAX_EDGES + 8, rings: RINGS, sides: SIDES });
  const strings = createTubeBatch(puppetSurface, { tubes: MAX_PUPPETS * 3, rings: 2, sides: 4 });
  const bars = createTubeBatch(woodSurface, { tubes: MAX_PUPPETS * 2, rings: 2, sides: 5 });
  const root = new Group();
  root.add(cores.mesh, sheaths.mesh, strings.mesh, bars.mesh);
  const links = new Map<number, number>();
  const lastEdges = new Map<number, Edge[]>();
  const knots = new Map<string, Knot>();
  const snaps: Snap[] = [];
  const centerline = Array.from({ length: RINGS }, () => new Vector3());
  const braid = Array.from({ length: RINGS }, () => new Vector3());
  const direction = new Vector3();
  const across = new Vector3();
  const over = new Vector3();
  const spot = new Vector3();
  const bar = new Vector3();
  const left = new Vector3();
  const right = new Vector3();
  const reach = new Vector3();
  let time = 0;

  function sample(from: Vector3, to: Vector3, start: number, end: number, phase: number, points: Vector3[]): void {
    const sag = from.distanceTo(to) * SAG_PER_UNIT;

    for (const [index, point] of points.entries()) {
      const t = start + (end - start) * (index / (points.length - 1));
      const belly = 4 * t * (1 - t);
      point.lerpVectors(from, to, t);
      point.y += -sag * belly + Math.sin(time * WAVE_SPEED + phase + t * Math.PI * 2) * WAVE_UNITS * belly;
    }
  }

  function drawThread(from: Vector3, to: Vector3, start: number, end: number, phase: number, thickness: number): void {
    sample(from, to, start, end, phase, centerline);
    direction.subVectors(to, from);
    const length = direction.length();

    if (length < 0.001) {
      return;
    }

    direction.divideScalar(length);
    across.crossVectors(direction, UP);

    if (across.lengthSq() < 1e-6) {
      across.set(1, 0, 0);
    }

    across.normalize();
    over.crossVectors(across, direction);
    const turns = length * BRAID_TURNS_PER_UNIT;

    for (const strand of [0, 1]) {
      for (const [index, point] of braid.entries()) {
        const t = start + (end - start) * (index / (RINGS - 1));
        const angle = t * turns * Math.PI * 2 + strand * Math.PI + time * 2 + phase;
        point
          .copy(centerline[index] ?? point)
          .addScaledVector(across, Math.cos(angle) * BRAID_RADIUS * thickness)
          .addScaledVector(over, Math.sin(angle) * BRAID_RADIUS * thickness);
      }

      cores.tube(braid, () => STRAND_RADIUS * thickness);
    }

    sheaths.tube(centerline, () => SHEATH_RADIUS * thickness);
  }

  function drawStrings(tie: Tie, phase: number): void {
    const sway = Math.sin(time * 2.4 + phase) * BAR_SWAY;
    bar.copy(tie.crown).setY(tie.crown.y + STRING_HEIGHT + Math.sin(time * 1.7 + phase) * 0.4);
    reach.set(BAR_HALF, 0, 0).applyAxisAngle(UP, sway);
    left.copy(bar).sub(reach);
    right.copy(bar).add(reach);
    bars.tube([left, right], () => 0.34);
    reach.set(0, 0, BAR_HALF * 0.7).applyAxisAngle(UP, sway);
    bars.tube([spot.copy(bar).sub(reach), bar.clone().add(reach)], () => 0.34);
    strings.tube([left, tie.crown.clone().add(reach.set(-SHOULDER_SPREAD, -1.2, 0))], () => 0.15);
    strings.tube([right, tie.crown.clone().add(reach.set(SHOULDER_SPREAD, -1.2, 0))], () => 0.15);
    strings.tube([bar, tie.crown], () => 0.15);
  }

  function snapEdge(edge: Edge): void {
    snaps.push({ from: edge.from.clone(), to: edge.to.clone(), age: 0 });
    spot.lerpVectors(edge.from, edge.to, 0.5);
    particles.emit(SNAP_SPARKS, spot, UP, 8);

    for (let index = 1; index < 5; index += 1) {
      particles.emit(SNAP_FIBRES, spot.lerpVectors(edge.from, edge.to, index / 5), UP, 2);
    }
  }

  function knotFor(unitId: string): Knot {
    const known = knots.get(unitId);

    if (known !== undefined) {
      return known;
    }

    const knot: Knot = {
      core: new Mesh(knotGeometry, knotCoreSurface),
      glow: new Mesh(knotGlowGeometry, knotGlowSurface),
      age: 0,
      seen: true,
    };

    root.add(knot.core, knot.glow);
    knots.set(unitId, knot);

    return knot;
  }

  function dropKnot(unitId: string, knot: Knot, burst: boolean): void {
    if (burst) {
      particles.emit(SNAP_SPARKS, knot.core.position, UP, 10);
      particles.emit(SNAP_FIBRES, knot.core.position, UP, 6);
    }

    knot.core.removeFromParent();
    knot.glow.removeFromParent();
    knots.delete(unitId);
  }

  return {
    root,

    update(ties, deltaSeconds) {
      time += deltaSeconds;
      cores.begin();
      sheaths.begin();
      strings.begin();
      bars.begin();
      const groups = new Map<number, Tie[]>();

      for (const tie of ties) {
        groups.set(tie.linkId, [...(groups.get(tie.linkId) ?? []), tie]);
      }

      for (const knot of knots.values()) {
        knot.seen = false;
      }

      for (const [linkId, edges] of lastEdges) {
        if (!groups.has(linkId)) {
          for (const edge of edges) {
            snapEdge(edge);
          }

          lastEdges.delete(linkId);
          links.delete(linkId);
        }
      }

      for (const [linkId, members] of groups) {
        const age = (links.get(linkId) ?? 0) + deltaSeconds;
        links.set(linkId, age);
        const cx = members.reduce((sum, tie) => sum + tie.chest.x, 0) / members.length;
        const cz = members.reduce((sum, tie) => sum + tie.chest.z, 0) / members.length;

        const ring = [...members].sort(
          (a, b) => Math.atan2(a.chest.z - cz, a.chest.x - cx) - Math.atan2(b.chest.z - cz, b.chest.x - cx),
        );

        const count = ring.length < 3 ? ring.length - 1 : ring.length;
        const grow = easeOut(age / GROW_SECONDS);
        const edges: Edge[] = [];

        for (let index = 0; index < count; index += 1) {
          const a = ring[index]!;
          const b = ring[(index + 1) % ring.length]!;
          const phase = linkId * 1.7 + index * 2.3;
          drawThread(a.chest, b.chest, 0.5 - grow / 2, 0.5 + grow / 2, phase, a.puppet || b.puppet ? 1.3 : 1);
          edges.push({ from: a.chest.clone(), to: b.chest.clone(), phase, puppet: a.puppet || b.puppet });
        }

        lastEdges.set(linkId, edges);

        if (age < SPOKE_SECONDS) {
          const spoke = easeOut(age / (SPOKE_SECONDS * 0.5));
          const fade = 1 - clamp01((age - SPOKE_SECONDS * 0.5) / (SPOKE_SECONDS * 0.5));
          const hub = new Vector3(cx, 0.4, cz);

          for (const [index, tie] of ring.entries()) {
            drawThread(hub, tie.chest, 0, spoke, linkId + index * 1.3, 0.8 * fade);
          }
        }

        for (const [index, tie] of ring.entries()) {
          const knot = knotFor(tie.unitId);
          knot.seen = true;
          knot.age += deltaSeconds;
          const cinch = 1 + 1.3 * (1 - easeOut(knot.age / CINCH_SECONDS));

          for (const mesh of [knot.core, knot.glow]) {
            mesh.position.copy(tie.chest);
            mesh.rotation.set(
              Math.PI / 2 + 0.35 * Math.sin(time * 1.3 + index),
              time * 1.8 + index,
              0.2 * Math.cos(time * 1.1 + index),
            );
            mesh.scale.setScalar(cinch * (tie.puppet ? 1.12 : 1));
          }

          if (tie.puppet) {
            drawStrings(tie, linkId * 0.9 + index * 1.9);
          }
        }
      }

      for (const [unitId, knot] of knots) {
        if (!knot.seen) {
          dropKnot(unitId, knot, true);
        }
      }

      let recoiling = 0;

      for (const snap of snaps) {
        snap.age += deltaSeconds;
        const recoil = clamp01(snap.age / SNAP_SECONDS);

        if (recoil >= 1) {
          continue;
        }

        snaps[recoiling] = snap;
        recoiling += 1;
        const kept = 0.5 * (1 - easeOut(recoil));
        drawThread(snap.from, snap.to, 0, kept, recoil * 9, 1 - recoil * 0.6);
        drawThread(snap.from, snap.to, 1 - kept, 1, recoil * 7, 1 - recoil * 0.6);
      }

      snaps.length = recoiling;

      glowSurface.opacity = 0.4 + 0.12 * Math.sin(time * 3.2);
      knotGlowSurface.opacity = 0.45 + 0.2 * Math.sin(time * 4.1);
      cores.end();
      sheaths.end();
      strings.end();
      bars.end();
    },

    clear() {
      for (const [unitId, knot] of knots) {
        dropKnot(unitId, knot, false);
      }

      snaps.length = 0;
      links.clear();
      lastEdges.clear();

      for (const batch of [cores, sheaths, strings, bars]) {
        batch.begin();
        batch.end();
      }
    },

    dispose() {
      root.removeFromParent();

      for (const batch of [cores, sheaths, strings, bars]) {
        batch.dispose();
      }

      for (const surface of [coreSurface, glowSurface, puppetSurface, woodSurface, knotCoreSurface, knotGlowSurface]) {
        surface.dispose();
      }

      knotGeometry.dispose();
      knotGlowGeometry.dispose();
    },
  };
}
