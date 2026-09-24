import type { Object3D } from "three";
import type { EnvironmentTheme } from "../environment.js";
import { waterSurface } from "../environment.js";
import { islandGeometry } from "../forms.js";
import type { PropKit } from "../prop-kit.js";
import {
  barrel,
  bottle,
  bush,
  campfire,
  crate,
  flag,
  grassTuft,
  hut,
  lanternPost,
  logSeat,
  palmTree,
  pier,
  place,
  rock,
  ropeCoil,
  rowboat,
  shell,
  starfish,
  treasureChest,
} from "../props.js";

const WATER_LEVEL = -6.6;

const SAND_TOP = -3.2;

const FOLIAGE = ["#4fae52", "#3f9a4b", "#6cc45a"];

const GRASS = ["#7cc95e", "#5fb356", "#9ad66a"];

function sandbank(kit: PropKit, radius: number, x: number, z: number): Object3D[] {
  const outline = islandGeometry(kit, radius, 6, 1.1, 0.1);
  const sand = kit.solid(outline, kit.surface("#f1d59a"), x, SAND_TOP - 3, z);
  const shelf = kit.solid(outline, kit.surface("#d7b476"), x, SAND_TOP - 4.4, z);
  shelf.scale.set(1.09, 1, 1.09);
  const foam = kit.solid(outline, kit.surface("#ffffff", { opacity: 0.5 }), x, WATER_LEVEL + 0.12, z);
  foam.scale.set(1.17, 0.03, 1.17);
  foam.castShadow = false;
  foam.receiveShadow = false;

  return [sand, shelf, foam];
}

function camp(kit: PropKit): Object3D {
  const seatA = place(logSeat(kit, 7), -7, 0, 2, 0.4);
  const seatB = place(logSeat(kit, 6), 5, 0, -5.5, -0.9);

  return kit.group(campfire(kit, 0), seatA, seatB, place(bottle(kit, "#3f8f5a"), -3.6, 0, 7, 0));
}

