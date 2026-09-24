import { BufferGeometry, Color, Float32BufferAttribute, Line, Mesh, OctahedronGeometry, RingGeometry, Vector3, type MeshBasicMaterial, type Object3D, type Scene } from "three";
import type { ConditionKind } from "@jev-game/game";
import { effectMaterials, releaseEffectMaterial } from "./effect-materials.js";
import { hitKind, hitTint, trailStyle } from "./hit-effects.js";
import { createTrail, type ParticleStyle, type ParticleSystem } from "./particles.js";
import { projectileVisual } from "./spell-visuals.js";

export interface GroundMarker {
  setOpacity(opacity: number): void;
  remove(): void;
}

export interface BattleEffects {
  comboBurst(ground: Vector3, chest: Vector3, condition: ConditionKind): void;
  impactFlash(center: Vector3, radius: number, color: string): void;
  projectile(abilityId: string, from: Vector3, aim: () => Vector3, onLand: () => void): void;
  arc(start: Vector3, end: Vector3, abilityId: string, onLand: () => void): void;
  marker(center: Vector3, innerFraction: number, radius: number, color: string, opacity: number): GroundMarker;
  step(deltaSeconds: number): void;
  dispose(): void;
}

interface RunningEffect {
  age: number;
  duration: number;
  step(progress: number): void;
  land: (() => void) | null;
  retire(): void;
}

interface GroundRing {
  mesh: Mesh<RingGeometry, MeshBasicMaterial>;
  retire(): void;
}

export const CONDITION_COLORS: Readonly<Record<ConditionKind, string>> = {
  staggered: "#ffa928",
  brittle: "#9fe8ff",
  disoriented: "#b58cff",
};

const UP = new Vector3(0, 1, 0);

const RING_SEGMENTS = 40;

const RING_LIFT = 0.18;

const COMBO_RING_INNER = 0.5;

const COMBO_RING_RADIUS = 3;

const IMPACT_RING_INNER = 0.2;

const PROJECTILE_SECONDS = 0.16;

const ARC_SECONDS = 0.22;

const ARC_LANDS_AT = 0.3;

const ARC_SEGMENTS = 7;

const ARC_JITTER = 1.1;

const COMBO_BURST_SECONDS = 0.55;

const COMBO_SPARK_COUNT = 18;

const TRAIL_SPACING_UNITS = 1.1;

const SPARK = new OctahedronGeometry(1, 0);

const BOLT = new OctahedronGeometry(0.7, 0);

const rings = new Map<number, RingGeometry>();

function comboSparks(color: string): ParticleStyle {
  return {
    blend: "solid",
    from: new Color("#ffffff"),
    to: new Color(color),
    brightness: 1,
    opacity: 1,
    size: [2.2, 0.5],
    life: [0.3, 0.55],
    speed: [12, 26],
    cone: Math.PI,
    spread: 0.6,
    gravity: 12,
    drag: 3.5,
    stretch: 0.04,
    softness: 0.2,
  };
}

const COMBO_SPARKS: Readonly<Record<ConditionKind, ParticleStyle>> = {
  staggered: comboSparks(CONDITION_COLORS.staggered),
  brittle: comboSparks(CONDITION_COLORS.brittle),
  disoriented: comboSparks(CONDITION_COLORS.disoriented),
};

function ringGeometry(innerFraction: number): RingGeometry {
  const cached = rings.get(innerFraction);

  if (cached !== undefined) {
    return cached;
  }

  const geometry = new RingGeometry(innerFraction, 1, RING_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  rings.set(innerFraction, geometry);

  return geometry;
}

function groundRing(center: Vector3, innerFraction: number, radius: number, color: string, opacity: number): GroundRing {
  const material = effectMaterials.flash.take();
  material.color.set(color);
  material.opacity = opacity;
  const mesh = new Mesh(ringGeometry(innerFraction), material);
  mesh.position.set(center.x, RING_LIFT, center.z);
  mesh.scale.setScalar(radius);

  return {
    mesh,

    retire() {
      mesh.removeFromParent();
      releaseEffectMaterial(material);
    },
  };
}

function arcGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array((ARC_SEGMENTS + 1) * 3), 3));

  return geometry;
}

