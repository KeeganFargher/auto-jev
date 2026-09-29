import { runBattle, type BattleEvent, type BattleSetup, type TeamId } from "@jev-game/game";
import { battleDigest, gameCatalogue } from "@jev-game/content";
import {
  createEmptyPairingHistory,
  createPairings,
  recordPairingRound,
  type Pairing,
} from "./pairings.js";
import type { PlayerId, RunId } from "./ids.js";
import type { ControllerKind, PlayerSeat, RoundBattle, RoundState, RunState } from "./types.js";
import { deriveBattleSeed, derivePairingSeed } from "./seed.js";
import { createMatchBattleSetup } from "./battle-setup.js";
import { draftPool } from "./draft.js";
import { DEFAULT_RUN_RULES, lossCost, type RunRules } from "./rules.js";
import {
  activePlayerIds,
  allSeatsReady,
  pairablePlayerIds,
  pairedPlayerIds,
  requireRound,
  requireSeat,
} from "./readiness.js";

export interface SeatSpec {
  playerId: PlayerId;
  displayName: string;
  controllerKind: ControllerKind;
}

export interface ResolvedBattle {
  result: RoundBattle["result"];
  winnerSurvivors: number | null;
  presentationSeconds: number;
  digest: string;
}

export function createRun(
  runId: RunId,
  runSeed: number,
  seatSpecs: readonly SeatSpec[],
  rules: RunRules = DEFAULT_RUN_RULES,
): RunState {
  const initialPlayerIds = seatSpecs.map((spec) => spec.playerId);
  const pool = draftPool(gameCatalogue);

  if (seatSpecs.length < 2) {
    throw new Error(`A run needs at least 2 seats, got ${seatSpecs.length}`);
  }

  if (new Set(initialPlayerIds).size !== initialPlayerIds.length) {
    throw new Error(`Run ${runId} has a player id twice: ${initialPlayerIds.join(", ")}`);
  }

  if (rules.draftPicks < 1 || rules.draftPicks > pool.length) {
    throw new Error(`A draft of ${rules.draftPicks} heroes needs a pool of at least that many`);
  }

  const players: Record<PlayerId, PlayerSeat> = {};

  for (const spec of seatSpecs) {
    players[spec.playerId] = {
      playerId: spec.playerId,
      displayName: spec.displayName,
      controllerKind: spec.controllerKind,
      heroIds: [],
      formation: [],
      runHealth: rules.startingHealth,
      eliminated: false,
      forfeited: false,
      decisionRevision: 0,
    };
  }

  return {
    runId,
    runSeed,
    phase: "lobby",
    phaseEpoch: 0,
    rules,
    draftPool: pool,
    initialPlayerIds,
    players,
    pairingHistory: createEmptyPairingHistory(initialPlayerIds),
    currentRound: null,
    readyThresholdByPlayer: {},
    draftSelectionByPlayer: {},
    winnerPlayerIds: null,
  };
}

function thresholdsFor(state: RunState, playerIds: readonly PlayerId[]): Record<PlayerId, number> {
  const thresholds: Record<PlayerId, number> = {};

  for (const playerId of playerIds) {
    thresholds[playerId] = requireSeat(state, playerId).decisionRevision;
  }

  return thresholds;
}

function enterDraft(state: RunState): RunState {
  return {
    ...state,
    phase: "draft",
    phaseEpoch: state.phaseEpoch + 1,
    readyThresholdByPlayer: thresholdsFor(state, activePlayerIds(state)),
  };
}

function enterPreparing(state: RunState): RunState {
  const pairing = createPairings(
    pairablePlayerIds(state),
    state.pairingHistory,
    derivePairingSeed(state.runSeed),
  );

  const currentRound: RoundState = {
    round: state.pairingHistory.nextRound,
    pairings: pairing.pairings,
    byePlayerId: pairing.byePlayerId,
    battles: [],
  };

  return {
    ...state,
    phase: "preparing",
    phaseEpoch: state.phaseEpoch + 1,
    pairingHistory: recordPairingRound(state.pairingHistory, pairing),
    currentRound,
    draftSelectionByPlayer: {},
    readyThresholdByPlayer: thresholdsFor(state, pairedPlayerIds(currentRound)),
  };
}

export function survivorCount(
  setup: BattleSetup,
  events: readonly BattleEvent[],
  teamId: TeamId,
): number {
  const dead = new Set(events.flatMap((event) => (event.kind === "death" ? [event.unitId] : [])));

  return setup.units.filter((unit) => unit.teamId === teamId && !dead.has(unit.unitId)).length;
}

