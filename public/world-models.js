import * as THREE from "three";

const materials = new Map();
const box = new THREE.BoxGeometry(1, 1, 1);
const rock = new THREE.IcosahedronGeometry(1, 0);
const cone = new THREE.ConeGeometry(1, 1, 5);
const roofPrism = new THREE.BufferGeometry();
roofPrism.setAttribute("position", new THREE.Float32BufferAttribute([-.5, 0, -.5, .5, 0, -.5, 0, 1, -.5, -.5, 0, .5, .5, 0, .5, 0, 1, .5], 3));
roofPrism.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 2, 5, 4, 2, 4, 1, 1, 4, 3, 1, 3, 0]);
const roofGeometry = roofPrism.toNonIndexed();
roofGeometry.computeVertexNormals();
roofPrism.dispose();
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
const cylinder8 = new THREE.CylinderGeometry(1, 1, 1, 8);

/** Adds a shared-geometry, flat-shaded mesh to a model. */
export function part(parent, geometry, color, position, scale) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95 }));
  const mesh = new THREE.Mesh(geometry, materials.get(color));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Builds one of four tree silhouettes so a forest never reads as one repeated prop. */
function createTree(group, variation) {
  // `variation` arrives as k/19; recover k so shape and size vary independently.
  const seed = Math.round(variation * 19);
  const spread = ((seed * 7) % 19) / 19;
  const foliage = new THREE.Group();
  foliage.name = "renewable-foliage";
  group.add(foliage);
  group.rotation.y = seed * 1.7;
  const trunk = (color, height, width) => {
    part(group, cylinder, color, [0, height / 2, 0], [width, height, width]).name = "tree-trunk";
  };
  if (seed % 4 === 0) {
    // Broad conifer: three stacked tiers.
    const height = 1.8 + spread * 0.8;
    trunk("#78533d", 0.8, 0.12);
    for (let tier = 0; tier < 3; tier += 1) {
      const radius = 0.64 - tier * 0.15;
      part(foliage, cone, ["#407e55", "#5b985a", "#83b76b"][tier], [0, 0.8 + tier * height * 0.3, 0], [radius, height * 0.65, radius]);
    }
  } else if (seed % 4 === 1) {
    // Tall slim pine: four narrow tiers on a bare trunk.
    const height = 2 + spread * 0.9;
    trunk("#6b4630", 1, 0.1);
    for (let tier = 0; tier < 4; tier += 1) {
      const radius = 0.46 - tier * 0.09;
      part(foliage, cone, ["#3a6f4e", "#407e55", "#5b985a", "#6e9d5f"][tier], [0, 0.85 + tier * height * 0.26, 0], [radius, height * 0.55, radius]);
    }
  } else if (seed % 4 === 2) {
    // Broadleaf: a clustered canopy of offset blobs.
    const size = 0.38 + spread * 0.1;
    trunk("#8a6247", 0.95, 0.11);
    part(foliage, rock, "#5b985a", [0, 1.24, 0], [size, size * 0.92, size]);
    part(foliage, rock, "#6e9d5f", [size * 0.62, 1.02, -size * 0.3], [size * 0.62, size * 0.6, size * 0.62]);
    part(foliage, rock, "#83b76b", [-size * 0.5, 1.42, size * 0.34], [size * 0.55, size * 0.5, size * 0.55]);
  } else {
    // Squat bush tree: a wide skirt under a rounded crown.
    const height = 1.3 + spread * 0.5;
    trunk("#78533d", 0.55, 0.15);
    part(foliage, cone, "#3a6f4e", [0, 0.72, 0], [0.62, height * 0.62, 0.62]);
    part(foliage, cone, "#6e9d5f", [0, 0.72 + height * 0.34, 0], [0.46, height * 0.55, 0.46]);
    part(foliage, rock, "#94c07a", [0, 0.72 + height * 0.62, 0], [0.24, 0.22, 0.24]);
  }
}

