import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  NormalBlending,
  OctahedronGeometry,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type ColorRepresentation,
  type Material,
  type Object3D,
} from "three";
import type { PropKit } from "./prop-kit.js";
import { frondGeometry, latheGeometry, rockGeometry } from "./forms.js";

export const WOOD = "#c08a4e";

export const WOOD_DARK = "#7c4f2a";

export const WOOD_DEEP = "#5a3a1f";

export const IRON = "#59606c";

export const GOLD = "#f2c14e";

export const FLAME = "#ffae3b";

export const FLAME_CORE = "#fff0a8";

const FIRE_LIGHT = 60;

const UP = new Vector3(0, 1, 0);

export function place<T extends Object3D>(object: T, x: number, y: number, z: number, turn = 0, scale?: number): T {
  object.position.set(x, y, z);
  object.rotation.y = turn;

  if (scale !== undefined) {
    object.scale.setScalar(scale);
  }

  return object;
}

export function strut(
  kit: PropKit,
  from: Vector3,
  to: Vector3,
  radiusFrom: number,
  radiusTo: number,
  material: Material,
  sides = 7,
): Mesh {
  const direction = to.clone().sub(from);
  const length = direction.length();
  const mesh = kit.solid(new CylinderGeometry(radiusTo, radiusFrom, length, sides), material);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, direction.normalize()));

  return mesh;
}

export function palmTree(kit: PropKit, height: number, lean: number): Group {
  const tree = kit.group();
  const bark = [kit.surface("#9c6b3d"), kit.surface("#b98a52")];
  const segments = 8;
  const girth = height / 22;

  function trunkPoint(progress: number): Vector3 {
    return new Vector3(lean * height * progress * progress, height * progress, 0);
  }

  for (let index = 0; index < segments; index += 1) {
    const from = trunkPoint(index / segments);
    const to = trunkPoint((index + 1) / segments);
    const radiusFrom = girth * (1.25 - (0.45 * index) / segments);
    const radiusTo = girth * (1.25 - (0.45 * (index + 1)) / segments) * 0.92;
    tree.add(strut(kit, from, to, radiusFrom, radiusTo, bark[index % 2]!));
  }

  const top = trunkPoint(1);

  const fronds = [
    frondGeometry(height * 0.42, height * 0.13, height * 0.07, height * 0.3),
    frondGeometry(height * 0.36, height * 0.12, height * 0.09, height * 0.24),
  ];

  const greens = [kit.surface("#4fae52", { twoSided: true }), kit.surface("#6cc45a", { twoSided: true })];
  const count = 8;

  for (let index = 0; index < count; index += 1) {
    const frond = kit.solid(fronds[index % 2]!, greens[index % 2]!, top.x, top.y, top.z);
    frond.rotation.y = (index / count) * Math.PI * 2 + kit.between(-0.2, 0.2);
    frond.rotation.z = kit.between(-0.15, 0.1);
    tree.add(frond);
  }

  const nut = new SphereGeometry(girth * 0.55, 6, 5);
  const husk = kit.surface("#6b4a2a");

  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2 + 0.4;

    tree.add(
      kit.solid(
        nut,
        husk,
        top.x + Math.cos(angle) * girth * 0.8,
        top.y - girth * 0.9,
        top.z + Math.sin(angle) * girth * 0.8,
      ),
    );
  }

  kit.animate((seconds) => {
    tree.rotation.z = Math.sin(seconds * 0.9 + top.x) * 0.012;
  });

  return tree;
}

