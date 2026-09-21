import * as THREE from "three";
import { part } from "./world-models.js";

/**
 * Campaign-map props: settlements that visibly grow with tier and buildings, army markers, and
 * biome scatter. Conventions follow world-models.js — shared geometries, flat-shaded materials
 * cached by colour inside `part()`.
 *
 * `part()` hands back a SHARED material; never touch `.color`, `.opacity` or anything else on it.
 * Everything here that needs its own material builds one through `cloth()` (cached, read-only in
 * the same way) or `uniqueCloth()` (owned by one prop, safe to recolour).
 */

// ---------------------------------------------------------------- shared geometry
const BOX = new THREE.BoxGeometry(1, 1, 1);
const ROCK = new THREE.IcosahedronGeometry(1, 0);
const BLOB = new THREE.IcosahedronGeometry(1, 1);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
const CONE5 = new THREE.ConeGeometry(1, 1, 5);
const CONE6 = new THREE.ConeGeometry(1, 1, 6);
const CYL5 = new THREE.CylinderGeometry(1, 1, 1, 5);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CYL12 = new THREE.CylinderGeometry(1, 1, 1, 12);
const TAPER6 = new THREE.CylinderGeometry(0.76, 1, 1, 6);
const WHEEL = new THREE.TorusGeometry(1, 0.17, 4, 10);

/** A hipped roof prism: square base at y=0, ridge at y=1, built the same way world-models does. */
const ROOF = (() => {
  const source = new THREE.BufferGeometry();
  source.setAttribute("position", new THREE.Float32BufferAttribute([-.5, 0, -.5, .5, 0, -.5, 0, 1, -.5, -.5, 0, .5, .5, 0, .5, 0, 1, .5], 3));
  source.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 2, 5, 4, 2, 4, 1, 1, 4, 3, 1, 3, 0]);
  const geometry = source.toNonIndexed();
  geometry.computeVertexNormals();
  source.dispose();
  return geometry;
})();

/** A rectangular flag with a baked ripple; the pole edge sits at local x=0 so it hangs correctly. */
const FLAG = (() => {
  const geometry = new THREE.PlaneGeometry(1, 1, 5, 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const along = position.getX(index) + 0.5;
    position.setZ(index, Math.sin(along * Math.PI * 1.7) * 0.1 * along);
  }
  geometry.translate(0.5, 0, 0);
  geometry.computeVertexNormals();
  return geometry;
})();

/** A swallow-tail pennant, also anchored at local x=0. */
const PENNANT = (() => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0.5, 0, 0, -0.5, 0, 1, 0.16, 0.06,
    0, -0.5, 0, 1, -0.16, 0.06, 1, 0.16, 0.06,
  ], 3));
  geometry.computeVertexNormals();
  return geometry;
})();

// ---------------------------------------------------------------- palette
const STONE = "#9aa096", STONE_DARK = "#7c837b", STONE_PALE = "#b7bcb0";
const TIMBER = "#76583f", TIMBER_PALE = "#9d754b", PLASTER = "#d0bd92", PLASTER_WARM = "#c9a97c";
const ROOF_SLATE = "#667d85", ROOF_TILE = "#a3614f", ROOF_THATCH = "#c2a068", ROOF_WOOD = "#8f7861";
const EARTH = "#7d6045", DIRT = "#8f7352", SOOT = "#4c4a46", IRON = "#5f686c", STEEL = "#c5d0cd";
const GOLD = "#ffe7a8", EMBER = "#ffaf58", MOSS = "#6e8f5c", NEUTRAL = "#98a19b";
const HOUSE_WALLS = [PLASTER, PLASTER_WARM, "#c3b492", "#bda583"];
const HOUSE_ROOFS = [ROOF_THATCH, ROOF_TILE, ROOF_SLATE, ROOF_WOOD];

// ---------------------------------------------------------------- deterministic variation
/** Hashes a 0..1 `variation` plus a salt, so every prop's jitter is stable across rebuilds. */
function hashed(variation, salt) {
  let state = Math.round(((variation % 1) + 1) * 9973) + salt * 7919;
  state = Math.imul(state ^ (state >>> 13), 1274126177) >>> 0;
  return state ^ (state >>> 16);
}
const pick = (variation, salt, count) => hashed(variation, salt) % count;
/** A stable 0..1 float for the given variation and salt. */
const spread = (variation, salt) => (hashed(variation, salt) % 2048) / 2048;
/** A stable -1..1 float. */
const jitter = (variation, salt) => spread(variation, salt) * 2 - 1;

// ---------------------------------------------------------------- cloth materials
const clothCache = new Map();
/** A shared double-sided cloth material. Treat it as read-only, exactly like a `part()` material. */
function cloth(color) {
  if (!clothCache.has(color)) clothCache.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.82, side: THREE.DoubleSide }));
  return clothCache.get(color);
}
/** A cloth material owned by a single prop, so the caller may recolour it. */
const uniqueCloth = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.82, side: THREE.DoubleSide });

/** Adds a mesh with a caller-supplied material, mirroring `part()` for everything else. */
function sheet(parent, geometry, material, position, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * A faction banner tall enough to read at campaign zoom: pole, gold finial, big rippling flag and a
 * pennant tail. The flag material belongs to this banner alone — recolour it through `setBannerColor`.
 */
export function createFactionBanner(color, height = 2.4, width = 0.85) {
  const group = new THREE.Group();
  const tint = color ?? NEUTRAL;
  const material = uniqueCloth(tint);
  part(group, CYL5, "#6f5237", [0, height / 2, 0], [0.05, height, 0.05]);
  part(group, CONE5, GOLD, [0, height + 0.12, 0], [0.08, 0.26, 0.08]);
  part(group, BOX, "#6f5237", [width * 0.34, height - 0.05, 0], [width * 0.7, 0.055, 0.055]);
  const flag = sheet(group, FLAG, material, [0.02, height - 0.07 - width * 0.46, 0], [width * 1.1, width * 0.8, 1]);
  flag.name = "faction-flag";
  const tail = sheet(group, PENNANT, material, [0.02, height - 0.2 - width * 1.05, 0], [width * 0.66, width * 0.32, 1]);
  tail.name = "faction-pennant";
  // A streamer lying flat under the finial: from a straight-down campaign camera the upright cloth
  // is edge-on and vanishes, so the colour needs a horizontal surface too.
  const pennon = sheet(group, PENNANT, material, [0, height + 0.02, 0], [width * 0.95, width * 0.62, 1]);
  pennon.rotation.x = -Math.PI / 2;
  pennon.name = "faction-pennon";
  group.name = "faction-banner";
  group.userData.material = material;
  group.userData.neutral = color === null || color === undefined;
  return group;
}

/** Recolours a banner returned by `createFactionBanner`/`createSettlement`; null reads as neutral. */
export function setBannerColor(banner, color) {
  const material = banner?.userData?.material;
  if (!material) return;
  material.color.set(color ?? NEUTRAL);
  banner.userData.neutral = color === null || color === undefined;
}

// ---------------------------------------------------------------- building blocks

/** A one-room house: walls, hipped roof, door, and a chimney on roughly half of them. */
function cottage(parent, x, z, rotation, scale, variation, salt) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);
  parent.add(group);
  const walls = HOUSE_WALLS[pick(variation, salt, HOUSE_WALLS.length)];
  const roof = HOUSE_ROOFS[pick(variation, salt + 3, HOUSE_ROOFS.length)];
  const depth = 0.5 + spread(variation, salt + 5) * 0.18;
  part(group, BOX, walls, [0, 0.31, 0], [0.64, 0.62, depth]);
  for (const side of [-1, 1]) part(group, BOX, TIMBER, [side * 0.3, 0.31, depth / 2 - 0.01], [0.07, 0.62, 0.07]);
  part(group, ROOF, roof, [0, 0.61, 0], [0.8, 0.44, depth + 0.16]);
  part(group, BOX, "#5b4531", [0, 0.17, depth / 2 + 0.01], [0.18, 0.34, 0.03]);
  part(group, BOX, "#f0dca6", [0.22, 0.42, depth / 2 + 0.01], [0.13, 0.13, 0.03]);
  if (pick(variation, salt + 7, 2) === 0) part(group, BOX, STONE_DARK, [-0.2, 0.86, 0], [0.13, 0.42, 0.13]);
  return group;
}

/** A long hall: the shape every barracks, granary and market hall in the library is cut from. */
function hall(parent, x, z, rotation, width, height, depth, wallColor, roofColor) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  parent.add(group);
  part(group, BOX, wallColor, [0, height / 2, 0], [width, height, depth]);
  for (const side of [-1, 1]) {
    part(group, BOX, TIMBER, [side * (width / 2 - 0.05), height / 2, depth / 2 - 0.01], [0.08, height, 0.08]);
    part(group, BOX, TIMBER, [0, height - 0.06, side * (depth / 2 - 0.01)], [width, 0.08, 0.08]);
  }
  part(group, ROOF, roofColor, [0, height, 0], [width * 1.14, height * 0.6, depth * 1.16]);
  part(group, BOX, "#5b4531", [0, height * 0.3, depth / 2 + 0.01], [width * 0.22, height * 0.6, 0.03]);
  return group;
}

