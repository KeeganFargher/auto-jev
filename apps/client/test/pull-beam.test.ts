import { strict as assert } from "node:assert";
import { test } from "node:test";
import { burr, mags, paladin } from "@jev-game/content";
import { createBattle, type UnitState } from "@jev-game/game";
import { createCustomLabSetup, gameCatalogue } from "@jev-game/content";
import { pullerOf } from "../src/game/views/pull-beam.js";

function battleUnits(): Map<string, UnitState> {
  const setup = createCustomLabSetup(1, [mags.id, burr.id, paladin.id], ["training-dummy"]);
  const state = createBattle(setup, gameCatalogue);

  return new Map(state.units.map((unit) => [unit.unitId, unit]));
}

function skidBy(unit: UnitState, makerUnitId: string): void {
  unit.motion = {
    kind: "skid",
    from: { x: 10, y: 10 },
    to: { x: 20, y: 10 },
    startTick: 0,
    endTick: 10,
    downedTicks: 45,
    makerUnitId,
  };
}

test("a unit sliding because of Collection Day is pulled by Mags, and a knockdown skid is not", () => {
  const units = battleUnits();
  const lookup = (unitId: string): UnitState => {
    const unit = units.get(unitId);

    if (unit === undefined) {
      throw new Error(`No unit ${unitId}`);
    }

    return unit;
  };
  const dummy = lookup("B-1");

  skidBy(dummy, "A-1");
  assert.equal(pullerOf(dummy, lookup), "A-1");

  skidBy(dummy, "A-3");
  assert.equal(pullerOf(dummy, lookup), null);

  dummy.motion = { kind: "ground" };
  assert.equal(pullerOf(dummy, lookup), null);
});
