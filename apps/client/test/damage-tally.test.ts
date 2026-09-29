import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCustomLabSetup, gameCatalogue } from "@jev-game/content";
import {
  createBattle,
  getBattleSnapshot,
  type BattleEvent,
  type BattleSnapshot,
  type DamageCause,
  type HealCause,
} from "@jev-game/game";
import {
  TOP_SOURCES,
  createDamageTally,
  damageLabel,
  rankEntries,
  teamTotal,
  topSources,
  type MeterEntry,
} from "../src/features/match/damage/damage-tally.js";

function opening(): BattleSnapshot {
  const setup = createCustomLabSetup(1, ["paladin", "firebrand"], ["training-dummy"]);

  return getBattleSnapshot(createBattle(setup, gameCatalogue));
}

let sequence = 0;

function hit(
  source: string,
  target: string,
  amount: number,
  options: { crit?: boolean; cause?: DamageCause } = {},
): BattleEvent {
  sequence += 1;

  return {
    kind: "damage",
    tick: sequence,
    sequence,
    sourceUnitId: source,
    targetUnitId: target,
    amount,
    crit: options.crit ?? false,
    cause: options.cause ?? "attack",
    hpAfter: 10,
  };
}

function heal(source: string, target: string, amount: number, cause: HealCause): BattleEvent {
  sequence += 1;

  return {
    kind: "heal",
    tick: sequence,
    sequence,
    sourceUnitId: source,
    targetUnitId: target,
    amount,
    cause,
    hpAfter: 10,
  };
}

function entryOf(entries: readonly MeterEntry[], unitId: string): MeterEntry {
  const entry = entries.find((candidate) => candidate.unitId === unitId);

  if (entry === undefined) {
    throw new Error(`The meter has no entry for ${unitId}`);
  }

  return entry;
}

test("the meter only lists the friendly team, in roster order", () => {
  const tally = createDamageTally(opening(), "A");

  assert.deepEqual(
    tally.read().entries.map((entry) => [entry.unitId, entry.order]),
    [
      ["A-1", 0],
      ["A-2", 1],
    ],
  );
});

test("a team with no units is a loud error", () => {
  assert.throws(() => createDamageTally(opening(), "Z"), /no units on team Z/);
});

test("damage dealt to the enemy is credited to the attacker under the attack's name", () => {
  const tally = createDamageTally(opening(), "A");

  assert.equal(tally.ingest([hit("A-1", "B-1", 12), hit("A-1", "B-1", 8)]), true);

  const paladin = entryOf(tally.read().entries, "A-1");
  assert.equal(paladin.totals.dealt, 20);
  assert.deepEqual(paladin.sources.dealt, [
    { label: damageLabel("paladin", "attack"), amount: 20 },
  ]);
});

test("crits are counted and each cause gets its own source line", () => {
  const tally = createDamageTally(opening(), "A");

  tally.ingest([
    hit("A-2", "B-1", 5, { crit: true }),
    hit("A-2", "B-1", 9, { cause: "burn" }),
    hit("A-2", "B-1", 1, { cause: "splash" }),
  ]);

  const firebrand = entryOf(tally.read().entries, "A-2");
  assert.equal(firebrand.crits, 1);
  assert.deepEqual(
    firebrand.sources.dealt.map((source) => source.label),
    ["Burning", damageLabel("firebrand", "attack"), damageLabel("firebrand", "splash")],
  );
});

test("damage taken is credited to the victim under the attacker's hero name", () => {
  const tally = createDamageTally(opening(), "A");

  tally.ingest([hit("B-1", "A-2", 6)]);

  const firebrand = entryOf(tally.read().entries, "A-2");
  assert.equal(firebrand.totals.taken, 6);
  assert.equal(firebrand.sources.taken[0]?.label, gameCatalogue.heroes["training-dummy"]?.name);
});

test("friendly fire counts against the victim and not for the attacker", () => {
  const tally = createDamageTally(opening(), "A");

  tally.ingest([hit("A-1", "A-2", 7)]);

  const entries = tally.read().entries;
  assert.equal(entryOf(entries, "A-1").totals.dealt, 0);
  assert.equal(entryOf(entries, "A-2").totals.taken, 7);
});

