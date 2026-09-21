import * as THREE from "three";
import { part } from "./world-models.js";

const stone = new THREE.IcosahedronGeometry(1, 0);
const box = new THREE.BoxGeometry(1, 1, 1);
const spike = new THREE.ConeGeometry(1, 1, 5);
const ring = new THREE.TorusGeometry(1, 0.025, 4, 32);
const glowMaterials = new Map();
let haloTexture;

function halo(parent, color, position, size) {
  if (haloTexture === undefined) {
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Hero glow requires a 2D canvas context");
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "#ffffffa0"); gradient.addColorStop(0.3, "#ffffff45"); gradient.addColorStop(1, "#ffffff00");
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
    haloTexture = new THREE.CanvasTexture(canvas);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sprite.position.set(...position); sprite.scale.set(size, size, 1); parent.add(sprite);
}

function glow(parent, geometry, color, position, scale) {
  if (!glowMaterials.has(color)) glowMaterials.set(color, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const mesh = new THREE.Mesh(geometry, glowMaterials.get(color));
  mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh);
  return mesh;
}

/** Gives each mythical hero a silhouette, articulated signature weapon and permanent identity. */
export function dressHero(model, hero) {
  const { body, arms, weapon, group } = model;
  model.heroId = hero.id;
  model.heroColor = hero.color;
  model.headHeight = hero.id === "thorn" ? 3.7 : 3.1;
  group.scale.setScalar(hero.id === "thorn" ? 2.4 : 2);
  weapon.clear();
  weapon.position.set(0, 0, 0);
  // Weapons belong to the striking shoulder so the attack moves the actual weapon.
  arms[1].add(weapon);
  const bright = { veyra: "#a5eaff", thorn: "#b8f27c", kael: "#ff665b", elowen: "#baffdf", nyx: "#c3adff", orun: "#ffd37c" }[hero.id];
  const dark = { veyra: "#282440", thorn: "#55472d", kael: "#382531", elowen: "#e5efe0", nyx: "#24243b", orun: "#45434b" }[hero.id];
  model.torso.material = new THREE.MeshStandardMaterial({ color: dark, flatShading: true });
  model.headwear.visible = false;
  model.badge.visible = false;
  part(body, spike, dark, [0, 0.33, -0.08], [0.34, 0.66, 0.3]);
  for (const x of [-0.25, 0.25]) part(body, stone, dark, [x, 0.66, 0], [0.22, 0.2, 0.25]);
  glow(body, stone, bright, [0, 0.52, 0.16], [0.075, 0.13, 0.045]);
  for (const x of [-0.07, 0.07]) glow(body, box, bright, [x, 0.79, 0.18], [0.07, 0.035, 0.025]);

  if (hero.id === "thorn") {
    part(body, stone, "#685c43", [0, 0.55, 0], [0.4, 0.48, 0.3]);
    part(body, stone, "#6c754a", [0, 0.85, 0], [0.24, 0.28, 0.21]);
    for (const side of [-1, 1]) {
      const branch = part(body, spike, "#63503a", [side * 0.24, 1.12, 0], [0.1, 0.65, 0.1]);
      branch.rotation.z = -side * 0.55;
      part(body, stone, "#719b4f", [side * 0.36, 1.18, 0], [0.26, 0.2, 0.22]);
      part(arms[side === -1 ? 0 : 1], stone, "#65523a", [0, -0.18, 0], [0.21, 0.36, 0.23]);
      glow(body, box, bright, [side * 0.09, 0.87, 0.22], [0.08, 0.04, 0.025]);
    }
    glow(body, stone, bright, [0, 0.58, 0.29], [0.08, 0.17, 0.04]);
  } else if (hero.id === "orun") {
    part(body, spike, "#b7a791", [0, 0.65, 0.2], [0.2, 0.43, 0.12]).rotation.z = Math.PI;
    part(weapon, box, "#6e4631", [0, -0.25, 0], [0.07, 0.85, 0.07]);
    part(weapon, box, "#42404b", [0, -0.64, 0], [0.53, 0.3, 0.3]);
    glow(weapon, box, bright, [0, -0.64, 0.16], [0.37, 0.075, 0.02]);
    part(body, box, "#444451", [0, 0.23, -0.48], [0.5, 0.36, 0.42]);
    glow(body, spike, bright, [0, 0.49, -0.48], [0.2, 0.4, 0.18]);
    for (const x of [-0.24, 0.24]) part(body, box, "#80766c", [x, 0.07, -0.48], [0.06, 0.1, 0.65]);
  } else if (hero.id === "kael") {
    part(body, spike, "#852f39", [0, 0.55, -0.18], [0.38, 0.8, 0.13]);
    for (const side of [-1, 1]) part(body, spike, "#e8d4ac", [side * 0.17, 1.02, 0], [0.07, 0.35, 0.08]).rotation.z = -side * 0.5;
    part(weapon, box, "#342c34", [0, -0.2, 0], [0.08, 0.3, 0.08]);
    part(weapon, box, "#d3bec4", [0, -0.64, 0], [0.16, 0.7, 0.05]);
    glow(weapon, box, bright, [0.075, -0.64, 0], [0.025, 0.7, 0.065]);
    part(weapon, box, "#b49371", [0, -0.29, 0], [0.36, 0.05, 0.1]);
  } else {
    if (hero.id === "veyra") {
      for (const x of [-0.2, 0, 0.2]) glow(body, spike, bright, [x, 1.12, -0.06], [0.055, x === 0 ? 0.4 : 0.25, 0.045]);
    } else part(body, spike, dark, [0, 0.91, -0.025], [0.27, 0.5, 0.25]);
    if (hero.id === "nyx") {
      part(body, stone, dark, [0, 0.76, 0.08], [0.19, 0.22, 0.19]);
      glow(body, box, bright, [0, 0.8, 0.25], [0.17, 0.025, 0.02]);
      for (const x of [-0.26, 0.26]) glow(body, spike, bright, [x, 0.47, -0.2], [0.035, 0.65, 0.025]);
      glow(weapon, spike, bright, [0, -0.45, 0], [0.085, 0.5, 0.035]).rotation.z = Math.PI;
    } else if (hero.id === "elowen") {
      part(weapon, box, "#ac9a6a", [0, -0.15, 0], [0.045, 1.3, 0.045]);
      glow(weapon, ring, bright, [0, 0.55, 0], [0.22, 0.28, 0.22]);
      glow(body, ring, bright, [0, 1.23, 0], [0.32, 0.32, 0.32]).rotation.x = Math.PI / 2;
    } else {
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) glow(arms[side === -1 ? 0 : 1], stone, bright, [side * (0.08 + i * 0.05), -0.15 + i * 0.1, 0.08], [0.065, 0.1, 0.065]);
    }
  }
  halo(body, bright, [0, 0.58, 0.18], 0.7);
  if (hero.id === "veyra" || hero.id === "elowen") for (const arm of arms) halo(arm, bright, [0, -0.24, 0], 0.65);
  if (hero.id === "orun") halo(weapon, bright, [0, -0.64, 0.16], 0.8);
  const orbit = new THREE.Group(); group.add(orbit);
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7;
    glow(orbit, stone, bright, [Math.cos(angle) * 0.62, 0.3 + i * 0.13, Math.sin(angle) * 0.62], [0.025, 0.065, 0.025]);
  }
  model.orbit = orbit;
}

/** Keeps hero identity visible while stopping decorative motion when paused or reduced. */
export function animateHero(model, now, still) {
  if (model.heroId === undefined || still) return;
  model.orbit.rotation.y = now * 0.00035;
  if (["veyra", "elowen", "nyx"].includes(model.heroId)) model.body.position.y += 0.1 + Math.sin(now * 0.0015 + model.phase) * 0.035;
}