export const coveTheme: EnvironmentTheme = {
  id: "cove",
  name: "Smugglers' Cove",
  story: "Contraband, a stolen chest, and a fight on the landing",
  swatch: "#3fc4d0",
  seed: 7,
  stage: {
    board: {
      tileLight: "#ead3a0",
      tileDark: "#d4b582",
      grout: "#7d5c3a",
      frame: "#8b5a33",
      caps: "#e2bd5c",
      capsMetalness: 0.6,
      plinth: "#b48a58",
    },
    atmosphere: {
      backdrop: "#a3e0ec",
      fogBeyond: 160,
      fogDepth: 700,
      skyLight: "#e3f7ff",
      groundLight: "#c9a66b",
      ambient: 1.3,
      sun: "#fff0d4",
      sunIntensity: 2.7,
      rim: "#a6e3ff",
      rimIntensity: 0.8,
      exposure: 1,
      shadowReach: 135,
      glowFloor: false,
    },
  },
  build(kit) {
    const boat = place(rowboat(kit), 98, WATER_LEVEL + 0.8, 30, 0.3);

    kit.animate((seconds) => {
      boat.position.y = WATER_LEVEL + 0.8 + Math.sin(seconds * 1.3) * 0.35;
      boat.rotation.z = Math.sin(seconds * 1.1) * 0.04;
    });

    const beached = place(rowboat(kit), -96, SAND_TOP + 1.6, -58, 2.2);
    beached.rotation.z = 0.12;

    const lying = barrel(kit, 6);
    place(lying, -60, SAND_TOP + 2.2, 36, 0.6);
    lying.rotation.z = Math.PI / 2;

    return kit.group(
      waterSurface(kit, 1800, WATER_LEVEL, "#35c0d0", 0.55),
      ...sandbank(kit, 80, -26, -8),
      ...sandbank(kit, 16, 152, -118),
      place(palmTree(kit, 36, 0.2), -72, SAND_TOP, -6, Math.PI),
      place(palmTree(kit, 30, 0.26), -92, SAND_TOP, 26, Math.PI * 0.85),
      place(palmTree(kit, 34, 0.16), -68, SAND_TOP, -48, Math.PI * 0.7),
      place(palmTree(kit, 38, 0.14), -2, SAND_TOP, -70, Math.PI * 0.45),
      place(palmTree(kit, 32, 0.2), 26, SAND_TOP, -80, Math.PI * 0.3),
      place(palmTree(kit, 26, 0.22), 148, SAND_TOP, -122, 0.4),
      place(palmTree(kit, 22, 0.28), 160, SAND_TOP, -110, 2.2),
      place(camp(kit), -62, SAND_TOP, -24),
      place(crate(kit, 7), -60, SAND_TOP, 18, 0.2),
      place(crate(kit, 6.2, "#b88246"), -52, SAND_TOP, 23, -0.3),
      place(crate(kit, 5.4), -58.5, SAND_TOP + 7, 18.5, 0.5),
      place(barrel(kit, 6.5), -68, SAND_TOP, 30),
      lying,
      place(bottle(kit, "#3f8f5a"), -49, SAND_TOP, 30, 0),
      place(bottle(kit, "#7a4a2a"), -47, SAND_TOP, 28.5, 0),
      place(ropeCoil(kit), -44, SAND_TOP, 52),
      place(lanternPost(kit, 14), -52, SAND_TOP, 46, 0.2),
      place(hut(kit, "#e7c88e", "#d7b060"), -40, SAND_TOP, -66, 0.35),
      place(crate(kit, 6), -10, SAND_TOP, -60, 0.8),
      place(barrel(kit, 6), -16, SAND_TOP, -55),
      place(treasureChest(kit), 22, SAND_TOP, -56, -0.35),
      place(pier(kit, 64, 11, 2.6, 8), 48, WATER_LEVEL, 14),
      place(barrel(kit, 5.5), 80, WATER_LEVEL + 2.9, 16),
      place(barrel(kit, 5.5), 84, WATER_LEVEL + 2.9, 11),
      place(crate(kit, 5), 70, WATER_LEVEL + 2.9, 11, 0.4),
      place(flag(kit, 24, "#2b2d42", "#f4efe1"), 108, WATER_LEVEL + 2.9, 9),
      boat,
      beached,
      place(rock(kit, 5, "#9c9488"), 74, WATER_LEVEL, -36),
      place(rock(kit, 3.5, "#8d857a"), 86, WATER_LEVEL, -24),
      place(rock(kit, 7, "#a39b8f"), 112, WATER_LEVEL, -64),
      place(rock(kit, 3, "#b3aa9c"), 66, WATER_LEVEL, 50),
      place(starfish(kit, "#f2895b"), 34, SAND_TOP, 58, 0.4),
      place(starfish(kit, "#f6b24a"), -78, SAND_TOP, 52, 1.2, 0.8),
      place(shell(kit, "#f7d9d0"), -20, SAND_TOP, 58, 0.3),
      place(shell(kit, "#fbe9c2"), 12, SAND_TOP, 60, 1.9, 0.8),
      place(shell(kit, "#f7d9d0"), -86, SAND_TOP, -30, 0.9),
      place(bush(kit, 5, FOLIAGE), -84, SAND_TOP, 44),
      place(bush(kit, 4, FOLIAGE), -52, SAND_TOP, -54),
      place(bush(kit, 5.5, FOLIAGE), 42, SAND_TOP, -64),
      place(grassTuft(kit, 4, GRASS), -76, SAND_TOP, -2),
      place(grassTuft(kit, 3.5, GRASS), -66, SAND_TOP, -40),
      place(grassTuft(kit, 4.5, GRASS), -94, SAND_TOP, 20),
      place(grassTuft(kit, 3.5, GRASS), 4, SAND_TOP, -64),
      place(grassTuft(kit, 4, GRASS), 30, SAND_TOP, -74),
      place(grassTuft(kit, 3, GRASS), -30, SAND_TOP, -56),
    );
  },
};
