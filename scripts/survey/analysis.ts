import { teamKey, type PieceCase } from "./jobs.js";
import { addScore, quantile, scoreRate, type ScoreLine } from "./stats.js";
import type { BattleJob, BattleJobResult, BattleTier, HeroTally, NotableBattle, RunJobResult } from "./types.js";

export interface MatchupRow {
  tier: BattleTier;
  first: string;
  second: string;
  mirror: boolean;
  battles: number;
  firstRate: number;
  southRate: number;
  distinctOutcomes: number;
  mutualEliminations: number;
  timeouts: number;
  failures: number;
  budgetTrips: number;
  combos: number;
  medianTicks: number;
  notable: NotableBattle[];
}

export interface HeroRow {
  heroId: string;
  winRate: number;
  exclusiveWinRate: number;
  swapWinRate: number;
  battles: number;
  damagePerAppearance: number;
  deathRate: number;
  ultimateCastsPerAppearance: number;
  firstUltimateTick: number | null;
}

export interface TeamRow {
  team: string;
  winRate: number;
  battles: number;
}

export interface PieceRow {
  label: string;
  heroId: string;
  pieceId: string;
  category: string;
  rarePowerSpike: boolean;
  delta: number;
  pairs: number;
}

export interface RunPickRow {
  id: string;
  picks: number;
  pickRate: number;
  averagePlacement: number;
  winRate: number;
}

export interface RunSummary {
  runs: number;
  finished: number;
  stalled: number;
  aborted: number;
  medianRounds: number;
  maxRounds: number;
  heroes: RunPickRow[];
  upgrades: RunPickRow[];
  items: RunPickRow[];
  gems: RunPickRow[];
  eliminationRounds: number[];
}

function draws(result: BattleJobResult): number {
  return result.mutualEliminations + result.timeouts;
}

function decided(result: BattleJobResult): number {
  return result.battles - result.failures;
}

export function isMirror(job: BattleJob): boolean {
  return teamKey(job.first) === teamKey(job.second);
}

export function matchupRow(job: BattleJob, result: BattleJobResult): MatchupRow {
  const decidedBattles = decided(result);
  const half = draws(result) / 2;

  return {
    tier: job.tier,
    first: teamKey(job.first),
    second: teamKey(job.second),
    mirror: isMirror(job),
    battles: result.battles,
    firstRate: scoreRate({ score: result.firstWins + half, battles: decidedBattles }),
    southRate: scoreRate({ score: result.southWins + half, battles: decidedBattles }),
    distinctOutcomes: result.distinctOutcomes,
    mutualEliminations: result.mutualEliminations,
    timeouts: result.timeouts,
    failures: result.failures,
    budgetTrips: result.budgetTrips,
    combos: result.combos,
    medianTicks: quantile(result.endTicks, 0.5),
    notable: result.notable,
  };
}

function heroSet(job: BattleJob, side: "first" | "second"): Set<string> {
  return new Set((side === "first" ? job.first : job.second).map((pick) => pick.heroId));
}

function copies(job: BattleJob, side: "first" | "second", heroId: string): number {
  return (side === "first" ? job.first : job.second).filter((pick) => pick.heroId === heroId).length;
}

export function heroCopyWinRates(pairs: readonly [BattleJob, BattleJobResult][]): Map<string, ScoreLine> {
  const lines = new Map<string, ScoreLine>();

  for (const [job, result] of pairs) {
    const half = draws(result) / 2;
    const heroIds = new Set([...heroSet(job, "first"), ...heroSet(job, "second")]);

    for (const heroId of heroIds) {
      const firstCopies = copies(job, "first", heroId);
      const secondCopies = copies(job, "second", heroId);
      const line = lines.get(heroId) ?? { score: 0, battles: 0 };

      addScore(
        line,
        firstCopies * (result.firstWins + half) + secondCopies * (result.secondWins + half),
        (firstCopies + secondCopies) * decided(result),
      );
      lines.set(heroId, line);
    }
  }

  return lines;
}

export function heroWinRates(pairs: readonly [BattleJob, BattleJobResult][]): Map<string, ScoreLine> {
  const lines = new Map<string, ScoreLine>();

  function add(heroId: string, score: number, battles: number): void {
    const line = lines.get(heroId) ?? { score: 0, battles: 0 };
    addScore(line, score, battles);
    lines.set(heroId, line);
  }

  for (const [job, result] of pairs) {
    if (isMirror(job)) {
      continue;
    }

    const firstHeroes = heroSet(job, "first");
    const secondHeroes = heroSet(job, "second");
    const half = draws(result) / 2;

    for (const heroId of firstHeroes) {
      if (!secondHeroes.has(heroId)) {
        add(heroId, result.firstWins + half, decided(result));
      }
    }

    for (const heroId of secondHeroes) {
      if (!firstHeroes.has(heroId)) {
        add(heroId, result.secondWins + half, decided(result));
      }
    }
  }

  return lines;
}

