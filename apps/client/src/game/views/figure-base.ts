import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";

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

const CONTACT_SHADOW_REACH = 1.5;

const CONTACT_SHADOW_OPACITY = 0.55;

const CONTACT_SHADOW_LIFT = 0.03;

const CONTACT_SHADOW_TEXELS = 64;

const CONTACT_SHADOW_CORE = 0.55;

interface ContactShadowKit {
  geometry: CircleGeometry;
  material: MeshBasicMaterial;
}

let contactShadow: ContactShadowKit | null = null;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

  return progress * progress * (3 - 2 * progress);
}

function contactShadowTexture(): DataTexture {
  const size = CONTACT_SHADOW_TEXELS;
  const texels = new Uint8Array(size * size * 4);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = ((column + 0.5) / size) * 2 - 1;
      const y = ((row + 0.5) / size) * 2 - 1;
      texels[(row * size + column) * 4 + 3] = Math.round(255 * smoothstep(1, CONTACT_SHADOW_CORE, Math.hypot(x, y)));
    }
  }

  const texture = new DataTexture(texels, size, size);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

function contactShadowKit(): ContactShadowKit {
  if (contactShadow !== null) {
    return contactShadow;
  }

  const geometry = new CircleGeometry(1, 32);
  geometry.rotateX(-Math.PI / 2);

  contactShadow = {
    geometry,
    material: new MeshBasicMaterial({
      map: contactShadowTexture(),
      transparent: true,
      opacity: CONTACT_SHADOW_OPACITY,
      depthWrite: false,
    }),
  };

  return contactShadow;
}

function createContactShadow(): Mesh {
  const kit = contactShadowKit();
  const mesh = new Mesh(kit.geometry, kit.material);
  mesh.scale.setScalar(BASE_RADIUS * CONTACT_SHADOW_REACH);
  mesh.position.y = -BASE_HEIGHT / 2 + CONTACT_SHADOW_LIFT;
  mesh.renderOrder = -1;

  return mesh;
}

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
  mesh.add(createContactShadow());

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
