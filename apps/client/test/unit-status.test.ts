import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCustomLabSetup, gameCatalogue, labPreset } from "@jev-game/content";
import {
  createBattle,
  getBattleSnapshot,
  type BattleState,
  type FlightMotion,
  type LaunchCause,
  type UnitState,
} from "@jev-game/game";
import { statusEndTick, unitStatuses } from "../src/game/unit-status.js";

function flight(launcher: UnitState, cause: LaunchCause): FlightMotion {
  return {
    kind: "flight",
    path: { from: { x: 10, y: 10 }, bounce: null, to: { x: 14, y: 10 }, length: 4 },
    startTick: 0,
    endTick: 10,
    startHeight: 0,
    peak: 3,
    landing: {
      hard: false,
      cause,
      launcherUnitId: launcher.unitId,
      launcherTeamId: launcher.teamId,
      bowlingHop: 0,
      bowlingDamage: 0,
      landingDamage: 0,
      stunTicks: 0,
    },
  };
}

function statusesOf(state: BattleState, unitId: string): string[] {
  const snapshot = getBattleSnapshot(state);
  const unit = snapshot.units.find((candidate) => candidate.unitId === unitId);

  if (unit === undefined) {
    throw new Error(`The battle has no unit ${unitId}`);
  }

  return unitStatuses(snapshot, unit);
}

test("a crit hop shows Airborne, and a fall from a popped bubble does not", () => {
  const preset = labPreset("comet");
  const state = createBattle(createCustomLabSetup(1, preset.teamA, preset.teamB), gameCatalogue);
  const launcher = state.units[0];
  const target = state.units.at(-1);

  if (launcher === undefined || target === undefined) {
    throw new Error("The comet preset has no units");
  }

  target.motion = flight(launcher, "crit");
  assert.deepEqual(statusesOf(state, target.unitId), ["airborne"]);

  target.motion = flight(launcher, "drop");
  assert.deepEqual(statusesOf(state, target.unitId), []);
});

test("a frozen unit shows Frozen and not Stunned, and ends when it thaws", () => {
  const preset = labPreset("gather-freeze-smash");
  const state = createBattle(createCustomLabSetup(1, preset.teamA, preset.teamB), gameCatalogue);
  const target = state.units.at(-1);

  if (target === undefined) {
    throw new Error("The preset has no units");
  }

  target.frozen = { makerUnitId: "A-2", untilTick: 90 };
  assert.deepEqual(statusesOf(state, target.unitId), ["frozen"]);

  const snapshot = getBattleSnapshot(state);
  const frozen = snapshot.units.find((candidate) => candidate.unitId === target.unitId);

  if (frozen === undefined) {
    throw new Error("The snapshot lost the unit");
  }

  assert.equal(statusEndTick(snapshot, frozen, "frozen"), 90);
});
