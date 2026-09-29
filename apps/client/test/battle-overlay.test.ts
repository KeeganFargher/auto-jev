import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createBattleOverlay,
  samePlate,
  type PlateModel,
} from "../src/game/views/battle-overlay.js";

function plate(overrides: Partial<PlateModel> = {}): PlateModel {
  return {
    unitId: "u1",
    friendly: true,
    label: null,
    alive: true,
    segment: 0.1,
    hp: 0.5,
    mana: 0.25,
    manaFull: false,
    statuses: ["burning"],
    chain: { count: 2, serial: 1, flourish: false },
    ...overrides,
  };
}

test("identical plate models compare equal, so an idle frame publishes nothing", () => {
  assert.equal(samePlate(plate(), plate()), true);
});

test("every visible plate field breaks equality", () => {
  assert.equal(samePlate(plate(), plate({ hp: 0.4 })), false);
  assert.equal(samePlate(plate(), plate({ alive: false })), false);
  assert.equal(samePlate(plate(), plate({ mana: null })), false);
  assert.equal(samePlate(plate(), plate({ manaFull: true })), false);
  assert.equal(samePlate(plate(), plate({ statuses: [] })), false);
  assert.equal(samePlate(plate(), plate({ chain: null })), false);
  assert.equal(samePlate(plate(), plate({ label: "u1" })), false);
});

test("a new chain serial with the same count still replays the badge", () => {
  const next = plate({ chain: { count: 2, serial: 2, flourish: false } });

  assert.equal(samePlate(plate(), next), false);
});

test("resetting the overlay clears plates, numbers and anchored positions", () => {
  const overlay = createBattleOverlay();
  overlay.plates.set([plate()]);
  overlay.numbers.set([{ id: 1, text: "12", kind: "big", side: 1 }]);
  overlay.anchors.place("plate:u1", { x: 4, y: 5 });

  overlay.reset();

  const seen: number[] = [];
  overlay.anchors.follow("plate:u1", (point) => seen.push(point.x));

  assert.deepEqual(overlay.plates.get(), []);
  assert.deepEqual(overlay.numbers.get(), []);
  assert.deepEqual(seen, []);
});