/** Creates a resource at the same footprint as its authoritative grid tile. */
export function createResource(kind, variation) {
  const group = new THREE.Group();
  if (kind === "tree") {
    createTree(group, variation);
  } else if (kind === "stone" || kind === "iron") {
    const mesh = part(group, rock, kind === "iron" ? "#a46549" : "#929b9b", [0, 0.35, 0], [0.55, 0.58, 0.46]);
    mesh.rotation.set(0.2, variation * 4, 0.3);
    part(group, rock, kind === "iron" ? "#d68a5c" : "#b8b6a7", [0.35, 0.16, 0.28], [0.25, 0.28, 0.3]);
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

/** Builds a small timber cabin with a pitched roof. */
export function createHut() {
  const group = new THREE.Group();
  part(group, box, "#b38258", [0, 0.46, 0], [0.86, 0.9, 0.86]);
  const roof = part(group, new THREE.CylinderGeometry(0.8, 0.8, 1.1, 3), "#dca76c", [0, 1.04, 0], [1, 1, 1]);
  roof.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  part(group, box, "#644d3c", [0, 0.3, 0.44], [0.26, 0.6, 0.035]);
  part(group, box, "#f5dea3", [0.28, 0.58, 0.445], [0.18, 0.2, 0.035]);
  for (const x of [-0.4, 0.4]) part(group, box, "#76563f", [x, 0.48, 0.44], [0.065, 0.96, 0.065]);
  return group;
}

/** Creates a campfire landmark. */
export function createCampfire() {
  const group = new THREE.Group();
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    part(group, rock, "#8c9390", [Math.cos(angle) * 0.46, 0.12, Math.sin(angle) * 0.46], [0.17, 0.16, 0.17]);
  }
  for (const angle of [-0.65, 0.65]) part(group, cylinder, "#79563b", [0, 0.13, 0], [0.11, 0.8, 0.11]).rotation.set(Math.PI / 2, 0, angle);
  part(group, cone, "#ee9c48", [0, 0.43, 0], [0.27, 0.65, 0.27]);
  part(group, cone, "#ffe0a0", [0.02, 0.3, 0.1], [0.15, 0.4, 0.15]);
  return group;
}

/** Creates a banner pole in faction colours. */
export function createBanner(color, height = 2.2) {
  const banner = new THREE.Group();
  part(banner, cylinder, "#79583d", [0, height / 2, 0], [0.035, height, 0.035]);
  part(banner, box, color, [0.28, height - 0.35, 0], [0.55, 0.45, 0.04]);
  return banner;
}

const BOW_LIMB = 0.32;
// The archer faces +Z, so the nock is hauled back toward -Z and the arrow flies out the front.
const BOW_PULL = 0.26;
/** Folds a bow's two string limbs around a nock drawn back by `amount` (0 slack, 1 full draw). */
export function setBowDraw(bow, amount) {
  if (!bow) return;
  const pull = amount * BOW_PULL;
  const length = Math.hypot(BOW_LIMB, pull);
  for (const [limb, sign] of [[bow.top, 1], [bow.bottom, -1]]) {
    // Each limb spans tip (0, ±r, 0) to nock (0, 0, -pull): place it at the midpoint and tilt it to match.
    limb.position.set(0, sign * BOW_LIMB / 2, -pull / 2);
    limb.scale.set(0.02, length, 0.02);
    limb.rotation.x = sign > 0 ? Math.atan2(pull, BOW_LIMB) : -Math.atan2(pull, BOW_LIMB);
  }
  bow.arrow.position.set(0, 0, -pull);
  bow.arrow.visible = amount > 0.04;
}
/** Creates a jointed person; soldiers carry spears or bows and Jevs stand taller in their own colour. */
export function createColonist(index, teamColor, role = "worker", heroColor = null, identity = String(index)) {
  // Appearance follows identity, not array order or frame-time randomness.
  let seed = 2166136261;
  for (const letter of identity) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0;
  const skin = ["#f1c7a2", "#dba77d", "#b97c55", "#8c593e", "#694735"][seed % 5];
  const hair = ["#382d2c", "#73503b", "#b27a43", "#cfb67d", "#c2bbb0"][(seed >>> 4) % 5];
  const clothes = ["#647e73", "#b69b73", "#866e75", "#8495a0", "#a77850"][(seed >>> 8) % 5];
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const hero = role === "hero";
  const tunic = hero ? heroColor ?? teamColor : role === "worker" ? clothes : "#5a5f63";
  const torso = part(body, box, tunic, [0, 0.45, 0], [0.3, 0.36, 0.23]);
  part(body, rock, hero ? "#f1c7a2" : skin, [0, 0.76, 0], [0.2, 0.23, 0.19]);
  const headwear = part(body, rock, hero ? teamColor : hair, [0, 0.89, -0.025], [0.205, 0.105, 0.2]);
  const badge = part(body, box, teamColor, [0, 0.56, 0.13], [0.25, 0.075, 0.025]);
  const arms = [-0.21, 0.21].map((x) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 0.59, 0);
    part(shoulder, box, hero ? "#f1c7a2" : skin, [0, -0.13, 0], [0.09, 0.3, 0.1]);
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
  if (!hero) {
    const hairstyle = (seed >>> 12) % 4;
    if (hairstyle === 0) part(body, rock, hair, [0, 0.71, -0.15], [0.2, 0.19, 0.12]);
    if (hairstyle === 1) part(body, rock, hair, [0, 0.95, -0.1], [0.12, 0.12, 0.12]);
    if (hairstyle === 2) part(body, rock, hair, [0, 0.67, 0.12], [0.15, 0.1, 0.1]);
    part(body, box, "#51443b", [0, 0.32, 0], [0.32, 0.055, 0.25]);
    for (const leg of legs) part(leg, box, "#51443b", [0, -0.26, 0.025], [0.12, 0.09, 0.18]);
    if (role === "worker") {
      if ((seed >>> 16) % 3 === 0) {
        part(body, cylinder, "#bb995d", [0, 0.91, 0], [0.29, 0.035, 0.28]);
        part(body, cylinder, "#d0b275", [0, 0.98, 0], [0.17, 0.12, 0.17]);
      } else if ((seed >>> 16) % 3 === 1) part(body, box, "#735742", [0, 0.47, -0.19], [0.27, 0.3, 0.14]);
      else part(body, box, "#d1b995", [0, 0.38, 0.13], [0.22, 0.25, 0.025]);
    } else if (role === "infantry") {
      part(body, rock, "#8d999c", [0, 0.92, 0], [0.23, 0.15, 0.22]);
      const shield = part(arms[1], cylinder8, teamColor, [0.04, -0.17, 0.1], [0.22, 0.06, 0.3]); shield.rotation.x = Math.PI / 2;
      part(arms[1], rock, "#c2b38d", [0.04, -0.17, 0.14], [0.08, 0.08, 0.04]);
    } else {
      part(body, box, "#5d4936", [0.13, 0.5, -0.2], [0.13, 0.38, 0.13]);
      for (const x of [0.1, 0.16]) part(body, box, "#e0d1a5", [x, 0.75, -0.2], [0.025, 0.25, 0.025]);
    }
    group.scale.set(0.91 + ((seed >>> 20) % 5) * 0.045, 0.92 + ((seed >>> 24) % 5) * 0.04, 1);
  }
  const tools = {};
  for (const kind of ["axe", "pickaxe", "hammer"]) {
    const tool = new THREE.Group();
    part(tool, box, "#86613f", [0, -0.42, 0.04], [0.045, 0.5, 0.045]);
    part(tool, box, "#b1c3c9", [kind === "axe" ? 0.07 : 0, -0.62, 0.04], [kind === "pickaxe" ? 0.42 : 0.23, kind === "axe" ? 0.2 : 0.1, 0.1]);
    tool.visible = false;
    arms[1].add(tool);
    tools[kind] = tool;
  }
  const weapon = new THREE.Group();
  let bow = null;
  if (role === "archer") {
    // The bow gets its own frame on the torso rather than hanging off the shoulder joint: inheriting the
    // bow arm's swing tipped the stave onto its side, and the draw has to read from every camera angle.
    const stave = part(weapon, new THREE.TorusGeometry(BOW_LIMB, 0.03, 4, 10, Math.PI), "#8b6543", [0, 0, 0], [1, 1, 1]);
    stave.rotation.set(0, Math.PI / 2, Math.PI / 2);
    // Two string segments meeting at a nock, so drawing folds them into a V instead of sliding a bar back.
    const limb = (sign) => part(weapon, box, "#d9d2c4", [0, sign * BOW_LIMB / 2, 0], [0.02, BOW_LIMB, 0.02]);
    const arrow = new THREE.Group();
    part(arrow, box, "#c8b48a", [0, 0, 0.17], [0.018, 0.018, 0.5]);
    part(arrow, cone, "#e8e2d2", [0, 0, 0.45], [0.028, 0.07, 0.028]).rotation.x = Math.PI / 2;
    weapon.add(arrow);
    bow = { top: limb(1), bottom: limb(-1), arrow };
    setBowDraw(bow, 0);
  } else {
    part(weapon, box, "#8b6543", [-0.25, 0.65, -0.18], [0.045, 1.2, 0.045]);
    part(weapon, cone, hero ? "#ffe7a8" : "#c9d5d5", [-0.25, 1.3, -0.18], [0.09, 0.25, 0.09]);
  }
  if (role === "archer") {
    body.add(weapon);
    weapon.position.set(-0.17, 0.54, 0.24);
  } else {
    arms[0].add(weapon);
    weapon.position.set(0.21, -0.59, 0);
  }
  weapon.visible = role !== "worker";
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.42, 32), new THREE.MeshBasicMaterial({ color: "#fff2be", side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.visible = false;
  group.add(ring);
  if (hero) {
    const aura = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 32), new THREE.MeshBasicMaterial({ color: heroColor ?? teamColor, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }));
    aura.rotation.x = -Math.PI / 2; aura.position.y = 0.03; group.add(aura);

    group.scale.setScalar(1.3);
  }
  return { group, body, torso, headwear, badge, arms, legs, tools, weapon, bow, ring, stride: 0, phase: index * 1.7, attackStarted: -Infinity, hitStarted: -Infinity };
}

