import * as THREE from "three";
import { part, setBowDraw } from "./world-models.js";

// Shared geometry: every fighter on the field draws from this handful of primitives, so a hundred
// models cost a hundred meshes and not a hundred buffers.
const box = new THREE.BoxGeometry(1, 1, 1);
const rock = new THREE.IcosahedronGeometry(1, 0);
const cone = new THREE.ConeGeometry(1, 1, 5);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
const cylinder8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const wheelGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
// setBowDraw places the string limbs against this radius, so the stave has to be cut to the same one.
const BOW_LIMB = 0.32;
const bowStave = new THREE.TorusGeometry(BOW_LIMB, 0.03, 4, 10, Math.PI);

const SKINS = ["#f1c7a2", "#dba77d", "#b97c55", "#8c593e", "#694735"];
const HAIRS = ["#382d2c", "#73503b", "#b27a43", "#cfb67d", "#c2bbb0"];
const STEEL = "#b3bec2", DARK_STEEL = "#8d999c", IRON = "#6f797d", MAIL = "#9aa3a8";
const WOOD = "#8b6543", DARK_WOOD = "#6e4a31", LEATHER = "#7a5a3e", DARK_LEATHER = "#51443b";
const CLOTH = "#a49475", BRONZE = "#c2955a", BONE = "#e8e2d2", HIDE = "#8e7a5c";
const COATS = ["#7c5c41", "#9a7550", "#5a4436", "#b49a78", "#6b6360"];

const glowMaterials = new Map();
/** Adds an unlit accent — orbs and runes have to stay bright in the shadow of a melee. */
function glow(parent, geometry, color, position, scale) {
  if (!glowMaterials.has(color)) glowMaterials.set(color, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const mesh = new THREE.Mesh(geometry, glowMaterials.get(color));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

/** Turns the caller's 0..1 variation into a stable integer seed, so a model never shuffles between frames. */
function seedOf(variation) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(variation) ? variation : 0));
  let seed = Math.imul(Math.round(clamped * 4093) + 0x9e3779b1, 2654435761) >>> 0;
  seed ^= seed >>> 15;
  return seed >>> 0;
}
const pick = (seed, shift, list) => list[(seed >>> shift) % list.length];
const bit = (seed, shift) => ((seed >>> shift) & 1) === 1;

/** Builds the colonist rig at colonist proportions: same joints, same heights, optionally bulked out.
 *  Everything a fighter is differentiated by — plate, helmets, shields, weapons — hangs off this. */
function buildRig(spec) {
  const { seed, teamColor, tunic, bulk = 1, mounted = false, robe = false } = spec;
  const skin = spec.skin ?? pick(seed, 0, SKINS);
  const hair = spec.hair ?? pick(seed, 4, HAIRS);
  const sleeve = spec.sleeve ?? skin;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const torso = part(body, box, tunic, [0, 0.45, 0], [0.3 * bulk, 0.36, 0.23 * bulk]);
  const head = part(body, rock, skin, [0, 0.76, 0], [0.2, 0.23, 0.19]);
  const headwear = part(body, rock, hair, [0, 0.89, -0.025], [0.205, 0.105, 0.2]);
  const badge = part(body, box, teamColor, [0, 0.56, 0.13], [0.25 * bulk, 0.075, 0.025]);
  const arms = [-0.21, 0.21].map((x) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(x * bulk, 0.59, 0);
    part(shoulder, box, sleeve, [0, -0.13, 0], [0.09 * bulk, 0.3, 0.1 * bulk]);
    body.add(shoulder);
    return shoulder;
  });
  // A rider's legs are welded to the torso and the hip joints come back empty. The walk cycle swings
  // hips through two thirds of a radian, which on a seated man kicks his boot out over the horse's ear;
  // giving the animation layer inert joints keeps the legs in the stirrups where they belong.
  if (mounted) {
    for (const [x, side] of [[-0.17, -1], [0.17, 1]]) {
      part(body, box, spec.trouser ?? DARK_LEATHER, [x + side * 0.04, 0.2, 0.11], [0.13, 0.14, 0.3]);
      part(body, box, spec.trouser ?? DARK_LEATHER, [x + side * 0.07, 0.02, 0.2], [0.12, 0.34, 0.13]);
      part(body, box, DARK_LEATHER, [x + side * 0.07, -0.14, 0.24], [0.13, 0.09, 0.22]);
    }
  }
  const legs = [-0.09, 0.09].map((x) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0.3, 0);
    if (!mounted) {
      part(hip, box, spec.trouser ?? "#41535a", [0, -0.15, 0], [0.1 * bulk, 0.3, 0.13]);
      if (!robe) part(hip, box, DARK_LEATHER, [0, -0.26, 0.025], [0.12, 0.09, 0.18]);
    }
    body.add(hip);
    return hip;
  });
  part(body, box, DARK_LEATHER, [0, 0.32, 0], [0.32 * bulk, 0.055, 0.25 * bulk]);
  return { group, body, torso, head, headwear, badge, arms, legs, skin, hair, bulk };
}

/** Hangs a weapon on the striking shoulder. Parts are authored in body space: the offset cancels the
 *  shoulder so a shaft drawn at x = -0.25 really sits in the right hand. */
function holdWeapon(rig, weapon) {
  rig.arms[0].add(weapon);
  weapon.position.set(0.21 * rig.bulk, -0.59, 0);
}

/* ---------------------------------------------------------------- helmets */