export function crate(kit: PropKit, size: number, tone: ColorRepresentation = WOOD): Group {
  const trim = kit.surface(WOOD_DARK);
  const band = new BoxGeometry(size * 1.04, size * 0.14, size * 1.04);
  const post = new BoxGeometry(size * 0.15, size * 1.02, size * 0.15);
  const brace = new BoxGeometry(size * 1.18, size * 0.13, size * 0.07);
  const inset = size / 2 - size * 0.06;

  const box = kit.group(
    kit.solid(new BoxGeometry(size, size, size), kit.surface(tone), 0, size / 2, 0),
    kit.solid(band, trim, 0, size * 0.93, 0),
    kit.solid(band, trim, 0, size * 0.07, 0),
  );

  for (const x of [-inset, inset]) {
    for (const z of [-inset, inset]) {
      box.add(kit.solid(post, trim, x, size / 2, z));
    }
  }

  for (const z of [-1, 1]) {
    const diagonal = kit.solid(brace, trim, 0, size / 2, z * (size / 2 + size * 0.03));
    diagonal.rotation.z = z * (Math.PI / 4);
    box.add(diagonal);
  }

  return box;
}

export function barrel(kit: PropKit, height: number, tone: ColorRepresentation = "#a8703c"): Group {
  const radius = height * 0.36;

  const body = latheGeometry(
    [
      [0, 0],
      [radius * 0.8, 0],
      [radius * 0.96, height * 0.22],
      [radius, height * 0.5],
      [radius * 0.96, height * 0.78],
      [radius * 0.8, height],
      [0, height],
    ],
    10,
  );

  const hoop = new TorusGeometry(radius * 0.93, height * 0.035, 4, 12);
  const iron = kit.surface(IRON, { metalness: 0.4, roughness: 0.55 });

  const cask = kit.group(kit.solid(body, kit.surface(tone)));

  for (const level of [0.16, 0.84]) {
    const ring = kit.solid(hoop, iron, 0, height * level, 0);
    ring.rotation.x = Math.PI / 2;
    cask.add(ring);
  }

  return cask;
}

export function rock(kit: PropKit, radius: number, tone: ColorRepresentation, flatten = 0.7): Mesh {
  return kit.solid(rockGeometry(kit, radius, flatten), kit.surface(tone), 0, radius * 0.15, 0);
}

export function bush(kit: PropKit, radius: number, tones: readonly ColorRepresentation[]): Group {
  const shrub = kit.group();
  const blob = new IcosahedronGeometry(1, 1);
  const count = 3 + Math.floor(kit.random() * 3);

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + kit.between(0, 1);
    const size = radius * kit.between(0.55, 0.85);
    const lump = kit.solid(blob, kit.surface(kit.pick(tones)), Math.cos(angle) * radius * 0.5, size * 0.75, Math.sin(angle) * radius * 0.5);
    lump.scale.set(size, size * 0.85, size);
    shrub.add(lump);
  }

  return shrub;
}

export function pier(kit: PropKit, length: number, width: number, deck: number, depth: number): Group {
  const dock = kit.group();
  const planks = [kit.surface("#c69558"), kit.surface("#b3834a"), kit.surface("#d1a266")];
  const plankDepth = 2.3;
  const plank = new BoxGeometry(plankDepth * 0.92, 0.6, width);
  const count = Math.floor(length / plankDepth);

  for (let index = 0; index < count; index += 1) {
    const board = kit.solid(plank, kit.pick(planks), index * plankDepth + plankDepth / 2, deck + kit.between(-0.08, 0.08), 0);
    board.rotation.y = kit.between(-0.03, 0.03);
    dock.add(board);
  }

  const post = new CylinderGeometry(0.7, 0.8, deck + depth, 7);
  const postSurface = kit.surface(WOOD_DEEP);

  for (let along = 1; along < length; along += 9) {
    for (const side of [-1, 1]) {
      dock.add(kit.solid(post, postSurface, along, (deck - depth) / 2, side * (width / 2 - 0.4)));
    }
  }

  const beam = new BoxGeometry(length, 0.7, 0.8);

  for (const side of [-1, 1]) {
    dock.add(kit.solid(beam, kit.surface(WOOD_DARK), length / 2, deck - 0.65, side * (width / 2 - 1.2)));
  }

  return dock;
}