function swappedHeroes(job: BattleJob): [string, string] | null {
  const rest = job.second.map((pick) => pick.heroId);
  const onlyFirst: string[] = [];

  for (const pick of job.first) {
    const at = rest.indexOf(pick.heroId);

    if (at >= 0) {
      rest.splice(at, 1);
    } else {
      onlyFirst.push(pick.heroId);
    }
  }

  const [firstHero] = onlyFirst;
  const [secondHero] = rest;

  return onlyFirst.length === 1 && rest.length === 1 && firstHero !== undefined && secondHero !== undefined ? [firstHero, secondHero] : null;
}

export function heroSwapWinRates(pairs: readonly [BattleJob, BattleJobResult][]): Map<string, ScoreLine> {
  const lines = new Map<string, ScoreLine>();

  function add(heroId: string, score: number, battles: number): void {
    const line = lines.get(heroId) ?? { score: 0, battles: 0 };
    addScore(line, score, battles);
    lines.set(heroId, line);
  }

  for (const [job, result] of pairs) {
    const swapped = swappedHeroes(job);

    if (swapped === null) {
      continue;
    }

    const half = draws(result) / 2;
    add(swapped[0], result.firstWins + half, decided(result));
    add(swapped[1], result.secondWins + half, decided(result));
  }

  return lines;
}

export function teamWinRates(pairs: readonly [BattleJob, BattleJobResult][]): TeamRow[] {
  const lines = new Map<string, ScoreLine>();

  function add(team: string, score: number, battles: number): void {
    const line = lines.get(team) ?? { score: 0, battles: 0 };
    addScore(line, score, battles);
    lines.set(team, line);
  }

  for (const [job, result] of pairs) {
    if (isMirror(job)) {
      continue;
    }

    const half = draws(result) / 2;
    add(teamKey(job.first), result.firstWins + half, decided(result));
    add(teamKey(job.second), result.secondWins + half, decided(result));
  }

  return [...lines.entries()]
    .map(([team, line]) => ({ team, winRate: scoreRate(line), battles: line.battles }))
    .sort((a, b) => b.winRate - a.winRate || a.team.localeCompare(b.team));
}

function mergeTallies(results: readonly BattleJobResult[]): Map<string, HeroTally> {
  const merged = new Map<string, HeroTally>();

  for (const result of results) {
    for (const [heroId, tally] of Object.entries(result.heroTallies)) {
      const current = merged.get(heroId) ?? {
        appearances: 0,
        damageDealt: 0,
        deaths: 0,
        casts: 0,
        ultimateCasts: 0,
        firstUltimateTickSum: 0,
        firstUltimateSamples: 0,
      };

      current.appearances += tally.appearances;
      current.damageDealt += tally.damageDealt;
      current.deaths += tally.deaths;
      current.casts += tally.casts;
      current.ultimateCasts += tally.ultimateCasts;
      current.firstUltimateTickSum += tally.firstUltimateTickSum;
      current.firstUltimateSamples += tally.firstUltimateSamples;
      merged.set(heroId, current);
    }
  }

  return merged;
}

export function heroRows(pairs: readonly [BattleJob, BattleJobResult][]): HeroRow[] {
  const winRates = heroCopyWinRates(pairs);
  const exclusiveRates = heroWinRates(pairs);
  const swapRates = heroSwapWinRates(pairs);
  const tallies = mergeTallies(pairs.map(([, result]) => result));
  const rows: HeroRow[] = [];

  for (const [heroId, tally] of tallies) {
    const line = winRates.get(heroId) ?? { score: 0, battles: 0 };
    const appearances = Math.max(1, tally.appearances);

    rows.push({
      heroId,
      winRate: scoreRate(line),
      exclusiveWinRate: scoreRate(exclusiveRates.get(heroId) ?? { score: 0, battles: 0 }),
      swapWinRate: scoreRate(swapRates.get(heroId) ?? { score: 0, battles: 0 }),
      battles: line.battles,
      damagePerAppearance: tally.damageDealt / appearances,
      deathRate: tally.deaths / appearances,
      ultimateCastsPerAppearance: tally.ultimateCasts / appearances,
      firstUltimateTick:
        tally.firstUltimateSamples === 0 ? null : tally.firstUltimateTickSum / tally.firstUltimateSamples,
    });
  }

  return rows.sort((a, b) => b.swapWinRate - a.swapWinRate || a.heroId.localeCompare(b.heroId));
}