/** A round stone tower with a banded shaft and a conical cap. */
function tower(parent, x, z, height, radius, roofColor, stone = STONE) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  parent.add(group);
  part(group, TAPER6, stone, [0, height / 2, 0], [radius, height, radius]);
  part(group, CYL6, STONE_PALE, [0, height * 0.56, 0], [radius * 0.82, 0.1, radius * 0.82]);
  part(group, CYL6, STONE_PALE, [0, height + 0.07, 0], [radius * 0.96, 0.15, radius * 0.96]);
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3;
    part(group, BOX, STONE_PALE, [Math.sin(angle) * radius * 0.82, height + 0.24, Math.cos(angle) * radius * 0.82], [0.17, 0.2, 0.17]);
  }
  if (roofColor) part(group, CONE6, roofColor, [0, height + 0.62, 0], [radius * 1.02, 0.85, radius * 1.02]);
  for (const side of [-1, 1]) part(group, BOX, "#2f3a3a", [side * radius * 0.7, height * 0.66, radius * 0.66], [0.09, 0.24, 0.09]);
  return group;
}

/** Lays a curtain of straight panels around `radius`, leaving one panel open for the gate. */
function wallRing(parent, radius, height, gateAngle, merlons, stone = STONE) {
  const segments = 14;
  const panel = 2 * radius * Math.sin(Math.PI / segments) * 1.1;
  const group = new THREE.Group();
  parent.add(group);
  for (let index = 1; index < segments; index += 1) {
    const angle = gateAngle + index * (Math.PI * 2 / segments);
    const panelGroup = new THREE.Group();
    panelGroup.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    panelGroup.rotation.y = angle;
    group.add(panelGroup);
    part(panelGroup, BOX, stone, [0, height / 2, 0], [panel, height, 0.3]);
    part(panelGroup, BOX, STONE_PALE, [0, height + 0.05, 0], [panel, 0.1, 0.4]);
    // A wall-walk on the inner face keeps the curtain from reading as a thin ribbon from above.
    part(panelGroup, BOX, STONE_DARK, [0, height * 0.62, -0.26], [panel, 0.1, 0.22]);
    for (let strut = -1; strut <= 1; strut += 1) part(panelGroup, BOX, TIMBER, [panel * strut * 0.32, height * 0.44, -0.24], [0.08, height * 0.5, 0.08]);
    if (merlons) for (const offset of [-0.32, 0, 0.32]) part(panelGroup, BOX, STONE_PALE, [panel * offset, height + 0.2, 0.04], [panel * 0.22, 0.2, 0.32]);
  }
  return group;
}

/** A square curtain with corner towers; the plan that tells a fort apart from a walled town. */
function squareCurtain(parent, half, height, gateSide, roofColor, stone = STONE) {
  const group = new THREE.Group();
  parent.add(group);
  for (let side = 0; side < 4; side += 1) {
    const angle = side * Math.PI / 2;
    const run = new THREE.Group();
    run.position.set(Math.sin(angle) * half, 0, Math.cos(angle) * half);
    run.rotation.y = angle;
    group.add(run);
    const spans = side === gateSide
      ? [[-(half * 0.66), half * 0.68], [half * 0.66, half * 0.68]]
      : [[0, half * 2]];
    for (const [offset, width] of spans) {
      part(run, BOX, stone, [offset, height / 2, 0], [width, height, 0.3]);
      part(run, BOX, STONE_PALE, [offset, height + 0.05, 0], [width, 0.1, 0.4]);
      part(run, BOX, STONE_DARK, [offset, height * 0.62, -0.26], [width, 0.1, 0.22]);
      const merlons = Math.max(2, Math.round(width / 0.44));
      for (let index = 0; index < merlons; index += 1) {
        part(run, BOX, STONE_PALE, [offset + (index / (merlons - 1) - 0.5) * (width - 0.22), height + 0.2, 0.04], [0.2, 0.2, 0.32]);
      }
    }
  }
  for (let corner = 0; corner < 4; corner += 1) {
    const angle = corner * Math.PI / 2 + Math.PI / 4;
    tower(group, Math.sin(angle) * half * 1.414, Math.cos(angle) * half * 1.414, height + 0.5, 0.29, roofColor, stone);
  }
  // Gate: two squat piers and a timber door in the gap left on the gate side.
  const gate = new THREE.Group();
  const gateAngle = gateSide * Math.PI / 2;
  gate.position.set(Math.sin(gateAngle) * half, 0, Math.cos(gateAngle) * half);
  gate.rotation.y = gateAngle;
  group.add(gate);
  for (const sign of [-1, 1]) {
    part(gate, BOX, stone, [sign * 0.38, (height + 0.3) / 2, 0], [0.34, height + 0.3, 0.44]);
    part(gate, BOX, STONE_PALE, [sign * 0.38, height + 0.38, 0], [0.44, 0.14, 0.54]);
  }
  part(gate, BOX, stone, [0, height + 0.08, 0], [0.5, 0.36, 0.42]);
  part(gate, BOX, "#4b3926", [0, height * 0.34, 0.02], [0.46, height * 0.68, 0.16]);
  return group;
}

/** Twin towers over a timber gate, sitting in the gap `wallRing` leaves. */
function gatehouse(parent, radius, height, gateAngle, stone = STONE) {
  const group = new THREE.Group();
  group.position.set(Math.sin(gateAngle) * radius, 0, Math.cos(gateAngle) * radius);
  group.rotation.y = gateAngle;
  parent.add(group);
  for (const side of [-1, 1]) {
    part(group, BOX, stone, [side * 0.5, (height + 0.45) / 2, 0], [0.42, height + 0.45, 0.5]);
    part(group, BOX, STONE_PALE, [side * 0.5, height + 0.52, 0], [0.52, 0.14, 0.6]);
    part(group, CONE4, ROOF_SLATE, [side * 0.5, height + 0.88, 0], [0.38, 0.58, 0.38]).rotation.y = Math.PI / 4;
  }
  part(group, BOX, stone, [0, height + 0.06, 0], [0.62, 0.42, 0.46]);
  part(group, BOX, "#4b3926", [0, height * 0.36, 0.02], [0.58, height * 0.72, 0.16]);
  for (const y of [0.18, 0.42, 0.66]) part(group, BOX, IRON, [0, height * y, 0.1], [0.6, 0.05, 0.04]);
  return group;
}

/** A ring of sharpened stakes; the cheap defence every young settlement starts behind. */
function palisade(parent, radius, height, gateAngle, count = 26) {
  const group = new THREE.Group();
  parent.add(group);
  for (let index = 0; index < count; index += 1) {
    const angle = index * (Math.PI * 2 / count);
    if (Math.abs(Math.atan2(Math.sin(angle - gateAngle), Math.cos(angle - gateAngle))) < 0.3) continue;
    const post = part(group, CYL5, TIMBER_PALE, [Math.sin(angle) * radius, height / 2, Math.cos(angle) * radius], [0.075, height, 0.075]);
    post.rotation.z = Math.sin(index * 2.3) * 0.05;
    part(group, CONE5, "#b39a73", [Math.sin(angle) * radius, height + 0.08, Math.cos(angle) * radius], [0.075, 0.18, 0.075]);
  }
  return group;
}

/** Crop rows whose ripeness is decided by the caller's colour. */
function field(parent, x, z, rotation, width, depth, cropColor) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  parent.add(group);
  part(group, BOX, EARTH, [0, 0.02, 0], [width, 0.04, depth]).castShadow = false;
  const rows = Math.max(2, Math.round(width / 0.26));
  for (let index = 0; index < rows; index += 1) {
    const offset = (index / (rows - 1) - 0.5) * (width - 0.16);
    part(group, BOX, "#5d4330", [offset, 0.05, 0], [0.08, 0.03, depth - 0.1]).castShadow = false;
    for (let step = 0; step < 4; step += 1) {
      part(group, CONE5, cropColor, [offset, 0.14, (step / 3 - 0.5) * (depth - 0.2)], [0.075, 0.22, 0.075]).castShadow = false;
    }
  }
  return group;
}

/** A post-and-rail fence along a straight run. */
function fence(parent, x, z, rotation, length, color = TIMBER_PALE) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  parent.add(group);
  const posts = Math.max(2, Math.round(length / 0.45));
  for (let index = 0; index <= posts; index += 1) part(group, BOX, color, [(index / posts - 0.5) * length, 0.16, 0], [0.06, 0.32, 0.06]);
  for (const y of [0.14, 0.27]) part(group, BOX, color, [0, y, 0], [length, 0.04, 0.04]);
  return group;
}

/** A conical tent. */
function tent(parent, x, z, scale, color) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  parent.add(group);
  part(group, CONE6, color, [0, 0.3, 0], [0.34, 0.66, 0.34]);
  part(group, BOX, "#3d3226", [0, 0.14, 0.3], [0.13, 0.28, 0.03]);
  part(group, CYL5, TIMBER, [0, 0.66, 0], [0.02, 0.2, 0.02]);
  return group;
}

/** A stone well; the thing that makes a cluster of houses read as a village square. */
function well(parent, x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  parent.add(group);
  part(group, CYL8, STONE, [0, 0.14, 0], [0.24, 0.28, 0.24]);
  part(group, CYL8, "#33474b", [0, 0.27, 0], [0.19, 0.04, 0.19]).castShadow = false;
  for (const side of [-1, 1]) part(group, BOX, TIMBER, [side * 0.2, 0.34, 0], [0.05, 0.68, 0.05]);
  part(group, ROOF, ROOF_WOOD, [0, 0.62, 0], [0.56, 0.22, 0.42]);
  return group;
}

// ---------------------------------------------------------------- settlement cores

