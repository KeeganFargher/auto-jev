import { BufferGeometry, InstancedMesh, Matrix4, Mesh, SkinnedMesh, type Material, type Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

interface Batch {
  material: Material;
  castShadow: boolean;
  receiveShadow: boolean;
  parts: BufferGeometry[];
}

function attributeSignature(geometry: BufferGeometry): string {
  return Object.entries(geometry.attributes)
    .map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`)
    .sort()
    .join(",");
}

function mergeable(node: Object3D): node is Mesh<BufferGeometry, Material> {
  return (
    node instanceof Mesh &&
    !(node instanceof InstancedMesh) &&
    !(node instanceof SkinnedMesh) &&
    !Array.isArray(node.material) &&
    !node.material.transparent &&
    node.children.length === 0 &&
    node.renderOrder === 0 &&
    node.frustumCulled &&
    Object.keys(node.geometry.morphAttributes).length === 0
  );
}

function collectStatic(node: Object3D, island: Object3D, live: ReadonlySet<Object3D>, found: Mesh<BufferGeometry, Material>[]): void {
  const isIsland = node === island;

  if ((!isIsland && live.has(node)) || !node.visible) {
    return;
  }

  if (!isIsland && mergeable(node)) {
    found.push(node);
  }

  for (const child of node.children) {
    collectStatic(child, island, live, found);
  }
}

function flipWinding(geometry: BufferGeometry): void {
  for (const attribute of Object.values(geometry.attributes)) {
    for (let corner = 0; corner + 2 < attribute.count; corner += 3) {
      for (let component = 0; component < attribute.itemSize; component += 1) {
        const second = attribute.getComponent(corner + 1, component);
        attribute.setComponent(corner + 1, component, attribute.getComponent(corner + 2, component));
        attribute.setComponent(corner + 2, component, second);
      }
    }
  }
}

function placedGeometry(mesh: Mesh<BufferGeometry, Material>, fromWorld: Matrix4): BufferGeometry {
  const geometry = mesh.geometry.index === null ? mesh.geometry.clone() : mesh.geometry.toNonIndexed();
  const placement = new Matrix4().multiplyMatrices(fromWorld, mesh.matrixWorld);
  geometry.applyMatrix4(placement);

  if (placement.determinant() < 0) {
    flipWinding(geometry);
  }

  return geometry;
}

function pruneEmpty(node: Object3D | null, island: Object3D): void {
  let cursor = node;

  while (cursor !== null && cursor !== island && cursor.children.length === 0 && cursor.type === "Group") {
    const parent = cursor.parent;
    cursor.removeFromParent();
    cursor = parent;
  }
}

export function mergeStaticMeshes(island: Object3D, live: ReadonlySet<Object3D>): BufferGeometry[] {
  island.updateMatrixWorld(true);
  const fromWorld = island.matrixWorld.clone().invert();
  const found: Mesh<BufferGeometry, Material>[] = [];
  collectStatic(island, island, live, found);
  const batches = new Map<string, Batch>();

  for (const mesh of found) {
    const key = [mesh.material.uuid, mesh.castShadow, mesh.receiveShadow, attributeSignature(mesh.geometry)].join("|");
    let batch = batches.get(key);

    if (batch === undefined) {
      batch = { material: mesh.material, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, parts: [] };
      batches.set(key, batch);
    }

    batch.parts.push(placedGeometry(mesh, fromWorld));
  }

  for (const mesh of found) {
    const parent = mesh.parent;
    mesh.removeFromParent();
    pruneEmpty(parent, island);
  }

  const created: BufferGeometry[] = [];

  for (const batch of batches.values()) {
    const merged = mergeGeometries(batch.parts);

    if (!(merged instanceof BufferGeometry)) {
      throw new Error(`static meshes sharing ${batch.material.type} ${batch.material.uuid} could not be merged`);
    }

    for (const part of batch.parts) {
      part.dispose();
    }

    const mesh = new Mesh(merged, batch.material);
    mesh.castShadow = batch.castShadow;
    mesh.receiveShadow = batch.receiveShadow;
    island.add(mesh);
    created.push(merged);
  }

  return created;
}