/** Creates a farm with crop rows whose visibility follows the field's growth stage. */
function createFarm() {
  const group = new THREE.Group();
  part(group, box, "#805b3f", [0, 0.03, 0], [2.8, 0.06, 2.8]).castShadow = false;
  const frame = new THREE.Group(), crops = new THREE.Group(), ripe = new THREE.Group();
  crops.name = "crops"; ripe.name = "ripe";
  group.add(frame, crops, ripe);
  for (const x of [-1.35, 1.35]) {
    for (const z of [-1.35, 1.35]) part(frame, box, "#c19a64", [x, 0.35, z], [0.12, 0.7, 0.12]);
    part(frame, box, "#d8b67e", [x, 0.45, 0], [0.08, 0.08, 2.7]);
    part(frame, box, "#d8b67e", [0, 0.45, x], [2.7, 0.08, 0.08]);
  }
  for (let row = 0; row < 3; row += 1) {
    const x = (row - 1) * 0.75;
    part(group, box, "#63452f", [x, 0.085, 0], [0.38, 0.06, 2.4]).castShadow = false;
    for (let index = 0; index < 5; index += 1) {
      const z = (index - 2) * 0.45;
      part(crops, cone, "#7eb65b", [x, 0.35, z], [0.19, 0.55, 0.19]);
      part(ripe, cone, "#e3c46a", [x, 0.4, z], [0.22, 0.7, 0.22]);
    }
  }
  return group;
}

