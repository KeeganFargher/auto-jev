import * as THREE from "three";

const materials = new Map();
const box = new THREE.BoxGeometry(1, 1, 1);
const rock = new THREE.IcosahedronGeometry(1, 0);
const cone = new THREE.ConeGeometry(1, 1, 5);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);

/** Adds a shared-geometry, flat-shaded mesh to a model. */
export function part(parent, geometry, color, position, scale) {
  if (!materials.has(color)) {
    materials.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95 }));
  }
  const mesh = new THREE.Mesh(geometry, materials.get(color));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Creates a resource at the same footprint as its authoritative grid tile. */
export function createResource(kind, variation) {
  const group = new THREE.Group();
  if (kind === "tree") {
    const foliage = new THREE.Group();
    foliage.name = "renewable-foliage";
    group.add(foliage);
    const height = 1.8 + variation * 0.8;
    part(group, cylinder, "#78533d", [0, 0.4, 0], [0.12, 0.8, 0.12]).name = "tree-trunk";
    for (let tier = 0; tier < 3; tier += 1) {
      const radius = 0.64 - tier * 0.15;
      part(foliage, cone, ["#407e55", "#5b985a", "#83b76b"][tier], [0, 0.8 + tier * height * 0.3, 0], [radius, height * 0.65, radius]);
    }
  } else if (["stone", "ore", "coal", "clay"].includes(kind)) {
    const mesh = part(group, rock, kind === "clay" ? "#c49b78" : kind === "ore" ? "#a46549" : kind === "coal" ? "#38464d" : "#929b9b", [0, 0.35, 0], [0.55, 0.58, 0.46]);
    mesh.rotation.set(0.2, variation * 4, 0.3);
    part(group, rock, "#b8b6a7", [0.35, 0.16, 0.28], [0.25, 0.28, 0.3]);
  } else if (kind === "berries") {
    part(group, rock, "#6e9250", [0, 0.26, 0], [0.52, 0.45, 0.45]);
    const fruit = new THREE.Group();
    fruit.name = "renewable-foliage";
    group.add(fruit);
    for (let index = 0; index < 5; index += 1) {
      const angle = index * 2.4;
      part(fruit, rock, "#d77772", [Math.cos(angle) * 0.32, 0.5, Math.sin(angle) * 0.3], [0.1, 0.1, 0.1]);
    }
  } else if (kind === "river") {
    const water = part(group, box, "#65bfcb", [0, 0.012, 0], [0.98, 0.035, 1.01]);
    water.castShadow = false;
    part(group, box, "#acdee0", [0.12, 0.035, variation * 0.5 - 0.25], [0.42, 0.008, 0.035]).castShadow = false;
  }
  return group;
}

/** Builds a small timber cabin with a pitched roof and porch. */
export function createHut() {
  const group = new THREE.Group();
  part(group, box, "#b38258", [0, 0.46, 0], [0.86, 0.9, 0.86]);
  const roof = part(group, new THREE.CylinderGeometry(0.8, 0.8, 1.1, 3), "#dca76c", [0, 1.04, 0], [1, 1, 1]);
  roof.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  part(group, box, "#644d3c", [0, 0.3, 0.44], [0.26, 0.6, 0.035]);
  part(group, box, "#f5dea3", [0.28, 0.58, 0.445], [0.18, 0.2, 0.035]);
  part(group, box, "#e0be87", [0, 0.08, 0.61], [0.95, 0.15, 0.35]);
  const improvement = part(group, box, "#f0d796", [0, 0.8, 0.47], [0.45, 0.08, 0.22]);
  improvement.name = "home-improvement";
  improvement.visible = false;
  for (const x of [-0.4, 0.4]) part(group, box, "#76563f", [x, 0.48, 0.44], [0.065, 0.96, 0.065]);
  return group;
}

/** Creates the shared stockpile campfire landmark. */
export function createCampfire() {
  const group = new THREE.Group();
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    part(group, rock, "#8c9390", [Math.cos(angle) * 0.46, 0.12, Math.sin(angle) * 0.46], [0.17, 0.16, 0.17]);
  }
  for (const angle of [-0.65, 0.65]) {
    part(group, cylinder, "#79563b", [0, 0.13, 0], [0.11, 0.8, 0.11]).rotation.set(Math.PI / 2, 0, angle);
  }
  part(group, cone, "#ee9c48", [0, 0.43, 0], [0.27, 0.65, 0.27]);
  part(group, cone, "#ffe0a0", [0.02, 0.3, 0.1], [0.15, 0.4, 0.15]);
  return group;
}