export function rowboat(kit: PropKit): Group {
  const hull = new SphereGeometry(1, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const bowl = kit.solid(hull, kit.surface("#b0643a", { twoSided: true }));
  bowl.scale.set(8, 3, 3.4);

  const rim = kit.solid(new TorusGeometry(1, 0.09, 4, 18), kit.surface("#6e3e22"));
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(8, 3.4, 3);

  const seat = new BoxGeometry(1.2, 0.35, 6.2);
  const oar = kit.solid(new CylinderGeometry(0.18, 0.18, 12, 5), kit.surface(WOOD));
  oar.position.set(1, 0.4, 1.8);
  oar.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI / 2 + 0.15);

  const blade = kit.solid(new BoxGeometry(0.2, 2.6, 1.1), kit.surface(WOOD));
  blade.position.set(6.4, 0.7, 2.9);
  blade.rotation.set(0.3, 0.1, 0.2);

  const floor = kit.solid(new CylinderGeometry(1, 1, 0.3, 14), kit.surface("#d19a5c"), 0, -1.7, 0);
  floor.scale.set(6.6, 1, 2.6);

  const boat = kit.group(bowl, floor, rim, oar, blade);

  for (const x of [-2.6, 2.4]) {
    boat.add(kit.solid(seat, kit.surface(WOOD_DARK), x, -0.5, 0));
  }

  return boat;
}

export function treasureChest(kit: PropKit): Group {
  const wood = kit.surface("#8a4526");
  const gold = kit.surface(GOLD, { metalness: 0.55, roughness: 0.4, emissive: "#7a5410", glow: 0.35 });
  const body = kit.solid(new BoxGeometry(6, 3.6, 4), wood, 0, 1.8, 0);

  const lidHinge = kit.group();
  lidHinge.position.set(0, 3.6, -2);
  const lid = kit.solid(new CylinderGeometry(2, 2, 6, 10, 1, false, 0, Math.PI), wood, 0, 0, 2);
  lid.rotation.z = Math.PI / 2;
  lidHinge.add(lid);
  lidHinge.rotation.x = -0.55;

  const chest = kit.group(body, lidHinge);
  const band = new BoxGeometry(0.5, 3.7, 4.1);

  for (const x of [-2.2, 2.2]) {
    chest.add(kit.solid(band, gold, x, 1.85, 0));
  }

  chest.add(kit.solid(new BoxGeometry(0.9, 1, 0.3), gold, 0, 2.6, 2.05));

  const hoard = kit.solid(new SphereGeometry(2.4, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), gold, 0, 3.5, 0);
  hoard.scale.set(1.15, 0.55, 0.75);
  chest.add(hoard);

  const coin = new CylinderGeometry(0.55, 0.55, 0.16, 8);

  for (let index = 0; index < 7; index += 1) {
    const piece = kit.solid(coin, gold, kit.between(-3.5, 3.5), 0.1, kit.between(2.4, 4.5));
    piece.rotation.set(kit.between(-0.3, 0.3), 0, kit.between(-0.3, 0.3));
    chest.add(piece);
  }

  const gem = new OctahedronGeometry(0.55, 0);

  for (const tone of ["#4fd1c5", "#e05d9b", "#7aa2ff"]) {
    chest.add(kit.solid(gem, kit.surface(tone, { emissive: tone, glow: 0.4 }), kit.between(-2, 2), 3.9, kit.between(-1, 1)));
  }

  return chest;
}