/** Builds a pitched roof with a ridge and contrasting timber fascia. */
function pitchedRoof(parent, color, x, y, z, width, height, depth) {
  part(parent, roofGeometry, color, [x, y - height * 0.4, z], [width, height, depth]);
  part(parent, box, "#51493f", [x, y + height * 0.6, z], [0.11, 0.1, depth + 0.08]);
}

/** Adds framing, an inset doorway and shuttered windows to a timber hall. */
function timberHall(parent, x, z, width, height, depth) {
  part(parent, box, "#d0bd92", [x, height / 2 + 0.15, z], [width, height, depth]);
  for (const side of [-1, 1]) {
    part(parent, box, "#76583f", [x + side * (width / 2 - 0.06), height / 2 + 0.15, z + depth / 2], [0.12, height, 0.13]);
    part(parent, box, "#76583f", [x, 0.28, z + side * depth / 2], [width, 0.13, 0.12]);
  }
  part(parent, box, "#604632", [x, 0.6, z + depth / 2 + 0.015], [0.48, 0.88, 0.055]);
  part(parent, box, "#bf9864", [x, 0.17, z + depth / 2 + 0.14], [0.67, 0.17, 0.32]);
  for (const side of [-1, 1]) {
    part(parent, box, "#4a5e5c", [x + side * width * 0.32, height * 0.65, z + depth / 2 + 0.025], [0.28, 0.35, 0.045]);
    part(parent, box, "#b38b59", [x + side * width * 0.32, height * 0.65, z + depth / 2 + 0.06], [0.035, 0.36, 0.025]);
  }
}

