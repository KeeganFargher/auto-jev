import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { trainingDummy } from "@jev-game/content";
import { Box3, Quaternion, Vector3 } from "three";
import {
  BOUNCE_SECONDS,
  HOP_SECONDS,
  HOP_UNITS,
  SQUASH_SECONDS,
  bounceLift,
  flightSpin,
  hitSquash,
  hopLift,
  spinAngle,
  squashPeak,
  squashScale,
  squashWobble,
} from "../src/game/views/body-motion.js";
import { KAYKIT_UNIT } from "../src/game/views/figure-base.js";
import { createHeroFigure } from "../src/game/views/hero-figures.js";
import { installHeroModels } from "./hero-models.js";

const TURN = Math.PI * 2;

before(installHeroModels);

function near(actual: number, expected: number, label: string, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} is not ${expected}`);
}

test("a launched body always spins the same way for the same launch", () => {
  const first = flightSpin("u7", 120, 1.1);
  const again = flightSpin("u7", 120, 1.1);

  assert.deepEqual(again.axis.toArray(), first.axis.toArray());
  assert.equal(again.turns, first.turns);
  near(first.axis.length(), 1, "the spin axis is a direction");
  assert.ok(Number.isInteger(first.turns) && first.turns >= 1, `${first.turns} turns`);
});

test("different launches tumble about different axes", () => {
  const axes = new Set<string>();

  for (let tick = 0; tick < 20; tick += 1) {
    axes.add(
      flightSpin("u3", tick, 1)
        .axis.toArray()
        .map((value) => value.toFixed(3))
        .join(","),
    );
  }

  assert.equal(axes.size, 20);
});

test("every tumble tips the body at least onto its side", () => {
  const up = new Vector3();
  const turn = new Quaternion();

  for (let tick = 0; tick < 200; tick += 1) {
    const spin = flightSpin("u1", tick, 0.4);
    let lowest = 1;

    for (let step = 0; step <= 200; step += 1) {
      turn.setFromAxisAngle(spin.axis, spinAngle(spin, 0.4, step / 200));
      lowest = Math.min(lowest, up.set(0, 1, 0).applyQuaternion(turn).y);
    }

    assert.ok(lowest < 0.01, `launch ${tick} keeps its head up, lowest at ${lowest}`);
  }
});

test("longer flights spin more turns", () => {
  let short = 0;
  let long = 0;

  for (let tick = 0; tick < 100; tick += 1) {
    short += flightSpin("u2", tick, 0.5).turns;
    long += flightSpin("u2", tick, 2).turns;
  }

  assert.ok(long > short * 2, `${long} turns over long flights against ${short} over short ones`);
});

test("a tumble starts and lands upright, having turned whole turns", () => {
  const spin = flightSpin("u5", 40, 1.2);
  const landed = new Quaternion().setFromAxisAngle(spin.axis, spinAngle(spin, 1.2, 1));
  const upright = new Vector3(0, 1, 0).applyQuaternion(landed);

  near(spinAngle(spin, 1.2, 0), 0, "launch");
  near(spinAngle(spin, 1.2, 1), spin.turns * TURN, "landing");
  near(upright.y, 1, "the body lands upright", 1e-9);
});

test("the spin slows down a little as the body flies, as air drags on it", () => {
  const spin = flightSpin("u9", 12, 1.5);
  const early = spinAngle(spin, 1.5, 0.1) - spinAngle(spin, 1.5, 0);
  const late = spinAngle(spin, 1.5, 1) - spinAngle(spin, 1.5, 0.9);

  assert.ok(late < early, `the spin speeds up from ${early} to ${late}`);
  assert.ok(late > early * 0.5, `the spin all but stops, from ${early} to ${late}`);
});

test("a hard landing bounces the body up and back down under the sim's gravity", () => {
  const highest = bounceLift(BOUNCE_SECONDS / 2);

  near(bounceLift(0), 0, "impact");
  near(highest, 0.6 * KAYKIT_UNIT, "the top of the bounce", 1e-6);
  assert.ok(bounceLift(BOUNCE_SECONDS * 0.25) > 0);
  near(bounceLift(BOUNCE_SECONDS - 1e-9), 0, "back down", 1e-6);
  assert.equal(bounceLift(BOUNCE_SECONDS), 0);
  assert.equal(bounceLift(Number.POSITIVE_INFINITY), 0);
});

test("getting up is a little hop that lands back on the ground", () => {
  near(hopLift(0), 0, "on the ground");
  near(hopLift(HOP_SECONDS / 2), HOP_UNITS, "top of the hop");
  assert.equal(hopLift(HOP_SECONDS), 0);
  assert.equal(hopLift(Number.POSITIVE_INFINITY), 0);
});

test("bigger hits and crits squash harder, and nothing squashes more than fully", () => {
  near(hitSquash(0, false), 0.35, "the lightest hit");
  assert.ok(hitSquash(100, false) > hitSquash(20, false));
  assert.ok(hitSquash(60, true) > hitSquash(60, false));
  assert.equal(hitSquash(10_000, false), 1);
  assert.equal(hitSquash(200, true), 1);
});

test("a weaker hit does not cut a big squash short, but a fresh one restarts it", () => {
  near(squashPeak(0, Number.POSITIVE_INFINITY, 0.4), 0.4, "a fresh squash");
  near(squashPeak(1, 0, 0.2), 1, "a weak hit during a big squash");
  near(squashPeak(1, 0.5, 0.2), 0.2, "a weak hit once the big squash has faded");
  assert.throws(() => squashPeak(0, 0, 0), /stronger than 0/);
  assert.throws(() => squashPeak(0, 0, 1.2), /at most 1/);
  assert.throws(() => squashPeak(0, 0, Number.NaN), /stronger than 0/);
});

test("a squash flattens and widens the body, jiggles, then settles exactly", () => {
  const hit = squashScale(squashWobble(1, 0), new Vector3());

  assert.ok(hit.y < 1 && hit.x > 1 && hit.z > 1, `a fresh squash scales ${hit.toArray()}`);
  assert.ok(squashWobble(1, 0.1) < 0, "the squash springs back past standing");
  assert.equal(squashWobble(1, SQUASH_SECONDS), 0);
  assert.deepEqual(
    squashScale(squashWobble(1, Number.POSITIVE_INFINITY), new Vector3()).toArray(),
    [1, 1, 1],
  );
});

test("a squashed figure flattens on the hit and stands back at its full height", () => {
  const figure = createHeroFigure(trainingDummy.id);
  figure.update(0);
  const standing = new Box3().setFromObject(figure.root).getSize(new Vector3()).y;

  figure.squash(1);
  figure.update(0.001);
  const squashed = new Box3().setFromObject(figure.root).getSize(new Vector3()).y;

  figure.update(SQUASH_SECONDS);
  const settled = new Box3().setFromObject(figure.root).getSize(new Vector3()).y;

  assert.ok(squashed < standing * 0.85, `the hit only squashed ${standing} down to ${squashed}`);
  near(settled, standing, "settled height", 1e-6);
  figure.dispose();
});
