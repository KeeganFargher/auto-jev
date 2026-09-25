import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHeroBuild, type SkillSlot } from "@jev-game/game";
import { gameCatalogue } from "@jev-game/content";
import { applyCommand, type RunCommand } from "../src/commands.js";
import { gemCanGoOn, gemsInSkill } from "../src/inventory.js";
import { createRun } from "../src/run.js";
import type { OwnedGem, PlayerSeat, RunState } from "../src/types.js";

const PLAYER = "tester";

const UNBOUND = "unbound-1";

function gem(instanceId: string, pieceId: string, heroSlot: number | null, skill: SkillSlot | null): OwnedGem {
  return { instanceId, pieceId, heroSlot, skill };
}

function preparing(unboundOn: number | null, gems: OwnedGem[]): RunState {
  const run = createRun("run", 1, [{ playerId: PLAYER, displayName: "Tester", controllerKind: "human" }]);
  const seat = run.players[PLAYER];

  if (seat === undefined) {
    throw new Error("the run has no seat for the tester");
  }

  const filled: PlayerSeat = {
    ...seat,
    heroBuilds: [createHeroBuild("hero-0", "pyromancer", [], gameCatalogue), createHeroBuild("hero-1", "frostweaver", [], gameCatalogue)],
    items: [{ instanceId: UNBOUND, pieceId: "the-unbound", heroSlot: unboundOn }],
    gems,
  };

  return { ...run, phase: "preparing", players: { [PLAYER]: filled }, readyThresholdByPlayer: { [PLAYER]: 0 } };
}

function seatAfter(state: RunState, command: RunCommand): PlayerSeat {
  const result = applyCommand(state, command, gameCatalogue);

  if (!result.accepted) {
    throw new Error(`the command was rejected: ${result.reason}`);
  }

  const seat = result.state.players[PLAYER];

  if (seat === undefined) {
    throw new Error("the seat vanished");
  }

  return seat;
}

const FULL = [
  gem("g1", "gem-opener", 0, "ability"),
  gem("g2", "gem-haste", 0, "ability"),
  gem("g3", "gem-last-word", 0, "ultimate"),
  gem("g4", "gem-overcharge", 0, "ultimate"),
];

test("The Unbound opens a second socket in both skills", () => {
  const bare = preparing(null, [gem("g1", "gem-opener", 0, "ability")]).players[PLAYER];
  const held = preparing(0, [gem("g1", "gem-opener", 0, "ability")]).players[PLAYER];

  assert.ok(bare !== undefined && held !== undefined);
  assert.equal(gemCanGoOn(bare, "gem-haste", 0, "ability", gameCatalogue, null), false);
  assert.equal(gemCanGoOn(held, "gem-haste", 0, "ability", gameCatalogue, null), true);
  assert.equal(gemCanGoOn({ ...held, gems: FULL }, "gem-cast-on-crit", 0, "ability", gameCatalogue, null), false);
  assert.equal(gemCanGoOn({ ...held, gems: FULL }, "gem-cast-on-crit", 1, "ability", gameCatalogue, null), true);
});

test("moving The Unbound to the stash sends each skill's extra gem back to the stash", () => {
  const seat = seatAfter(preparing(0, FULL), { kind: "move-item", playerId: PLAYER, instanceId: UNBOUND, heroSlot: null, expectedRevision: 0 });

  assert.deepEqual(
    gemsInSkill(seat.gems, 0, "ability").map((owned) => owned.instanceId),
    ["g1"],
  );
  assert.deepEqual(
    gemsInSkill(seat.gems, 0, "ultimate").map((owned) => owned.instanceId),
    ["g3"],
  );
  assert.deepEqual(
    seat.gems.filter((owned) => owned.heroSlot === null).map((owned) => [owned.instanceId, owned.skill]),
    [
      ["g2", null],
      ["g4", null],
    ],
  );
});

test("moving The Unbound to another hero moves the extra socket with it", () => {
  const seat = seatAfter(preparing(0, FULL), { kind: "move-item", playerId: PLAYER, instanceId: UNBOUND, heroSlot: 1, expectedRevision: 0 });

  assert.equal(gemsInSkill(seat.gems, 0, "ability").length, 1);
  assert.equal(gemsInSkill(seat.gems, 0, "ultimate").length, 1);
  assert.equal(gemCanGoOn(seat, "gem-haste", 1, "ability", gameCatalogue, null), true);
});

test("discarding The Unbound sends the extra gems back to the stash too", () => {
  const seat = seatAfter(preparing(0, FULL), { kind: "discard-item", playerId: PLAYER, instanceId: UNBOUND, expectedRevision: 0 });

  assert.equal(seat.items.length, 0);
  assert.equal(seat.gems.filter((owned) => owned.heroSlot === null).length, 2);
});

test("a trained socket keeps its gem when The Unbound comes off", () => {
  const state = preparing(0, FULL);
  const trained = state.players[PLAYER];

  assert.ok(trained !== undefined);

  const hero = trained.heroBuilds[0];

  assert.ok(hero !== undefined);

  const withTraining: RunState = {
    ...state,
    players: {
      [PLAYER]: {
        ...trained,
        heroBuilds: [{ ...hero, trainedSockets: { ability: 1 } }, ...trained.heroBuilds.slice(1)],
      },
    },
  };

  const seat = seatAfter(withTraining, { kind: "move-item", playerId: PLAYER, instanceId: UNBOUND, heroSlot: null, expectedRevision: 0 });

  assert.equal(gemsInSkill(seat.gems, 0, "ability").length, 2);
  assert.equal(gemsInSkill(seat.gems, 0, "ultimate").length, 1);
});
