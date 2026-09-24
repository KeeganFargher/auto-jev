import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Box3, BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, Mesh, Triangle, Vector3, type Object3D } from "three";
import { createPropKit } from "../src/game/environments/prop-kit.js";

function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = [];

  root.traverse((node) => {
    if (node instanceof Mesh) {
      found.push(node);
    }
  });

  return found;
}

function exactBounds(root: Object3D): Box3 {
  root.updateMatrixWorld(true);

  return new Box3().setFromObject(root, true);
}

function sameBounds(first: Box3, second: Box3): boolean {
  return first.min.distanceTo(second.min) < 1e-4 && first.max.distanceTo(second.max) < 1e-4;
}

test("static props that share a surface and shadow settings draw as one mesh", () => {
  const kit = createPropKit(1);
  const stone = kit.surface("#888888");
  const wood = kit.surface("#aa7744");

  const root = kit.group(
    ...[0, 1, 2, 3, 4].map((index) => kit.solid(new BoxGeometry(1, 1, 1), stone, index * 4, 0, 0)),
    ...[0, 1, 2].map((index) => kit.solid(new CylinderGeometry(1, 1, 3, 8), wood, 0, 0, index * 4)),
    kit.solid(new IcosahedronGeometry(1, 0), stone, -6, 0, 0),
  );

  kit.mergeStatic(root);
  assert.equal(meshes(root).length, 2);
  kit.dispose();
});

test("merging leaves every prop exactly where it stood", () => {
  const kit = createPropKit(2);
  const stone = kit.surface("#888888");
  const leaning = kit.solid(new BoxGeometry(2, 6, 1), stone, 10, 3, -4);
  leaning.rotation.set(0.3, 1.1, -0.4);
  leaning.scale.set(1.5, 0.8, 2);
  const cluster = kit.group(kit.solid(new ConeGeometry(2, 5, 6), stone, 0, 2.5, 0), kit.solid(new BoxGeometry(1, 1, 1), stone, 3, 0.5, 1));
  cluster.position.set(-20, 0, 12);
  cluster.rotation.y = 2.4;
  cluster.scale.setScalar(1.7);
  const root = kit.group(leaning, cluster);
  const before = exactBounds(root);

  kit.mergeStatic(root);
  assert.equal(meshes(root).length, 1);
  assert.ok(sameBounds(exactBounds(root), before), "the merged props moved");
  kit.dispose();
});

test("props that cast shadows are not merged with props that do not", () => {
  const kit = createPropKit(3);
  const stone = kit.surface("#888888");
  const flat = kit.solid(new BoxGeometry(4, 0.2, 4), stone, 0, 0, 0);
  flat.castShadow = false;
  const root = kit.group(flat, kit.solid(new BoxGeometry(1, 3, 1), stone, 5, 1.5, 0), kit.solid(new BoxGeometry(1, 3, 1), stone, 8, 1.5, 0));

  kit.mergeStatic(root);
  const merged = meshes(root);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((mesh) => mesh.castShadow).sort(), [false, true]);
  assert.ok(merged.every((mesh) => mesh.receiveShadow));
  kit.dispose();
});

function attachedTo(root: Object3D, target: Object3D): boolean {
  let attached = false;

  root.traverse((node) => {
    attached ||= node === target;
  });

  return attached;
}

test("a swaying prop keeps moving as one piece with its own parts merged inside it", () => {
  const kit = createPropKit(4);
  const bark = kit.surface("#6b4a2b");
  const tree = kit.group(kit.solid(new CylinderGeometry(0.5, 0.7, 6, 6), bark, 0, 3, 0), kit.solid(new ConeGeometry(3, 6, 6), bark, 0, 8, 0));
  tree.position.set(4, 0, -3);
  kit.animate([tree], (seconds) => {
    tree.rotation.z = seconds * 0.1;
  });
  const root = kit.group(tree, kit.solid(new BoxGeometry(1, 1, 1), bark, 6, 0.5, 0), kit.solid(new BoxGeometry(1, 1, 1), bark, 9, 0.5, 0));
  const treeBounds = exactBounds(tree);

  kit.mergeStatic(root);
  assert.ok(attachedTo(root, tree), "the swaying tree was taken out of the environment");
  assert.equal(meshes(tree).length, 1);
  assert.ok(sameBounds(exactBounds(tree), treeBounds), "the tree's parts moved when merged");
  assert.equal(meshes(root).length, 2);
  kit.tick(2);
  assert.equal(tree.rotation.z, 0.2);
  kit.dispose();
});

test("a part its animator moves on its own is never merged away", () => {
  const kit = createPropKit(7);
  const ember = kit.surface("#ff8a2a");
  const flame = kit.solid(new ConeGeometry(1, 3, 6), ember, 0, 1.5, 0);
  const core = kit.solid(new ConeGeometry(0.5, 2, 6), ember, 0, 1, 0);
  const blaze = kit.group(flame, core, kit.solid(new BoxGeometry(2, 0.4, 2), ember, 0, 0, 0));
  kit.animate([flame, core], (seconds) => {
    flame.scale.y = 1 + seconds;
    core.scale.y = 1 - seconds * 0.5;
  });
  const root = kit.group(blaze, kit.solid(new BoxGeometry(2, 0.4, 2), ember, 5, 0, 0));

  kit.mergeStatic(root);
  assert.ok(attachedTo(root, flame) && attachedTo(root, core), "an animated flame was merged away");
  assert.equal(meshes(root).length, 3);
  kit.tick(0.5);
  assert.equal(flame.scale.y, 1.5);
  assert.equal(core.scale.y, 0.75);
  kit.dispose();
});

test("a mirrored prop keeps its faces pointing outwards once merged", () => {
  const kit = createPropKit(5);
  const stone = kit.surface("#888888");
  const mirrored = kit.solid(new BoxGeometry(2, 2, 2), stone, 0, 1, 0);
  mirrored.scale.set(-1, 1, 1);
  const root = kit.group(mirrored, kit.solid(new BoxGeometry(2, 2, 2), stone, 5, 1, 0));

  kit.mergeStatic(root);
  const [merged] = meshes(root);
  assert.ok(merged !== undefined);
  const position = merged.geometry.getAttribute("position");
  const normal = merged.geometry.getAttribute("normal");
  const triangle = new Triangle();
  const facing = new Vector3();
  const stored = new Vector3();

  for (let corner = 0; corner < position.count; corner += 3) {
    triangle.setFromAttributeAndIndices(position, corner, corner + 1, corner + 2);
    triangle.getNormal(facing);
    stored.fromBufferAttribute(normal, corner);
    assert.ok(facing.dot(stored) > 0.99, `triangle ${corner / 3} faces inwards`);
  }

  kit.dispose();
});

test("merged batches are released with the rest of the environment", () => {
  const kit = createPropKit(6);
  const stone = kit.surface("#888888");
  const root = kit.group(kit.solid(new BoxGeometry(1, 1, 1), stone, 0, 0, 0), kit.solid(new BoxGeometry(1, 1, 1), stone, 3, 0, 0));
  kit.mergeStatic(root);
  const [merged] = meshes(root);
  assert.ok(merged !== undefined);
  let released = false;
  merged.geometry.addEventListener("dispose", () => {
    released = true;
  });

  kit.dispose();
  assert.ok(released);
});
