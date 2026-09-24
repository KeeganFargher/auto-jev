import { createBattle, stepBattle, type BattleResult, type BattleSetup, type Catalogue } from "@jev-game/game";
import { createPairings, recordPairingRound, createEmptyPairingHistory } from "./pairings.js";
import type { PlayerId, RunId } from "./ids.js";
import type { ControllerKind, PendingDecision, PlayerSeat, RoundBattle, RunState } from "./types.js";
import { derivePairingSeed, deriveBattleSeed } from "./seed.js";
import { createMatchBattleSetup } from "./battle-setup.js";
import { generateHeroOffers } from "./offers.js";
import { generateRewardDecisions } from "./rewards.js";
import { equippedBuilds } from "./inventory.js";
import { DEFAULT_RUN_RULES, type RunRules } from "./rules.js";
import { activePairedPlayerIds, activePlayerIds, allRequiredSeatsReady, pairablePlayerIds } from "./readiness.js";

export interface SeatSpec {
  playerId: PlayerId;
  displayName: string;
  controllerKind: ControllerKind;
}

export function createRun(
  runId: RunId,
  runSeed: number,
  seatSpecs: readonly SeatSpec[],
  rules: RunRules = DEFAULT_RUN_RULES,
): RunState {
  const players: Record<PlayerId, PlayerSeat> = {};

  for (const spec of seatSpecs) {
    players[spec.playerId] = {
      playerId: spec.playerId,
      displayName: spec.displayName,
      controllerKind: spec.controllerKind,
      heroBuilds: [],
      formation: [],
      items: [],
      runes: [],
      nextInstanceId: 1,
      runHealth: rules.startingHealth,
      eliminated: false,
      forfeited: false,
      decisionRevision: 0,
    };
  }

  const initialPlayerIds = seatSpecs.map((spec) => spec.playerId);

  return {
    runId,
    runSeed,
    phase: "lobby",
    phaseEpoch: 0,
    roundCap: rules.roundCap,
    rules,
    initialPlayerIds,
    players,
    pairingHistory: createEmptyPairingHistory(initialPlayerIds),
    currentRound: null,
    readyThresholdByPlayer: {},
    heroOffersByPlayer: {},
    pendingDecisionsByPlayer: {},
    lastRoundLoserIds: [],
    winnerPlayerIds: null,
    abortReason: null,
  };
}

function withReadyThreshold(state: RunState, requiredPlayerIds: readonly PlayerId[]): Record<PlayerId, number> {
  const thresholds: Record<PlayerId, number> = {};

  for (const playerId of requiredPlayerIds) {
    thresholds[playerId] = state.players[playerId]?.decisionRevision ?? 0;
  }

  return thresholds;
}

function enterDraftPhase(state: RunState, catalogue: Catalogue): RunState {
  const heroOffersByPlayer: Record<PlayerId, ReturnType<typeof generateHeroOffers>> = {};

  for (const playerId of activePlayerIds(state)) {
    heroOffersByPlayer[playerId] = generateHeroOffers(catalogue, state.runSeed, 0, playerId, state.rules.heroOfferCount);
  }

  return {
    ...state,
    phase: "draft",
    phaseEpoch: state.phaseEpoch + 1,
    heroOffersByPlayer,
    readyThresholdByPlayer: withReadyThreshold(state, activePlayerIds(state)),
  };
}