/** Builds each structure with a readable function, within its three-tile footprint. */
export function createBuildingModel(kind, color) {
  if (kind === "farm") return createFarm();
  const group = new THREE.Group();
  part(group, box, "#97978a", [0, 0.07, 0], [2.75, 0.14, 2.75]).castShadow = false;
  if (kind === "town_centre") {
    timberHall(group, 0, -0.1, 2.15, 1.5, 1.7);
    pitchedRoof(group, "#727f83", 0, 1.93, -0.1, 2.6, 0.85, 2.1);
    timberHall(group, -0.65, 0.5, 0.7, 2.2, 0.7);
    pitchedRoof(group, color, -0.65, 2.48, 0.5, 1.05, 0.5, 1.0);
    const banner = createBanner(color, 1.1); banner.position.set(-0.65, 2.8, 0.5); group.add(banner);
    for (const x of [0.65, 1.05]) part(group, box, "#9d754b", [x, 0.3, 1.05], [0.3, 0.45, 0.3]);
  } else if (kind === "barracks") {
    timberHall(group, 0, -0.35, 2.25, 1.15, 1.4);
    pitchedRoof(group, "#825f50", 0, 1.54, -0.35, 2.6, 0.65, 1.8);
    part(group, box, color, [0, 1.1, 0.39], [0.45, 0.5, 0.035]);
    for (const x of [-0.9, -0.5, -0.1]) {
      part(group, box, "#735741", [x, 0.7, 1], [0.045, 1.25, 0.045]);
      part(group, cone, "#c5d0cd", [x, 1.38, 1], [0.07, 0.2, 0.07]);
    }
    part(group, box, "#735741", [-0.5, 0.5, 1], [1, 0.07, 0.09]);
    const shield = part(group, cylinder8, color, [0.85, 0.55, 0.9], [0.32, 0.09, 0.42]); shield.rotation.x = Math.PI / 2;
  } else if (kind === "range") {
    for (const x of [-1.05, 1.05]) part(group, box, "#76583f", [x, 0.7, -0.8], [0.12, 1.35, 0.12]);
    pitchedRoof(group, "#82927a", 0, 1.55, -0.65, 2.5, 0.55, 1.1);
    part(group, box, color, [0, 1.25, -0.12], [0.45, 0.23, 0.03]);
    for (const x of [-0.67, 0.67]) {
      for (const side of [-1, 1]) part(group, box, "#76583f", [x + side * 0.17, 0.35, 0.65], [0.07, 0.7, 0.07]).rotation.z = side * 0.2;
      for (const [radius, tint, z] of [[0.39, "#cbb77e", 0.65], [0.27, "#e5dbbc", 0.71], [0.12, "#a14e43", 0.77]]) part(group, cylinder8, tint, [x, 0.85, z], [radius, 0.07, radius]).rotation.x = Math.PI / 2;
    }
  } else if (kind === "tower") {
    part(group, cylinder8, "#888e86", [0, 1.16, 0], [0.68, 2.2, 0.68]);
    for (const y of [0.25, 0.95, 1.65]) part(group, cylinder8, "#a4a797", [0, y, 0], [0.72, 0.12, 0.72]);
    part(group, box, "#695440", [0, 2.3, 0], [1.65, 0.2, 1.65]);
    for (const x of [-0.67, 0.67]) for (const z of [-0.67, 0.67]) part(group, box, "#735b43", [x, 2.73, z], [0.12, 0.75, 0.12]);
    pitchedRoof(group, "#667d85", 0, 3.24, 0, 2, 0.62, 1.95);
    for (const x of [-0.69, 0.69]) part(group, box, "#937855", [x, 2.63, 0], [0.08, 0.12, 1.45]);
    part(group, box, color, [0, 2.35, 0.85], [0.4, 0.65, 0.04]);
    part(group, box, "#374844", [0, 1.45, 0.68], [0.12, 0.42, 0.03]);
  } else if (kind === "forge") {
    timberHall(group, -0.48, -0.2, 1.45, 1.1, 1.75);
    pitchedRoof(group, "#595d61", -0.48, 1.5, -0.2, 1.8, 0.65, 2.1);
    part(group, box, "#797369", [0.8, 0.65, -0.55], [0.8, 1.15, 0.85]);
    part(group, box, "#8d877d", [0.8, 1.72, -0.55], [0.46, 1.35, 0.5]);
    part(group, box, "#494b49", [0.8, 2.42, -0.55], [0.6, 0.16, 0.62]);
    part(group, box, "#382d29", [0.8, 0.62, -0.1], [0.53, 0.65, 0.05]);
    part(group, cone, "#ffaf58", [0.8, 0.5, -0.04], [0.19, 0.42, 0.13]);
    part(group, box, "#70543f", [0.65, 0.3, 0.87], [0.42, 0.48, 0.38]);
    part(group, box, "#454d50", [0.65, 0.61, 0.87], [0.65, 0.15, 0.3]);
    part(group, cone, "#697477", [1.02, 0.61, 0.87], [0.14, 0.35, 0.14]).rotation.z = -Math.PI / 2;
  } else if (kind === "outpost") {
    for (const x of [-1.15, 1.15]) for (let z = -1.1; z <= 1.2; z += 0.28) {
      part(group, cylinder, "#8b704c", [x, 0.49, z], [0.1, 0.85, 0.1]);
      part(group, cone, "#baa079", [x, 1, z], [0.1, 0.2, 0.1]);
    }
    timberHall(group, 0, -0.35, 1.25, 0.85, 1.15);
    pitchedRoof(group, "#8f7861", 0, 1.12, -0.35, 1.6, 0.5, 1.5);
    const banner = createBanner(color, 2.15); banner.position.set(0.65, 0, 0.7); group.add(banner);
  }
  return group;
}