/** Every helmet replaces the hair: left visible it wedges out of the back of the skull. */
function ironCap(rig, crest) {
  rig.headwear.visible = false;
  part(rig.body, rock, DARK_STEEL, [0, 0.89, 0], [0.215, 0.14, 0.205]);
  if (crest) part(rig.body, box, crest, [0, 0.97, -0.02], [0.05, 0.06, 0.2]);
}
function nasalHelm(rig, crest) {
  rig.headwear.visible = false;
  part(rig.body, rock, STEEL, [0, 0.9, 0], [0.225, 0.18, 0.215]);
  part(rig.body, box, DARK_STEEL, [0, 0.79, 0.14], [0.035, 0.16, 0.05]);
  part(rig.body, box, IRON, [0, 0.81, 0], [0.24, 0.045, 0.23]);
  if (crest) part(rig.body, cone, crest, [0, 1.03, -0.02], [0.06, 0.17, 0.06]);
}
function kettleHat(rig, crest) {
  rig.headwear.visible = false;
  part(rig.body, rock, DARK_STEEL, [0, 0.9, 0], [0.2, 0.13, 0.19]);
  const brim = part(rig.body, cylinder8, STEEL, [0, 0.86, 0], [0.3, 0.03, 0.3]);
  brim.rotation.y = 0.4;
  if (crest) part(rig.body, box, crest, [0, 0.96, -0.01], [0.045, 0.07, 0.18]);
}
/** A closed helm is the whole head: the skin sphere is wider than the visor and would show through. */
function greatHelm(rig, crest) {
  rig.headwear.visible = false;
  rig.head.visible = false;
  part(rig.body, box, STEEL, [0, 0.81, 0], [0.235, 0.3, 0.225]);
  part(rig.body, box, DARK_STEEL, [0, 0.95, 0], [0.245, 0.05, 0.235]);
  part(rig.body, box, "#2b3236", [0, 0.86, 0.113], [0.17, 0.035, 0.02]);
  for (const x of [-0.05, 0.05]) part(rig.body, box, "#2b3236", [x, 0.76, 0.113], [0.025, 0.06, 0.02]);
  if (crest) part(rig.body, box, crest, [0, 1.03, -0.02], [0.05, 0.09, 0.22]);
}
/** A cowl replaces the skull outright: a five-sided cone is narrower between its vertices than the
 *  head's icosahedron, so any head left inside pokes brown chevrons through the cloth. */
function hood(rig, color) {
  rig.headwear.visible = false;
  rig.head.visible = false;
  part(rig.body, cone, color, [0, 0.85, -0.01], [0.23, 0.36, 0.24]);
  part(rig.body, box, color, [0, 0.69, 0], [0.24, 0.13, 0.23]);
  part(rig.body, box, "#2a2529", [0, 0.75, 0.105], [0.15, 0.13, 0.04]);
  part(rig.body, box, rig.skin, [0, 0.71, 0.12], [0.1, 0.05, 0.03]);
}

/* ---------------------------------------------------------------- shields */

function roundShield(arm, teamColor) {
  const shield = part(arm, cylinder8, WOOD, [0.05, -0.17, 0.12], [0.21, 0.05, 0.21]);
  shield.rotation.x = Math.PI / 2;
  const face = part(arm, cylinder8, teamColor, [0.05, -0.17, 0.15], [0.16, 0.02, 0.16]);
  face.rotation.x = Math.PI / 2;
  part(arm, rock, BRONZE, [0.05, -0.17, 0.17], [0.06, 0.06, 0.03]);
}
function kiteShield(arm, teamColor) {
  part(arm, box, teamColor, [0.05, -0.15, 0.12], [0.24, 0.34, 0.05]);
  part(arm, cone, teamColor, [0.05, -0.39, 0.12], [0.17, 0.18, 0.04]).rotation.z = Math.PI;
  part(arm, box, IRON, [0.05, -0.15, 0.145], [0.035, 0.34, 0.02]);
  part(arm, rock, BRONZE, [0.05, -0.17, 0.155], [0.05, 0.05, 0.03]);
}
function towerShield(arm, teamColor) {
  part(arm, box, teamColor, [0.07, -0.12, 0.15], [0.34, 0.62, 0.06]);
  for (const y of [0.17, -0.41]) part(arm, box, IRON, [0.07, y, 0.16], [0.35, 0.05, 0.05]);
  part(arm, box, IRON, [0.07, -0.12, 0.185], [0.05, 0.6, 0.02]);
  part(arm, rock, STEEL, [0.07, -0.12, 0.2], [0.08, 0.08, 0.04]);
}

/* ---------------------------------------------------------------- weapons */

function spearWeapon(weapon, length, teamColor) {
  part(weapon, box, WOOD, [-0.25, length * 0.44, -0.1], [0.04, length * 0.88, 0.04]);
  part(weapon, cone, STEEL, [-0.25, length * 0.92, -0.1], [0.075, length * 0.18, 0.075]);
  part(weapon, box, IRON, [-0.25, length * 0.82, -0.1], [0.05, 0.04, 0.05]);
  if (teamColor) part(weapon, box, teamColor, [-0.25, length * 0.74, -0.19], [0.015, 0.11, 0.16]);
}
function swordWeapon(weapon, blade) {
  part(weapon, box, DARK_LEATHER, [-0.25, 0.3, -0.04], [0.038, 0.18, 0.038]);
  part(weapon, rock, BRONZE, [-0.25, 0.2, -0.04], [0.055, 0.05, 0.055]);
  part(weapon, box, BRONZE, [-0.25, 0.41, -0.04], [0.22, 0.045, 0.055]);
  part(weapon, box, STEEL, [-0.25, 0.45 + blade / 2, -0.04], [0.07, blade, 0.028]);
  part(weapon, cone, STEEL, [-0.25, 0.48 + blade + 0.05, -0.04], [0.05, 0.13, 0.022]);
}