function enterPreparingPhase(state: RunState): RunState {
  const active = pairablePlayerIds(state);
  const pairingSeed = derivePairingSeed(state.runSeed);
  const pairingResult = createPairings(active, state.pairingHistory, pairingSeed);
  const round = state.pairingHistory.nextRound;

  const battles: Record<string, RoundBattle> = {};

  for (const pairing of pairingResult.pairings) {
    battles[pairing.battleId] = {
      battleId: pairing.battleId,
      teamAPlayerId: pairing.teamAPlayerId,
      teamBPlayerId: pairing.teamBPlayerId,
      setup: null,
      result: null,
      winnerSurvivors: null,
    };
  }

  const nextState: RunState = {
    ...state,
    phase: "preparing",
    phaseEpoch: state.phaseEpoch + 1,
    pairingHistory: recordPairingRound(state.pairingHistory, pairingResult),
    currentRound: { round, battles, byePlayerId: pairingResult.byePlayerId },
    heroOffersByPlayer: {},
    pendingDecisionsByPlayer: {},
  };

  return {
    ...nextState,
    readyThresholdByPlayer: withReadyThreshold(nextState, activePairedPlayerIds(nextState)),
  };
}

function enterBattlePhase(state: RunState, catalogue: Catalogue): RunState {
  if (state.currentRound === null) {
    return state;
  }

  const battles: Record<string, RoundBattle> = {};

  const { round } = state.currentRound;

  for (const [battleId, battle] of Object.entries(state.currentRound.battles)) {
    const teamA = state.players[battle.teamAPlayerId];
    const teamB = state.players[battle.teamBPlayerId];

    if (teamA === undefined || teamB === undefined) {
      continue;
    }

    const setup = createMatchBattleSetup(
      deriveBattleSeed(state.runSeed, round, battleId),
      { playerId: teamA.playerId, heroBuilds: equippedBuilds(teamA), formation: teamA.formation },
      { playerId: teamB.playerId, heroBuilds: equippedBuilds(teamB), formation: teamB.formation },
    );

    const resolved = resolveBattle(setup, catalogue);
    battles[battleId] = { ...battle, setup, result: resolved.result, winnerSurvivors: resolved.winnerSurvivors };
  }

  return {
    ...state,
    phase: "battle",
    phaseEpoch: state.phaseEpoch + 1,
    currentRound: { ...state.currentRound, battles },
  };
}

interface ResolvedBattle {
  result: BattleResult;
  winnerSurvivors: number | null;
}

export function resolveBattle(setup: BattleSetup, catalogue: Catalogue): ResolvedBattle {
  const state = createBattle(setup, catalogue);

  while (state.result === null) {
    stepBattle(state, catalogue);
  }

  const { result } = state;

  if (result.kind !== "win") {
    return { result, winnerSurvivors: null };
  }

  const winnerSurvivors = state.units.filter((unit) => unit.alive && unit.summonerUnitId === null && unit.teamId === result.winningTeamId).length;

  return { result, winnerSurvivors };
}

export function lossCost(rules: RunRules, winnerSurvivors: number | null): number {
  return Math.min(rules.maxLossCost, 1 + (winnerSurvivors ?? 0));
}

function computeWinners(survivors: readonly PlayerSeat[], eliminatedThisRound: readonly PlayerSeat[]): PlayerId[] {
  if (survivors.length === 0) {
    const stayed = eliminatedThisRound.filter((seat) => !seat.forfeited);

    return (stayed.length > 0 ? stayed : eliminatedThisRound).map((seat) => seat.playerId);
  }

  if (survivors.length === 1) {
    return survivors.map((seat) => seat.playerId);
  }

  const maxHealth = Math.max(...survivors.map((seat) => seat.runHealth));
  const winners: PlayerId[] = [];

  for (const seat of survivors) {
    if (seat.runHealth === maxHealth) {
      winners.push(seat.playerId);
    }
  }

  return winners;
}

export function forfeitSeat(state: RunState, playerId: PlayerId): RunState {
  const seat = state.players[playerId];

  if (seat === undefined || seat.eliminated || seat.forfeited) {
    return state;
  }

  return { ...state, players: { ...state.players, [playerId]: { ...seat, forfeited: true } } };
}

