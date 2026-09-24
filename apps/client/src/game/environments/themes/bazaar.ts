import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Group,
  type Object3D,
} from "three";
import type { EnvironmentTheme } from "../environment.js";
import { latheGeometry, terrainGeometry } from "../forms.js";
import type { PropKit } from "../prop-kit.js";
import {
  crate,
  drift,
  grassTuft,
  palmTree,
  place,
  pool,
  rock,
  stripeTexture,
  strut,
  WOOD_DARK,
  WOOD_DEEP,
} from "../props.js";

const SAND_TOP = -3.4;

const SANDSTONE = "#d9a766";

const FRUIT = ["#ff9f1c", "#ffd23f", "#8ac926", "#c05299"];

const REEDS = ["#7aa83d", "#8fbf4a", "#5f8f34"];

function pot(kit: PropKit, tone: string, height: number): Object3D {
  return kit.solid(
    latheGeometry(
      [
        [0, 0],
        [height * 0.2, 0],
        [height * 0.34, height * 0.25],
        [height * 0.36, height * 0.5],
        [height * 0.22, height * 0.8],
        [height * 0.16, height * 0.88],
        [height * 0.2, height],
        [0, height],
      ],
      9,
    ),
    kit.surface(tone),
  );
}

function pottery(kit: PropKit): Group {
  const tones = ["#c9653a", "#b8552f", "#2f9fa0", "#e0a458"];

  return kit.group(
    place(pot(kit, kit.pick(tones), 6), 0, 0, 0),
    place(pot(kit, kit.pick(tones), 4.6), 3.6, 0, 1.4),
    place(pot(kit, kit.pick(tones), 3.8), -2.2, 0, 3),
    place(pot(kit, kit.pick(tones), 5.2), 1.4, 0, -3.2),
  );
}

function rugTexture(kit: PropKit, field: string, border: string, motif: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.fillStyle = border;
  context.fillRect(0, 0, 64, 96);
  context.fillStyle = field;
  context.fillRect(6, 6, 52, 84);
  context.fillStyle = motif;

  for (const y of [22, 48, 74]) {
    context.beginPath();
    context.moveTo(32, y - 10);
    context.lineTo(44, y);
    context.lineTo(32, y + 10);
    context.lineTo(20, y);
    context.closePath();
    context.fill();
  }

  const texture = kit.keep(new CanvasTexture(canvas));
  texture.colorSpace = SRGBColorSpace;

  return texture;
}

function rug(kit: PropKit, field: string, border: string, motif: string): Object3D {
  return kit.solid(new BoxGeometry(9, 0.25, 13), kit.surface("#ffffff", { map: rugTexture(kit, field, border, motif) }), 0, 0.13, 0);
}

function stall(kit: PropKit, stripes: readonly string[]): Group {
  const post = new CylinderGeometry(0.4, 0.45, 11, 6);
  const wood = kit.surface(WOOD_DARK);
  const booth = kit.group(kit.solid(new BoxGeometry(14, 3.6, 5), kit.surface("#a8743f"), 0, 1.8, 2));

  for (const x of [-7, 7]) {
    for (const z of [-4, 4.6]) {
      booth.add(kit.solid(post, wood, x, z > 0 ? 4.5 : 5.5, z));
    }
  }

  const awning = kit.solid(new PlaneGeometry(16, 11, 1, 1), kit.surface("#ffffff", { map: stripeTexture(kit, stripes, 12), twoSided: true }), 0, 10.6, 0.4);
  awning.rotation.x = -Math.PI / 2 + 0.32;

  const valance = kit.solid(new BoxGeometry(16, 1.2, 0.3), kit.surface(stripes[0]!), 0, 8.8, 5.6);

  booth.add(awning, valance);

  for (let index = 0; index < 9; index += 1) {
    booth.add(kit.solid(new SphereGeometry(0.75, 7, 5), kit.surface(kit.pick(FRUIT)), kit.between(-5.5, 5.5), 3.9, kit.between(0.6, 3.4)));
  }

  booth.add(place(pot(kit, "#2f9fa0", 3), -4.5, 3.6, 1.5), place(pot(kit, "#c9653a", 2.6), 4.8, 3.6, 2.8));

  return booth;
}