test("self damage is labelled as such", () => {
  const tally = createDamageTally(opening(), "A");

  tally.ingest([hit("A-1", "A-1", 3, { cause: "blast" })]);

  assert.equal(entryOf(tally.read().entries, "A-1").sources.taken[0]?.label, "Self");
});

test("zero damage and enemy-only events change nothing", () => {
  const tally = createDamageTally(opening(), "A");

  assert.equal(tally.ingest([hit("A-1", "B-1", 0)]), false);
  assert.equal(tally.ingest([hit("B-1", "B-1", 4)]), false);
  assert.equal(tally.ingest([]), false);
});

test("an unknown source hitting a friendly unit is a loud error", () => {
  const tally = createDamageTally(opening(), "A");

  assert.throws(() => tally.ingest([hit("Z-9", "A-1", 4)]), /never seen unit Z-9/);
});

test("healing is credited to the healer under the cause", () => {
  const tally = createDamageTally(opening(), "A");

  assert.equal(
    tally.ingest([heal("A-1", "A-2", 4, "safety-bubble"), heal("B-1", "B-1", 2, "attack")]),
    true,
  );

  const paladin = entryOf(tally.read().entries, "A-1");
  assert.deepEqual(paladin.sources.healing, [{ label: "Safety Bubble", amount: 4 }]);
});

test("combo links count setups and payoffs for friendly units only", () => {
  const tally = createDamageTally(opening(), "A");

  const changed = tally.ingest([
    {
      kind: "combo-link",
      tick: 1,
      sequence: 1,
      teamId: "A",
      count: 1,
      setupUnitId: "A-1",
      payoffUnitId: "A-2",
      targetUnitId: "B-1",
      state: "burning",
      unitIds: ["A-1", "A-2"],
    },
  ]);

  const entries = tally.read().entries;
  assert.equal(changed, true);
  assert.equal(entryOf(entries, "A-1").setups, 1);
  assert.equal(entryOf(entries, "A-2").payoffs, 1);
});

test("a death marks the friendly unit as fallen and ignores enemies", () => {
  const tally = createDamageTally(opening(), "A");

  assert.equal(
    tally.ingest([{ kind: "death", tick: 1, sequence: 1, unitId: "A-2", killerUnitId: "B-1" }]),
    true,
  );
  assert.equal(
    tally.ingest([{ kind: "death", tick: 2, sequence: 2, unitId: "B-1", killerUnitId: "A-1" }]),
    false,
  );
  assert.equal(entryOf(tally.read().entries, "A-2").alive, false);
  assert.equal(entryOf(tally.read().entries, "A-1").alive, true);
});

test("reads are snapshots and later events do not mutate them", () => {
  const tally = createDamageTally(opening(), "A");
  const before = tally.read();

  tally.ingest([hit("A-1", "B-1", 10)]);

  assert.equal(entryOf(before.entries, "A-1").totals.dealt, 0);
  assert.equal(entryOf(tally.read().entries, "A-1").totals.dealt, 10);
});

test("entries rank by the metric with roster order breaking ties", () => {
  const tally = createDamageTally(opening(), "A");
  tally.ingest([hit("A-2", "B-1", 10)]);

  const snapshot = tally.read();
  assert.deepEqual(
    rankEntries(snapshot, "dealt").map((entry) => entry.unitId),
    ["A-2", "A-1"],
  );
  assert.deepEqual(
    rankEntries(snapshot, "taken").map((entry) => entry.unitId),
    ["A-1", "A-2"],
  );
  assert.equal(teamTotal(snapshot, "dealt"), 10);
});

test("only the top sources are listed and the rest fold into Other", () => {
  const sources = Array.from({ length: TOP_SOURCES + 2 }, (_, index) => ({
    label: `source ${index}`,
    amount: 10 - index,
  }));

  const shown = topSources(sources);
  assert.equal(shown.length, TOP_SOURCES + 1);
  assert.deepEqual(shown.at(-1), {
    label: "Other",
    amount: 10 - TOP_SOURCES + (10 - TOP_SOURCES - 1),
  });
  assert.deepEqual(topSources(sources.slice(0, 2)), sources.slice(0, 2));
  assert.deepEqual(topSources(sources, 1).at(-1)?.label, "Other");
});