export function hut(kit: PropKit, tone: ColorRepresentation, thatch: ColorRepresentation): Group {
  const stilts = new CylinderGeometry(0.55, 0.6, 5, 6);
  const post = kit.surface(WOOD_DEEP);
  const shack = kit.group(kit.solid(new BoxGeometry(18, 1, 15), kit.surface(WOOD_DARK), 0, 4.5, 0));

  for (const x of [-8, 8]) {
    for (const z of [-6.5, 6.5]) {
      shack.add(kit.solid(stilts, post, x, 2, z));
    }
  }

  shack.add(
    kit.solid(new BoxGeometry(14, 9, 11), kit.surface(tone), 0, 9.5, 0),
    kit.solid(new BoxGeometry(3.4, 6, 0.4), kit.surface("#4a2e18"), -2, 8, 5.6),
    kit.solid(new BoxGeometry(3.2, 2.6, 0.4), kit.surface("#3a2414"), 3.6, 10.5, 5.6),
  );

  const roof = kit.solid(new ConeGeometry(13.5, 9, 4), kit.surface(thatch), 0, 18.5, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 1);

  const fringe = kit.solid(new ConeGeometry(14.5, 2.4, 4, 1, true), kit.surface("#b98d4a", { twoSided: true }), 0, 14.4, 0);
  fringe.rotation.y = Math.PI / 4;
  fringe.scale.set(1.15, 1, 1);

  shack.add(roof, fringe);

  return shack;
}

export function flag(kit: PropKit, height: number, cloth: ColorRepresentation, trim: ColorRepresentation): Group {
  const pole = kit.solid(new CylinderGeometry(0.3, 0.4, height, 6), kit.surface(WOOD_DARK), 0, height / 2, 0);
  const finial = kit.solid(new SphereGeometry(0.7, 8, 6), kit.surface(GOLD, { metalness: 0.5, roughness: 0.4 }), 0, height + 0.5, 0);
  const width = height * 0.32;
  const drop = height * 0.2;
  const sheet = kit.keep(new PlaneGeometry(width, drop, 10, 3));
  sheet.translate(width / 2, 0, 0);
  const banner = kit.solid(sheet, kit.surface(cloth, { twoSided: true }), 0.3, height - drop / 2 - 0.4, 0);
  const stripe = kit.solid(new BoxGeometry(width * 0.08, drop * 1.02, 0.12), kit.surface(trim), 0.3 + width * 0.06, height - drop / 2 - 0.4, 0);

  const position = sheet.getAttribute("position");
  const rest = Float32Array.from(position.array);

  kit.animate((seconds) => {
    for (let index = 0; index < position.count; index += 1) {
      const x = rest[index * 3]!;
      const reach = x / width;
      position.setZ(index, Math.sin(x * 0.55 - seconds * 4.2) * 0.9 * reach);
    }

    position.needsUpdate = true;
  });

  return kit.group(pole, finial, banner, stripe);
}

export function lanternPost(kit: PropKit, height: number): Group {
  const wood = kit.surface(WOOD_DEEP);
  const lamp = kit.surface("#ffd98a", { emissive: "#ffb347", glow: 1.6 });
  const cage = kit.surface(IRON, { metalness: 0.4, roughness: 0.5 });

  return kit.group(
    kit.solid(new CylinderGeometry(0.45, 0.6, height, 6), wood, 0, height / 2, 0),
    kit.solid(new BoxGeometry(3.4, 0.5, 0.5), wood, 1.4, height - 0.6, 0),
    kit.solid(new BoxGeometry(1.5, 2, 1.5), lamp, 2.7, height - 2.3, 0),
    kit.solid(new ConeGeometry(1.2, 0.9, 4), cage, 2.7, height - 0.95, 0),
    kit.solid(new BoxGeometry(1.7, 0.3, 1.7), cage, 2.7, height - 3.4, 0),
  );
}