function cactus(kit: PropKit, height: number): Group {
  const green = kit.surface("#5a9a4a");
  const trunk = kit.solid(new CapsuleGeometry(height * 0.1, height * 0.8, 3, 8), green, 0, height * 0.5, 0);
  const plant = kit.group(trunk);

  for (const side of [-1, 1]) {
    const elbowY = height * kit.between(0.35, 0.55);
    const reach = height * 0.22;
    plant.add(strut(kit, new Vector3(0, elbowY, 0), new Vector3(side * reach, elbowY + height * 0.04, 0), height * 0.07, height * 0.07, green, 7));
    plant.add(kit.solid(new CapsuleGeometry(height * 0.07, height * 0.26, 3, 8), green, side * reach, elbowY + height * 0.17, 0));
  }

  plant.add(kit.solid(new SphereGeometry(height * 0.07, 6, 4), kit.surface("#ff7eb6"), 0, height * 1.02, 0));

  return plant;
}

function archway(kit: PropKit): Group {
  const stone = kit.surface(SANDSTONE);
  const tile = kit.surface("#2fb3ad", { roughness: 0.4 });
  const gate = kit.group();

  for (const x of [-9, 9]) {
    gate.add(kit.solid(new BoxGeometry(5, 20, 5), stone, x, 10, 0), kit.solid(new BoxGeometry(6, 1.4, 6), tile, x, 20.4, 0));
  }

  const arch = kit.solid(new TorusGeometry(9, 2.5, 6, 14, Math.PI), stone, 0, 20.4, 0);
  const trim = kit.solid(new TorusGeometry(9, 0.7, 5, 14, Math.PI), tile, 0, 20.4, 2.4);

  gate.add(arch, trim, kit.solid(new BoxGeometry(8, 3, 3), stone, 0, 31.5, 0));

  return gate;
}

function lanternString(kit: PropKit, span: number, sag: number): Group {
  const line = kit.group();
  const rope = kit.surface("#5b3a1f");
  const glows = ["#ffcf5c", "#ff9f45", "#7fe0d0", "#ff8fb1"];
  const steps = 10;
  let previous = new Vector3(-span / 2, 0, 0);

  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    const point = new Vector3(-span / 2 + span * progress, -sag * Math.sin(Math.PI * progress), 0);
    line.add(strut(kit, previous, point, 0.12, 0.12, rope, 4));

    if (index < steps) {
      const tone = kit.pick(glows);
      line.add(kit.solid(new BoxGeometry(1.1, 1.5, 1.1), kit.surface(tone, { emissive: tone, glow: 1.3 }), point.x, point.y - 1.3, 0));
    }

    previous = point;
  }

  const wood = kit.surface(WOOD_DEEP);
  const ends = kit.group(line);

  for (const x of [-span / 2, span / 2]) {
    ends.add(kit.solid(new CylinderGeometry(0.4, 0.5, 20, 6), wood, x, -10, 0));
  }

  return ends;
}

function well(kit: PropKit): Group {
  const wood = kit.surface(WOOD_DARK);
  const water = kit.solid(new CylinderGeometry(3.6, 3.6, 0.3, 12), kit.surface("#1f6f78", { roughness: 0.2 }), 0, 1.2, 0);
  water.castShadow = false;
  const rim = kit.solid(new TorusGeometry(4.2, 0.7, 5, 14), kit.surface("#2fb3ad", { roughness: 0.4 }), 0, 4.2, 0);
  rim.rotation.x = Math.PI / 2;

  const shaft = kit.group(
    kit.solid(new CylinderGeometry(4.2, 4.6, 4.2, 12, 1, true), kit.surface(SANDSTONE, { twoSided: true }), 0, 2.1, 0),
    rim,
    water,
    kit.solid(new BoxGeometry(10.5, 0.7, 0.7), wood, 0, 10.4, 0),
    kit.solid(new CylinderGeometry(0.9, 0.7, 1.6, 8), kit.surface("#8a5a33"), 1.4, 6.6, 0),
    strut(kit, new Vector3(1.4, 10.1, 0), new Vector3(1.4, 7.4, 0), 0.08, 0.08, kit.surface("#5b3a1f"), 4),
  );

  for (const x of [-5, 5]) {
    shaft.add(kit.solid(new BoxGeometry(0.8, 10.8, 0.8), wood, x, 5.4, 0));
  }

  return shaft;
}

function rolledCarpets(kit: PropKit): Group {
  const tones = ["#9b2d3a", "#2a4d8f", "#e9c46a", "#2a9d8f"];
  const pile = kit.group();

  tones.forEach((tone, index) => {
    const roll = kit.solid(new CylinderGeometry(0.9, 0.9, 8, 8), kit.surface(tone), 0, 0.9 + (index >= 3 ? 1.6 : 0), (index % 3) * 1.9 - 1.9 + (index >= 3 ? 0.95 : 0));
    roll.rotation.z = Math.PI / 2;
    pile.add(roll);
  });

  return pile;
}