/** Marks a strategic region with a stone plinth whose flag takes the controller's colour. */
export function createRegionMarker(primary) {
  const group = new THREE.Group();
  const scale = primary ? 1.4 : 1;
  part(group, cylinder8, "#a5aaa0", [0, 0.2 * scale, 0], [1.1 * scale, 0.4 * scale, 1.1 * scale]);
  part(group, box, "#8a8f86", [0, 1.1 * scale, 0], [0.5 * scale, 1.8 * scale, 0.5 * scale]);
  part(group, cylinder, "#79583d", [0, 3 * scale, 0], [0.04, 2.2 * scale, 0.04]);
  const flagMaterial = new THREE.MeshStandardMaterial({ color: "#d9d2c4", flatShading: true, roughness: 0.9 });
  const flag = new THREE.Mesh(box, flagMaterial);
  flag.position.set(0.35 * scale, 3.75 * scale, 0); flag.scale.set(0.7 * scale, 0.5 * scale, 0.05); flag.castShadow = true;
  flag.name = "region-flag";
  group.add(flag);
  return { group, flagMaterial };
}

/** Creates a translucent claim disc on the ground. */
export function createClaimDisc(color, radius) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}

/** Renders exactly the walkable island, waterways and crossings generated by the server. */
export function createTerrain(width, height, terrain) {
  const vertices = [], colors = [];
  const palette = { g: "#b3c788", f: "#82a772", s: "#d9c59a", w: "#75b9c5", m: "#929e92", r: "#b69569" };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const tile = terrain.tiles[y * width + x];
    const h = tile === "w" ? -0.12 : 0;
    const tint = new THREE.Color(palette[tile]).multiplyScalar(0.95 + ((x * 17 + y * 13) % 7) * 0.015);
    for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]]) { vertices.push(x + dx - width / 2, h, y + dy - height / 2); colors.push(tint.r, tint.g, tint.b); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const group = new THREE.Group();
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  ground.receiveShadow = true;
  group.add(ground);
  for (let y = 4; y < height - 4; y += 3) for (let x = 4; x < width - 4; x += 3) if (terrain.tiles[y * width + x] === "m") part(group, cone, "#929989", [x - width / 2, 1.4, y - height / 2], [2.4, 2.8 + (x % 3), 2.4]);
  return group;
}