export function fire(kit: PropKit, size: number, light: number): Group {
  const flame = kit.solid(new ConeGeometry(0.9 * size, 2.8 * size, 6), kit.surface(FLAME, { emissive: FLAME, glow: 2.2 }), 0, 1.4 * size, 0);
  const core = kit.solid(new ConeGeometry(0.5 * size, 1.8 * size, 6), kit.surface(FLAME_CORE, { emissive: FLAME_CORE, glow: 2.6 }), 0, size, 0);
  flame.castShadow = false;
  core.castShadow = false;

  const blaze = kit.group(flame, core);
  const glow = light > 0 ? new PointLight("#ffb052", FIRE_LIGHT * light, 40 * size, 2) : null;

  if (glow !== null) {
    glow.position.set(0, 2.5 * size, 0);
    blaze.add(glow);
  }

  const phase = kit.between(0, 10);

  kit.animate((seconds) => {
    const flicker = Math.sin(seconds * 13 + phase) * 0.08 + Math.sin(seconds * 7.3 + phase * 2) * 0.06;
    flame.scale.set(1 - flicker, 1 + flicker * 2, 1 - flicker);
    core.scale.set(1 + flicker, 1 - flicker, 1 + flicker);

    if (glow !== null) {
      glow.intensity = FIRE_LIGHT * light * (1 + flicker * 1.5);
    }
  });

  return blaze;
}

export function torch(kit: PropKit, height: number, light: number): Group {
  const blaze = fire(kit, 1, light);
  blaze.position.y = height;

  return kit.group(
    kit.solid(new CylinderGeometry(0.35, 0.5, height, 6), kit.surface(WOOD_DEEP), 0, height / 2, 0),
    kit.solid(new CylinderGeometry(1.1, 0.6, 1.2, 7), kit.surface(IRON, { metalness: 0.4, roughness: 0.5 }), 0, height, 0),
    blaze,
  );
}

export function starfish(kit: PropKit, tone: ColorRepresentation): Group {
  const arm = new ConeGeometry(0.75, 2.6, 4);
  const surface = kit.surface(tone);
  const star = kit.group(kit.solid(new CylinderGeometry(0.9, 0.9, 0.4, 5), surface, 0, 0.2, 0));

  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const limb = kit.solid(arm, surface, Math.cos(angle) * 1.3, 0.2, Math.sin(angle) * 1.3);
    limb.rotation.set(0, -angle, -Math.PI / 2);
    limb.scale.set(1, 1, 0.45);
    star.add(limb);
  }

  return star;
}

export function shell(kit: PropKit, tone: ColorRepresentation): Mesh {
  const dome = kit.solid(new SphereGeometry(1, 8, 4, 0, Math.PI), kit.surface(tone, { twoSided: true }));
  dome.rotation.x = -Math.PI / 2;
  dome.scale.set(1, 1, 0.45);

  return dome;
}

export function grassTuft(kit: PropKit, height: number, tones: readonly ColorRepresentation[]): Group {
  const blade = new ConeGeometry(0.28, 1, 3);
  const tuft = kit.group();

  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2 + kit.between(0, 0.8);
    const length = height * kit.between(0.6, 1);
    const leaf = kit.solid(blade, kit.surface(kit.pick(tones)), Math.cos(angle) * 0.4, length / 2, Math.sin(angle) * 0.4);
    leaf.scale.set(1, length, 1);
    leaf.rotation.set(Math.sin(angle) * 0.35, 0, -Math.cos(angle) * 0.35);
    tuft.add(leaf);
  }

  return tuft;
}

export function ropeCoil(kit: PropKit): Group {
  const rope = kit.surface("#cfa76a");

  const coil = kit.group();

  [1.6, 1.25, 0.9].forEach((radius, layer) => {
    const loop = kit.solid(new TorusGeometry(radius, 0.32, 5, 16), rope, 0, 0.3 + layer * 0.5, 0);
    loop.rotation.x = Math.PI / 2;
    coil.add(loop);
  });

  return coil;
}

export function bottle(kit: PropKit, tone: ColorRepresentation): Mesh {
  return kit.solid(
    latheGeometry(
      [
        [0, 0],
        [0.55, 0],
        [0.6, 0.2],
        [0.6, 1.5],
        [0.25, 2.1],
        [0.22, 2.7],
        [0, 2.7],
      ],
      7,
    ),
    kit.surface(tone, { roughness: 0.25, emissive: tone, glow: 0.15 }),
  );
}

