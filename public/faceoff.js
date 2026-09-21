import * as THREE from "three";
import { createFighter } from "./campaign-models.js";
import { animateColonist } from "./colonist-activity.js";
import { dressHero, animateHero } from "./hero-models.js";
import { createResource, createBanner } from "./world-models.js";
import { hudIcon } from "./hud-icons.js";
import { lowPolyArt, esc, jevPortraitOf, crestOf } from "./card-art.js";

/** Somewhere no camera ever looks, so the face-off stage can sit in the same scene as the map. */
const STAGE = new THREE.Vector3(0, -900, 0);
const GROUND = { grassland: "#b3c788", forest: "#82a772", mountain: "#a9b0a4", marsh: "#c9bc86", badlands: "#c8a46e" };

/**
 * The moment before a battle: the two commanders face each other across a few yards of the
 * province they are about to fight over, while the Jev decides whether to commit. A versus card
 * carries the numbers; the models carry the drama.
 */
export function createFaceOff(scene, container, attacker, defender, biome) {
  const group = new THREE.Group();
  group.position.copy(STAGE);
  scene.add(group);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshStandardMaterial({ color: GROUND[biome] ?? GROUND.grassland, flatShading: true, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  // Trees stay behind the commanders, never between them and the camera.
  for (let index = 0; index < 16; index++) {
    const x = -12 + index * 1.6 + ((index * 7) % 3) * 0.4, z = -6 - ((index * 5) % 4) * 1.4;
    const tree = createResource("tree", (index % 19) / 19);
    tree.position.set(x, 0, z);
    tree.scale.setScalar(1.3 + ((index * 3) % 3) * 0.35);
    group.add(tree);
  }
  const light = new THREE.DirectionalLight("#fff0d1", 2.2);
  light.position.set(-4, 8, 6);
  light.castShadow = true;
  light.shadow.camera.left = -10; light.shadow.camera.right = 10; light.shadow.camera.top = 10; light.shadow.camera.bottom = -10;
  group.add(light, light.target);

  const models = [];
  const stand = (side, x) => {
    const model = createFighter(side.hero === undefined ? "swordsmen" : "swordsmen", side.colour, 0.3);
    if (side.hero !== undefined) dressHero(model, side.hero);
    else model.group.scale.setScalar(1.6);
    model.group.position.set(x, 0, 0);
    model.group.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    const banner = createBanner(side.colour, 2.6);
    banner.position.set(x * 1.35, 0, -1.6);
    banner.scale.setScalar(1.1);
    group.add(model.group, banner);
    models.push(model);
  };
  stand(attacker, -2.6);
  stand(defender, 2.6);

  const card = document.createElement("div");
  card.className = "versus hud-surface";
  // Same card language as the choice cards below it: a tinted skyline, a crest, and short chips.
  const sideHtml = (side, align) => `
    <div class="versus-side ${align}" style="--crest:${side.colour}">
      <span class="versus-crest">${jevPortraitOf(side.hero?.id) === null ? hudIcon("helm") : `<img src="${jevPortraitOf(side.hero.id)}" alt="" draggable="false">`}</span>
      <div class="versus-copy">
        <span class="versus-kicker">${esc(side.faction)}</span>
        <strong>${esc(side.name)}</strong>
        <span class="versus-tags">${side.tags.map((tag) => `<i>${esc(tag)}</i>`).join("")}</span>
      </div>
    </div>`;
  card.innerHTML = `<span class="versus-art">${lowPolyArt(`${attacker.name}-${defender.name}`, "banners", 320, 74)}</span>
    ${sideHtml(attacker, "left")}
    <div class="versus-middle">
      <span class="versus-vs">vs</span>
      <div class="versus-odds"><i style="width:${Math.round(attacker.share * 100)}%;background:${attacker.colour}"></i><i style="width:${Math.round((1 - attacker.share) * 100)}%;background:${defender.colour}"></i></div>
      <span class="versus-estimate">${Math.round(attacker.share * 100)}% · ${esc(attacker.estimate)}</span>
      <span class="versus-result"></span>
    </div>
    ${sideHtml(defender, "right")}`;
  container.append(card);

  return {
    /** Where the camera stands for this shot: low, close, between the two. */
    pose: { position: STAGE.clone().add(new THREE.Vector3(0, 2.6, 8.4)), target: STAGE.clone().add(new THREE.Vector3(0, 1.4, 0)) },
    result(text) { card.querySelector(".versus-result").textContent = text; card.classList.add("has-result"); },
    update(now, reduced) {
      for (const model of models) {
        if (model.isHero !== true && model.heroId === undefined) { animateColonist(model, now, 0, false, false, reduced); continue; }
        animateHero(model, now, false);
        animateColonist(model, now, 0, false, false, reduced);
      }
    },
    dispose() { scene.remove(group); card.remove(); },
  };
}
