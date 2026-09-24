import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Group,
  type Object3D,
} from "three";
import type { EnvironmentTheme } from "../environment.js";
import { terrainGeometry } from "../forms.js";
import type { PropKit } from "../prop-kit.js";
import {
  banner,
  barrel,
  campfire,
  crate,
  drift,
  logSeat,
  place,
  rock,
  snowcap,
  strut,
  WOOD_DARK,
  WOOD_DEEP,
} from "../props.js";

const SNOW_TOP = -3.4;

const PINE_GREENS = ["#2f6b4f", "#3a7a58", "#2a5f47"];

function pine(kit: PropKit, height: number): Group {
  const tree = kit.group(
    kit.solid(new CylinderGeometry(height * 0.03, height * 0.045, height * 0.28, 6), kit.surface("#6b4a2e"), 0, height * 0.14, 0),
  );

  const snow = kit.surface("#f4f8fc");

  for (let tier = 0; tier < 4; tier += 1) {
    const radius = height * 0.25 * (1 - tier * 0.2);
    const tall = height * 0.34;
    const base = height * 0.16 + tier * height * 0.19;
    tree.add(kit.solid(new ConeGeometry(radius, tall, 7), kit.surface(PINE_GREENS[tier % PINE_GREENS.length]!), 0, base + tall / 2, 0));
    tree.add(kit.solid(new ConeGeometry(radius * 0.7, tall * 0.42, 7), snow, 0, base + tall * 0.78, 0));
  }

  return tree;
}

function ridgeTentGeometry(length: number, width: number, height: number): BufferGeometry {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const backLeft = [-halfLength, 0, -halfWidth];
  const backRight = [halfLength, 0, -halfWidth];
  const ridgeRight = [halfLength, height, 0];
  const ridgeLeft = [-halfLength, height, 0];
  const frontRight = [halfLength, 0, halfWidth];
  const frontLeft = [-halfLength, 0, halfWidth];

  const geometry = new BufferGeometry();

  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        ...backLeft, ...backRight, ...ridgeRight, ...backLeft, ...ridgeRight, ...ridgeLeft,
        ...frontLeft, ...ridgeLeft, ...ridgeRight, ...frontLeft, ...ridgeRight, ...frontRight,
        ...backRight, ...frontRight, ...ridgeRight,
        ...backLeft, ...ridgeLeft, ...frontLeft,
      ],
      3,
    ),
  );

  geometry.computeVertexNormals();

  return geometry;
}

function ridgeTent(kit: PropKit, canvas: string, flap: string): Group {
  const length = 14;
  const height = 8;
  const pole = kit.surface(WOOD_DEEP);

  const tent = kit.group(
    kit.solid(ridgeTentGeometry(length, 11, height), kit.surface(canvas, { twoSided: true })),
    kit.solid(new BoxGeometry(length + 0.6, 0.7, 1.6), kit.surface("#f4f8fc"), 0, height - 0.1, 0),
  );

  for (const x of [-length / 2 - 0.2, length / 2 + 0.2]) {
    tent.add(kit.solid(new CylinderGeometry(0.25, 0.25, height + 2, 5), pole, x, (height + 2) / 2, 0));
  }

  const door = kit.solid(ridgeTentGeometry(0.2, 5, height * 0.7), kit.surface(flap, { twoSided: true }), length / 2 + 0.05, 0, 0);
  tent.add(door);

  return tent;
}

function watchtower(kit: PropKit): Group {
  const wood = kit.surface(WOOD_DARK);
  const tower = kit.group();
  const deck = 18;

  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      tower.add(strut(kit, new Vector3(x * 5.5, 0, z * 5.5), new Vector3(x * 4, deck, z * 4), 0.6, 0.5, wood, 6));
      tower.add(strut(kit, new Vector3(x * 4, deck, z * 4), new Vector3(x * 4, deck + 6.5, z * 4), 0.35, 0.35, wood, 5));
    }
  }

  tower.add(kit.solid(new BoxGeometry(11, 1, 11), kit.surface("#8a5a33"), 0, deck, 0));

  for (const [x, z, width, depth] of [
    [0, -5, 10, 0.4],
    [0, 5, 10, 0.4],
    [-5, 0, 0.4, 10],
    [5, 0, 0.4, 10],
  ] satisfies [number, number, number, number][]) {
    tower.add(kit.solid(new BoxGeometry(width, 0.5, depth), wood, x, deck + 2.6, z));
  }

  const roof = kit.solid(new ConeGeometry(8.6, 5.5, 4), kit.surface("#5b3b27"), 0, deck + 9.2, 0);
  roof.rotation.y = Math.PI / 4;
  const cap = kit.solid(new ConeGeometry(6.2, 3, 4), kit.surface("#f4f8fc"), 0, deck + 10.6, 0);
  cap.rotation.y = Math.PI / 4;

  tower.add(roof, cap, place(banner(kit, 9, "#3b6fb6", "#f4efe1"), 0, deck + 11, 0));

  return tower;
}