function capitalCore(group, tier, variation) {
  const radius = 1.34 + tier * 0.2;
  const gate = Math.PI * 0.5 + jitter(variation, 2) * 0.35;
  const keepHeight = 1.4 + tier * 0.46;
  const stoneAge = tier >= 2;
  // Keep: a square donjon rather than a round tower, so it never reads as a watchtower.
  const keep = new THREE.Group();
  keep.position.set(-0.1, 0, -0.15);
  keep.rotation.y = jitter(variation, 4) * 0.25;
  group.add(keep);
  part(keep, BOX, STONE_DARK, [0, 0.1, 0], [1.2, 0.2, 1.2]);
  part(keep, BOX, STONE, [0, keepHeight / 2 + 0.1, 0], [1.02, keepHeight, 1.02]);
  part(keep, BOX, STONE_PALE, [0, keepHeight + 0.2, 0], [1.2, 0.16, 1.2]);
  for (const x of [-0.52, 0, 0.52]) for (const z of [-0.52, 0.52]) part(keep, BOX, STONE_PALE, [x, keepHeight + 0.4, z], [0.2, 0.24, 0.2]);
  for (const z of [-0.52, 0.52]) part(keep, BOX, STONE_PALE, [z, keepHeight + 0.4, 0], [0.2, 0.24, 0.2]);
  for (const side of [-1, 1]) part(keep, BOX, "#2f3a3a", [side * 0.28, keepHeight * 0.72, 0.52], [0.11, 0.3, 0.05]);
  part(keep, BOX, "#4b3926", [0, 0.44, 0.52], [0.32, 0.68, 0.05]);
  if (tier >= 2) {
    // A stair turret pushed off one corner, then a full spire once the capital is grown.
    tower(keep, 0.56, 0.5, keepHeight + 0.3, 0.3, tier >= 3 ? ROOF_SLATE : null);
    // A tiled great hall against the keep's flank: the one warm mass in an otherwise grey pile.
    hall(keep, -0.85, 0.28, Math.PI / 2, 1.0, 0.68, 0.72, PLASTER, ROOF_TILE);
  }
  if (tier >= 3) {
    part(keep, BOX, STONE, [0, keepHeight * 0.5 + 0.1, -0.78], [0.5, keepHeight, 0.5]);
    part(keep, CONE4, ROOF_SLATE, [0, keepHeight + 0.55, -0.78], [0.42, 0.95, 0.42]).rotation.y = Math.PI / 4;
  }

  const houses = [3, 5, 8][tier - 1] ?? 3;
  for (let index = 0; index < houses; index += 1) {
    const angle = (index / houses) * Math.PI * 2 + 0.6 + jitter(variation, 10 + index) * 0.18;
    const distance = radius * (0.66 + spread(variation, 20 + index) * 0.2);
    cottage(group, Math.sin(angle) * distance, Math.cos(angle) * distance + 0.35, -angle + Math.PI, 0.78, variation, index * 3 + 1);
  }
  well(group, 0.62, 0.72);

  if (stoneAge) {
    wallRing(group, radius, 0.62 + tier * 0.1, gate, tier >= 3);
    gatehouse(group, radius, 0.62 + tier * 0.1, gate);
    if (tier >= 3) for (let index = 0; index < 4; index += 1) {
      const angle = gate + (index + 0.5) * Math.PI / 2;
      tower(group, Math.sin(angle) * radius, Math.cos(angle) * radius, 1.1, 0.25, ROOF_SLATE);
    }
  } else {
    palisade(group, radius, 0.72, gate);
    for (const side of [-1, 1]) part(group, CYL6, TIMBER, [Math.sin(gate + side * 0.34) * radius, 0.5, Math.cos(gate + side * 0.34) * radius], [0.1, 1, 0.1]);
  }
  return { radius, bannerAt: [-0.1, keepHeight + 0.5, -0.15], bannerHeight: 1.05 + tier * 0.12, bannerWidth: 0.78 };
}

function townCore(group, tier, variation) {
  const radius = 1.2 + tier * 0.2;
  const houses = [4, 6, 9][tier - 1] ?? 4;
  for (let index = 0; index < houses; index += 1) {
    const angle = (index / houses) * Math.PI * 2 + jitter(variation, 30 + index) * 0.22;
    const distance = radius * (0.5 + spread(variation, 40 + index) * 0.32);
    cottage(group, Math.sin(angle) * distance, Math.cos(angle) * distance, -angle + Math.PI, 0.8 + spread(variation, 50 + index) * 0.16, variation, index * 5 + 2);
  }
  // The square: cobbles, a well, and from tier 2 a timbered moot hall that gives the town a centre.
  part(group, CYL12, "#a9a396", [0, 0.02, 0], [radius * 0.52, 0.04, radius * 0.52]).castShadow = false;
  well(group, -0.3, 0.32);
  if (tier >= 2) {
    hall(group, 0.42, -0.5, jitter(variation, 60) * 0.3, 1.05, 0.72, 0.68, PLASTER, ROOF_TILE);
    fence(group, 0, radius * 0.95, 0, 1.5);
  }
  if (tier >= 3) {
    part(group, BOX, STONE, [-0.75, 0.45, -0.6], [0.66, 0.9, 0.66]);
    part(group, CONE4, ROOF_SLATE, [-0.75, 1.22, -0.6], [0.56, 0.72, 0.56]).rotation.y = Math.PI / 4;
    for (let index = 0; index < 3; index += 1) {
      const angle = 1.8 + index * 0.7;
      cottage(group, Math.sin(angle) * radius * 1.05, Math.cos(angle) * radius * 1.05, -angle, 0.74, variation, index * 7 + 9);
    }
  }
  const bannerHeight = 1.5 + tier * 0.3;
  return { radius, bannerAt: [0.24, 0, 0.5], bannerHeight, bannerWidth: 0.62 + tier * 0.05, poleOnGround: true };
}

function fortCore(group, tier, variation) {
  const radius = 1.12 + tier * 0.2;
  const gate = Math.PI * 0.5 + jitter(variation, 3) * 0.3;
  const wallHeight = 0.6 + tier * 0.14;
  // Earthwork first: a fort always sits on a raised, revetted platform.
  part(group, CYL8, "#6f5a42", [0, 0.07, 0], [radius * 1.02, 0.14, radius * 1.02]).receiveShadow = true;
  if (tier === 1) {
    palisade(group, radius, 0.85, gate, 30);
    for (const side of [-1, 1]) {
      part(group, CYL6, TIMBER, [Math.sin(gate + side * 0.3) * radius, 0.62, Math.cos(gate + side * 0.3) * radius], [0.11, 1.24, 0.11]);
    }
    // Timber watch platform on four legs — the outpost silhouette.
    const platform = new THREE.Group();
    platform.position.set(-0.15, 0, -0.2);
    group.add(platform);
    for (const x of [-0.36, 0.36]) for (const z of [-0.36, 0.36]) part(platform, BOX, TIMBER, [x, 0.6, z], [0.1, 1.2, 0.1]);
    for (const y of [0.4, 0.8]) part(platform, BOX, TIMBER_PALE, [0, y, 0], [0.84, 0.05, 0.84]);
    part(platform, BOX, TIMBER_PALE, [0, 1.22, 0], [0.96, 0.08, 0.96]);
    for (const side of [-1, 1]) {
      part(platform, BOX, TIMBER_PALE, [side * 0.44, 1.42, 0], [0.07, 0.34, 0.9]);
      part(platform, BOX, TIMBER_PALE, [0, 1.42, side * 0.44], [0.9, 0.34, 0.07]);
    }
    part(platform, ROOF, ROOF_WOOD, [0, 1.62, 0], [1.1, 0.4, 1.1]);
    tent(group, 0.55, 0.55, 0.9, "#8d9a8c");
    tent(group, 0.1, 0.78, 0.8, "#94a08f");
    return { radius, bannerAt: [-0.15, 1.72, -0.2], bannerHeight: 0.95, bannerWidth: 0.6 };
  }
  // Square plan from here on; it is what stops a fort reading as a small walled town.
  const curtain = squareCurtain(group, radius * 0.86, wallHeight, 0, tier >= 3 ? ROOF_SLATE : null, STONE_DARK);
  curtain.rotation.y = jitter(variation, 3) * 0.3;
  // Square bastion keep in the middle of the yard.
  const keepHeight = 0.9 + tier * 0.35;
  part(group, BOX, STONE, [-0.1, keepHeight / 2 + 0.16, -0.15], [0.82, keepHeight, 0.82]);
  part(group, BOX, STONE_PALE, [-0.1, keepHeight + 0.23, -0.15], [0.98, 0.14, 0.98]);
  for (const x of [-0.5, 0.3]) for (const z of [-0.55, 0.25]) part(group, BOX, STONE_PALE, [x, keepHeight + 0.4, z], [0.18, 0.22, 0.18]);
  part(group, BOX, "#4b3926", [-0.1, 0.5, 0.27], [0.28, 0.6, 0.05]);
  tent(group, 0.62, 0.42, 0.85, "#8d9a8c");
  if (tier >= 3) {
    tent(group, 0.68, -0.34, 0.8, "#94a08f");
    for (const x of [-0.85, -0.52]) part(group, BOX, TIMBER, [x, 0.42, 0.68], [0.06, 0.78, 0.06]);
  }
  return { radius, bannerAt: [-0.1, keepHeight + 0.32, -0.15], bannerHeight: 0.95, bannerWidth: 0.68 };
}