/* ------------------------------------------------------------------ horse */

/** A horse with a barrel, a hinged-looking neck and a head that reads from the side at map zoom. */
function createHorse(teamColor, seed, heavy) {
  const horse = new THREE.Group();
  const coat = heavy ? pick(seed, 12, ["#4c4038", "#5a4436", "#3f3b39"]) : pick(seed, 12, COATS);
  const mane = heavy ? "#2e2a27" : pick(seed, 16, ["#3a2e26", "#57402c", "#2e2a27", "#c2b79c"]);
  part(horse, box, coat, [0, 0.66, -0.02], [0.32, 0.38, 0.9]);
  part(horse, box, coat, [0, 0.7, 0.32], [0.36, 0.4, 0.3]);
  part(horse, box, coat, [0, 0.68, -0.42], [0.36, 0.42, 0.32]);
  // A raised neck with the head hung forward off the poll: level with the barrel it reads as a dog.
  const neck = new THREE.Group();
  neck.position.set(0, 0.9, 0.38);
  neck.rotation.x = 0.33;
  horse.add(neck);
  part(neck, box, coat, [0, 0, 0], [0.21, 0.54, 0.25]);
  for (let index = 0; index < 5; index += 1) part(neck, box, mane, [0, 0.22 - index * 0.12, -0.14], [0.09, 0.13, 0.055]);
  const skull = new THREE.Group();
  skull.position.set(0, 1.16, 0.52);
  skull.rotation.x = 0.62;
  horse.add(skull);
  part(skull, box, coat, [0, 0, 0.08], [0.16, 0.19, 0.3]);
  part(skull, box, coat, [0, -0.045, 0.26], [0.13, 0.13, 0.16]);
  part(skull, box, "#2b2522", [0, -0.055, 0.345], [0.1, 0.06, 0.02]);
  for (const x of [-0.055, 0.055]) part(skull, cone, coat, [x, 0.12, -0.05], [0.035, 0.1, 0.035]);
  for (const x of [-0.083, 0.083]) part(skull, box, "#241f1d", [x, 0.035, 0.07], [0.02, 0.04, 0.055]);
  part(skull, box, LEATHER, [0, -0.02, 0.2], [0.15, 0.035, 0.12]);
  for (const x of [-0.083, 0.083]) part(skull, box, LEATHER, [x, 0.02, 0.12], [0.015, 0.14, 0.12]);
  part(neck, box, mane, [0, 0.28, -0.05], [0.1, 0.11, 0.2]);
  for (const x of [-0.13, 0.13]) for (const z of [0.3, -0.36]) {
    const front = z > 0;
    part(horse, box, coat, [x, 0.36, z], [0.11, 0.42, front ? 0.14 : 0.16]);
    part(horse, box, coat, [x, 0.14, front ? z : z + 0.05], [0.085, 0.3, 0.1]);
    part(horse, box, "#3b3733", [x, 0.035, front ? z : z + 0.05], [0.1, 0.07, 0.12]);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.8, -0.58);
  tail.rotation.x = 0.62;
  horse.add(tail);
  part(tail, box, mane, [0, -0.19, 0], [0.07, 0.38, 0.07]);
  part(tail, box, mane, [0, -0.38, 0.01], [0.055, 0.18, 0.055]);
  // Tack, then the faction's cloth over it.
  part(horse, box, teamColor, [0, 0.845, -0.04], [0.36, 0.06, 0.52]);
  part(horse, box, LEATHER, [0, 0.89, 0.02], [0.3, 0.08, 0.3]);
  part(horse, box, DARK_LEATHER, [0, 0.95, -0.12], [0.26, 0.07, 0.06]);
  part(horse, box, DARK_LEATHER, [0, 0.94, 0.15], [0.2, 0.06, 0.06]);
  for (const x of [-0.17, 0.17]) part(horse, box, DARK_LEATHER, [x, 0.72, 0.06], [0.03, 0.26, 0.05]);
  if (heavy) {
    for (const x of [-0.18, 0.18]) part(horse, box, teamColor, [x, 0.6, -0.06], [0.04, 0.34, 0.76]);
    part(horse, box, STEEL, [0, 0.72, 0.47], [0.34, 0.3, 0.09]);
    part(skull, box, STEEL, [0, 0.03, 0.12], [0.15, 0.16, 0.3]);
    part(skull, cone, STEEL, [0, 0.16, 0.06], [0.05, 0.18, 0.05]);
    for (let index = 0; index < 3; index += 1) part(neck, box, DARK_STEEL, [0, 0.15 - index * 0.14, 0.09], [0.16, 0.1, 0.08]);
  }
  return horse;
}

/** Seats a finished rig on a horse. The mount hangs off the root group, never off `body`, so the
 *  flinch and walk cycles shove the rider around without dragging the animal with them. */
function mountRig(rig, horse) {
  const saddle = new THREE.Group();
  saddle.position.set(0, 0.63, -0.06);
  rig.group.remove(rig.body);
  saddle.add(rig.body);
  rig.group.add(horse, saddle);
  return horse;
}