function sled(kit: PropKit): Group {
  const wood = kit.surface("#9b6a3e");
  const runner = new BoxGeometry(15, 0.45, 0.6);
  const cart = kit.group(kit.solid(new BoxGeometry(12.5, 0.6, 7.2), wood, 0, 1.9, 0));

  for (const z of [-3.2, 3.2]) {
    cart.add(kit.solid(runner, kit.surface(WOOD_DEEP), 0, 0.3, z));
    const curl = kit.solid(new BoxGeometry(3, 0.45, 0.6), kit.surface(WOOD_DEEP), 8.2, 1.2, z);
    curl.rotation.z = 0.7;
    cart.add(curl);

    for (const x of [-4.5, 4.5]) {
      cart.add(kit.solid(new BoxGeometry(0.5, 1.4, 0.5), wood, x, 1, z));
    }
  }

  cart.add(
    place(crate(kit, 4.6), -3, 2.2, 0, 0.2),
    place(crate(kit, 3.8, "#b88246"), 2, 2.2, 0.8, -0.3),
    place(snowcap(kit, 4.6, 4.6), -3, 7, 0),
  );

  return cart;
}

function iceCrystals(kit: PropKit, size: number): Group {
  const surface = kit.surface("#aeeaff", { emissive: "#4fc3ec", glow: 0.55, roughness: 0.18, metalness: 0.1 });
  const cluster = kit.group();
  const shard = new OctahedronGeometry(1, 0);

  for (let index = 0; index < 5; index += 1) {
    const tall = size * kit.between(0.55, 1);
    const piece = kit.solid(shard, surface, kit.between(-1.6, 1.6) * size * 0.3, tall * 0.9, kit.between(-1.6, 1.6) * size * 0.3);
    piece.scale.set(size * 0.22, tall, size * 0.22);
    piece.rotation.set(kit.between(-0.35, 0.35), kit.between(0, Math.PI), kit.between(-0.35, 0.35));
    cluster.add(piece);
  }

  return cluster;
}

function snowman(kit: PropKit): Group {
  const snow = kit.surface("#f7fafd", { smooth: true });
  const coal = kit.surface("#23252b");
  const stick = kit.surface("#6b4a2e");

  const figure = kit.group(
    kit.solid(new SphereGeometry(3.4, 14, 10), snow, 0, 3, 0),
    kit.solid(new SphereGeometry(2.5, 14, 10), snow, 0, 7.6, 0),
    kit.solid(new SphereGeometry(1.8, 14, 10), snow, 0, 11.2, 0),
    kit.solid(new CylinderGeometry(1.3, 1.3, 2, 10), coal, 0, 13.6, 0),
    kit.solid(new CylinderGeometry(2, 2, 0.3, 12), coal, 0, 12.7, 0),
  );

  const scarf = kit.solid(new TorusGeometry(1.9, 0.45, 6, 14), kit.surface("#7b5ea7"), 0, 9.6, 0);
  scarf.rotation.x = Math.PI / 2;
  const nose = kit.solid(new ConeGeometry(0.35, 2.2, 6), kit.surface("#f28a2e"), 0, 11.2, 2.6);
  nose.rotation.x = Math.PI / 2;

  figure.add(scarf, nose);

  for (const x of [-0.65, 0.65]) {
    figure.add(kit.solid(new SphereGeometry(0.25, 6, 5), coal, x, 11.8, 1.6));
  }

  for (const y of [6.6, 7.8, 9]) {
    figure.add(kit.solid(new SphereGeometry(0.28, 6, 5), coal, 0, y, 2.4));
  }

  for (const side of [-1, 1]) {
    figure.add(strut(kit, new Vector3(side * 2.1, 8.2, 0), new Vector3(side * 5.4, 10.6, 0.4), 0.18, 0.12, stick, 5));
  }

  return figure;
}

function frozenPond(kit: PropKit, radius: number): Group {
  const ice = kit.solid(new CircleGeometry(radius, 32), kit.surface("#8fd3ee", { roughness: 0.1, metalness: 0.08, emissive: "#3fa9d6", glow: 0.25 }), 0, 0.6, 0);
  ice.rotation.x = -Math.PI / 2;
  ice.castShadow = false;
  const pond = kit.group(ice);

  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    pond.add(place(rock(kit, kit.between(2.2, 3.4), "#e9f1f8", 0.5), Math.cos(angle) * radius, 0.4, Math.sin(angle) * radius));
  }

  return pond;
}

function camp(kit: PropKit): Object3D {
  return kit.group(
    campfire(kit, 1.2),
    place(logSeat(kit, 7), -7.5, 0, 1.5, 0.3),
    place(logSeat(kit, 6), 5.5, 0, -6, -0.8),
    place(snowcap(kit, 6, 2.4), -7.5, 2.2, 1.5, 0.3),
  );
}