function mineCore(group, tier, variation) {
  const radius = 1.35 + tier * 0.12;
  // The pit: a dark shaft mouth ringed with cut stone and spoil.
  part(group, CYL8, "#6d6257", [0, 0.05, -0.15], [0.62, 0.1, 0.62]).receiveShadow = true;
  part(group, CYL8, "#1d2021", [0, 0.11, -0.15], [0.45, 0.06, 0.45]).castShadow = false;
  for (let index = 0; index < 7; index += 1) {
    const angle = index * 0.92;
    part(group, ROCK, index % 3 === 0 ? "#a46549" : "#8d8b80", [Math.sin(angle) * (0.85 + spread(variation, 70 + index) * 0.5), 0.13, Math.cos(angle) * (0.85 + spread(variation, 80 + index) * 0.5) - 0.1], [0.22, 0.2, 0.2]);
  }
  // Headframe: four raking legs, a winding wheel and the rope dropping into the shaft.
  const frame = new THREE.Group();
  frame.position.set(0, 0, -0.15);
  frame.rotation.y = jitter(variation, 6) * 0.3;
  group.add(frame);
  const legHeight = 1.3 + tier * 0.28;
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const leg = part(frame, BOX, TIMBER, [x * 0.38, legHeight / 2, z * 0.38], [0.1, legHeight, 0.1]);
    leg.rotation.set(-z * 0.16, 0, x * 0.16);
  }
  for (const y of [legHeight * 0.45, legHeight * 0.82]) for (const x of [-1, 1]) {
    part(frame, BOX, TIMBER_PALE, [x * 0.33 * (1 - y / legHeight * 0.4), y, 0], [0.05, 0.05, 0.72]);
    part(frame, BOX, TIMBER_PALE, [0, y, x * 0.33 * (1 - y / legHeight * 0.4)], [0.72, 0.05, 0.05]);
  }
  part(frame, BOX, TIMBER, [0, legHeight + 0.04, 0], [0.62, 0.08, 0.62]);
  part(frame, WHEEL, IRON, [0, legHeight + 0.34, 0], [0.28, 0.28, 0.28]);
  part(frame, CYL5, "#9c8f77", [0, legHeight * 0.6, 0.27], [0.02, legHeight * 1.2, 0.02]);
  // Pit-head shed and spoil ramp.
  hall(group, -0.95, 0.55, 0.5, 0.9, 0.52, 0.72, "#b09a78", ROOF_WOOD);
  part(group, BOX, DIRT, [0.9, 0.2, 0.6], [0.9, 0.4, 0.7]).receiveShadow = true;
  part(group, ROCK, "#8d8b80", [0.95, 0.46, 0.55], [0.4, 0.28, 0.36]);
  if (tier >= 2) {
    // Rails and an ore cart, so the mine reads as working rather than abandoned.
    for (const x of [-0.08, 0.08]) part(group, BOX, IRON, [x, 0.04, 0.75], [0.05, 0.05, 1.5]).castShadow = false;
    for (let index = 0; index < 5; index += 1) part(group, BOX, TIMBER, [0, 0.03, 0.18 + index * 0.3], [0.32, 0.04, 0.08]).castShadow = false;
    const cart = new THREE.Group();
    cart.position.set(0, 0, 0.95);
    group.add(cart);
    part(cart, BOX, "#7a6a55", [0, 0.2, 0], [0.32, 0.26, 0.42]);
    part(cart, ROCK, "#a46549", [0, 0.34, 0], [0.13, 0.08, 0.16]);
    for (const x of [-0.17, 0.17]) for (const z of [-0.14, 0.14]) part(cart, CYL8, IRON, [x, 0.08, z], [0.08, 0.05, 0.08]).rotation.z = Math.PI / 2;
    part(group, BOX, STONE, [-1.0, 0.36, -0.7], [0.5, 0.72, 0.5]);
    part(group, CYL6, SOOT, [-1.0, 1.1, -0.7], [0.16, 0.8, 0.16]);
  }
  if (tier >= 3) {
    // Crusher house with a smoking stack, and a second smaller shaft.
    part(group, BOX, STONE_DARK, [0.95, 0.45, -0.75], [0.8, 0.9, 0.7]);
    part(group, ROOF, "#5a5d5a", [0.95, 0.9, -0.75], [0.94, 0.4, 0.84]);
    part(group, CYL6, SOOT, [1.24, 1.35, -0.75], [0.17, 1.4, 0.17]);
    part(group, CYL6, "#3b3a37", [1.24, 2.1, -0.75], [0.21, 0.14, 0.21]);
    part(group, CYL8, "#1d2021", [-0.95, 0.06, -0.15], [0.22, 0.06, 0.22]).castShadow = false;
    for (const x of [-1.1, -0.8]) part(group, BOX, TIMBER, [x, 0.25, -0.15], [0.07, 0.5, 0.07]);
    part(group, BOX, TIMBER, [-0.95, 0.52, -0.15], [0.42, 0.07, 0.07]);
  }
  return { radius, bannerAt: [-0.95, 0.56, 0.55], bannerHeight: 1.35, bannerWidth: 0.58 };
}

function farmCore(group, tier, variation) {
  const radius = 1.5 + tier * 0.12;
  const crop = ["#8fbb5f", "#c9c064", "#e3c46a"][tier - 1] ?? "#8fbb5f";
  const fields = [2, 3, 4][tier - 1] ?? 2;
  const layout = [[-0.95, 0.85, 0], [0.9, 0.85, 0], [-0.95, -0.55, 0], [0.95, -0.6, 0]];
  for (let index = 0; index < fields; index += 1) {
    const place = layout[index] ?? layout[0];
    field(group, place[0], place[1], place[2] + jitter(variation, 90 + index) * 0.12, 1.05, 1.0, crop);
  }
  // Barn: the one tall mass, so a farm still has a silhouette from above.
  const barn = hall(group, 0.05, -0.05, jitter(variation, 8) * 0.25, 1.25, 0.85, 0.95, "#a35c48", ROOF_WOOD);
  part(barn, BOX, "#e4d7ba", [0, 0.42, 0.48], [1.2, 0.09, 0.04]);
  part(barn, BOX, "#e4d7ba", [0, 0.82, 0.48], [1.2, 0.09, 0.04]);
  part(group, BOX, DIRT, [0.05, 0.02, 0.75], [1.3, 0.04, 0.6]).castShadow = false;
  fence(group, 0, 1.45, 0, 2.2);
  fence(group, -1.5, 0.2, Math.PI / 2, 2.2);
  if (tier >= 2) {
    // Granary on staddle stones, plus haystacks.
    part(group, CYL8, PLASTER_WARM, [1.15, 0.62, 0.15], [0.36, 0.85, 0.36]);
    part(group, CONE6, ROOF_THATCH, [1.15, 1.22, 0.15], [0.44, 0.5, 0.44]);
    for (const x of [-0.16, 0.16]) for (const z of [-0.16, 0.16]) part(group, CYL6, STONE, [1.15 + x, 0.1, 0.15 + z], [0.08, 0.2, 0.08]);
    part(group, CONE6, "#d5bb76", [-0.95, 0.26, -1.15], [0.36, 0.55, 0.36]);
  }
  if (tier >= 3) {
    // Windmill: unmistakable at campaign zoom and the clearest tier-3 tell in the set.
    const mill = new THREE.Group();
    mill.position.set(-1.35, 0, -0.35);
    group.add(mill);
    part(mill, TAPER6, PLASTER, [0, 0.72, 0], [0.42, 1.44, 0.42]);
    part(mill, CONE6, ROOF_SLATE, [0, 1.62, 0], [0.4, 0.45, 0.4]);
    part(mill, BOX, "#5b4531", [0, 0.3, 0.33], [0.22, 0.58, 0.04]);
    const sails = new THREE.Group();
    sails.position.set(0, 1.5, 0.4);
    sails.rotation.z = 0.4;
    mill.add(sails);
    part(sails, CYL6, TIMBER, [0, 0, -0.06], [0.07, 0.16, 0.07]).rotation.x = Math.PI / 2;
    for (let index = 0; index < 4; index += 1) {
      const arm = new THREE.Group();
      arm.rotation.z = index * Math.PI / 2;
      sails.add(arm);
      part(arm, BOX, TIMBER, [0, 0.42, 0], [0.05, 0.84, 0.04]);
      part(arm, BOX, "#e9e0c6", [0.08, 0.5, -0.02], [0.14, 0.6, 0.02]);
    }
    part(group, CONE6, "#d5bb76", [-0.6, 0.24, -1.2], [0.32, 0.5, 0.32]);
  }
  return { radius, bannerAt: [0.62, 0, 0.55], bannerHeight: 1.5 + tier * 0.12, bannerWidth: 0.6, poleOnGround: true };
}

