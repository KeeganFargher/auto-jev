import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Object3D,
} from "three";
import type { EnvironmentTheme } from "../environment.js";
import { frondGeometry, rockGeometry, terrainGeometry } from "../forms.js";
import type { PropKit } from "../prop-kit.js";
import { bush, drift, drum, fire, grassTuft, place, rock, strut } from "../props.js";

const FLOOR = -3.6;

const STONE = "#9c9884";

const STONE_DARK = "#7f7c6b";

const MOSS = ["#5f8f3e", "#4f7f36", "#6fa347"];

const CANOPY = ["#3f7d3a", "#4f9a45", "#5eab4e", "#367034"];

function mossPatch(kit: PropKit, width: number): Object3D {
  const patch = kit.solid(new IcosahedronGeometry(1, 1), kit.surface(kit.pick(MOSS)));
  patch.scale.set(width / 2, width * 0.12, width / 2);

  return patch;
}

function pillar(kit: PropKit, drums: number, broken: boolean): Group {
  const column = kit.group();
  const height = 4.4;

  for (let index = 0; index < drums; index += 1) {
    const piece = place(drum(kit, 3.2, height, index % 2 === 0 ? STONE : "#a7a38e"), kit.between(-0.25, 0.25), index * height, kit.between(-0.25, 0.25), kit.between(0, 1));

    if (broken && index === drums - 1) {
      piece.rotation.set(0.18, 0.4, -0.22);
    }

    column.add(piece);
  }

  const top = drums * height;

  if (!broken) {
    column.add(kit.solid(new BoxGeometry(8.4, 2, 8.4), kit.surface(STONE_DARK), 0, top + 1, 0));
    column.add(place(mossPatch(kit, 7), 0.6, top + 2.1, -0.4));
  } else {
    column.add(place(mossPatch(kit, 5.5), 0, top - 0.4, 0));
  }

  column.add(kit.solid(new BoxGeometry(8.2, 1.6, 8.2), kit.surface(STONE_DARK), 0, 0.8, 0));

  return column;
}

function fallenDrum(kit: PropKit): Group {
  const piece = drum(kit, 3.2, 4.4, STONE);
  piece.rotation.z = Math.PI / 2;
  piece.position.y = 3.2;

  return kit.group(piece, place(mossPatch(kit, 3.5), 0.5, 6.1, 0.2));
}

function idol(kit: PropKit): Group {
  const stone = kit.surface("#8f8b77");
  const deep = kit.surface("#5f5c4e");
  const eyes = kit.surface("#7ff3e0", { emissive: "#3fe0c6", glow: 1.6 });

  const head = kit.group(
    kit.solid(new BoxGeometry(18, 3, 16), kit.surface(STONE_DARK), 0, 1.5, 0),
    kit.solid(new BoxGeometry(15, 20, 12), stone, 0, 13, 0),
    kit.solid(new BoxGeometry(16.5, 2.6, 3), deep, 0, 17.4, 5.8),
    kit.solid(new BoxGeometry(3.4, 7, 3.6), stone, 0, 12.6, 6.8),
    kit.solid(new BoxGeometry(9, 1.6, 1.4), deep, 0, 7.4, 6.2),
    kit.solid(new BoxGeometry(17, 3, 13), kit.surface(STONE_DARK), 0, 24.4, 0),
    kit.solid(new ConeGeometry(4.5, 5, 4), kit.surface("#b09a58", { metalness: 0.3, roughness: 0.5 }), 0, 28.4, 0),
  );

  for (const x of [-3.9, 3.9]) {
    head.add(kit.solid(new BoxGeometry(3.2, 1.6, 1), eyes, x, 15.4, 6.1));
    head.add(kit.solid(new BoxGeometry(2.4, 6, 3), stone, x * 2.1, 13, 1));
  }

  head.add(place(mossPatch(kit, 12), -1.5, 26, 0.5), place(mossPatch(kit, 5), 5, 19, 5.8));

  for (let index = 0; index < 4; index += 1) {
    const start = new Vector3(kit.between(-6, 6), 25.5, kit.between(4, 6.5));
    head.add(strut(kit, start, start.clone().add(new Vector3(kit.between(-0.6, 0.6), -kit.between(6, 13), 0.4)), 0.28, 0.2, kit.surface("#4f8a3a"), 5));
  }

  return head;
}

function brazier(kit: PropKit, light: number): Group {
  const bowl = kit.solid(new CylinderGeometry(2.6, 1.4, 1.8, 8, 1, true), kit.surface("#9b7a3a", { metalness: 0.45, roughness: 0.45, twoSided: true }), 0, 7.2, 0);

  return kit.group(
    kit.solid(new BoxGeometry(4.4, 1.2, 4.4), kit.surface(STONE_DARK), 0, 0.6, 0),
    kit.solid(new CylinderGeometry(1.2, 1.6, 5.8, 8), kit.surface(STONE), 0, 3.6, 0),
    bowl,
    place(fire(kit, 1.3, light), 0, 7.1, 0),
  );
}