/* ----------------------------------------------------------------- bodies */

function mailTorso(body, bulk, tint) {
  part(body, box, tint, [0, 0.48, 0], [0.315 * bulk, 0.24, 0.245 * bulk]);
  part(body, box, tint, [0, 0.62, 0], [0.34 * bulk, 0.09, 0.26 * bulk]);
}
function pauldrons(body, bulk, tint) {
  for (const x of [-0.24 * bulk, 0.24 * bulk]) part(body, rock, tint, [x, 0.62, 0], [0.13 * bulk, 0.11, 0.15 * bulk]);
}
function quiver(body, teamColor) {
  part(body, box, DARK_WOOD, [0.14, 0.5, -0.19], [0.12, 0.34, 0.12]);
  part(body, box, teamColor, [0.14, 0.58, -0.19], [0.13, 0.05, 0.13]);
  for (const x of [0.11, 0.17]) part(body, box, BONE, [x, 0.75, -0.19], [0.022, 0.24, 0.022]);
  part(body, box, LEATHER, [0, 0.52, -0.06], [0.34, 0.05, 0.3]).rotation.z = 0.5;
}
function backBanner(body, teamColor, height) {
  part(body, cylinder, DARK_WOOD, [-0.02, 0.45 + height / 2, -0.17], [0.022, height, 0.022]);
  part(body, box, teamColor, [0.14, 0.42 + height, -0.17], [0.26, 0.2, 0.02]);
}

/** Builds an archer's bow with the same limbs and nock setBowDraw expects. */
function buildBow(weapon) {
  const stave = part(weapon, bowStave, WOOD, [0, 0, 0], [1, 1, 1]);
  stave.rotation.set(0, Math.PI / 2, Math.PI / 2);
  const limb = (sign) => part(weapon, box, "#d9d2c4", [0, sign * BOW_LIMB / 2, 0], [0.02, BOW_LIMB, 0.02]);
  const arrow = new THREE.Group();
  part(arrow, box, "#c8b48a", [0, 0, 0.17], [0.018, 0.018, 0.5]);
  part(arrow, cone, BONE, [0, 0, 0.45], [0.028, 0.07, 0.028]).rotation.x = Math.PI / 2;
  weapon.add(arrow);
  const bow = { top: limb(1), bottom: limb(-1), arrow };
  setBowDraw(bow, 0);
  return bow;
}

/* ------------------------------------------------------------------ units */

