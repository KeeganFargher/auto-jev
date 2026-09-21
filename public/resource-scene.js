import * as THREE from "three";
import { createResource } from "./world-models.js";

/** Batches the large map's resource props into shared instanced draws, retaining regrowth visuals. */
export function createResourceScene(scene, nodes, toPosition) {
  const buckets = new Map();
  const entries = new Map();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const node of nodes) {
    const prototype = createResource(node.kind, ((node.x * 13 + node.y * 7) % 19) / 19);
    prototype.position.copy(toPosition(node));
    prototype.updateMatrixWorld(true);
    const parts = [];
    prototype.traverse((object) => {
      if (!object.isMesh) return;
      const key = `${object.geometry.uuid}:${object.material.uuid}`;
      if (!buckets.has(key)) buckets.set(key, { geometry: object.geometry, material: object.material, parts: [] });
      const bucket = buckets.get(key);
      let ancestor = object;
      let foliage = false;
      while (ancestor !== null) { if (ancestor.name === "renewable-foliage") foliage = true; ancestor = ancestor.parent; }
      const part = { bucket, index: bucket.parts.length, resourceId: node.id, matrix: object.matrixWorld.clone(), foliage, trunk: object.name === "tree-trunk" };
      bucket.parts.push(part); parts.push(part);
    });
    entries.set(node.id, { parts, amount: null });
  }
  for (const bucket of buckets.values()) {
    bucket.mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.parts.length);
    bucket.mesh.userData.resourceIds = bucket.parts.map((part) => part.resourceId);
    bucket.mesh.castShadow = true; bucket.mesh.receiveShadow = true;
    // Resource visibility changes without changing instance count; keep bounds valid for all regrowth.
    bucket.mesh.frustumCulled = false;
    scene.add(bucket.mesh);
  }
  const stump = new THREE.Matrix4();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const update = (resources) => {
    for (const node of resources) {
      const entry = entries.get(node.id);
      if (entry.amount === node.amount) continue;
      entry.amount = node.amount;
      for (const part of entry.parts) {
        let matrix = part.matrix;
        if (node.amount <= 0 && (part.foliage || !["tree", "berries", "river"].includes(node.kind))) matrix = hidden;
        else if (node.amount <= 0 && part.trunk) {
          part.matrix.decompose(position, rotation, scale);
          position.y -= 0.275; scale.y = 0.25;
          stump.compose(position, rotation, scale); matrix = stump;
        }
        part.bucket.mesh.setMatrixAt(part.index, matrix);
        part.bucket.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  };
  update(nodes);
  return { update };
}