function fruitCrate(kit: PropKit): Group {
  const box = crate(kit, 5);

  for (let index = 0; index < 6; index += 1) {
    box.add(kit.solid(new SphereGeometry(0.85, 7, 5), kit.surface(kit.pick(FRUIT)), kit.between(-1.5, 1.5), 5.4, kit.between(-1.5, 1.5)));
  }

  return box;
}

export const bazaarTheme: EnvironmentTheme = {
  id: "bazaar",
  name: "Sunscorch Bazaar",
  story: "Merchants close their stalls when the champions arrive",
  swatch: "#e8a84f",
  seed: 59,
  stage: {
    board: {
      tileLight: "#ecc596",
      tileDark: "#d9ab78",
      grout: "#7a4b2c",
      frame: "#b3793f",
      caps: "#2fb3ad",
      capsMetalness: 0.2,
      plinth: "#a36a3c",
    },
    atmosphere: {
      backdrop: "#f1c796",
      fogBeyond: 130,
      fogDepth: 620,
      skyLight: "#fff2dc",
      groundLight: "#c07a3e",
      ambient: 1.25,
      sun: "#ffdcaa",
      sunIntensity: 2.8,
      rim: "#ffb77a",
      rimIntensity: 1,
      exposure: 1,
      shadowReach: 135,
      glowFloor: false,
    },
  },
  build(kit) {
    const dunes = kit.solid(
      terrainGeometry(kit, {
        size: 1200,
        segments: 90,
        height: 18,
        flatRadius: 70,
        rampWidth: 80,
        low: "#d99a5b",
        high: "#f3c887",
        clearings: [{ x: 84, z: -22, radius: 34 }],
      }),
      kit.surface("#ffffff", { tinted: true }),
      0,
      SAND_TOP,
      0,
    );

    dunes.castShadow = false;

    return kit.group(
      dunes,
      drift(kit, { count: 90, spread: 140, floor: 0, ceiling: 20, fall: -1.5, sway: 8, size: 0.9, tone: "#f7d9a8", glowing: false }),
      place(stall(kit, ["#2a9d8f", "#f4efe1"]), -64, SAND_TOP, -8, 1.35),
      place(stall(kit, ["#e76f51", "#f4efe1"]), -70, SAND_TOP, 32, 1.75),
      place(stall(kit, ["#7b5ea7", "#f4efe1"]), 18, SAND_TOP, -66, 0.1),
      place(rug(kit, "#9b2d3a", "#f2b84b", "#2a9d8f"), -52, SAND_TOP, 14, 0.2),
      place(rug(kit, "#2a4d8f", "#e9c46a", "#f4efe1"), -54, SAND_TOP, 50, -0.3),
      place(pottery(kit), -52, SAND_TOP, -34),
      place(pottery(kit), 56, SAND_TOP, 44),
      place(fruitCrate(kit), -48, SAND_TOP, 32, 0.4),
      place(fruitCrate(kit), 0, SAND_TOP, -58, -0.2),
      place(crate(kit, 6), 7, SAND_TOP, -60, 0.5),
      place(archway(kit), -30, SAND_TOP, -70, 0.15),
      place(lanternString(kit, 64, 4), -2, SAND_TOP + 20, -52),
      place(pool(kit, 20, "#43c6c9", "#c9a26b"), 84, SAND_TOP, -22),
      place(palmTree(kit, 34, 0.18), 72, SAND_TOP, -46, 0.5),
      place(palmTree(kit, 30, 0.22), 102, SAND_TOP, -6, 2.6),
      place(palmTree(kit, 28, 0.2), 96, SAND_TOP, -44, 1.4),
      place(grassTuft(kit, 4, REEDS), 70, SAND_TOP, -12),
      place(grassTuft(kit, 5, REEDS), 98, SAND_TOP, -30),
      place(grassTuft(kit, 4, REEDS), 80, SAND_TOP, -2),
      place(cactus(kit, 12), 64, SAND_TOP, 22),
      place(cactus(kit, 9), 74, SAND_TOP, 54),
      place(cactus(kit, 14), -96, SAND_TOP, -40),
      place(well(kit), 60, SAND_TOP, 26, 0.3),
      place(rolledCarpets(kit), -46, SAND_TOP, -18, 0.3),
      place(pottery(kit), 80, SAND_TOP, 12),
      place(fruitCrate(kit), 70, SAND_TOP, 46, 0.7),
      place(rock(kit, 5, "#c7925a"), 60, SAND_TOP, 62),
      place(rock(kit, 4, "#b98450"), -84, SAND_TOP, 62),
    );
  },
};