export function sideRate(results: readonly BattleJobResult[]): ScoreLine {
  const line: ScoreLine = { score: 0, battles: 0 };

  for (const result of results) {
    addScore(line, result.southWins + draws(result) / 2, decided(result));
  }

  return line;
}

export function pieceRows(cases: readonly PieceCase[], resultsByIndex: ReadonlyMap<number, BattleJobResult>): PieceRow[] {
  const rows: PieceRow[] = [];

  for (const pieceCase of cases) {
    let deltaSum = 0;
    let counted = 0;

    for (const pair of pieceCase.pairs) {
      const base = resultsByIndex.get(pair.baseJobIndex);
      const variant = resultsByIndex.get(pair.variantJobIndex);

      if (base === undefined || variant === undefined) {
        continue;
      }

      const baseRate = scoreRate({ score: base.firstWins + draws(base) / 2, battles: decided(base) });
      const variantRate = scoreRate({ score: variant.firstWins + draws(variant) / 2, battles: decided(variant) });
      deltaSum += variantRate - baseRate;
      counted += 1;
    }

    rows.push({
      label: pieceCase.label,
      heroId: pieceCase.heroId,
      pieceId: pieceCase.pieceId,
      category: pieceCase.category,
      rarePowerSpike: pieceCase.rarePowerSpike,
      delta: counted === 0 ? 0 : deltaSum / counted,
      pairs: counted,
    });
  }

  return rows.sort((a, b) => b.delta - a.delta || a.label.localeCompare(b.label));
}

interface PickLine {
  picks: number;
  placementSum: number;
  wins: number;
}

function pickRows(lines: Map<string, PickLine>, seats: number): RunPickRow[] {
  return [...lines.entries()]
    .map(([id, line]) => ({
      id,
      picks: line.picks,
      pickRate: seats === 0 ? 0 : line.picks / seats,
      averagePlacement: line.picks === 0 ? 0 : line.placementSum / line.picks,
      winRate: line.picks === 0 ? 0 : line.wins / line.picks,
    }))
    .sort((a, b) => a.averagePlacement - b.averagePlacement || a.id.localeCompare(b.id));
}

function notePick(lines: Map<string, PickLine>, id: string, placement: number): void {
  const line = lines.get(id) ?? { picks: 0, placementSum: 0, wins: 0 };
  line.picks += 1;
  line.placementSum += placement;
  line.wins += placement === 1 ? 1 : 0;
  lines.set(id, line);
}

export function summariseRuns(results: readonly RunJobResult[]): RunSummary {
  const heroes = new Map<string, PickLine>();
  const upgrades = new Map<string, PickLine>();
  const items = new Map<string, PickLine>();
  const gems = new Map<string, PickLine>();
  const eliminationRounds: number[] = [];
  let seats = 0;

  for (const result of results) {
    for (const seat of result.seats) {
      seats += 1;

      for (const heroId of new Set(seat.heroIds)) {
        notePick(heroes, heroId, seat.placement);
      }

      for (const upgradeId of new Set(seat.upgradeIds)) {
        notePick(upgrades, upgradeId, seat.placement);
      }

      for (const itemId of new Set(seat.itemIds)) {
        notePick(items, itemId, seat.placement);
      }

      for (const gemId of new Set(seat.gemIds)) {
        notePick(gems, gemId, seat.placement);
      }

      if (seat.eliminatedInRound !== null) {
        eliminationRounds.push(seat.eliminatedInRound);
      }
    }
  }

  const rounds = results.map((result) => result.rounds);

  return {
    runs: results.length,
    finished: results.filter((result) => result.finished).length,
    stalled: results.filter((result) => result.stalled).length,
    aborted: results.filter((result) => result.abortReason !== null).length,
    medianRounds: quantile(rounds, 0.5),
    maxRounds: rounds.length === 0 ? 0 : Math.max(...rounds),
    heroes: pickRows(heroes, seats),
    upgrades: pickRows(upgrades, seats),
    items: pickRows(items, seats),
    gems: pickRows(gems, seats),
    eliminationRounds,
  };
}
