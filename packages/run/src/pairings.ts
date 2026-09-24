import { createRng, nextInt } from "@jev-game/game";
import type { BattleId, PlayerId } from "./ids.js";

export interface Pairing {
  battleId: BattleId;
  teamAPlayerId: PlayerId;
  teamBPlayerId: PlayerId;
}

export interface PairingRoundResult {
  pairings: Pairing[];
  byePlayerId: PlayerId | null;
}

export interface PairingHistory {
  initialPlayerIds: readonly PlayerId[];
  nextRound: number;
  encounterCounts: Record<string, number>;
  lastRoundOpponent: Record<PlayerId, PlayerId | null>;
  byeCounts: Record<PlayerId, number>;
  lastByeRound: Record<PlayerId, number | null>;
}

function pairKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function createEmptyPairingHistory(initialPlayerIds: readonly PlayerId[]): PairingHistory {
  const lastRoundOpponent: Record<PlayerId, PlayerId | null> = {};
  const byeCounts: Record<PlayerId, number> = {};
  const lastByeRound: Record<PlayerId, number | null> = {};

  for (const playerId of initialPlayerIds) {
    lastRoundOpponent[playerId] = null;
    byeCounts[playerId] = 0;
    lastByeRound[playerId] = null;
  }

  return {
    initialPlayerIds,
    nextRound: 0,
    encounterCounts: {},
    lastRoundOpponent,
    byeCounts,
    lastByeRound,
  };
}

export function recordPairingRound(history: PairingHistory, result: PairingRoundResult): PairingHistory {
  const round = history.nextRound;
  const encounterCounts = { ...history.encounterCounts };
  const lastRoundOpponent: Record<PlayerId, PlayerId | null> = {};
  const byeCounts = { ...history.byeCounts };
  const lastByeRound = { ...history.lastByeRound };

  for (const playerId of Object.keys(history.lastRoundOpponent)) {
    lastRoundOpponent[playerId] = null;
  }

  for (const pairing of result.pairings) {
    const key = pairKey(pairing.teamAPlayerId, pairing.teamBPlayerId);
    encounterCounts[key] = (encounterCounts[key] ?? 0) + 1;
    lastRoundOpponent[pairing.teamAPlayerId] = pairing.teamBPlayerId;
    lastRoundOpponent[pairing.teamBPlayerId] = pairing.teamAPlayerId;
  }

  if (result.byePlayerId !== null) {
    byeCounts[result.byePlayerId] = (byeCounts[result.byePlayerId] ?? 0) + 1;
    lastByeRound[result.byePlayerId] = round;
  }

  return {
    initialPlayerIds: history.initialPlayerIds,
    nextRound: round + 1,
    encounterCounts,
    lastRoundOpponent,
    byeCounts,
    lastByeRound,
  };
}

function seededShuffle(items: readonly PlayerId[], seed: number): PlayerId[] {
  const order = [...items];
  const rng = createRng(seed);

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = nextInt(rng, index + 1);
    const current = order[index]!;
    order[index] = order[swapIndex]!;
    order[swapIndex] = current;
  }

  return order;
}

function seededOrderRanks(count: number, seed: number): number[] {
  const indices = Array.from({ length: count }, (_unused, index) => index);
  const rng = createRng(seed);

  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swapIndex = nextInt(rng, index + 1);
    const current = indices[index]!;
    indices[index] = indices[swapIndex]!;
    indices[swapIndex] = current;
  }

  const ranks = Array.from({ length: count }, () => 0);

  indices.forEach((originalIndex, rank) => {
    ranks[originalIndex] = rank;
  });

  return ranks;
}

function sidedPairings(
  pairs: readonly (readonly [PlayerId, PlayerId])[],
  round: number,
): Pairing[] {
  const swapSides = round % 2 === 1;

  return pairs.map(([left, right], index) => ({
    battleId: `round-${round}-battle-${index}`,
    teamAPlayerId: swapSides ? right : left,
    teamBPlayerId: swapSides ? left : right,
  }));
}

function circleSchedulePairs(
  initialPlayerIds: readonly PlayerId[],
  pairingSeed: number,
  round: number,
): [PlayerId, PlayerId][] {
  const seatOrder = seededShuffle(initialPlayerIds, pairingSeed);
  const fixed = seatOrder[0]!;
  const rotating = seatOrder.slice(1);
  const cycleLength = rotating.length;
  const offset = ((round % cycleLength) + cycleLength) % cycleLength;
  const rotated = [...rotating.slice(offset), ...rotating.slice(0, offset)];

  const pairs: [PlayerId, PlayerId][] = [[fixed, rotated[0]!]];

  for (let i = 1, j = rotated.length - 1; i < j; i += 1, j -= 1) {
    pairs.push([rotated[i]!, rotated[j]!]);
  }

  return pairs;
}