function shrineCore(group, tier, variation) {
  const radius = 1.15 + tier * 0.16;
  const stones = [5, 7, 9][tier - 1] ?? 5;
  const ringRadius = radius * 0.74;
  part(group, CYL12, "#9ea48f", [0, 0.02, 0], [ringRadius + 0.42, 0.04, ringRadius + 0.42]).castShadow = false;
  for (let index = 0; index < stones; index += 1) {
    const angle = index * (Math.PI * 2 / stones);
    const height = 0.95 + tier * 0.25 + spread(variation, 100 + index) * 0.45;
    const monolith = part(group, BOX, index % 2 === 0 ? "#8e948c" : "#7e857f", [Math.sin(angle) * ringRadius, height / 2, Math.cos(angle) * ringRadius], [0.3, height, 0.22]);
    monolith.rotation.set(jitter(variation, 110 + index) * 0.08, angle, jitter(variation, 120 + index) * 0.09);
    part(group, ROCK, MOSS, [Math.sin(angle) * ringRadius * 1.16, 0.07, Math.cos(angle) * ringRadius * 1.16], [0.18, 0.08, 0.18]).castShadow = false;
  }
  // Altar slab and its rune, lit with its own basic material so it glows without a light.
  part(group, BOX, "#a8aea0", [0, 0.16, 0], [0.62, 0.32, 0.5]);
  part(group, BOX, "#bcc2b2", [0, 0.35, 0], [0.76, 0.1, 0.62]);
  const rune = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: "#9fe9ff" }));
  rune.position.set(0, 0.41, 0);
  rune.scale.set(0.3, 0.02, 0.3);
  rune.name = "shrine-rune";
  group.add(rune);
  if (tier >= 2) {
    // Trilithon gate on the approach: two uprights and a lintel.
    const arch = new THREE.Group();
    arch.position.set(0, 0, ringRadius + 0.55);
    arch.rotation.y = jitter(variation, 9) * 0.2;
    group.add(arch);
    const height = 1.5 + tier * 0.2;
    for (const side of [-1, 1]) part(arch, BOX, "#8e948c", [side * 0.42, height / 2, 0], [0.28, height, 0.28]);
    part(arch, BOX, "#9aa096", [0, height + 0.13, 0], [1.2, 0.26, 0.32]);
  }
  if (tier >= 3) {
    // Obelisk and a floating shard: the shrine fully awake.
    part(group, TAPER6, "#868d86", [0, 1.1, -ringRadius * 0.15], [0.22, 2.2, 0.22]);
    part(group, CONE6, "#b9c0b0", [0, 2.35, -ringRadius * 0.15], [0.2, 0.42, 0.2]);
    const shard = new THREE.Mesh(CONE6, new THREE.MeshBasicMaterial({ color: "#9fe9ff" }));
    shard.position.set(0, 2.85, -ringRadius * 0.15);
    shard.scale.set(0.14, 0.34, 0.14);
    shard.name = "shrine-shard";
    group.add(shard);
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI / 2 + 0.4;
      part(group, ROCK, "#8d938c", [Math.sin(angle) * (radius + 0.35), 0.16, Math.cos(angle) * (radius + 0.35)], [0.3, 0.3, 0.28]);
      part(group, ROCK, "#9aa096", [Math.sin(angle) * (radius + 0.35), 0.4, Math.cos(angle) * (radius + 0.35)], [0.18, 0.18, 0.17]);
    }
  }
  return { radius, bannerAt: [ringRadius * 0.82, 0, ringRadius * 0.82], bannerHeight: 1.7, bannerWidth: 0.54, poleOnGround: true };
}

function chokepointCore(group, tier, variation) {
  const radius = 1.5;
  const span = 2.85;
  const turn = jitter(variation, 11) * 0.5;
  const road = new THREE.Group();
  road.rotation.y = turn;
  group.add(road);
  // The chasm runs ACROSS the road; the two approaches sit on raised banks either side of it.
  const reach = span + 1.15;
  part(road, BOX, "#3f3d38", [0, -0.2, 0], [1.2, 0.6, reach + 0.3]).castShadow = false;
  for (const side of [-1, 1]) {
    const bank = new THREE.Group();
    bank.position.set(side * (0.58 + span * 0.26), 0, 0);
    road.add(bank);
    part(bank, BOX, "#8a7f6a", [0, 0.11, 0], [span * 0.5, 0.22, reach]).receiveShadow = true;
    part(bank, BOX, "#6e6455", [side * span * 0.26, 0.06, 0], [0.16, 0.32, reach]).castShadow = false;
    // Crags pinching the road: the silhouette that says "pass" from straight above.
    for (const end of [-1, 1]) {
      const crag = part(bank, ROCK, "#8d938c", [side * span * 0.08, 0.3, end * reach * 0.33], [0.44, 0.52, 0.46]);
      crag.rotation.set(0.25, side + end, 0.2);
      const shoulder = part(bank, ROCK, "#7f867e", [side * span * 0.2, 0.46, end * reach * 0.44], [0.36, 0.78, 0.4]);
      shoulder.rotation.set(0.1, end * 1.4, -side * 0.18);
    }
  }
  part(road, BOX, DIRT, [0, 0.23, 0], [span + 1.6, 0.04, 0.72]).castShadow = false;
  if (tier === 1) {
    // Timber trestle bridge with a felled-log barrier.
    part(road, BOX, TIMBER_PALE, [0, 0.24, 0], [1.6, 0.09, 0.66]);
    for (const x of [-0.5, 0, 0.5]) for (const z of [-0.26, 0.26]) part(road, BOX, TIMBER, [x, 0.02, z], [0.08, 0.44, 0.08]);
    for (const z of [-0.33, 0.33]) part(road, BOX, TIMBER, [0, 0.4, z], [1.6, 0.05, 0.05]);
    for (const side of [-1, 1]) {
      part(road, CYL6, TIMBER, [side * 1.0, 0.5, 0], [0.09, 0.7, 0.09]);
      part(road, CYL6, TIMBER_PALE, [side * 1.0, 0.62, 0], [0.07, 1.1, 0.07]).rotation.x = Math.PI / 2;
    }
    const camp = new THREE.Vector3(0.95, 0.24, 1.15).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
    tent(group, camp.x, camp.z, 0.85, "#8d9a8c");
    return { radius, bannerAt: [camp.x - 0.55, 0.24, camp.z + 0.1], bannerHeight: 1.45, bannerWidth: 0.6, poleOnGround: true };
  }
  // Stone arch: three tapering piers with voussoir blocks over the gap.
  part(road, BOX, STONE_PALE, [0, 0.31, 0], [span, 0.16, 0.8]);
  for (const z of [-0.42, 0.42]) part(road, BOX, STONE, [0, 0.47, z], [span, 0.2, 0.12]);
  for (const x of [-0.42, 0.42]) part(road, BOX, STONE_DARK, [x, 0.02, 0], [0.3, 0.6, 0.8]);
  part(road, BOX, STONE, [0, 0.18, 0], [0.9, 0.3, 0.76]);

  const gateHeight = 1.1 + tier * 0.25;
  for (const side of [-1, 1]) {
    tower(road, side * (span / 2 + 0.12), 0.62, gateHeight, 0.34, tier >= 3 ? ROOF_SLATE : null, STONE_DARK);
    tower(road, side * (span / 2 + 0.12), -0.62, gateHeight, 0.34, tier >= 3 ? ROOF_SLATE : null, STONE_DARK);
    part(road, BOX, STONE_DARK, [side * (span / 2 + 0.12), gateHeight * 0.45 + 0.2, 0], [0.34, gateHeight * 0.9, 0.9]);
  }
  if (tier >= 3) {
    // A roofed gatehouse bridging the road, with a portcullis: the pass is now sealed.
    for (const side of [-1, 1]) {
      part(road, BOX, STONE, [side * (span / 2 + 0.12), gateHeight + 0.44, 0], [0.5, 0.5, 1.5]);
      part(road, BOX, "#3d3128", [side * (span / 2 + 0.12), 0.84, 0], [0.12, 0.84, 0.72]);
      for (const y of [0.62, 0.9, 1.18]) part(road, BOX, IRON, [side * (span / 2 + 0.05), y, 0], [0.05, 0.05, 0.74]);
    }
    part(road, BOX, STONE_PALE, [0, gateHeight + 0.78, 0], [span - 0.1, 0.18, 1.1]);
    for (let index = 0; index < 7; index += 1) part(road, BOX, STONE_PALE, [(index / 6 - 0.5) * (span - 0.5), gateHeight + 0.98, 0.52], [0.2, 0.22, 0.2]);
    for (let index = 0; index < 7; index += 1) part(road, BOX, STONE_PALE, [(index / 6 - 0.5) * (span - 0.5), gateHeight + 0.98, -0.52], [0.2, 0.22, 0.2]);
  } else {
    part(road, BOX, "#3d3128", [span / 2 + 0.12, 0.8, 0], [0.12, 0.8, 0.7]);
  }
  const bannerLocal = new THREE.Vector3(-(span / 2 + 0.12), gateHeight + (tier >= 3 ? 0.88 : 0.32), 0.62).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
  return { radius, bannerAt: [bannerLocal.x, bannerLocal.y, bannerLocal.z], bannerHeight: 1.05, bannerWidth: 0.6 };
}