function jungleTree(kit: PropKit, height: number): Group {
  const bark = kit.surface("#6e5236");
  const tree = kit.group();
  const lean = new Vector3(kit.between(-3, 3), height * 0.62, kit.between(-3, 3));
  tree.add(strut(kit, new Vector3(0, 0, 0), lean, height * 0.07, height * 0.045, bark, 7));

  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2 + 0.4;
    tree.add(strut(kit, new Vector3(Math.cos(angle) * height * 0.13, 0, Math.sin(angle) * height * 0.13), new Vector3(0, height * 0.16, 0), height * 0.035, height * 0.02, bark, 5));
  }

  const blob = new IcosahedronGeometry(1, 1);

  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2 + kit.between(0, 1);
    const size = height * kit.between(0.2, 0.28);
    const lump = kit.solid(blob, kit.surface(kit.pick(CANOPY)), lean.x + Math.cos(angle) * height * 0.18, lean.y + kit.between(-1, 4), lean.z + Math.sin(angle) * height * 0.18);
    lump.scale.set(size, size * 0.72, size);
    tree.add(lump);
  }

  tree.add(place(kit.solid(blob, kit.surface(kit.pick(CANOPY))), lean.x, lean.y + height * 0.12, lean.z, 0, height * 0.24));

  for (let index = 0; index < 5; index += 1) {
    const x = lean.x + kit.between(-height * 0.25, height * 0.25);
    const z = lean.z + kit.between(-height * 0.25, height * 0.25);
    tree.add(strut(kit, new Vector3(x, lean.y - 1, z), new Vector3(x + kit.between(-0.5, 0.5), lean.y - kit.between(7, 14), z), 0.22, 0.16, kit.surface("#4f8a3a"), 4));
  }

  return tree;
}

function fern(kit: PropKit, size: number): Group {
  const leaf = frondGeometry(size, size * 0.34, size * 0.35, size * 0.55);
  const plant = kit.group();
  const count = 7;

  for (let index = 0; index < count; index += 1) {
    const frond = kit.solid(leaf, kit.surface(kit.pick(MOSS), { twoSided: true }), 0, 0.3, 0);
    frond.rotation.y = (index / count) * Math.PI * 2 + kit.between(-0.2, 0.2);
    plant.add(frond);
  }

  return plant;
}

function streamTexture(kit: PropKit): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#7fd4e6";
  context.fillRect(0, 0, 64, 128);

  for (let index = 0; index < 40; index += 1) {
    const x = kit.between(0, 64);
    const y = kit.between(0, 128);
    const length = kit.between(10, 40);
    context.fillStyle = `rgb(255 255 255 / ${kit.between(0.35, 0.9).toFixed(2)})`;

    for (const wrap of [0, -128]) {
      context.fillRect(x, y + wrap, kit.between(1, 3), length);
    }
  }

  const texture = kit.keep(new CanvasTexture(canvas));
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;

  return texture;
}

function waterfall(kit: PropKit, width: number, height: number): Group {
  const cliff = kit.group();
  const cliffStone = [kit.surface("#6f6d60"), kit.surface("#7d7a6b"), kit.surface("#646256")];

  for (let index = 0; index < 9; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const boulder = kit.solid(rockGeometry(kit, kit.between(7, 11), 1.1, 1), kit.pick(cliffStone), side * kit.between(width * 0.55, width * 0.95), kit.between(0, height * 0.8), kit.between(-8, -2));
    cliff.add(boulder);
  }

  cliff.add(kit.solid(new BoxGeometry(width * 1.6, height, 10), kit.pick(cliffStone), 0, height / 2, -8));

  const flow = streamTexture(kit);
  const fall = kit.solid(new PlaneGeometry(width, height, 1, 1), kit.surface("#ffffff", { map: flow, emissive: "#3fb7d6", glow: 0.25, opacity: 0.92 }), 0, height / 2, -2.6);
  fall.castShadow = false;
  const basin = kit.solid(new CircleGeometry(width * 0.9, 20), kit.surface("#5cc7dc", { roughness: 0.2 }), 0, 0.3, 4);
  basin.rotation.x = -Math.PI / 2;
  basin.castShadow = false;
  const foam = kit.solid(new CircleGeometry(width * 0.45, 16), kit.surface("#ffffff", { opacity: 0.65 }), 0, 0.45, 0.5);
  foam.rotation.x = -Math.PI / 2;
  foam.castShadow = false;

  kit.animate((seconds) => {
    flow.offset.y = seconds * 1.6;
    foam.scale.setScalar(1 + Math.sin(seconds * 5) * 0.06);
  });

  cliff.add(fall, basin, foam);

  for (let index = 0; index < 5; index += 1) {
    cliff.add(place(fern(kit, kit.between(4, 6)), kit.between(-width, width), kit.between(height * 0.6, height), kit.between(-6, -2)));
  }

  return cliff;
}

