import {
  createBattle,
  createHeroBuild,
  ownCellCenter,
  stepBattle,
  type BattleResult,
  type BattleSetup,
  type BoardSide,
  type Catalogue,
  type UnitSetup,
  withEquipment,
} from "@jev-game/game";
import { boardArena, defaultFormation } from "@jev-game/content";
import type { BattleJob, BattleJobResult, HeroPick, HeroTally, NotableBattle } from "./types.js";

const SOUTH_TEAM_ID = "A";

const NORTH_TEAM_ID = "B";

const MAX_NOTABLE_PER_JOB = 3;

interface UnitCounters {
  casts: number;
  ultimateCasts: number;
  firstUltimateTick: number | null;
}

interface PlayedBattle {
  result: BattleResult;
  setup: BattleSetup;
  counters: Record<string, UnitCounters>;
  survivors: Set<string>;
  budgetTrips: number;
  combos: number;
}

function teamUnits(teamId: string, picks: readonly HeroPick[], side: BoardSide, catalogue: Catalogue): UnitSetup[] {
  const formation = defaultFormation(picks.map((pick) => pick.heroId));

  return picks.map((pick, index) => {
    const unitId = `${teamId}-${index + 1}`;
    const cell = formation[index];

    if (cell === undefined) {
      throw new Error(`no formation cell for ${unitId}`);
    }

    return {
      unitId,
      teamId,
      build: withEquipment(createHeroBuild(unitId, pick.heroId, pick.upgradeIds, catalogue), pick.itemIds ?? [], pick.gems ?? []),
      spawn: ownCellCenter(boardArena, side, cell),
    };
  });
}

export function createSurveySetup(
  seed: number,
  south: readonly HeroPick[],
  north: readonly HeroPick[],
  catalogue: Catalogue,
): BattleSetup {
  return {
    rulesetId: "balance-survey",
    rulesetVersion: 1,
    seed,
    arenaId: boardArena.id,
    units: [
      ...teamUnits(SOUTH_TEAM_ID, south, "south", catalogue),
      ...teamUnits(NORTH_TEAM_ID, north, "north", catalogue),
    ],
  };
}

export function playBattle(setup: BattleSetup, catalogue: Catalogue): PlayedBattle {
  const state = createBattle(setup, catalogue);
  const counters: Record<string, UnitCounters> = {};
  let budgetTrips = 0;
  let combos = 0;

  for (const unit of state.units) {
    counters[unit.unitId] = { casts: 0, ultimateCasts: 0, firstUltimateTick: null };
  }

  while (state.result === null) {
    const step = stepBattle(state, catalogue);

    for (const event of step.events) {
      if (event.kind === "reaction-budget-exceeded") {
        budgetTrips += 1;
        continue;
      }

      if (event.kind === "combo-detonated") {
        combos += 1;
        continue;
      }

      if (event.kind !== "cast") {
        continue;
      }

      const counter = counters[event.sourceUnitId];

      if (counter === undefined) {
        continue;
      }

      counter.casts += 1;

      if (event.ultimate === true && event.triggered !== true) {
        counter.ultimateCasts += 1;
        counter.firstUltimateTick ??= event.tick;
      }
    }
  }

  const survivors = new Set<string>();

  for (const unit of state.units) {
    if (unit.alive) {
      survivors.add(unit.unitId);
    }
  }

  return { result: state.result, setup, counters, survivors, budgetTrips, combos };
}

function pickListKey(picks: readonly HeroPick[]): string {
  return JSON.stringify(picks);
}

function emptyTally(): HeroTally {
  return {
    appearances: 0,
    damageDealt: 0,
    deaths: 0,
    casts: 0,
    ultimateCasts: 0,
    firstUltimateTickSum: 0,
    firstUltimateSamples: 0,
  };
}

function describeOutcome(result: BattleResult, firstSouth: boolean): string {
  if (result.kind === "win") {
    const firstWon = (result.winningTeamId === SOUTH_TEAM_ID) === firstSouth;

    return `${firstWon ? "first" : "second"} won at tick ${result.endedAtTick}`;
  }

  if (result.kind === "draw") {
    return `draw (${result.reason}) at tick ${result.endedAtTick}`;
  }

  return `failure (${result.reason}) at tick ${result.endedAtTick}`;
}