export function resolveBattle(setup: BattleSetup): ResolvedBattle {
  const outcome = runBattle(setup, gameCatalogue);
  const result = outcome.result;

  const winnerSurvivors =
    result.kind === "win" ? survivorCount(setup, outcome.events, result.winningTeamId) : null;

  if (winnerSurvivors === 0) {
    throw new Error(`Battle seed ${setup.seed} was won by a team with nobody left standing`);
  }

  return {
    result,
    winnerSurvivors,
    presentationSeconds: outcome.timeline.totalSeconds,
    digest: battleDigest(outcome.events),
  };
}

function fightPairing(state: RunState, round: number, pairing: Pairing): RoundBattle {
  const teamA = requireSeat(state, pairing.teamAPlayerId);
  const teamB = requireSeat(state, pairing.teamBPlayerId);

  const setup = createMatchBattleSetup(
    deriveBattleSeed(state.runSeed, round, pairing.battleId),
    teamA,
    teamB,
  );

  return { ...pairing, setup, ...resolveBattle(setup) };
}

function loserOf(battle: RoundBattle): PlayerId | null {
  const result = battle.result;

  if (result.kind === "draw") {
    return null;
  }

  if (result.winningTeamId === battle.teamAPlayerId) {
    return battle.teamBPlayerId;
  }

  if (result.winningTeamId === battle.teamBPlayerId) {
    return battle.teamAPlayerId;
  }

  throw new Error(`${battle.battleId} was won by "${result.winningTeamId}", who was not in it`);
}

function computeWinners(
  survivors: readonly PlayerSeat[],
  eliminatedThisRound: readonly PlayerSeat[],
): PlayerId[] {
  if (survivors.length === 0) {
    const stayed = eliminatedThisRound.filter((seat) => !seat.forfeited);

    return (stayed.length > 0 ? stayed : eliminatedThisRound).map((seat) => seat.playerId);
  }

  const bestHealth = Math.max(...survivors.map((seat) => seat.runHealth));

  return survivors.flatMap((seat) => (seat.runHealth === bestHealth ? [seat.playerId] : []));
}

function settleRound(state: RunState, round: RoundState): RunState {
  const players = { ...state.players };

  for (const battle of round.battles) {
    const loserId = loserOf(battle);

    if (loserId === null || battle.winnerSurvivors === null) {
      continue;
    }

    const loser = requireSeat(state, loserId);

    players[loserId] = {
      ...loser,
      runHealth: loser.runHealth - lossCost(state.rules, battle.winnerSurvivors),
    };
  }

  const eliminatedThisRound: PlayerSeat[] = [];

  for (const seat of Object.values(players)) {
    if (seat.eliminated || (seat.runHealth > 0 && !seat.forfeited)) {
      continue;
    }

    const runHealth = seat.forfeited ? 0 : Math.max(0, seat.runHealth);
    const eliminated = { ...seat, runHealth, eliminated: true };

    players[seat.playerId] = eliminated;
    eliminatedThisRound.push(eliminated);
  }

  const survivors = Object.values(players).filter((seat) => !seat.eliminated);
  const matchOver = survivors.length <= 1 || round.round + 1 >= state.rules.roundCap;

  return {
    ...state,
    phase: matchOver ? "finished" : "round-result",
    phaseEpoch: state.phaseEpoch + 1,
    players,
    currentRound: round,
    winnerPlayerIds: matchOver ? computeWinners(survivors, eliminatedThisRound) : null,
  };
}

function resolveRound(state: RunState): RunState {
  const round = requireRound(state);
  const battles = round.pairings.map((pairing) => fightPairing(state, round.round, pairing));

  return settleRound(state, { ...round, battles });
}

export function forfeitSeat(state: RunState, playerId: PlayerId): RunState {
  const seat = requireSeat(state, playerId);

  if (seat.eliminated || seat.forfeited) {
    return state;
  }

  return { ...state, players: { ...state.players, [playerId]: { ...seat, forfeited: true } } };
}

export function advanceIfReady(state: RunState): RunState {
  switch (state.phase) {
    case "lobby":
      return enterDraft(state);

    case "draft":
      return allSeatsReady(state, activePlayerIds(state)) ? enterPreparing(state) : state;

    case "preparing":
      return allSeatsReady(state, pairedPlayerIds(requireRound(state)))
        ? resolveRound(state)
        : state;

    case "round-result":
      return enterPreparing(state);

    case "finished":
      return state;
  }
}

export function pumpRun(state: RunState): RunState {
  let current = state;

  for (;;) {
    const next = advanceIfReady(current);

    if (next.phaseEpoch === current.phaseEpoch || next.phase === "finished") {
      return next;
    }

    current = next;
  }
}