function wildsCore(group, tier, variation) {
  const radius = 1.2;
  // A broken wall, toppled columns and a dead tree; nobody lives here.
  const ruin = new THREE.Group();
  ruin.rotation.y = jitter(variation, 12) * 1.4;
  group.add(ruin);
  part(ruin, BOX, "#8b8d83", [-0.35, 0.34, -0.45], [1.3, 0.68, 0.28]);
  part(ruin, BOX, "#7d7f76", [-0.85, 0.82, -0.45], [0.32, 0.3, 0.3]);
  part(ruin, BOX, "#8b8d83", [0.42, 0.18, -0.45], [0.34, 0.36, 0.26]);
  for (let index = 0; index < 3; index += 1) {
    const x = -0.7 + index * 0.72;
    const height = [0.85, 0.42, 1.15][index] ?? 0.6;
    part(ruin, CYL8, "#9aa096", [x, height / 2, 0.4], [0.16, height, 0.16]);
    part(ruin, BOX, "#a8ae9f", [x, 0.03, 0.4], [0.42, 0.07, 0.42]).castShadow = false;
    if (index === 1) {
      const fallen = part(ruin, CYL8, "#8e948c", [x + 0.4, 0.14, 0.95], [0.15, 0.95, 0.15]);
      fallen.rotation.set(0, 0.4, Math.PI / 2);
    }
  }
  for (let index = 0; index < 5; index += 1) {
    const angle = index * 1.3 + spread(variation, 130 + index);
    part(ruin, ROCK, "#8d8b80", [Math.sin(angle) * 1.15, 0.08, Math.cos(angle) * 1.15], [0.2, 0.13, 0.18]).castShadow = false;
  }
  // Dead tree: the one vertical that keeps the province readable from above.
  const tree = new THREE.Group();
  tree.position.set(0.85, 0, -0.2);
  tree.rotation.y = spread(variation, 14) * 3;
  group.add(tree);
  part(tree, CYL6, "#5f5346", [0, 0.62, 0], [0.09, 1.25, 0.09]);
  for (const [x, y, z, angle] of [[0.26, 1.1, 0.06, 0.9], [-0.24, 1.22, -0.08, -1.0], [0.1, 1.38, 0.22, 0.5]]) {
    part(tree, CYL6, "#6b5d4d", [x, y, z], [0.05, 0.5, 0.05]).rotation.set(0, 0, angle);
  }
  if (tier >= 2) {
    // Squatters have moved in: tents and a fire in the lee of the ruin.
    tent(group, -0.95, 0.75, 0.85, "#7f7a66");
    tent(group, -0.35, 1.0, 0.75, "#8a8470");
    for (let index = 0; index < 6; index += 1) {
      const angle = index * Math.PI / 3;
      part(group, ROCK, "#8c9390", [-0.65 + Math.sin(angle) * 0.26, 0.05, 1.35 + Math.cos(angle) * 0.26], [0.1, 0.09, 0.1]).castShadow = false;
    }
    part(group, CONE5, EMBER, [-0.65, 0.2, 1.35], [0.15, 0.34, 0.15]);
  }
  if (tier >= 3) {
    tent(group, -1.15, 0.05, 0.85, "#7f7a66");
    fence(group, -0.7, 1.75, 0.2, 1.7, "#7a6a55");
  }
  return { radius, bannerAt: [0.15, 0, 1.0], bannerHeight: 1.35, bannerWidth: 0.5, poleOnGround: true, leaning: true };
}

const CORES = {
  capital: capitalCore, town: townCore, fort: fortCore, mine: mineCore,
  farm: farmCore, shrine: shrineCore, chokepoint: chokepointCore, wilds: wildsCore,
};

// ---------------------------------------------------------------- building structures

/** Angle on the outer ring for each building, so a settlement's layout never shuffles. */
const BUILDING_SLOTS = {
  barracks: 0.0, range: 0.78, stable: 1.56, forge: 2.34,
  arcane_tower: 3.12, market: 3.9, farm: 4.68, watchtower: 5.46, keep: 2.75,
};
const BUILDING_ORDER = ["keep", "barracks", "range", "stable", "forge", "arcane_tower", "market", "farm", "watchtower", "walls"];

/** Builds the visible structure a completed building adds to its settlement. */
function buildingStructure(id, variation) {
  const group = new THREE.Group();
  group.name = id;
  if (id === "keep") {
    // Shown only where the core has no keep of its own; a stout stone hold with a gold-capped turret.
    part(group, BOX, STONE_DARK, [0, 0.09, 0], [1.0, 0.18, 1.0]);
    part(group, BOX, STONE, [0, 0.72, 0], [0.8, 1.1, 0.8]);
    part(group, BOX, STONE_PALE, [0, 1.34, 0], [0.96, 0.14, 0.96]);
    for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) part(group, BOX, STONE_PALE, [x, 1.5, z], [0.18, 0.22, 0.18]);
    part(group, TAPER6, STONE, [0.34, 0.95, 0.34], [0.24, 1.9, 0.24]);
    part(group, CONE6, GOLD, [0.34, 2.12, 0.34], [0.27, 0.5, 0.27]);
    part(group, BOX, "#4b3926", [0, 0.48, 0.41], [0.26, 0.6, 0.04]);
  } else if (id === "barracks") {
    hall(group, 0, 0, 0, 1.25, 0.6, 0.72, "#b9a480", "#7d6a52");
    for (let index = 0; index < 4; index += 1) {
      const x = -0.45 + index * 0.3;
      part(group, CYL5, TIMBER, [x, 0.33, 0.62], [0.025, 0.66, 0.025]);
      part(group, CONE5, STEEL, [x, 0.7, 0.62], [0.045, 0.14, 0.045]);
    }
    part(group, BOX, TIMBER, [0, 0.2, 0.62], [1.0, 0.05, 0.06]);
    const shield = part(group, CYL8, "#8e6b4a", [-0.75, 0.34, 0.3], [0.19, 0.06, 0.25]);
    shield.rotation.x = Math.PI / 2;
  } else if (id === "range") {
    for (const x of [-0.5, 0.5]) part(group, BOX, TIMBER, [x, 0.4, -0.35], [0.08, 0.8, 0.08]);
    part(group, ROOF, "#82927a", [0, 0.78, -0.3], [1.35, 0.32, 0.7]);
    part(group, BOX, "#b9a480", [0, 0.28, -0.42], [1.2, 0.56, 0.3]);
    for (const x of [-0.34, 0.34]) {
      for (const side of [-1, 1]) part(group, BOX, TIMBER, [x + side * 0.12, 0.22, 0.5], [0.05, 0.44, 0.05]).rotation.z = side * 0.22;
      for (const [radius, tint, z] of [[0.22, "#cbb77e", 0.5], [0.15, "#e5dbbc", 0.53], [0.07, "#a14e43", 0.56]]) {
        part(group, CYL8, tint, [x, 0.5, z], [radius, 0.05, radius]).rotation.x = Math.PI / 2;
      }
    }
  } else if (id === "stable") {
    hall(group, -0.2, -0.3, 0, 1.0, 0.55, 0.6, "#a9905f", ROOF_TILE);
    for (const x of [-0.55, -0.2, 0.15]) part(group, BOX, "#4b3926", [x, 0.22, 0.02], [0.2, 0.44, 0.04]);
    fence(group, 0.15, 0.55, 0, 1.3);
    fence(group, 0.78, 0.05, Math.PI / 2, 1.05);
    part(group, BOX, "#7a6a55", [0.5, 0.11, 0.3], [0.4, 0.18, 0.2]);
    part(group, CONE6, "#d5bb76", [0.62, 0.2, -0.4], [0.24, 0.4, 0.24]);
  } else if (id === "forge") {
    part(group, BOX, STONE_DARK, [-0.18, 0.36, 0], [0.9, 0.72, 0.78]);
    part(group, ROOF, "#5a5d5a", [-0.18, 0.72, 0], [1.05, 0.34, 0.9]);
    part(group, BOX, "#2f2a26", [-0.18, 0.28, 0.4], [0.42, 0.5, 0.05]);
    part(group, CONE5, EMBER, [-0.18, 0.22, 0.44], [0.15, 0.32, 0.1]);
    part(group, BOX, STONE, [0.46, 0.52, -0.1], [0.34, 1.04, 0.34]);
    part(group, CYL6, SOOT, [0.46, 1.2, -0.1], [0.14, 0.5, 0.14]);
    part(group, BOX, "#6e6053", [0.42, 0.14, 0.42], [0.28, 0.28, 0.2]);
    part(group, BOX, IRON, [0.42, 0.32, 0.42], [0.36, 0.1, 0.18]);
  } else if (id === "arcane_tower") {
    part(group, CYL8, "#6e6b84", [0, 0.1, 0], [0.42, 0.2, 0.42]);
    part(group, TAPER6, "#8b87a4", [0, 1.0, 0], [0.3, 1.8, 0.3]);
    part(group, CYL6, "#a7a3c0", [0, 1.2, 0], [0.38, 0.12, 0.38]);
    part(group, CONE6, "#4f5570", [0, 2.16, 0], [0.34, 0.6, 0.34]);
    const crystal = new THREE.Mesh(CONE6, new THREE.MeshBasicMaterial({ color: "#c0a8ff" }));
    crystal.position.set(0, 2.58, 0);
    crystal.scale.set(0.12, 0.34, 0.12);
    group.add(crystal);
    for (const angle of [0.4, 2.5, 4.6]) {
      const glyph = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: "#c0a8ff" }));
      glyph.position.set(Math.sin(angle) * 0.26, 1.55, Math.cos(angle) * 0.26);
      glyph.scale.set(0.09, 0.14, 0.09);
      group.add(glyph);
    }
  } else if (id === "market") {
    part(group, CYL12, "#a9a396", [0, 0.02, 0], [0.85, 0.04, 0.85]).castShadow = false;
    for (const [x, z, tint] of [[-0.42, 0.18, "#c1675f"], [0.42, 0.2, "#5f8fa8"], [0, -0.48, "#c9a659"]]) {
      const stall = new THREE.Group();
      stall.position.set(x, 0, z);
      stall.rotation.y = Math.atan2(-x, -z);
      group.add(stall);
      for (const sx of [-0.26, 0.26]) for (const sz of [-0.2, 0.2]) part(stall, BOX, TIMBER, [sx, 0.2, sz], [0.05, 0.4, 0.05]);
      part(stall, BOX, "#a08557", [0, 0.4, 0], [0.62, 0.05, 0.48]);
      part(stall, ROOF, tint, [0, 0.43, 0], [0.7, 0.24, 0.56]);
      part(stall, BOX, "#c8b48a", [0, 0.2, 0], [0.5, 0.16, 0.34]);
      part(stall, ROCK, "#b66b4d", [0.12, 0.48, 0.06], [0.1, 0.07, 0.1]);
    }
    part(group, CYL6, TIMBER, [0.68, 0.34, -0.1], [0.045, 0.68, 0.045]);
    sheet(group, PENNANT, cloth("#c9a659"), [0.7, 0.6, -0.1], [0.3, 0.18, 1]);
  } else if (id === "farm") {
    field(group, -0.1, 0.05, 0, 1.1, 0.95, "#a8c463");
    part(group, BOX, "#8d6f4e", [0.78, 0.26, -0.15], [0.5, 0.5, 0.42]);
    part(group, ROOF, ROOF_THATCH, [0.78, 0.5, -0.15], [0.62, 0.26, 0.54]);
    part(group, CONE6, "#d5bb76", [0.68, 0.18, 0.62], [0.24, 0.36, 0.24]);
    fence(group, -0.1, 0.62, 0, 1.2);
  } else if (id === "watchtower") {
    for (const x of [-0.24, 0.24]) for (const z of [-0.24, 0.24]) {
      const leg = part(group, BOX, TIMBER, [x, 0.82, z], [0.09, 1.64, 0.09]);
      leg.rotation.set(-Math.sign(z) * 0.06, 0, Math.sign(x) * 0.06);
    }
    for (const y of [0.55, 1.05]) {
      part(group, BOX, TIMBER_PALE, [0, y, 0], [0.56, 0.05, 0.05]);
      part(group, BOX, TIMBER_PALE, [0, y, 0], [0.05, 0.05, 0.56]);
    }
    part(group, BOX, TIMBER_PALE, [0, 1.66, 0], [0.76, 0.08, 0.76]);
    for (const side of [-1, 1]) {
      part(group, BOX, TIMBER_PALE, [side * 0.34, 1.84, 0], [0.06, 0.3, 0.72]);
      part(group, BOX, TIMBER_PALE, [0, 1.84, side * 0.34], [0.72, 0.3, 0.06]);
    }
    part(group, ROOF, ROOF_WOOD, [0, 2.0, 0], [0.9, 0.36, 0.9]);
    const lamp = new THREE.Mesh(BLOB, new THREE.MeshBasicMaterial({ color: "#ffd98a" }));
    lamp.position.set(0, 1.96, 0.3);
    lamp.scale.setScalar(0.07);
    group.add(lamp);
  }
  group.rotation.y = jitter(variation, 140) * 0.12;
  return group;
}

