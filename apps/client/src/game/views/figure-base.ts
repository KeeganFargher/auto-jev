import { CircleGeometry, Color, DataTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, type MeshStandardMaterial, type Object3D } from "three";

export interface FigureBase {
  readonly root: Object3D;
  paint(color: Color, dead: boolean): void;
  dispose(): void;
}

export const FIGURE_SCALE = 1.35;

export const ATTACK_SECONDS = 0.26;

export const CAST_SECONDS = 0.45;

export const HIT_SECONDS = 0.16;

export const DEATH_SECONDS = 0.6;

export const SINK_SECONDS = 0.9;

export const SINK_UNITS = 10;

export const LUNGE_UNITS = 2.2;

export const CHEST_FRACTION = 0.55;

export const DEAD_COLOR = new Color("#6b7280");

export const SPECTRAL_GLOW = new Color("#5cf2c0");

const SPECTRAL_TINT = 0.5;

const SPECTRAL_OPACITY = 0.62;

export interface SpectralMemory {
  colors: Map<MeshStandardMaterial, Color>;
}

export function paintSpectral(surfaces: readonly MeshStandardMaterial[], memory: SpectralMemory, spectral: boolean): void {
  for (const surface of surfaces) {
    const original = memory.colors.get(surface) ?? surface.color.clone();
    memory.colors.set(surface, original);
    surface.color.copy(original);

    if (spectral) {
      surface.color.lerp(SPECTRAL_GLOW, SPECTRAL_TINT);
    }

    surface.transparent = spectral;
    surface.opacity = spectral ? SPECTRAL_OPACITY : 1;
    surface.depthWrite = !spectral;
  }
}

const TEXELS = 128;

const CONTACT_SHADOW_RADIUS = 5.1;

const CONTACT_SHADOW_OPACITY = 0.55;

const CONTACT_SHADOW_CORE = 0.55;

const CONTACT_SHADOW_LIFT = 0.03;

const RING_RADIUS = 2.9;

const RING_LIFT = 0.06;

const RIM_INNER = 0.87;

const RIM_OUTER = 0.93;

const RIM_EDGE = 0.02;

const GLOW_START = 0.45;

const GLOW_ALPHA = 0.34;

const HALO_ALPHA = 0.2;

const RING_OPACITY = 0.95;

const DEAD_RING_OPACITY = 0.4;

interface DecalKit {
  geometry: CircleGeometry;
  shadow: MeshBasicMaterial;
  ring: DataTexture;
}

let decals: DecalKit | null = null;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

  return progress * progress * (3 - 2 * progress);
}

function contactShadowAlpha(radius: number): number {
  return smoothstep(1, CONTACT_SHADOW_CORE, radius);
}

function ringAlpha(radius: number): number {
  const rim = smoothstep(RIM_INNER - RIM_EDGE, RIM_INNER, radius) * (1 - smoothstep(RIM_OUTER, RIM_OUTER + RIM_EDGE, radius));
  const glow = GLOW_ALPHA * smoothstep(GLOW_START, RIM_INNER, radius) * (1 - smoothstep(RIM_OUTER, RIM_OUTER + RIM_EDGE, radius));
  const halo = HALO_ALPHA * smoothstep(RIM_OUTER - 0.03, RIM_OUTER, radius) * (1 - smoothstep(RIM_OUTER, 1, radius));

  return Math.max(rim, glow, halo);
}

function radialTexture(alpha: (radius: number) => number): DataTexture {
  const texels = new Uint8Array(TEXELS * TEXELS * 4);

  for (let row = 0; row < TEXELS; row += 1) {
    for (let column = 0; column < TEXELS; column += 1) {
      const x = ((column + 0.5) / TEXELS) * 2 - 1;
      const y = ((row + 0.5) / TEXELS) * 2 - 1;
      const index = (row * TEXELS + column) * 4;
      texels[index] = 255;
      texels[index + 1] = 255;
      texels[index + 2] = 255;
      texels[index + 3] = Math.round(255 * alpha(Math.hypot(x, y)));
    }
  }

  const texture = new DataTexture(texels, TEXELS, TEXELS);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

function decalKit(): DecalKit {
  if (decals !== null) {
    return decals;
  }

  const geometry = new CircleGeometry(1, 48);
  geometry.rotateX(-Math.PI / 2);

  decals = {
    geometry,
    shadow: new MeshBasicMaterial({
      color: "#000000",
      map: radialTexture(contactShadowAlpha),
      transparent: true,
      opacity: CONTACT_SHADOW_OPACITY,
      depthWrite: false,
    }),
    ring: radialTexture(ringAlpha),
  };

  return decals;
}

export function createFigureBase(): FigureBase {
  const kit = decalKit();
  const root = new Group();

  const shadow = new Mesh(kit.geometry, kit.shadow);
  shadow.scale.setScalar(CONTACT_SHADOW_RADIUS);
  shadow.position.y = CONTACT_SHADOW_LIFT;
  shadow.renderOrder = -2;

  const material = new MeshBasicMaterial({ map: kit.ring, transparent: true, opacity: RING_OPACITY, depthWrite: false });
  const ring = new Mesh(kit.geometry, material);
  ring.scale.setScalar(RING_RADIUS);
  ring.position.y = RING_LIFT;
  ring.renderOrder = -1;
  root.add(shadow, ring);

  return {
    root,

    paint(color, dead) {
      material.color.copy(color);
      material.opacity = dead ? DEAD_RING_OPACITY : RING_OPACITY;
    },

    dispose() {
      material.dispose();
    },
  };
}
