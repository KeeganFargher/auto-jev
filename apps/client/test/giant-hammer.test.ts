import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { paladin } from "@jev-game/content";
import { TICK_RATE } from "@jev-game/game";
import { Group, Material, Mesh, Vector3 } from "three";
import { HAMMER_SWING } from "../src/game/models/catalogue.js";
import { releaseEffectMaterial } from "../src/game/views/effect-materials.js";
import {
  createGiantHammer,
  groundAngle,
  hammerDone,
  hammerGlow,
  hammerGrowth,
  swingAngle,
  swingSeconds,
} from "../src/game/views/giant-hammer.js";
import { createHeroFigure } from "../src/game/views/hero-figures.js";
import { installHeroModels } from "./hero-models.js";

const DEGREES = Math.PI / 180;

const LANDING_TOLERANCE_UNITS = 1.5;

const FRAME_SECONDS = 1 / 60;

before(installHeroModels);

function near(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} is not ${expected}`);
}

test("the swing starts out in front, heaves up overhead and behind the head, then slams down to the ground", () => {
  const ground = 95 * DEGREES;

  near(swingAngle(0, ground), 80 * DEGREES, "pulled out in front");
  near(swingAngle(0.35, ground), -5 * DEGREES, "overhead");
  near(swingAngle(0.8, ground), -38 * DEGREES, "behind the head");
  near(swingAngle(HAMMER_SWING.hang, ground), -46 * DEGREES, "hanging back");
  near(swingAngle(HAMMER_SWING.impact, ground), ground, "on the ground");
  assert.ok(
    swingAngle(HAMMER_SWING.impact - 0.05, ground) < swingAngle(HAMMER_SWING.impact - 0.01, ground),
    "the slam keeps speeding forward until it lands",
  );
});

test("the hammer shudders after it lands and settles on the ground", () => {
  const ground = 95 * DEGREES;
  const shudder = Math.abs(swingAngle(HAMMER_SWING.impact + 0.05, ground) - ground);
  const settled = Math.abs(swingAngle(HAMMER_SWING.impact + 0.6, ground) - ground);

  assert.ok(shudder > 2 * DEGREES, `the landing only shudders ${shudder / DEGREES} degrees`);
  assert.ok(
    settled < 0.05 * DEGREES,
    `the hammer is still shuddering ${settled / DEGREES} degrees`,
  );
});

test("the hammer pops in past full size, holds, then shrinks away after the release", () => {
  near(hammerGrowth(0), 0, "summoned");
  assert.ok(hammerGrowth(0.2) > 1, "the pop overshoots full size");
  near(hammerGrowth(0.3), 1, "full size");
  near(hammerGrowth(HAMMER_SWING.impact), 1, "on impact");
  near(hammerGrowth(HAMMER_SWING.release + 0.1), 0.5, "halfway gone");
  near(hammerGrowth(HAMMER_SWING.release + 0.2), 0, "gone");
  assert.equal(hammerDone(HAMMER_SWING.release + 0.19), false);
  assert.equal(hammerDone(HAMMER_SWING.release + 0.2), true);
});

test("the hammer glows while it is raised for the blow and dims once it lands", () => {
  assert.ok(hammerGlow(0.3) < hammerGlow(0.7));
  assert.ok(hammerGlow(HAMMER_SWING.hang) > hammerGlow(HAMMER_SWING.impact));
});

test("the swing lands on the sim's impact however long the sim takes to get there", () => {
  near(swingSeconds(1.5, 1.5), HAMMER_SWING.impact, "impact");
  near(swingSeconds(0.75, 1.5), HAMMER_SWING.impact / 2, "halfway");
  assert.throws(() => swingSeconds(0.5, 0), /positive impact time/);
});

test("on the ground angle the hammer head rests on the ground", () => {
  const grip = 4;
  const reach = 17;
  const half = 3;
  const angle = groundAngle(grip, reach, half);

  near(grip + reach * Math.cos(angle), half, "head height");
  near(groundAngle(0, 1, 5), 0, "clamped straight up");
});

test("a hammer nobody holds cannot swing", () => {
  const hammer = createGiantHammer();

  assert.throws(() => hammer.pose(0.5, new Vector3(0, 0, 1)), /must be held/);
  hammer.dispose();
});

test("a disposed hammer leaves its hand and returns its materials", () => {
  const hand = new Group();
  const hammer = createGiantHammer();
  hand.add(hammer.root);
  const materials = new Set<Material>();

  hammer.root.traverse((node) => {
    if (node instanceof Mesh && node.material instanceof Material) {
      materials.add(node.material);
    }
  });

  hammer.dispose();
  assert.equal(hand.children.length, 0);
  assert.equal(materials.size, 3);

  for (const material of materials) {
    assert.throws(() => releaseEffectMaterial(material), /not taken/);
  }
});

test("the paladin swaps his warhammer for the giant hammer and gets it back afterwards", () => {
  const figure = createHeroFigure(paladin.id);
  const hammer = createGiantHammer();
  const other = createGiantHammer();
  figure.update(0);
  const item = hammer.root;

  figure.wield(item);
  const hand = item.parent;
  assert.ok(hand !== null);
  const held = hand.children.filter((child) => child !== item);
  assert.ok(held.length > 0, "the paladin had nothing in hand to swap out");
  assert.ok(held.every((child) => !child.visible));
  assert.throws(() => figure.wield(other.root), /already wields/);
  assert.throws(() => figure.unwield(other.root), /does not wield/);

  figure.unwield(item);
  assert.equal(item.parent, null);
  assert.ok(held.every((child) => child.visible));
  hammer.dispose();
  other.dispose();
  figure.dispose();
});

test("the paladin's hammer lands where the sim strikes", () => {
  const signature = paladin.signature;
  assert.ok(signature !== null && signature.kind === "hammerfall");
  const impactSeconds = signature.impactTick / TICK_RATE;
  const figure = createHeroFigure(paladin.id);
  const hammer = createGiantHammer();
  const heading = new Vector3(0, 0, 1);
  figure.update(0);
  figure.perform("signature", impactSeconds);
  figure.wield(hammer.root);
  const frames = Math.round(impactSeconds / FRAME_SECONDS);

  for (let frame = 0; frame <= frames; frame += 1) {
    if (frame > 0) {
      figure.update(FRAME_SECONDS);
    }

    hammer.pose(swingSeconds(frame * FRAME_SECONDS, impactSeconds), heading);
  }

  const face = hammer.face(new Vector3());
  const miss = Math.hypot(face.x, face.z - signature.reachUnits);

  assert.ok(
    miss < LANDING_TOLERANCE_UNITS,
    `the hammer lands at ${face.toArray()}, ${miss} units from the sim's blow`,
  );
  assert.ok(face.y < 0, "the hammer head does not reach the ground");
  figure.unwield(hammer.root);
  hammer.dispose();
  figure.dispose();
});