function tallyUnits(played: PlayedBattle, tallies: Record<string, HeroTally>): void {
  const damageDealt = played.result.damageDealt;

  for (const unit of played.setup.units) {
    const heroId = unit.build.heroId;
    const tally = tallies[heroId] ?? emptyTally();
    const counter = played.counters[unit.unitId];

    tally.appearances += 1;
    tally.damageDealt += damageDealt[unit.unitId] ?? 0;

    for (const [unitId, amount] of Object.entries(damageDealt)) {
      if (unitId.startsWith(`${unit.unitId}.`)) {
        tally.damageDealt += amount;
      }
    }

    tally.casts += counter?.casts ?? 0;
    tally.ultimateCasts += counter?.ultimateCasts ?? 0;

    if (counter !== undefined && counter.firstUltimateTick !== null) {
      tally.firstUltimateTickSum += counter.firstUltimateTick;
      tally.firstUltimateSamples += 1;
    }

    tallies[heroId] = tally;
  }
}

function tallyDeaths(played: PlayedBattle, tallies: Record<string, HeroTally>): void {
  for (const unit of played.setup.units) {
    const tally = tallies[unit.build.heroId];

    if (tally !== undefined && !played.survivors.has(unit.unitId)) {
      tally.deaths += 1;
    }
  }
}

export function runBattleJob(job: BattleJob, catalogue: Catalogue): BattleJobResult {
  const outcome: BattleJobResult = {
    index: job.index,
    battles: 0,
    firstWins: 0,
    secondWins: 0,
    mutualEliminations: 0,
    timeouts: 0,
    failures: 0,
    budgetTrips: 0,
    southWins: 0,
    northWins: 0,
    combos: 0,
    endTicks: [],
    distinctOutcomes: 0,
    heroTallies: {},
    notable: [],
  };

  const outcomes = new Set<string>();
  const mirror = pickListKey(job.first) === pickListKey(job.second);

  for (let offset = 0; offset < job.seedCount; offset += 1) {
    for (const firstSouth of [true, false]) {
      const seed = mirror && !firstSouth ? job.seedBase + job.seedCount + offset : job.seedBase + offset;

      const setup = firstSouth
        ? createSurveySetup(seed, job.first, job.second, catalogue)
        : createSurveySetup(seed, job.second, job.first, catalogue);

      const played = playBattle(setup, catalogue);
      const { result } = played;

      outcome.battles += 1;
      outcome.budgetTrips += played.budgetTrips;
      outcome.combos += played.combos;
      outcome.endTicks.push(result.endedAtTick);

      if (result.kind === "win") {
        const southWon = result.winningTeamId === SOUTH_TEAM_ID;
        const firstWon = southWon === firstSouth;

        if (firstWon) {
          outcome.firstWins += 1;
        } else {
          outcome.secondWins += 1;
        }

        if (southWon) {
          outcome.southWins += 1;
        } else {
          outcome.northWins += 1;
        }
      } else if (result.kind === "draw" && result.reason === "timeout") {
        outcome.timeouts += 1;
      } else if (result.kind === "draw") {
        outcome.mutualEliminations += 1;
      } else {
        outcome.failures += 1;
      }

      tallyUnits(played, outcome.heroTallies);
      tallyDeaths(played, outcome.heroTallies);

      const described = describeOutcome(result, firstSouth);
      outcomes.add(described);

      const isNotable = result.kind === "failure" || played.budgetTrips > 0 || (result.kind === "draw" && result.reason === "timeout");

      if (isNotable && outcome.notable.length < MAX_NOTABLE_PER_JOB) {
        const notable: NotableBattle = { seed, firstSouth, outcome: described };
        outcome.notable.push(notable);
      }
    }
  }

  outcome.distinctOutcomes = outcomes.size;

  return outcome;
}