const BUILDERS = {
  militia(teamColor, seed) {
    const rig = buildRig({ seed, teamColor, tunic: pick(seed, 8, ["#8d7f66", "#7d7462", "#95866a", "#6f6a5c"]) });
    // No armour worth the name: a padded jack, an arm band and whatever was in the shed.
    part(rig.body, box, teamColor, [0.21, 0.5, 0], [0.055, 0.1, 0.13]);
    part(rig.body, box, CLOTH, [0, 0.45, 0], [0.315, 0.2, 0.245]);
    if (bit(seed, 20)) ironCap(rig, null);
    else if (bit(seed, 21)) part(rig.body, cone, "#b79b63", [0, 0.92, 0], [0.26, 0.12, 0.26]);
    const weapon = new THREE.Group();
    if (bit(seed, 22)) {
      part(weapon, box, DARK_WOOD, [-0.25, 0.55, -0.08], [0.05, 0.85, 0.05]);
      part(weapon, box, IRON, [-0.25, 0.97, -0.08], [0.1, 0.18, 0.14]);
    } else spearWeapon(weapon, 1.25, null);
    holdWeapon(rig, weapon);
    if (bit(seed, 23)) roundShield(rig.arms[1], teamColor);
    return { rig, weapon, role: "infantry", head: 1.02 };
  },

  spearmen(teamColor, seed) {
    const rig = buildRig({ seed, teamColor, tunic: "#6a6f63", sleeve: LEATHER });
    mailTorso(rig.body, 1, LEATHER);
    pauldrons(rig.body, 1, IRON);
    nasalHelm(rig, teamColor);
    const weapon = new THREE.Group();
    spearWeapon(weapon, 1.75, teamColor);
    holdWeapon(rig, weapon);
    kiteShield(rig.arms[1], teamColor);
    return { rig, weapon, role: "infantry", head: 1.05 };
  },

  swordsmen(teamColor, seed) {
    const rig = buildRig({ seed, teamColor, tunic: MAIL, sleeve: MAIL });
    mailTorso(rig.body, 1, MAIL);
    part(rig.body, box, teamColor, [0, 0.44, 0.125], [0.2, 0.3, 0.02]);
    pauldrons(rig.body, 1, STEEL);
    nasalHelm(rig, bit(seed, 20) ? teamColor : null);
    const weapon = new THREE.Group();
    swordWeapon(weapon, 0.5);
    holdWeapon(rig, weapon);
    (bit(seed, 21) ? kiteShield : roundShield)(rig.arms[1], teamColor);
    return { rig, weapon, role: "infantry", head: 1.05 };
  },

  archers(teamColor, seed) {
    const rig = buildRig({ seed, teamColor, tunic: pick(seed, 8, ["#5f6b4e", "#6d6247", "#4f5a4a"]) });
    part(rig.body, box, LEATHER, [0, 0.47, 0], [0.315, 0.22, 0.245]);
    quiver(rig.body, teamColor);
    if (bit(seed, 20)) hood(rig, "#57604a");
    else part(rig.body, rock, "#6d6247", [0, 0.91, 0], [0.215, 0.11, 0.21]);
    part(rig.body, box, teamColor, [-0.21, 0.5, 0], [0.055, 0.1, 0.13]);
    // The bow rides on the torso, not the shoulder: inheriting the draw arm's swing tips the stave flat.
    const weapon = new THREE.Group();
    const bow = buildBow(weapon);
    rig.body.add(weapon);
    weapon.position.set(-0.17, 0.54, 0.24);
    return { rig, weapon, bow, role: "archer", head: 1.02 };
  },

  crossbowmen(teamColor, seed) {
    const rig = buildRig({ seed, teamColor, tunic: "#7a7466", sleeve: "#6b6558" });
    part(rig.body, box, CLOTH, [0, 0.47, 0], [0.33, 0.26, 0.26]);
    part(rig.body, box, IRON, [0, 0.6, 0], [0.34, 0.1, 0.26]);
    kettleHat(rig, teamColor);
    part(rig.body, box, DARK_WOOD, [0.15, 0.36, -0.16], [0.14, 0.2, 0.1]);
    for (const x of [0.12, 0.18]) part(rig.body, box, BONE, [x, 0.48, -0.16], [0.02, 0.14, 0.02]);
    // The stock stays level on the torso so the aim never rolls with the reload swing.
    const weapon = new THREE.Group();
    part(weapon, box, DARK_WOOD, [0, 0, 0], [0.07, 0.07, 0.62]);
    part(weapon, box, DARK_WOOD, [0, -0.07, -0.22], [0.06, 0.12, 0.16]);
    part(weapon, box, IRON, [0, 0.005, 0.24], [0.5, 0.035, 0.05]);
    part(weapon, box, "#d9d2c4", [0, 0.005, 0.15], [0.48, 0.015, 0.015]);
    part(weapon, box, BONE, [0, 0.05, 0.06], [0.02, 0.02, 0.34]);
    part(weapon, cone, STEEL, [0, 0.05, 0.25], [0.03, 0.09, 0.03]).rotation.x = Math.PI / 2;
    rig.body.add(weapon);
    weapon.position.set(-0.14, 0.52, 0.2);
    return { rig, weapon, role: "archer", head: 1.05 };
  },

  light_cavalry(teamColor, seed) {
    const rig = buildRig({ seed, teamColor, tunic: "#6f6a52", sleeve: LEATHER, mounted: true, trouser: "#8a7355" });
    part(rig.body, box, LEATHER, [0, 0.47, 0], [0.315, 0.24, 0.245]);
    part(rig.body, box, teamColor, [0, 0.58, -0.12], [0.3, 0.22, 0.03]);
    ironCap(rig, teamColor);
    roundShield(rig.arms[1], teamColor);
    // A sabre on the shoulder joint: the strike animation is exactly the sweep this wants.
    const weapon = new THREE.Group();
    part(weapon, box, DARK_LEATHER, [-0.25, 0.3, -0.04], [0.038, 0.17, 0.038]);
    part(weapon, box, BRONZE, [-0.25, 0.4, -0.04], [0.14, 0.05, 0.1]);
    const blade = part(weapon, box, STEEL, [-0.27, 0.68, -0.04], [0.065, 0.52, 0.026]);
    blade.rotation.z = 0.1;
    const tip = part(weapon, box, STEEL, [-0.34, 1.02, -0.04], [0.06, 0.24, 0.026]);
    tip.rotation.z = 0.35;
    part(weapon, cone, STEEL, [-0.39, 1.14, -0.04], [0.045, 0.14, 0.022]).rotation.z = 0.35;
    holdWeapon(rig, weapon);
    const mount = mountRig(rig, createHorse(teamColor, seed, false));
    return { rig, weapon, mount, role: "infantry", head: 1.45 };
  },

  heavy_cavalry(teamColor, seed) {
    const rig = buildRig({ seed, teamColor, tunic: STEEL, sleeve: MAIL, mounted: true, trouser: MAIL });
    mailTorso(rig.body, 1, STEEL);
    pauldrons(rig.body, 1, STEEL);
    part(rig.body, box, teamColor, [0, 0.45, 0.13], [0.22, 0.3, 0.025]);
    greatHelm(rig, teamColor);
    kiteShield(rig.arms[1], teamColor);
    // The lance is couched on the torso. Hung off the shoulder, the strike swing would point it skyward.
    const weapon = new THREE.Group();
    const lance = new THREE.Group();
    lance.position.set(-0.36, 0.52, 0.24);
    lance.rotation.x = 1.4;
    weapon.add(lance);
    part(lance, box, WOOD, [0, 0, 0], [0.05, 1.8, 0.05]);
    part(lance, cone, STEEL, [0, 0.98, 0], [0.07, 0.22, 0.07]);
    part(lance, cylinder8, IRON, [0, -0.4, 0], [0.1, 0.12, 0.1]);
    part(lance, box, teamColor, [-0.08, 0.62, 0], [0.13, 0.18, 0.02]);
    part(lance, box, teamColor, [-0.08, 0.46, 0], [0.13, 0.12, 0.02]);
    rig.body.add(weapon);
    const mount = mountRig(rig, createHorse(teamColor, seed, true));
    return { rig, weapon, mount, role: "infantry", head: 1.5 };
  },

  shieldguard(teamColor, seed) {
    const rig = buildRig({ seed, teamColor, tunic: STEEL, sleeve: MAIL, bulk: 1.28, trouser: MAIL });
    mailTorso(rig.body, 1.28, STEEL);
    pauldrons(rig.body, 1.28, STEEL);
    part(rig.body, box, teamColor, [0, 0.42, 0.155], [0.24, 0.34, 0.025]);
    for (const x of [-0.14, 0.14]) part(rig.body, box, STEEL, [x, 0.22, 0.02], [0.14, 0.2, 0.18]);
    greatHelm(rig, teamColor);
    backBanner(rig.body, teamColor, 0.62);
    towerShield(rig.arms[1], teamColor);
    // Leaned outboard from the grip so the head clears the tower shield in silhouette.
    const weapon = new THREE.Group();
    const haft = new THREE.Group();
    haft.position.set(-0.32, 0.3, -0.04);
    haft.rotation.z = 0.34;
    weapon.add(haft);
    part(haft, box, DARK_LEATHER, [0, 0.02, 0], [0.05, 0.28, 0.05]);
    part(haft, cylinder8, IRON, [0, 0.33, 0], [0.1, 0.22, 0.1]);
    for (const angle of [0, 1.05, 2.1]) {
      const flange = part(haft, box, STEEL, [0, 0.33, 0], [0.05, 0.21, 0.25]);
      flange.rotation.y = angle;
    }
    part(haft, rock, STEEL, [0, 0.48, 0], [0.07, 0.07, 0.07]);
    holdWeapon(rig, weapon);
    return { rig, weapon, role: "infantry", head: 1.07 };
  },

  great_weapons(teamColor, seed) {
    const rig = buildRig({ seed, teamColor, tunic: "#5d6367", sleeve: MAIL, bulk: 1.2, trouser: MAIL });
    mailTorso(rig.body, 1.2, "#69707a");
    pauldrons(rig.body, 1.2, DARK_STEEL);
    part(rig.body, box, teamColor, [0, 0.5, -0.14], [0.34, 0.26, 0.03]);
    rig.headwear.visible = false;
    part(rig.body, rock, DARK_STEEL, [0, 0.88, 0], [0.23, 0.18, 0.22]);
    for (const x of [-0.19, 0.19]) part(rig.body, cone, BONE, [x, 0.97, 0], [0.045, 0.19, 0.045]).rotation.z = -Math.sign(x) * 0.6;
    part(rig.body, box, "#2b3236", [0, 0.79, 0.12], [0.17, 0.04, 0.03]);
    // A two-handed axe pivoted at the grip and leaned outboard: held upright the head sits on the helmet.
    const weapon = new THREE.Group();
    const haft = new THREE.Group();
    haft.position.set(-0.28, 0.28, -0.02);
    haft.rotation.z = 0.26;
    weapon.add(haft);
    part(haft, box, DARK_WOOD, [0, 0.28, 0], [0.055, 1.05, 0.055]);
    for (const y of [0.02, 0.52]) part(haft, box, IRON, [0, y, 0], [0.07, 0.06, 0.07]);
    part(haft, box, STEEL, [0, 0.69, 0.14], [0.05, 0.38, 0.26]);
    part(haft, cone, STEEL, [0, 0.69, 0.29], [0.05, 0.19, 0.19]).rotation.x = -Math.PI / 2;
    part(haft, box, STEEL, [0, 0.69, -0.11], [0.05, 0.24, 0.13]);
    part(haft, cone, STEEL, [0, 0.92, 0], [0.05, 0.2, 0.05]);
    holdWeapon(rig, weapon);
    return { rig, weapon, role: "infantry", head: 1.08 };
  },

  ogre(teamColor, seed) {
    // Not a scaled-up soldier: an ogre gets its own proportions — a barrel chest, a head sunk between
    // the shoulders and arms that hang to the knees — and the whole thing is then blown up to 2.2x.
    const hide = pick(seed, 0, ["#8d9070", "#9a8b6c", "#7f8a72", "#94886e"]);
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    const torso = part(body, box, hide, [0, 0.62, 0], [0.5, 0.42, 0.36]);
    part(body, box, hide, [0, 0.74, 0], [0.46, 0.16, 0.34]);
    part(body, rock, hide, [0, 0.48, 0.1], [0.24, 0.16, 0.13]);
    const head = part(body, rock, hide, [0, 0.9, 0.05], [0.18, 0.19, 0.18]);
    const headwear = part(body, box, hide, [0, 0.98, 0.04], [0.16, 0.06, 0.16]);
    part(body, box, hide, [0, 0.83, 0.12], [0.17, 0.08, 0.14]);
    for (const x of [-0.055, 0.055]) part(body, cone, BONE, [x, 0.85, 0.15], [0.026, 0.1, 0.026]);
    for (const x of [-0.07, 0.07]) part(body, box, "#2b2522", [x, 0.94, 0.15], [0.045, 0.032, 0.03]);
    // The only cloth an ogre owns: a hide wrap with the faction's colours daubed on its chest.
    const badge = part(body, box, teamColor, [-0.1, 0.65, 0.184], [0.05, 0.24, 0.02]);
    part(body, box, teamColor, [0.1, 0.65, 0.184], [0.05, 0.24, 0.02]);
    part(body, box, HIDE, [0, 0.4, 0], [0.46, 0.18, 0.34]);
    part(body, box, teamColor, [0, 0.34, 0.17], [0.22, 0.2, 0.04]);
    for (const x of [-0.28, 0.28]) {
      part(body, rock, hide, [x, 0.76, 0], [0.16, 0.14, 0.18]);
      part(body, rock, BONE, [x, 0.83, 0], [0.13, 0.08, 0.15]);
    }
    const arms = [-0.29, 0.29].map((x) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, 0.76, 0);
      part(shoulder, box, hide, [0, -0.14, 0], [0.16, 0.3, 0.17]);
      part(shoulder, box, teamColor, [0, -0.26, 0], [0.18, 0.055, 0.19]);
      part(shoulder, box, hide, [0, -0.33, 0.02], [0.145, 0.24, 0.155]);
      part(shoulder, rock, hide, [0, -0.47, 0.03], [0.115, 0.105, 0.115]);
      return shoulder;
    });
    const legs = [-0.15, 0.15].map((x) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.42, 0);
      part(hip, box, hide, [0, -0.2, 0], [0.22, 0.4, 0.26]);
      part(hip, box, "#6c6f58", [0, -0.38, 0.05], [0.25, 0.1, 0.34]);
      return hip;
    });
    body.add(...arms, ...legs);
    const weapon = new THREE.Group();
    // The club is pivoted at the fist and leans outboard, so the head clears the shoulder in silhouette.
    const club = new THREE.Group();
    club.position.set(-0.32, 0.26, 0.02);
    club.rotation.z = 0.28;
    weapon.add(club);
    part(club, box, DARK_WOOD, [0, 0.16, 0], [0.1, 0.46, 0.1]);
    part(club, box, WOOD, [0, 0.56, 0], [0.19, 0.42, 0.19]);
    part(club, rock, WOOD, [0, 0.8, 0], [0.14, 0.13, 0.14]);
    for (const [x, z, tilt] of [[-0.13, 0, -1.4], [0.13, 0, 1.4], [0, 0.13, 0], [0, -0.13, 0]]) {
      const spike = part(club, cone, "#8f9499", [x, 0.56, z], [0.05, 0.16, 0.05]);
      spike.rotation.z = tilt;
      if (tilt === 0) spike.rotation.x = z > 0 ? 1.4 : -1.4;
    }
    arms[0].add(weapon);
    weapon.position.set(0.29, -0.76, 0);
    const rig = { group, body, torso, head, headwear, badge, arms, legs, skin: hide, bulk: 1 };
    return { rig, weapon, role: "infantry", scale: 2.2, head: 2.35 };
  },

  battle_mage(teamColor, seed) {
    const rig = buildRig({ seed, teamColor, tunic: teamColor, sleeve: teamColor, robe: true, trouser: "#3a3346" });
    // The robe is one cone from the hem to the chest, so legs never poke through a walk cycle.
    part(rig.body, cone, teamColor, [0, 0.24, 0], [0.32, 0.46, 0.32]);
    part(rig.body, box, "#3a3346", [0, 0.48, 0], [0.3, 0.33, 0.24]);
    // A mantle over the shoulders and a single stole down the front: one accent, not a cross.
    part(rig.body, cone, "#3a3346", [0, 0.56, 0], [0.29, 0.22, 0.26]);
    part(rig.body, box, teamColor, [0, 0.46, 0.125], [0.09, 0.3, 0.025]);
    hood(rig, "#3a3346");
    glow(rig.body, rock, "#cfe8ff", [0, 0.77, 0.11], [0.05, 0.03, 0.02]);
    part(rig.body, box, "#d8cfa8", [0, 0.32, 0], [0.31, 0.045, 0.25]);
    const weapon = new THREE.Group();
    part(weapon, box, DARK_WOOD, [-0.25, 0.66, -0.04], [0.042, 1.24, 0.042]);
    part(weapon, box, BRONZE, [-0.25, 1.26, -0.04], [0.06, 0.07, 0.06]);
    for (const x of [-0.31, -0.19]) part(weapon, cone, BRONZE, [x, 1.4, -0.04], [0.03, 0.2, 0.03]).rotation.z = x < -0.25 ? 0.4 : -0.4;
    glow(weapon, rock, "#bfe6ff", [-0.25, 1.42, -0.04], [0.075, 0.09, 0.075]);
    glow(weapon, box, teamColor, [-0.25, 0.9, -0.04], [0.05, 0.05, 0.05]);
    holdWeapon(rig, weapon);
    return { rig, weapon, role: "infantry", head: 1.05 };
  },

  catapult(teamColor, seed) {
    // A machine, not a person: the same object shape, but the joint arrays stay empty and the strike
    // lives entirely in the throwing arm. The tall A-frame is what makes it read as a siege engine
    // instead of a cart, so the uprights and the stop bar carry the silhouette.
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    for (const x of [-0.3, 0.3]) {
      part(body, box, WOOD, [x, 0.27, 0], [0.11, 0.11, 1.5]);
      const lean = Math.sign(x) * 0.16;
      part(body, box, DARK_WOOD, [x, 0.72, -0.26], [0.1, 0.92, 0.1]).rotation.z = lean;
      part(body, box, DARK_WOOD, [x, 0.75, 0.46], [0.09, 0.96, 0.09]).rotation.z = lean;
      part(body, box, DARK_WOOD, [x - Math.sign(x) * 0.08, 0.75, 0.1], [0.07, 0.07, 0.8]).rotation.x = 0.28;
    }
    for (const z of [0.66, 0, -0.66]) part(body, box, WOOD, [0, 0.27, z], [0.64, 0.1, 0.13]);
    part(body, cylinder8, IRON, [0, 1.16, -0.26], [0.06, 0.74, 0.06]).rotation.z = Math.PI / 2;
    // The padded stop bar the arm slams into at the top of its throw.
    part(body, box, DARK_WOOD, [0, 1.2, 0.42], [0.66, 0.12, 0.12]);
    part(body, box, LEATHER, [0, 1.28, 0.42], [0.52, 0.08, 0.18]);
    for (const x of [-0.38, 0.38]) for (const z of [0.56, -0.6]) {
      const wheel = part(body, wheelGeometry, DARK_WOOD, [x, 0.24, z], [0.24, 0.1, 0.24]);
      wheel.rotation.z = Math.PI / 2;
      part(body, cylinder8, IRON, [x + Math.sign(x) * 0.055, 0.24, z], [0.07, 0.03, 0.07]).rotation.z = Math.PI / 2;
    }
    part(body, cylinder8, "#c9b184", [0, 1.16, -0.26], [0.14, 0.34, 0.14]).rotation.z = Math.PI / 2;
    part(body, box, DARK_WOOD, [0, 0.44, 0.66], [0.46, 0.18, 0.16]);
    part(body, cylinder8, DARK_WOOD, [0, 0.44, 0.66], [0.12, 0.54, 0.12]).rotation.z = Math.PI / 2;
    for (const x of [-0.24, 0.24]) part(body, box, WOOD, [x, 0.6, 0.66], [0.05, 0.32, 0.05]).rotation.z = Math.sign(x) * 0.6;
    part(body, cylinder, DARK_WOOD, [0.36, 1.05, -0.66], [0.025, 1.4, 0.025]);
    part(body, box, teamColor, [0.36, 1.58, -0.5], [0.03, 0.3, 0.34]);
    part(body, box, teamColor, [0, 0.34, 0.75], [0.52, 0.14, 0.03]);
    // rotation.x = 0 is cocked; the animation layer winds it forward from here.
    const weapon = new THREE.Group();
    weapon.position.set(0, 1.16, -0.26);
    body.add(weapon);
    const arm = new THREE.Group();
    arm.rotation.x = -0.72;
    weapon.add(arm);
    part(arm, box, WOOD, [0, 0, -0.56], [0.1, 0.1, 1.2]);
    part(arm, box, DARK_WOOD, [0, 0, 0.14], [0.14, 0.14, 0.32]);
    part(arm, box, WOOD, [0, 0.08, -1.12], [0.26, 0.06, 0.26]);
    for (const x of [-0.13, 0.13]) part(arm, box, WOOD, [x, 0.17, -1.12], [0.035, 0.16, 0.26]);
    for (const z of [-1.0, -1.24]) part(arm, box, WOOD, [0, 0.17, z], [0.26, 0.16, 0.035]);
    const payload = part(arm, rock, "#8c9390", [0, 0.18, -1.12], [0.14, 0.14, 0.14]);
    part(arm, box, "#cbbfa4", [0, 0.07, -0.5], [0.02, 0.02, 1]);
    return { group, body, weapon, payload, role: "siege", scale: 1.15, head: 1.7, machine: true };
  },
};