export const frostTheme: EnvironmentTheme = {
  id: "frost",
  name: "Frostpeak Garrison",
  story: "A snowed-in outpost where the garrison settles its grudges",
  swatch: "#bfe3f7",
  seed: 23,
  stage: {
    board: {
      tileLight: "#e1e8f0",
      tileDark: "#c8d3df",
      grout: "#5d6b7e",
      frame: "#4b566a",
      caps: "#cdd8e6",
      capsMetalness: 0.55,
      plinth: "#566377",
    },
    atmosphere: {
      backdrop: "#c6d8ea",
      fogBeyond: 130,
      fogDepth: 600,
      skyLight: "#eef6ff",
      groundLight: "#9fb3c8",
      ambient: 1.35,
      sun: "#ffe6c8",
      sunIntensity: 2.3,
      rim: "#b9d6ff",
      rimIntensity: 1,
      exposure: 1.02,
      shadowReach: 135,
      glowFloor: false,
    },
  },
  build(kit) {
    const snowfield = kit.solid(
      terrainGeometry(kit, {
        size: 1200,
        segments: 90,
        height: 14,
        flatRadius: 52,
        rampWidth: 60,
        low: "#d3dfec",
        high: "#f6f9fc",
        clearings: [{ x: 80, z: 20, radius: 30 }],
      }),
      kit.surface("#ffffff", { tinted: true }),
      0,
      SNOW_TOP,
      0,
    );

    snowfield.castShadow = false;

    const crateStack = kit.group(
      crate(kit, 6.5),
      place(crate(kit, 5.6, "#b88246"), 7, 0, 2, -0.4),
      place(crate(kit, 5, "#a8783f"), 1, 6.5, 0.5, 0.3),
      place(snowcap(kit, 5.4, 5.4), 1, 11.6, 0.5),
      place(snowcap(kit, 5.8, 5.8), 7, 5.7, 2),
    );

    return kit.group(
      snowfield,
      drift(kit, { count: 520, spread: 150, floor: -4, ceiling: 70, fall: 6, sway: 2.2, size: 1.9, tone: "#ffffff", glowing: false }),
      place(pine(kit, 22), -54, SNOW_TOP, -40),
      place(pine(kit, 18), 54, SNOW_TOP, 44),
      place(pine(kit, 20), 58, SNOW_TOP, -46),
      place(ridgeTent(kit, "#d9cba6", "#8c6a44"), -66, SNOW_TOP, -10, -Math.PI / 2 + 0.35),
      place(ridgeTent(kit, "#c7b58c", "#7b5a38"), -76, SNOW_TOP, 26, -Math.PI / 2 - 0.3),
      place(camp(kit), -56, SNOW_TOP, 8),
      place(crateStack, -64, SNOW_TOP, 44, 0.3),
      place(barrel(kit, 6), -50, SNOW_TOP, 50),
      place(snowcap(kit, 4.4, 4.4), -50, SNOW_TOP + 6.1, 50),
      place(watchtower(kit), -52, SNOW_TOP, -66, 0.3),
      place(banner(kit, 16, "#3b6fb6", "#f4efe1"), -46, SNOW_TOP, -50),
      place(banner(kit, 16, "#3b6fb6", "#f4efe1"), 46, SNOW_TOP, -50),
      place(pine(kit, 36), -92, SNOW_TOP, -46),
      place(pine(kit, 30), -104, SNOW_TOP, -8),
      place(pine(kit, 40), -18, SNOW_TOP, -80),
      place(pine(kit, 34), 8, SNOW_TOP, -94),
      place(pine(kit, 38), 34, SNOW_TOP, -74),
      place(pine(kit, 28), 64, SNOW_TOP, -62),
      place(pine(kit, 42), -74, SNOW_TOP, -96),
      place(pine(kit, 36), 96, SNOW_TOP, -86),
      place(pine(kit, 32), 102, SNOW_TOP, -24),
      place(pine(kit, 30), 108, SNOW_TOP, 58),
      place(pine(kit, 26), -106, SNOW_TOP, 58),
      place(frozenPond(kit, 21), 80, SNOW_TOP, 20),
      place(iceCrystals(kit, 7), 62, SNOW_TOP, -14),
      place(iceCrystals(kit, 5), 98, SNOW_TOP, 44),
      place(iceCrystals(kit, 4), 56, SNOW_TOP, 48),
      place(sled(kit), 70, SNOW_TOP, -38, -0.4),
      place(snowman(kit), -52, SNOW_TOP, 56, 0.5),
      place(rock(kit, 4, "#8a93a3"), 60, SNOW_TOP, 60),
      place(snowcap(kit, 6.5, 6.5), 60, SNOW_TOP + 2.4, 60),
    );
  },
};