export function createBattleEffects(scene: Scene, particles: ParticleSystem): BattleEffects {
  const running: RunningEffect[] = [];
  const idleArcs: BufferGeometry[] = [];
  const point = new Vector3();

  function run(objects: readonly Object3D[], duration: number, step: (progress: number) => void, land: (() => void) | null, retire: () => void): void {
    for (const object of objects) {
      scene.add(object);
    }

    running.push({ age: 0, duration, step, land, retire });
    step(0);
  }

  return {
    comboBurst(ground, chest, condition) {
      const color = CONDITION_COLORS[condition];
      const ring = groundRing(ground, COMBO_RING_INNER, COMBO_RING_RADIUS, color, 0.9);
      const glint = effectMaterials.flash.take();
      glint.color.set(color);
      const flash = new Mesh(SPARK, glint);
      flash.position.copy(chest);
      particles.emit(COMBO_SPARKS[condition], chest, UP, COMBO_SPARK_COUNT);

      run(
        [ring.mesh, flash],
        COMBO_BURST_SECONDS,
        (progress) => {
          ring.mesh.scale.setScalar(COMBO_RING_RADIUS * (1 + progress * 3.5));
          ring.mesh.material.opacity = 0.9 * (1 - progress);
          flash.scale.setScalar(1.5 + progress * 5);
          flash.rotation.y = progress * 4;
          glint.opacity = 1 - progress;
        },
        null,
        () => {
          ring.retire();
          flash.removeFromParent();
          releaseEffectMaterial(glint);
        },
      );
    },

    impactFlash(center, radius, color) {
      const reach = Math.max(1, radius);
      const ring = groundRing(center, IMPACT_RING_INNER, reach, color, 0.95);

      run(
        [ring.mesh],
        COMBO_BURST_SECONDS,
        (progress) => {
          ring.mesh.scale.setScalar(reach * (1 + progress * 0.6));
          ring.mesh.material.opacity = 0.95 * (1 - progress);
        },
        null,
        () => ring.retire(),
      );
    },

    projectile(abilityId, from, aim, onLand) {
      const visual = projectileVisual(particles, abilityId, from);

      if (visual !== null) {
        run(visual.objects, PROJECTILE_SECONDS, (progress) => visual.place(from, aim(), progress), onLand, () => visual.dispose());

        return;
      }

      const kind = hitKind(abilityId);
      const glint = effectMaterials.flash.take();
      glint.color.set(hitTint(kind));
      const bolt = new Mesh(BOLT, glint);
      bolt.scale.set(0.8, 0.8, 3.2);
      const trail = createTrail(particles, trailStyle(kind), TRAIL_SPACING_UNITS, from);

      run(
        [bolt],
        PROJECTILE_SECONDS,
        (progress) => {
          const end = aim();
          bolt.position.lerpVectors(from, end, progress);
          bolt.lookAt(end);
          trail.follow(bolt.position);
        },
        onLand,
        () => {
          bolt.removeFromParent();
          releaseEffectMaterial(glint);
        },
      );
    },

    arc(start, end, abilityId, onLand) {
      const geometry = idleArcs.pop() ?? arcGeometry();
      const position = geometry.getAttribute("position");

      for (let index = 0; index <= ARC_SEGMENTS; index += 1) {
        const jitter = index === 0 || index === ARC_SEGMENTS ? 0 : ARC_JITTER;
        point.lerpVectors(start, end, index / ARC_SEGMENTS);
        position.setXYZ(index, point.x + (Math.random() - 0.5) * jitter, point.y + (Math.random() - 0.5) * jitter, point.z);
      }

      position.needsUpdate = true;
      geometry.computeBoundingSphere();
      const glint = effectMaterials.arc.take();
      glint.color.set(hitTint(hitKind(abilityId)));
      const line = new Line(geometry, glint);
      let landed = false;

      run(
        [line],
        ARC_SECONDS,
        (progress) => {
          glint.opacity = 1 - progress;

          if (!landed && progress >= ARC_LANDS_AT) {
            landed = true;
            onLand();
          }
        },
        null,
        () => {
          line.removeFromParent();
          releaseEffectMaterial(glint);
          idleArcs.push(geometry);
        },
      );
    },

    marker(center, innerFraction, radius, color, opacity) {
      const ring = groundRing(center, innerFraction, radius, color, opacity);
      scene.add(ring.mesh);

      return {
        setOpacity(next) {
          ring.mesh.material.opacity = next;
        },

        remove() {
          ring.retire();
        },
      };
    },

    step(deltaSeconds) {
      for (let index = running.length - 1; index >= 0; index -= 1) {
        const effect = running[index]!;
        effect.age += deltaSeconds;
        const progress = Math.min(1, effect.age / effect.duration);
        effect.step(progress);

        if (progress >= 1) {
          running.splice(index, 1);
          effect.land?.();
          effect.retire();
        }
      }
    },

    dispose() {
      for (const effect of running) {
        effect.retire();
      }

      running.length = 0;

      for (const geometry of idleArcs) {
        geometry.dispose();
      }

      idleArcs.length = 0;
    },
  };
}
