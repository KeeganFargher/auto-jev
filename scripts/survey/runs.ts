import { createRun, DEFAULT_RUN_RULES, pumpRun, runBotCommands, type RunState, type SeatSpec } from "@jev-game/run";
import type { Catalogue } from "@jev-game/game";
import type { RunJob, RunJobResult, SeatOutcome } from "./types.js";

const MAX_SETTLE_STEPS = 4000;

export const DEFAULT_ROUND_CAP = DEFAULT_RUN_RULES.roundCap;

export const DEFAULT_STARTING_HEALTH = DEFAULT_RUN_RULES.startingHealth;

export const DEFAULT_MAX_LOSS_COST = DEFAULT_RUN_RULES.maxLossCost;

function seatSpecs(count: number): SeatSpec[] {
  const specs: SeatSpec[] = [];

  for (let index = 0; index < count; index += 1) {
    specs.push({ playerId: `bot-${index + 1}`, displayName: `Bot ${index + 1}`, controllerKind: "random-bot" });
  }

  return specs;
}

function noteEliminations(state: RunState, eliminatedInRound: Map<string, number>): void {
  const round = (state.currentRound?.round ?? -1) + 1;

  for (const seat of Object.values(state.players)) {
    if (seat.eliminated && !eliminatedInRound.has(seat.playerId)) {
      eliminatedInRound.set(seat.playerId, round);
    }
  }
}

function placementScore(seat: SeatOutcome, winners: ReadonlySet<string>): number {
  if (winners.has(seat.playerId)) {
    return Number.POSITIVE_INFINITY;
  }

  if (seat.eliminatedInRound === null) {
    return 1_000_000 + seat.runHealth;
  }

  return seat.eliminatedInRound;
}

function assignPlacements(seats: SeatOutcome[], winners: ReadonlySet<string>): void {
  for (const seat of seats) {
    const score = placementScore(seat, winners);
    let better = 0;

    for (const other of seats) {
      if (placementScore(other, winners) > score) {
        better += 1;
      }
    }

    seat.placement = better + 1;
  }
}

export function playRun(job: RunJob, catalogue: Catalogue): RunJobResult {
  let state = createRun(`survey-${job.runSeed}`, job.runSeed, seatSpecs(job.seatCount), {
    ...DEFAULT_RUN_RULES,
    roundCap: job.roundCap,
    startingHealth: job.startingHealth,
    maxLossCost: job.maxLossCost,
  });

  const eliminatedInRound = new Map<string, number>();
  let stalled = true;

  for (let step = 0; step < MAX_SETTLE_STEPS; step += 1) {
    const pumped = pumpRun(state, catalogue);
    noteEliminations(pumped, eliminatedInRound);

    if (pumped.phase === "finished") {
      state = pumped;
      stalled = false;
      break;
    }

    const withBots = runBotCommands(pumped, catalogue);

    if (withBots === state) {
      break;
    }

    state = withBots;
  }

  const seats: SeatOutcome[] = Object.values(state.players).map((seat) => {
    const heroIds = seat.heroBuilds.map((build) => build.heroId);
    const itemIds = seat.items.map((piece) => piece.pieceId);
    const gemIds = seat.gems.map((piece) => piece.pieceId);
    const upgradeIds: string[] = [];

    for (const build of seat.heroBuilds) {
      for (const selection of build.upgrades) {
        for (let stack = 0; stack < selection.stacks; stack += 1) {
          upgradeIds.push(selection.upgradeId);
        }
      }
    }

    return {
      playerId: seat.playerId,
      heroIds,
      upgradeIds,
      itemIds,
      gemIds,
      eliminatedInRound: eliminatedInRound.get(seat.playerId) ?? null,
      runHealth: seat.runHealth,
      placement: 0,
    };
  });

  assignPlacements(seats, new Set(state.winnerPlayerIds ?? []));

  return {
    index: job.index,
    runSeed: job.runSeed,
    finished: state.phase === "finished",
    abortReason: state.abortReason,
    stalled,
    rounds: (state.currentRound?.round ?? -1) + 1,
    seats,
  };
}