function pyramid(kit: PropKit): Group {
  const stone = [kit.surface("#8a8672"), kit.surface("#7c7866")];
  const temple = kit.group();

  for (let tier = 0; tier < 6; tier += 1) {
    const size = 90 - tier * 14;
    temple.add(kit.solid(new BoxGeometry(size, 9, size), stone[tier % 2]!, 0, tier * 9 + 4.5, 0));
  }

  temple.add(kit.solid(new BoxGeometry(16, 12, 14), kit.surface("#6d6a5a"), 0, 60, 0), kit.solid(new BoxGeometry(12, 22, 3), kit.surface("#8a8672"), 0, 27, 45));

  return temple;
}

function courtyard(kit: PropKit): Group {
  const plaza = kit.group();
  const slab = new BoxGeometry(9.2, 0.5, 9.2);
  const tones = [kit.surface("#9b9883"), kit.surface("#a8a590"), kit.surface("#8f8c78")];

  for (let x = -56; x <= 56; x += 10) {
    for (let z = -58; z <= 50; z += 10) {
      if (Math.abs(x) < 48 && z > -52 && z < 48) {
        continue;
      }

      const roll = kit.random();

      if (roll < 0.2) {
        plaza.add(place(grassTuft(kit, 2.5, MOSS), x, 0, z));
        continue;
      }

      if (roll < 0.28) {
        plaza.add(place(mossPatch(kit, 6), x, 0.2, z));
        continue;
      }

      const stoneTile = kit.solid(slab, kit.pick(tones), x + kit.between(-0.3, 0.3), 0.1 + kit.between(0, 0.2), z + kit.between(-0.3, 0.3));
      stoneTile.rotation.y = kit.between(-0.05, 0.05);
      plaza.add(stoneTile);
    }
  }

  return plaza;
}

export const ruinsTheme: EnvironmentTheme = {
  id: "ruins",
  name: "Sunken Temple",
  story: "An old king's courtyard, still watched by his idol",
  swatch: "#5f8f3e",
  seed: 41,
  stage: {
    board: {
      tileLight: "#b6b39b",
      tileDark: "#a09d86",
      grout: "#4f5a3f",
      frame: "#79766a",
      caps: "#8fb38a",
      capsMetalness: 0.35,
      plinth: "#6d6a5c",
    },
    atmosphere: {
      backdrop: "#88aa86",
      fogBeyond: 110,
      fogDepth: 520,
      skyLight: "#eef8d8",
      groundLight: "#3e5e31",
      ambient: 1.25,
      sun: "#ffe0a3",
      sunIntensity: 2.5,
      rim: "#bfe6a4",
      rimIntensity: 0.9,
      exposure: 1.02,
      shadowReach: 135,
      glowFloor: false,
    },
  },
  build(kit) {
    const ground = kit.solid(
      terrainGeometry(kit, {
        size: 1100,
        segments: 80,
        height: 14,
        flatRadius: 66,
        rampWidth: 60,
        low: "#3f6b33",
        high: "#6c9a44",
        clearings: [{ x: 58, z: -84, radius: 24 }],
      }),
      kit.surface("#ffffff", { tinted: true }),
      0,
      FLOOR - 0.6,
      0,
    );

    ground.castShadow = false;

    return kit.group(
      ground,
      place(courtyard(kit), 0, FLOOR, 0),
      drift(kit, { count: 70, spread: 110, floor: 2, ceiling: 26, fall: 0, sway: 5, size: 1.6, tone: "#e9ff8a", glowing: true }),
      place(idol(kit), -70, FLOOR, -54, 0.75),
      place(pillar(kit, 5, false), -62, FLOOR, 4),
      place(pillar(kit, 3, true), -64, FLOOR, 40),
      place(fallenDrum(kit), -76, FLOOR, 48, 0.6),
      place(pillar(kit, 5, false), 62, FLOOR, -10),
      place(pillar(kit, 2, true), 62, FLOOR, 30),
      place(fallenDrum(kit), 72, FLOOR, 20, -0.4),
      place(brazier(kit, 0.6), -50, FLOOR, -50),
      place(brazier(kit, 0.6), 50, FLOOR, -50),
      place(jungleTree(kit, 44), -98, FLOOR, -14),
      place(jungleTree(kit, 38), -92, FLOOR, 60),
      place(jungleTree(kit, 46), 96, FLOOR, -46),
      place(jungleTree(kit, 36), 104, FLOOR, 30),
      place(jungleTree(kit, 40), -20, FLOOR, -98),
      place(waterfall(kit, 16, 30), 58, FLOOR, -84, -0.25),
      place(pyramid(kit), 0, FLOOR - 4, -230, 0, 1.2),
      place(fern(kit, 6), -54, FLOOR, 56),
      place(fern(kit, 5), 56, FLOOR, 54),
      place(fern(kit, 7), -80, FLOOR, 18),
      place(fern(kit, 5.5), 80, FLOOR, -18),
      place(fern(kit, 6), 20, FLOOR, -62),
      place(bush(kit, 6, CANOPY), -84, FLOOR, -40),
      place(bush(kit, 5, CANOPY), 86, FLOOR, 56),
      place(bush(kit, 4.5, CANOPY), 30, FLOOR, -64),
      place(rock(kit, 4, "#7d7b6c"), 54, FLOOR, 60),
      place(rock(kit, 3, "#8a8878"), -40, FLOOR, 60),
    );
  },
};