export const FIGHTER_IDS = Object.keys(BUILDERS);

/**
 * Builds one fighter model for a campaign unit.
 * Returns the same shape as `createColonist`, so `animateColonist` poses it unchanged: humanoids expose
 * two shoulder joints and two hip joints, and machines expose empty arrays plus `isMachine`.
 *
 * @param {string} unitId one of FIGHTER_IDS
 * @param {string} factionColor the owner's colour, used for cloth, shields and banners
 * @param {number} variation 0..1, a stable per-model roll of height, colouring and minor gear
 */
export function createFighter(unitId, factionColor, variation = 0) {
  const build = BUILDERS[unitId] ?? BUILDERS.militia;
  const seed = seedOf(variation);
  const built = build(factionColor, seed);
  const rig = built.rig;
  const group = rig?.group ?? built.group;
  const body = rig?.body ?? built.body;
  const arms = rig?.arms ?? [];
  const legs = rig?.legs ?? [];
  // Sizing lives on an inner frame, never on the root: callers set group.scale themselves each frame
  // (health shrink, hero bump), and an ogre that loses its 2.2x to one setScalar is just a big soldier.
  const frame = new THREE.Group();
  for (const child of [...group.children]) frame.add(child);
  group.add(frame);
  const unit = built.scale ?? 1;
  // The same trick trees use: shape comes from the unit, size comes from the roll.
  const spread = built.machine === true ? 1 : 0.95 + ((seed >>> 28) % 4) * 0.035;
  const height = built.machine === true ? 1 : 0.94 + ((seed >>> 26) % 5) * 0.03;
  frame.scale.set(unit * spread, unit * height, unit * spread);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.42, 32), new THREE.MeshBasicMaterial({ color: "#fff2be", side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.visible = false;
  frame.add(ring);
  return {
    group, frame, body, torso: rig?.torso ?? null, head: rig?.head ?? null, headwear: rig?.headwear ?? null,
    badge: rig?.badge ?? null, arms, legs, tools: {}, weapon: built.weapon, bow: built.bow ?? null,
    mount: built.mount ?? null, payload: built.payload ?? null, ring,
    unitId, role: built.role, isMachine: built.machine === true, headHeight: built.head * unit,
    stride: 0, phase: (seed % 628) / 100, attackStarted: -Infinity, hitStarted: -Infinity,
  };
}