function settleRound(state: RunState): RunState {
  if (state.currentRound === null) {
    return state;
  }

  const battles = Object.values(state.currentRound.battles);
  const hasFailure = battles.some((battle) => battle.result?.kind === "failure");

  if (hasFailure) {
    return {
      ...state,
      phase: "finished",
      phaseEpoch: state.phaseEpoch + 1,
      abortReason: "a battle simulation failed to produce a valid result",
    };
  }

  const players = { ...state.players };
  const lastRoundLoserIds: PlayerId[] = [];

  for (const battle of battles) {
    if (battle.result === null || battle.result.kind !== "win") {
      continue;
    }

    const loserId =
      battle.result.winningTeamId === battle.teamAPlayerId ? battle.teamBPlayerId : battle.teamAPlayerId;

    const loser = players[loserId];

    if (loser !== undefined) {
      players[loserId] = { ...loser, runHealth: loser.runHealth - lossCost(state.rules, battle.winnerSurvivors) };
      lastRoundLoserIds.push(loserId);
    }
  }

  const eliminatedThisRound: PlayerSeat[] = [];

  for (const [playerId, seat] of Object.entries(players)) {
    if (seat.eliminated || (seat.runHealth > 0 && !seat.forfeited)) {
      continue;
    }

    const eliminated = { ...seat, runHealth: seat.forfeited ? 0 : Math.max(0, seat.runHealth), eliminated: true };
    players[playerId] = eliminated;
    eliminatedThisRound.push(eliminated);
  }

  const survivors = Object.values(players).filter((seat) => !seat.eliminated);
  const isFinalRound = state.currentRound.round + 1 >= state.rules.roundCap;
  const matchOver = survivors.length <= 1 || isFinalRound;

  return {
    ...state,
    phase: matchOver ? "finished" : "round-result",
    phaseEpoch: state.phaseEpoch + 1,
    players,
    lastRoundLoserIds,
    winnerPlayerIds: matchOver ? computeWinners(survivors, eliminatedThisRound) : null,
  };
}

function enterRewardPhase(state: RunState, catalogue: Catalogue): RunState {
  const pendingDecisionsByPlayer: Record<PlayerId, PendingDecision[]> = {};
  const survivorIds = activePlayerIds(state);
  const round = (state.currentRound?.round ?? 0) + 1;

  for (const playerId of survivorIds) {
    const seat = state.players[playerId];

    if (seat === undefined) {
      continue;
    }

    pendingDecisionsByPlayer[playerId] = generateRewardDecisions(
      catalogue,
      state.rules,
      state.runSeed,
      round,
      seat,
      state.lastRoundLoserIds.includes(playerId),
    );
  }

  const nextState: RunState = {
    ...state,
    phase: "reward",
    phaseEpoch: state.phaseEpoch + 1,
    pendingDecisionsByPlayer,
  };

  return { ...nextState, readyThresholdByPlayer: withReadyThreshold(nextState, survivorIds) };
}

export function advanceIfReady(state: RunState, catalogue: Catalogue): RunState {
  switch (state.phase) {
    case "lobby":
      return enterDraftPhase(state, catalogue);

    case "draft":
      return allRequiredSeatsReady(state, activePlayerIds(state))
        ? enterPreparingPhase(state)
        : state;

    case "preparing":
      return allRequiredSeatsReady(state, activePairedPlayerIds(state))
        ? enterBattlePhase(state, catalogue)
        : state;

    case "battle":
      return settleRound(state);

    case "round-result":
      return enterRewardPhase(state, catalogue);

    case "reward":
      return allRequiredSeatsReady(state, activePlayerIds(state))
        ? enterPreparingPhase(state)
        : state;

    case "finished":
      return state;

    default: {
      const exhaustive: never = state.phase;

      return exhaustive;
    }
  }
}

export function pumpRun(state: RunState, catalogue: Catalogue): RunState {
  let current = state;

  for (;;) {
    const next = advanceIfReady(current, catalogue);

    if (next.phaseEpoch === current.phaseEpoch) {
      return next;
    }

    current = next;

    if (current.phase === "finished") {
      return current;
    }
  }
}