export function campfire(kit: PropKit, light: number): Group {
  const hearth = kit.group();
  const stone = new IcosahedronGeometry(0.9, 0);
  const stones = [kit.surface("#8f8a82"), kit.surface("#a39d93")];

  for (let index = 0; index < 9; index += 1) {
    const angle = (index / 9) * Math.PI * 2;
    const pebble = kit.solid(stone, stones[index % 2]!, Math.cos(angle) * 3, 0.45, Math.sin(angle) * 3);
    pebble.scale.set(1, 0.7, 1.2);
    pebble.rotation.y = angle;
    hearth.add(pebble);
  }

  const log = new CylinderGeometry(0.45, 0.5, 4.4, 6);
  const bark = kit.surface(WOOD_DEEP);

  for (let index = 0; index < 3; index += 1) {
    const piece = kit.solid(log, bark, 0, 0.9, 0);
    piece.rotation.set(Math.PI / 2 - 0.5, (index / 3) * Math.PI * 2, 0);
    hearth.add(piece);
  }

  hearth.add(place(fire(kit, 1.3, light), 0, 0.4, 0));

  const tripodTop = new Vector3(0, 7.5, 0);
  const pole = kit.surface(WOOD_DARK);

  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2 + 0.5;
    hearth.add(strut(kit, new Vector3(Math.cos(angle) * 3.4, 0, Math.sin(angle) * 3.4), tripodTop, 0.18, 0.14, pole, 5));
  }

  hearth.add(
    kit.solid(
      latheGeometry(
        [
          [0, 0],
          [1.1, 0.15],
          [1.35, 0.9],
          [1.2, 1.7],
          [1.3, 1.8],
          [0, 1.8],
        ],
        9,
      ),
      kit.surface("#3d3f46", { metalness: 0.4, roughness: 0.5 }),
      0,
      4.2,
      0,
    ),
  );

  return hearth;
}

export function logSeat(kit: PropKit, length: number): Mesh {
  const seat = kit.solid(new CylinderGeometry(1.1, 1.2, length, 7), kit.surface("#8a5a33"), 0, 1.1, 0);
  seat.rotation.z = Math.PI / 2;

  return seat;
}

export interface DriftOptions {
  count: number;
  spread: number;
  floor: number;
  ceiling: number;
  fall: number;
  sway: number;
  size: number;
  tone: ColorRepresentation;
  glowing: boolean;
}

function roundSprite(kit: PropKit): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgb(255 255 255 / 1)");
  gradient.addColorStop(0.55, "rgb(255 255 255 / 0.85)");
  gradient.addColorStop(1, "rgb(255 255 255 / 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);

  return kit.keep(new CanvasTexture(canvas));
}

export function drift(kit: PropKit, options: DriftOptions): Points {
  const seeds: number[] = [];
  const positions = new Float32Array(options.count * 3);

  for (let index = 0; index < options.count; index += 1) {
    seeds.push(
      kit.between(-options.spread, options.spread),
      kit.between(-options.spread, options.spread),
      kit.random(),
      kit.between(0.7, 1.3),
    );
  }

  const geometry = kit.keep(new BufferGeometry());
  const attribute = new Float32BufferAttribute(positions, 3);
  geometry.setAttribute("position", attribute);

  const material = kit.keep(
    new PointsMaterial({
      color: options.tone,
      size: options.size,
      map: roundSprite(kit),
      transparent: true,
      depthWrite: false,
      blending: options.glowing ? AdditiveBlending : NormalBlending,
    }),
  );

  const cloud = new Points(geometry, material);
  cloud.frustumCulled = false;
  const height = options.ceiling - options.floor;

  kit.animate((seconds) => {
    for (let index = 0; index < options.count; index += 1) {
      const x = seeds[index * 4]!;
      const z = seeds[index * 4 + 1]!;
      const phase = seeds[index * 4 + 2]!;
      const pace = seeds[index * 4 + 3]!;
      const travel = (((phase * height + seconds * options.fall * pace) % height) + height) % height;
      const y = options.fall === 0 ? options.floor + phase * height + Math.sin(seconds * pace + phase * 9) * 2 : options.ceiling - travel;

      attribute.setXYZ(
        index,
        x + Math.sin(seconds * 0.7 * pace + phase * 20) * options.sway,
        y,
        z + Math.cos(seconds * 0.6 * pace + phase * 15) * options.sway,
      );
    }

    attribute.needsUpdate = true;
  });

  return cloud;
}