function allPerfectMatchings(playerIds: readonly PlayerId[]): [PlayerId, PlayerId][][] {
  if (playerIds.length === 0) {
    return [[]];
  }

  const [first, ...rest] = playerIds;
  const matchings: [PlayerId, PlayerId][][] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const partner = rest[index]!;
    const remaining = [...rest.slice(0, index), ...rest.slice(index + 1)];

    for (const subMatching of allPerfectMatchings(remaining)) {
      matchings.push([[first!, partner], ...subMatching]);
    }
  }

  return matchings;
}

interface MatchingScore {
  immediateRematches: number;
  totalEncounters: number;
  rank: number;
}

function isBetterMatchingScore(a: MatchingScore, b: MatchingScore): boolean {
  if (a.immediateRematches !== b.immediateRematches) {
    return a.immediateRematches < b.immediateRematches;
  }

  if (a.totalEncounters !== b.totalEncounters) {
    return a.totalEncounters < b.totalEncounters;
  }

  return a.rank < b.rank;
}

function scoreMatching(matching: readonly [PlayerId, PlayerId][], history: PairingHistory, rank: number): MatchingScore {
  let immediateRematches = 0;
  let totalEncounters = 0;

  for (const [a, b] of matching) {
    if (history.lastRoundOpponent[a] === b) {
      immediateRematches += 1;
    }

    totalEncounters += history.encounterCounts[pairKey(a, b)] ?? 0;
  }

  return { immediateRematches, totalEncounters, rank };
}

interface ByeCandidate {
  playerId: PlayerId;
  byeCount: number;
  hadRecentBye: boolean;
  rank: number;
}

function isBetterByeCandidate(a: ByeCandidate, b: ByeCandidate): boolean {
  if (a.byeCount !== b.byeCount) {
    return a.byeCount < b.byeCount;
  }

  if (a.hadRecentBye !== b.hadRecentBye) {
    return !a.hadRecentBye;
  }

  return a.rank < b.rank;
}

function selectByePlayer(
  activePlayerIds: readonly PlayerId[],
  history: PairingHistory,
  round: number,
  pairingSeed: number,
): PlayerId {
  const ranks = seededOrderRanks(activePlayerIds.length, pairingSeed + round * 104_729 + 1);
  let best: ByeCandidate | null = null;

  activePlayerIds.forEach((playerId, index) => {
    const lastBye = history.lastByeRound[playerId] ?? null;

    const candidate: ByeCandidate = {
      playerId,
      byeCount: history.byeCounts[playerId] ?? 0,
      hadRecentBye: lastBye !== null && lastBye === round - 1,
      rank: ranks[index]!,
    };

    if (best === null || isBetterByeCandidate(candidate, best)) {
      best = candidate;
    }
  });

  return best!.playerId;
}

function isUnchangedFullRoster(
  activePlayerIds: readonly PlayerId[],
  initialPlayerIds: readonly PlayerId[],
): boolean {
  if (activePlayerIds.length !== initialPlayerIds.length) {
    return false;
  }

  const activeSet = new Set(activePlayerIds);

  return initialPlayerIds.every((playerId) => activeSet.has(playerId));
}

export function createPairings(
  activePlayerIds: readonly PlayerId[],
  history: PairingHistory,
  pairingSeed: number,
): PairingRoundResult {
  const round = history.nextRound;

  if (
    activePlayerIds.length > 0 &&
    activePlayerIds.length % 2 === 0 &&
    isUnchangedFullRoster(activePlayerIds, history.initialPlayerIds)
  ) {
    const pairs = circleSchedulePairs(history.initialPlayerIds, pairingSeed, round);

    return { pairings: sidedPairings(pairs, round), byePlayerId: null };
  }

  let pool = [...activePlayerIds];
  let byePlayerId: PlayerId | null = null;

  if (pool.length % 2 === 1) {
    byePlayerId = selectByePlayer(pool, history, round, pairingSeed);
    pool = pool.filter((playerId) => playerId !== byePlayerId);
  }

  const matchings = allPerfectMatchings(pool);
  const ranks = seededOrderRanks(matchings.length, pairingSeed + round * 104_729 + 2);

  let bestIndex = 0;
  let bestScore: MatchingScore | null = null;

  matchings.forEach((matching, index) => {
    const score = scoreMatching(matching, history, ranks[index]!);

    if (bestScore === null || isBetterMatchingScore(score, bestScore)) {
      bestScore = score;
      bestIndex = index;
    }
  });

  const chosen = matchings[bestIndex] ?? [];

  return { pairings: sidedPairings(chosen, round), byePlayerId };
}
