import { Color, CylinderGeometry, Mesh, MeshStandardMaterial } from "three";

export interface FigureBase {
  readonly mesh: Mesh;
  paint(color: Color, dead: boolean): void;
  dispose(): void;
}

export const FIGURE_SCALE = 1.35;

export const BASE_RADIUS = 3.4;

export const BASE_HEIGHT = 0.7;

export const ATTACK_SECONDS = 0.26;

export const CAST_SECONDS = 0.45;

export const HIT_SECONDS = 0.16;

export const DEATH_SECONDS = 0.6;

export const SINK_SECONDS = 0.9;

export const SINK_UNITS = 10;

export const LUNGE_UNITS = 2.2;

export const DEAD_COLOR = new Color("#6b7280");

const BASE_GLOW = 0.18;

export function createFigureBase(): FigureBase {
  const material = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.72,
    metalness: 0.2,
    flatShading: true,
  });

  const geometry = new CylinderGeometry(BASE_RADIUS, BASE_RADIUS * 1.06, BASE_HEIGHT, 24);
  const mesh = new Mesh(geometry, material);
  mesh.position.y = BASE_HEIGHT / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return {
    mesh,

    paint(color, dead) {
      material.color.copy(color);
      material.emissive.copy(color).multiplyScalar(dead ? 0 : BASE_GLOW);
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