export function pool(kit: PropKit, radius: number, tone: ColorRepresentation, rim: ColorRepresentation): Group {
  const water = kit.solid(new CircleGeometry(radius, 28), kit.surface(tone, { roughness: 0.2, emissive: tone, glow: 0.12 }), 0, 0.35, 0);
  water.rotation.x = -Math.PI / 2;
  water.castShadow = false;

  const basin = kit.group(water);
  const stones = Math.round(radius * 1.2);

  for (let index = 0; index < stones; index += 1) {
    const angle = (index / stones) * Math.PI * 2;
    const stone = rock(kit, kit.between(1.6, 2.6), rim, 0.55);
    stone.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    basin.add(stone);
  }

  return basin;
}

export function snowcap(kit: PropKit, width: number, depth: number): Mesh {
  const cap = kit.solid(new IcosahedronGeometry(1, 1), kit.surface("#f5f9fd"));
  cap.scale.set(width / 2, Math.min(width, depth) * 0.14, depth / 2);

  return cap;
}

export function stripeTexture(kit: PropKit, tones: readonly string[], count: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 8;
  const context = canvas.getContext("2d")!;
  const band = canvas.width / count;

  for (let index = 0; index < count; index += 1) {
    context.fillStyle = tones[index % tones.length]!;
    context.fillRect(index * band, 0, band + 1, canvas.height);
  }

  const texture = kit.keep(new CanvasTexture(canvas));
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;

  return texture;
}

export function banner(kit: PropKit, height: number, cloth: ColorRepresentation, trim: ColorRepresentation): Group {
  const width = height * 0.22;
  const drop = height * 0.42;
  const wood = kit.surface(WOOD_DARK);
  const sheet = kit.keep(new PlaneGeometry(width, drop, 2, 8));
  sheet.translate(0, -drop / 2, 0);
  const hang = kit.solid(sheet, kit.surface(cloth, { twoSided: true }), 0, height - 1.2, 0.5);
  const hem = kit.solid(new BoxGeometry(width, drop * 0.08, 0.2), kit.surface(trim), 0, height - 1.2 - drop * 0.92, 0.5);

  const position = sheet.getAttribute("position");
  const rest = Float32Array.from(position.array);
  const phase = kit.between(0, 6);

  kit.animate((seconds) => {
    for (let index = 0; index < position.count; index += 1) {
      const y = rest[index * 3 + 1]!;
      const reach = -y / drop;
      position.setZ(index, Math.sin(seconds * 1.8 + phase + y * 0.25) * 0.8 * reach);
    }

    position.needsUpdate = true;
  });

  kit.animate((seconds) => {
    hem.position.z = 0.5 + Math.sin(seconds * 1.8 + phase - drop * 0.23) * 0.8;
  });

  return kit.group(
    kit.solid(new CylinderGeometry(0.35, 0.45, height, 6), wood, 0, height / 2, 0),
    kit.solid(new BoxGeometry(width + 1.2, 0.5, 0.5), wood, 0, height - 1.2, 0.5),
    kit.solid(new SphereGeometry(0.6, 8, 6), kit.surface(GOLD, { metalness: 0.5, roughness: 0.4 }), 0, height + 0.3, 0),
    hang,
    hem,
  );
}

export function drum(kit: PropKit, radius: number, height: number, tone: ColorRepresentation): Group {
  return kit.group(kit.solid(new CylinderGeometry(radius, radius * 1.02, height, 10), kit.surface(tone), 0, height / 2, 0));
}
