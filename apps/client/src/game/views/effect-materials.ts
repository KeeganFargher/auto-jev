import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Scene,
} from "three";

export interface MaterialPool<T extends Material> {
  take(): T;
}

const WARM_SCALE = 0.001;

const lent = new Map<Material, () => void>();

function pool<T extends Material>(template: T): MaterialPool<T> {
  const idle: T[] = [];

  return {
    take() {
      const material = idle.pop() ?? template.clone();
      material.copy(template);
      lent.set(material, () => idle.push(material));

      return material;
    },
  };
}

export const effectMaterials = {
  glow: pool(new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, forceSinglePass: true })),
  flash: pool(new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false })),
  flame: pool(new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide })),
  trail: pool(
    new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      forceSinglePass: true,
    }),
  ),
  scorch: pool(new MeshBasicMaterial({ transparent: true, depthWrite: false })),
  core: pool(new MeshBasicMaterial()),
  rock: pool(new MeshStandardMaterial({ flatShading: true, roughness: 0.95 })),
  arc: pool(new LineBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false })),
};

export function releaseEffectMaterial(material: Material): void {
  const giveBack = lent.get(material);

  if (giveBack === undefined) {
    throw new Error(`effect material ${material.type} ${material.uuid} was not taken from the pool, or was already released`);
  }

  lent.delete(material);
  giveBack();
}

interface Specks {
  surface: BufferGeometry;
  stroke: BufferGeometry;
}

let specks: Specks | null = null;

function warmSpecks(): Specks {
  if (specks === null) {
    const corners = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const surface = new BufferGeometry();
    surface.setAttribute("position", new Float32BufferAttribute(corners, 3));
    surface.setAttribute("normal", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const stroke = new BufferGeometry();
    stroke.setAttribute("position", new Float32BufferAttribute(corners, 3));
    specks = { surface, stroke };
  }

  return specks;
}

export function warmEffectMaterials(scene: Scene): () => void {
  const group = new Group();
  const taken: Material[] = [];

  const { surface, stroke } = warmSpecks();

  for (const kind of Object.values(effectMaterials)) {
    const material = kind.take();
    const drawn = material instanceof LineBasicMaterial ? new Line(stroke, material) : new Mesh(surface, material);
    drawn.scale.setScalar(WARM_SCALE);
    drawn.frustumCulled = false;
    group.add(drawn);
    taken.push(material);
  }

  scene.add(group);

  return () => {
    group.removeFromParent();

    for (const material of taken) {
      releaseEffectMaterial(material);
    }
  };
}