/** The `walls` upgrade: a full stone curtain with a gatehouse, drawn outside the core. */
function wallsStructure(radius, variation, square) {
  const group = new THREE.Group();
  group.name = "walls";
  if (square) {
    squareCurtain(group, radius * 0.88, 0.72, 0, ROOF_SLATE, STONE_DARK);
    group.rotation.y = jitter(variation, 15) * 0.3;
    return group;
  }
  const gate = Math.PI * 0.5 + jitter(variation, 15) * 0.25;
  wallRing(group, radius, 0.72, gate, true);
  gatehouse(group, radius, 0.72, gate);
  for (let index = 0; index < 4; index += 1) {
    const angle = gate + (index + 0.5) * Math.PI / 2;
    tower(group, Math.sin(angle) * radius, Math.cos(angle) * radius, 1.05, 0.27, ROOF_SLATE);
  }
  return group;
}

/**
 * Builds a settlement for a campaign province.
 *
 * @param {"capital"|"town"|"fort"|"mine"|"farm"|"shrine"|"chokepoint"|"wilds"} kind
 * @param {number} tier              1..3; the core is rebuilt per tier, so call again when it rises.
 * @param {string[]} buildings       completed BuildingIds; toggles `structures[].node.visible`.
 * @param {string|null} factionColor owner colour, or null for neutral (grey banner).
 * @param {number} variation         0..1 seed for stable per-province jitter.
 * @returns {{ group: THREE.Group, banner: THREE.Group, structures: Array<{ id: string, node: THREE.Group }> }}
 *   `banner` carries its own material — recolour it with `setBannerColor` on capture, no rebuild.
 *   `structures` holds every building this kind can show; flip `.node.visible` as projects complete.
 */
export function createSettlement(kind, tier = 1, buildings = [], factionColor = null, variation = 0) {
  const group = new THREE.Group();
  group.name = `settlement-${kind}`;
  const level = Math.max(1, Math.min(3, Math.round(tier) || 1));
  const owned = new Set(buildings ?? []);
  const core = (CORES[kind] ?? wildsCore)(group, level, variation);

  const structures = [];
  const ringRadius = core.radius + 0.6;
  for (const id of BUILDING_ORDER) {
    // A capital and a fort already are a keep; a farm province already is a farm.
    if (id === "keep" && (kind === "capital" || kind === "fort")) continue;
    if (id === "farm" && kind === "farm") continue;
    const node = id === "walls" ? wallsStructure(core.radius + 1.04, variation, kind === "fort" || kind === "chokepoint") : buildingStructure(id, variation + BUILDING_SLOTS[id]);
    if (id !== "walls") {
      const angle = BUILDING_SLOTS[id] + jitter(variation, 150) * 0.1;
      node.position.set(Math.sin(angle) * ringRadius, 0, Math.cos(angle) * ringRadius);
      node.rotation.y += angle + Math.PI;
      node.scale.setScalar(0.72);
    }
    node.visible = owned.has(id);
    group.add(node);
    structures.push({ id, node });
  }

  const banner = createFactionBanner(factionColor, core.bannerHeight, core.bannerWidth);
  banner.position.set(...core.bannerAt);
  if (core.poleOnGround) {
    // Ground-planted banners get a little cairn so they do not float on sloping props.
    part(banner, CYL8, STONE, [0, 0.06, 0], [0.16, 0.12, 0.16]);
  }
  if (core.leaning) banner.rotation.z = 0.12;
  banner.rotation.y = jitter(variation, 17) * 0.8;
  group.add(banner);
  group.userData.banner = banner;
  return { group, banner, structures };
}

// ---------------------------------------------------------------- army marker

/**
 * The counter an army puts on the campaign map: a bristle of spears with faction pennants,
 * a suggestion of the rank and file underneath, and the lord's own standard above it all.
 *
 * @param {string|null} factionColor
 * @param {number} strength 0..1; drives spear count, cluster width and overall scale.
 * @param {string|null} lordColor colour of the lord's standard (falls back to the faction colour).
 * @returns {THREE.Group} with `userData.banner` and `userData.standard` for later tweaks.
 */
export function createArmyMarker(factionColor, strength = 0.5, lordColor = null) {
  const group = new THREE.Group();
  group.name = "army-marker";
  const power = Math.max(0, Math.min(1, strength));
  const tint = factionColor ?? NEUTRAL;
  const lord = lordColor ?? tint;
  const spears = 5 + Math.round(power * 11);
  const cluster = 0.26 + power * 0.32;

  // The mass: helmets and shoulders packed tight, read as a crowd rather than as models.
  for (let index = 0; index < spears; index += 1) {
    const angle = index * 2.399963;
    const distance = cluster * Math.sqrt((index + 0.6) / spears);
    const x = Math.sin(angle) * distance, z = Math.cos(angle) * distance;
    part(group, BLOB, index % 4 === 0 ? tint : "#8d999c", [x, 0.12, z], [0.1, 0.09, 0.1]).castShadow = index < 6;
    part(group, BOX, index % 3 === 0 ? tint : "#5d666a", [x, 0.05, z], [0.15, 0.1, 0.12]).castShadow = false;
    // Spears rake backwards a touch, the way a marching column reads from above.
    const height = 0.62 + ((index * 7) % 5) * 0.045;
    const shaft = part(group, CYL5, "#8b6543", [x, 0.16 + height / 2, z], [0.018, height, 0.018]);
    shaft.rotation.set(0.12 + ((index * 11) % 4) * 0.03, angle, ((index * 13) % 5 - 2) * 0.035);
    part(group, CONE5, STEEL, [x - Math.sin(angle) * 0.02, 0.2 + height, z], [0.032, 0.14, 0.032]);
  }
  // Two faction pennants on the outer spears so the colour reads before the shapes do.
  const pennants = [];
  for (const side of [-1, 1]) {
    const x = side * cluster * 0.95, z = -side * cluster * 0.35;
    part(group, CYL5, "#6f5237", [x, 0.48, z], [0.022, 0.96, 0.022]);
    const pennant = sheet(group, PENNANT, cloth(tint), [x + 0.01, 0.82, z], [0.34, 0.24, 1]);
    pennant.rotation.y = side * 0.5;
    pennant.name = "faction-pennant";
    pennants.push(pennant);
  }
  // The lord's standard: taller, squarer, in his own colour, with a gilded crest.
  const standard = new THREE.Group();
  standard.position.set(0, 0, -cluster * 0.55);
  group.add(standard);
  const poleHeight = 1.25 + power * 0.35;
  part(standard, CYL5, "#5c4530", [0, poleHeight / 2, 0], [0.032, poleHeight, 0.032]);
  part(standard, CONE5, GOLD, [0, poleHeight + 0.09, 0], [0.06, 0.2, 0.06]);
  part(standard, CYL8, GOLD, [0, poleHeight - 0.08, 0], [0.09, 0.04, 0.09]);
  part(standard, BOX, "#5c4530", [0.19, poleHeight - 0.16, 0], [0.4, 0.04, 0.04]);
  const flag = sheet(standard, FLAG, cloth(lord), [0.01, poleHeight - 0.16 - 0.24, 0], [0.56, 0.44, 1]);
  flag.name = "lord-standard";
  standard.rotation.y = 0.25;

  group.scale.setScalar(0.88 + power * 0.32);
  group.userData.pennants = pennants;
  group.userData.standard = standard;
  group.userData.strength = power;
  return group;
}

// ---------------------------------------------------------------- biome scatter

/**
 * A cheap scatter prop for a province's terrain. Four silhouettes per biome, chosen by `variation`,
 * so hundreds of them never read as one repeated object.
 *
 * @param {"grassland"|"forest"|"mountain"|"marsh"|"badlands"} biome
 * @param {number} variation 0..1
 * @returns {THREE.Group}
 */
