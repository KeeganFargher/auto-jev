import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AdditiveBlending, Color, DoubleSide, Line, Mesh, Scene, type Material } from "three";
import { effectMaterials, releaseEffectMaterial, warmEffectMaterials } from "../src/game/views/effect-materials.js";

function watchDisposal(materials: readonly Material[]): () => string[] {
  const disposed: string[] = [];

  for (const material of materials) {
    material.addEventListener("dispose", () => disposed.push(material.uuid));
  }

  return () => disposed;
}

test("a released effect material is handed out again rather than disposed", () => {
  const first = effectMaterials.glow.take();
  const disposed = watchDisposal([first]);
  releaseEffectMaterial(first);

  const second = effectMaterials.glow.take();
  assert.equal(second, first);
  assert.deepEqual(disposed(), []);
  releaseEffectMaterial(second);
});

test("a reused effect material starts from its kind's fresh look", () => {
  const worn = effectMaterials.glow.take();
  const fresh = worn.opacity;
  worn.color.set("#123456");
  worn.opacity = 0;
  releaseEffectMaterial(worn);

  const reused = effectMaterials.glow.take();
  assert.equal(reused, worn);
  assert.equal(reused.opacity, fresh);
  assert.equal(reused.color.getHex(), new Color("#ffffff").getHex());
  releaseEffectMaterial(reused);
});

test("releasing a material twice is refused, so two effects can never share one", () => {
  const material = effectMaterials.flash.take();
  releaseEffectMaterial(material);

  assert.throws(() => releaseEffectMaterial(material), /not taken/);
});

test("releasing a material the pool never handed out is refused", () => {
  const stranger = effectMaterials.flash.take().clone();

  assert.throws(() => releaseEffectMaterial(stranger), /not taken/);
});

test("warming draws one material of every kind for a frame, then pools them ready for use", () => {
  const scene = new Scene();
  const finish = warmEffectMaterials(scene);
  const warmed: Material[] = [];

  scene.traverse((node) => {
    if (node instanceof Mesh || node instanceof Line) {
      warmed.push(node.material);
    }
  });

  assert.equal(warmed.length, Object.keys(effectMaterials).length);
  finish();
  assert.equal(scene.children.length, 0);

  const glow = effectMaterials.glow.take();
  assert.ok(warmed.includes(glow), "the warmed glow material was not the one handed out next");
  releaseEffectMaterial(glow);
});

test("additive double-sided effects draw in one pass, since added light does not depend on draw order", () => {
  for (const kind of Object.values(effectMaterials)) {
    const material = kind.take();

    if (material.blending === AdditiveBlending && material.side === DoubleSide) {
      assert.ok(material.forceSinglePass, `${material.type} would be drawn twice per frame`);
    }

    releaseEffectMaterial(material);
  }
});