/** Creates a jointed colonist with tools attached to its working hand. */
export function createColonist(index, teamColor) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  part(body, box, teamColor, [0, 0.45, 0], [0.3, 0.36, 0.23]);
  part(body, rock, "#f1c7a2", [0, 0.76, 0], [0.2, 0.23, 0.19]);
  part(body, box, "#654d40", [0, 0.91, -0.025], [0.32, 0.09, 0.29]);
  const arms = [-0.21, 0.21].map((x) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 0.59, 0);
    part(shoulder, box, "#f1c7a2", [0, -0.13, 0], [0.09, 0.3, 0.1]);
    body.add(shoulder);
    return shoulder;
  });
  const legs = [-0.09, 0.09].map((x) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0.3, 0);
    part(hip, box, "#41535a", [0, -0.15, 0], [0.1, 0.3, 0.13]);
    body.add(hip);
    return hip;
  });
  const tools = {};
  for (const kind of ["axe", "pickaxe", "hammer"]) {
    const tool = new THREE.Group();
    part(tool, box, "#86613f", [0, -0.42, 0.04], [0.045, 0.5, 0.045]);
    part(tool, box, "#b1c3c9", [kind === "axe" ? 0.07 : 0, -0.62, 0.04], [kind === "pickaxe" ? 0.42 : 0.23, kind === "axe" ? 0.2 : 0.1, 0.1]);
    tool.visible = false;
    arms[1].add(tool);
    tools[kind] = tool;
  }
  const fishingRod = new THREE.Group();
  part(fishingRod, box, "#826340", [0, -0.7, 0.05], [0.035, 1.25, 0.035]);
  fishingRod.visible = false;
  arms[1].add(fishingRod);
  tools.fishingRod = fishingRod;
  const weapon = new THREE.Group();
  part(weapon, box, "#8b6543", [-0.25, 0.65, -0.18], [0.045, 1.2, 0.045]);
  part(weapon, cone, "#c9d5d5", [-0.25, 1.3, -0.18], [0.09, 0.25, 0.09]);
  body.add(weapon); weapon.visible = false;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.42, 32), new THREE.MeshBasicMaterial({ color: "#fff2be", side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.visible = false;
  group.add(ring);
  return { group, body, arms, legs, tools, weapon, ring, stride: 0, phase: index * 1.7 };
}

/** Creates a farm with independently visible foundations, timber framing, and crop rows. */
export function createFarm() {
  const group = new THREE.Group();
  part(group, box, "#805b3f", [0, 0.03, 0], [2.8, 0.06, 2.8]).castShadow = false;
  const foundation = new THREE.Group();
  const frame = new THREE.Group();
  const crops = new THREE.Group();
  const ripeCrops = new THREE.Group();
  group.add(foundation, frame, crops, ripeCrops);
  for (const x of [-1.35, 1.35]) {
    for (const z of [-1.35, 1.35]) {
      part(foundation, rock, "#b8b6a7", [x, 0.1, z], [0.2, 0.18, 0.2]);
      part(frame, box, "#c19a64", [x, 0.35, z], [0.12, 0.7, 0.12]);
    }
    part(frame, box, "#d8b67e", [x, 0.45, 0], [0.08, 0.08, 2.7]);
    part(frame, box, "#d8b67e", [0, 0.45, x], [2.7, 0.08, 0.08]);
  }
  for (let row = 0; row < 3; row += 1) {
    const x = (row - 1) * 0.75;
    part(group, box, "#63452f", [x, 0.085, 0], [0.38, 0.06, 2.4]).castShadow = false;
    for (let index = 0; index < 5; index += 1) {
      const z = (index - 2) * 0.45;
      part(crops, cone, "#7eb65b", [x, 0.35, z], [0.19, 0.55, 0.19]);
      part(ripeCrops, cone, "#e3c46a", [x, 0.4, z], [0.22, 0.7, 0.22]);
    }
  }
  return { group, foundation, frame, crops, ripeCrops };
}

/** Builds distinct, single-tile supply stations so needs have a visible destination. */
export function createStation(kind) {
  const group = new THREE.Group();
  if (kind === "water") {
    part(group, cylinder, "#966b45", [0, 0.35, 0], [0.38, 0.7, 0.38]);
    for (const height of [0.12, 0.58]) part(group, cylinder, "#464e4c", [0, height, 0], [0.39, 0.07, 0.39]);
    part(group, cylinder, "#65bfcb", [0, 0.705, 0], [0.33, 0.025, 0.33]);
    part(group, box, "#d1ac6b", [0, 0.3, 0.43], [0.09, 0.09, 0.2]);
  } else {
    part(group, box, "#b38258", [0, 0.5, 0], [0.85, 0.12, 0.7]);
    for (const x of [-0.3, 0.3]) part(group, box, "#78533d", [x, 0.24, 0], [0.1, 0.48, 0.5]);
    for (let index = 0; index < 5; index += 1) part(group, rock, index % 2 ? "#dca76c" : "#d77772", [(index % 3 - 1) * 0.22, 0.65, Math.floor(index / 3) * 0.22 - 0.1], [0.12, 0.11, 0.12]);
  }
  return group;
}

/** Builds a workshop bench, stockade tiers, and a camp banner within occupied tiles. */
export function createDevelopmentModels(color) {
  const workshop = new THREE.Group();
  part(workshop, box, "#8a603f", [0, 0.4, 0], [0.85, 0.8, 0.7]);
  part(workshop, box, "#deb878", [0, 0.86, 0], [0.95, 0.12, 0.85]);
  part(workshop, box, "#6b7779", [0.2, 0.99, 0], [0.3, 0.2, 0.25]);
  const defenses = Array.from({ length: 3 }, (_, tier) => {
    const group = new THREE.Group();
    for (const x of [-0.32, 0, 0.32]) {
      part(group, cylinder, "#88603f", [x, 0.55, (tier - 1) * 0.3], [0.12, 1.1, 0.12]);
      part(group, cone, "#ba9360", [x, 1.2, (tier - 1) * 0.3], [0.12, 0.25, 0.12]);
    }
    return group;
  });
  const banner = new THREE.Group();
  part(banner, cylinder, "#79583d", [0, 1.1, 0], [0.035, 2.2, 0.035]);
  part(banner, box, color, [0.28, 1.85, 0], [0.55, 0.45, 0.04]);
  return { workshop, defenses, banner };
}