export function createBiomeProp(biome, variation = 0) {
  const group = new THREE.Group();
  group.name = `prop-${biome}`;
  const shape = pick(variation, 1, 4);
  const size = 0.8 + spread(variation, 2) * 0.45;
  if (biome === "forest") {
    if (shape === 0) {
      // Bare snag.
      part(group, CYL6, "#5f5346", [0, 0.4, 0], [0.065, 0.8, 0.065]);
      for (const [x, y, angle] of [[0.16, 0.66, 0.85], [-0.14, 0.76, -0.9]]) part(group, CYL6, "#6b5d4d", [x, y, 0], [0.04, 0.34, 0.04]).rotation.z = angle;
    } else if (shape === 1) {
      // Stump with a bracket of mushrooms.
      part(group, CYL8, "#6b5340", [0, 0.11, 0], [0.19, 0.22, 0.19]);
      part(group, CYL8, "#8a6f52", [0, 0.23, 0], [0.19, 0.03, 0.19]).castShadow = false;
      for (const angle of [0.6, 2.4]) part(group, CONE6, "#c0705e", [Math.sin(angle) * 0.2, 0.08, Math.cos(angle) * 0.2], [0.06, 0.1, 0.06]).castShadow = false;
    } else if (shape === 2) {
      // Fallen log with moss.
      part(group, CYL6, "#6b5d4d", [0, 0.1, 0], [0.1, 0.85, 0.1]).rotation.set(0, spread(variation, 3) * 3, Math.PI / 2);
      part(group, ROCK, MOSS, [0.12, 0.17, 0.03], [0.1, 0.05, 0.09]).castShadow = false;
    } else {
      // Fern clump.
      for (let index = 0; index < 5; index += 1) {
        const angle = index * 1.25;
        part(group, CONE5, index % 2 ? "#4f7d4c" : "#5f9257", [Math.sin(angle) * 0.1, 0.13, Math.cos(angle) * 0.1], [0.11, 0.3, 0.11]).castShadow = false;
      }
    }
  } else if (biome === "mountain") {
    if (shape === 0) {
      part(group, CONE5, "#8e948c", [0, 0.34, 0], [0.3, 0.7, 0.3]).rotation.y = spread(variation, 3) * 3;
      part(group, CONE5, "#c9d2d4", [0, 0.62, 0], [0.13, 0.22, 0.13]);
    } else if (shape === 1) {
      part(group, ROCK, "#8a8f88", [0, 0.2, 0], [0.32, 0.3, 0.28]).rotation.set(0.3, spread(variation, 3) * 3, 0.2);
      part(group, ROCK, "#9aa096", [0.24, 0.1, 0.2], [0.16, 0.14, 0.15]).castShadow = false;
    } else if (shape === 2) {
      // Tilted slab crag.
      const slab = part(group, BOX, "#7f867e", [0, 0.3, 0], [0.24, 0.66, 0.18]);
      slab.rotation.set(0.15, spread(variation, 3) * 3, 0.28);
      part(group, BOX, "#949a91", [0.14, 0.12, 0.08], [0.2, 0.26, 0.16]).rotation.y = 0.6;
    } else {
      // Scree fan.
      for (let index = 0; index < 5; index += 1) {
        const angle = index * 1.3;
        part(group, ROCK, index % 2 ? "#8a8f88" : "#a0a69c", [Math.sin(angle) * 0.2, 0.06, Math.cos(angle) * 0.2], [0.12, 0.09, 0.11]).castShadow = false;
      }
    }
  } else if (biome === "marsh") {
    if (shape === 0) {
      // Reed bed.
      for (let index = 0; index < 7; index += 1) {
        const angle = index * 1.9;
        const height = 0.34 + ((index * 5) % 4) * 0.08;
        const reed = part(group, CYL5, "#7f9457", [Math.sin(angle) * 0.14, height / 2, Math.cos(angle) * 0.14], [0.016, height, 0.016]);
        reed.rotation.z = ((index % 3) - 1) * 0.14;
        reed.castShadow = false;
        if (index % 2 === 0) part(group, CYL5, "#8a6b48", [Math.sin(angle) * 0.14, height, Math.cos(angle) * 0.14], [0.03, 0.12, 0.03]).castShadow = false;
      }
    } else if (shape === 1) {
      // Puddle with lily pads.
      part(group, CYL12, "#5d8e85", [0, 0.012, 0], [0.34, 0.02, 0.3]).castShadow = false;
      for (const angle of [0.4, 2.7, 4.9]) part(group, CYL8, "#6e9d5f", [Math.sin(angle) * 0.16, 0.026, Math.cos(angle) * 0.16], [0.08, 0.01, 0.08]).castShadow = false;
    } else if (shape === 2) {
      // Rotted stump in the water.
      part(group, CYL6, "#54493d", [0, 0.15, 0], [0.13, 0.3, 0.13]).rotation.z = 0.12;
      part(group, ROCK, "#6c7a4f", [0.05, 0.3, 0], [0.12, 0.05, 0.11]).castShadow = false;
      part(group, CYL12, "#5d8e85", [0, 0.012, 0], [0.26, 0.02, 0.24]).castShadow = false;
    } else {
      // Cattails on a tussock.
      part(group, ROCK, "#6f7c4d", [0, 0.06, 0], [0.2, 0.1, 0.18]).castShadow = false;
      for (const [x, z, height] of [[0.03, 0.02, 0.46], [-0.07, 0.06, 0.36], [0.06, -0.07, 0.4]]) {
        part(group, CYL5, "#82945c", [x, height / 2 + 0.05, z], [0.015, height, 0.015]).castShadow = false;
        part(group, CYL5, "#6b4f34", [x, height + 0.05, z], [0.032, 0.14, 0.032]).castShadow = false;
      }
    }
  } else if (biome === "badlands") {
    if (shape === 0) {
      // Cracked mesa chunk.
      part(group, BOX, "#a5764f", [0, 0.16, 0], [0.42, 0.32, 0.34]).rotation.y = spread(variation, 3) * 3;
      part(group, BOX, "#bb8a5d", [0.04, 0.35, -0.02], [0.3, 0.12, 0.24]).rotation.y = spread(variation, 4) * 3;
    } else if (shape === 1) {
      // Sun-bleached bones.
      part(group, BLOB, "#ded3bb", [0, 0.07, 0], [0.12, 0.1, 0.13]);
      for (const [x, z, angle] of [[0.16, 0.06, 0.4], [-0.14, -0.1, -0.7], [0.04, -0.18, 1.2]]) {
        part(group, CYL5, "#cfc4ab", [x, 0.03, z], [0.022, 0.26, 0.022]).rotation.set(Math.PI / 2, 0, angle);
      }
      part(group, CONE5, "#ded3bb", [0.08, 0.14, 0.08], [0.05, 0.14, 0.05]).rotation.z = 0.9;
    } else if (shape === 2) {
      // Thorn tree.
      part(group, CYL6, "#5a4433", [0, 0.28, 0], [0.05, 0.56, 0.05]);
      for (const angle of [0.9, -1.0, 0.4]) part(group, CYL6, "#6b5241", [Math.sin(angle) * 0.12, 0.5, 0], [0.032, 0.3, 0.032]).rotation.z = angle;
      part(group, ROCK, "#6d6244", [0, 0.66, 0], [0.16, 0.06, 0.15]).castShadow = false;
    } else {
      // Hoodoo: a capped spire.
      part(group, CYL6, "#a5764f", [0, 0.3, 0], [0.12, 0.6, 0.12]);
      part(group, CYL6, "#8a6142", [0, 0.16, 0], [0.16, 0.14, 0.16]);
      part(group, ROCK, "#c19168", [0, 0.64, 0], [0.19, 0.11, 0.18]);
    }
  } else {
    // grassland (and the fallback)
    if (shape === 0) {
      for (let index = 0; index < 6; index += 1) {
        const angle = index * 2.1;
        part(group, CONE5, index % 2 ? "#8bb265" : "#9dc472", [Math.sin(angle) * 0.11, 0.11, Math.cos(angle) * 0.11], [0.065, 0.26, 0.065]).castShadow = false;
      }
    } else if (shape === 1) {
      part(group, ROCK, "#9aa096", [0, 0.11, 0], [0.22, 0.2, 0.2]).rotation.set(0.3, spread(variation, 3) * 3, 0.2);
      part(group, ROCK, MOSS, [0.05, 0.19, 0.04], [0.11, 0.04, 0.1]).castShadow = false;
    } else if (shape === 2) {
      // Wildflowers.
      part(group, ROCK, "#7ba35c", [0, 0.05, 0], [0.18, 0.07, 0.17]).castShadow = false;
      for (const [x, z, tint] of [[0.07, 0.04, "#e6d16a"], [-0.06, 0.08, "#d98aa6"], [0.02, -0.09, "#e8e2d2"]]) {
        part(group, CYL5, "#6f9150", [x, 0.13, z], [0.013, 0.18, 0.013]).castShadow = false;
        part(group, BLOB, tint, [x, 0.23, z], [0.035, 0.035, 0.035]).castShadow = false;
      }
    } else {
      // Gorse bush.
      part(group, BLOB, "#6e9250", [0, 0.16, 0], [0.24, 0.19, 0.22]);
      part(group, BLOB, "#83b76b", [0.11, 0.24, -0.05], [0.13, 0.11, 0.12]).castShadow = false;
    }
  }
  group.rotation.y = spread(variation, 5) * Math.PI * 2;
  group.scale.setScalar(size);
  return group;
}
