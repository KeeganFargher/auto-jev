import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";
import type { Catalogue } from "@jev-game/game";
import { playableHeroIds } from "@jev-game/run";
import {
  heroRows,
  isMirror,
  matchupRow,
  pieceRows,
  sideRate,
  summariseRuns,
  teamWinRates,
  type MatchupRow,
  type RunSummary,
} from "./survey/analysis.js";
import { playBattle, createSurveySetup } from "./survey/battles.js";
import { contentHash, loadCatalogue } from "./survey/catalogues.js";
import { stalePackages } from "./survey/freshness.js";
import { addPieceJobs, addSanityJobs, addTeamJobs, heroTeams, JobList, type PieceCase } from "./survey/jobs.js";
import { runTasks } from "./survey/pool.js";
import { DEFAULT_MAX_LOSS_COST, DEFAULT_ROUND_CAP, DEFAULT_STARTING_HEALTH } from "./survey/runs.js";
import { writeReport, type Flag, type SurveyParams, type SurveyReport } from "./survey/report.js";
import { percent, points, quantile, scoreRate, seconds, ticksToSeconds } from "./survey/stats.js";
import type {
  BattleJob,
  BattleJobResult,
  HeroPick,
  RunJob,
  RunJobResult,
  SurveyTier,
  WorkerTask,
} from "./survey/types.js";

const ALL_TIERS: readonly SurveyTier[] = ["sanity", "teams", "pieces", "runs"];

const BATTLES_PER_TASK = 400;

const RUNS_PER_TASK = 2;

const CONFIRMATION_CAP = 100;

const CONFIRMATION_SEED_OFFSET = 1_000_003;

const EXTREME_RATE = 0.75;

const HERO_RATE_LOW = 0.45;

const HERO_RATE_HIGH = 0.55;

const PIECE_SWING = 0.08;

const RARE_SPIKE_SWING = 0.2;

const MIRROR_BAND_LOW = 0.43;

const MIRROR_BAND_HIGH = 0.57;

const MIRROR_CHECK_MIN_BATTLES = 400;

const FIGHT_MEDIAN_LOW_SECONDS = 25;

const FIGHT_MEDIAN_HIGH_SECONDS = 40;

const FIGHT_P90_HIGH_SECONDS = 50;

const TIMEOUT_RATE_LIMIT = 0.02;

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));

interface SeedPlan {
  sanity: number;
  mirror: number;
  teams: number;
  confirm: number;
  pieces: number;
  runs: number;
}

const QUICK_PLAN: SeedPlan = { sanity: 10, mirror: 50, teams: 5, confirm: 100, pieces: 5, runs: 40 };

const FULL_PLAN: SeedPlan = { sanity: 100, mirror: 200, teams: 20, confirm: 200, pieces: 20, runs: 400 };

interface CliOptions {
  command: "survey" | "replay" | "help";
  tiers: SurveyTier[];
  full: boolean;
  threads: number;
  surveySeed: number;
  teamSize: number;
  seedOverride: number | null;
  runCount: number | null;
  roundCap: number;
  startingHealth: number;
  maxLossCost: number;
  seatCount: number;
  allowStale: boolean;
  outputRoot: string;
  positionals: string[];
}

const USAGE = `Usage:
  pnpm survey [sanity] [teams] [pieces] [runs] [options]
  pnpm survey replay <first team> <second team> <seed> <south|north>

Options:
  --full               full seed counts (minutes, not seconds)
  --threads <n>        worker threads (default 4; 1 runs in-process)
  --seed <n>           first battle seed (default 1)
  --seeds <n>          seeds per matchup for every battle tier
  --runs <n>           number of full runs
  --round-cap <n>      round cap for full runs (default: the run rules' cap)
  --health <n>         starting run health for full runs (default: the run rules)
  --max-loss <n>       most health one lost duel can cost (default: the run rules)
  --seats <n>          seats per full run (default 8)
  --team-size <n>      heroes per team in the round-robin (default 3)
  --allow-stale        run even when a package's dist is older than its src
  --out <dir>          report root (default reports/survey)

Teams are written as hero ids joined by commas. Upgrades and talents go in
square brackets, items in braces and runes in angle brackets:
  bulwark[bulwark-spiked-plate]{aegis},frostweaver<rune-echo>,duskblade`;

function parseInteger(flag: string, text: string | undefined): number {
  const value = Number(text);

  if (text === undefined || !Number.isInteger(value)) {
    throw new Error(`${flag} needs a whole number`);
  }

  return value;
}

function parseTier(text: string): SurveyTier | null {
  return ALL_TIERS.find((tier) => tier === text) ?? null;
}

function parseOptions(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    command: "survey",
    tiers: [],
    full: false,
    threads: Math.min(4, Math.max(1, availableParallelism() - 1)),
    surveySeed: 1,
    teamSize: 3,
    seedOverride: null,
    runCount: null,
    roundCap: DEFAULT_ROUND_CAP,
    startingHealth: DEFAULT_STARTING_HEALTH,
    maxLossCost: DEFAULT_MAX_LOSS_COST,
    seatCount: 8,
    allowStale: false,
    outputRoot: join(REPOSITORY_ROOT, "reports", "survey"),
    positionals: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];

    switch (arg) {
      case "--full":
        options.full = true;
        break;

      case "--allow-stale":
        options.allowStale = true;
        break;

      case "--help":
      case "-h":
        options.command = "help";
        break;

      case "--threads":
        options.threads = Math.max(1, parseInteger(arg, next));
        index += 1;
        break;

      case "--seed":
        options.surveySeed = parseInteger(arg, next);
        index += 1;
        break;

      case "--seeds":
        options.seedOverride = Math.max(1, parseInteger(arg, next));
        index += 1;
        break;

      case "--runs":
        options.runCount = Math.max(0, parseInteger(arg, next));
        index += 1;
        break;

      case "--round-cap":
        options.roundCap = Math.max(1, parseInteger(arg, next));
        index += 1;
        break;

      case "--health":
        options.startingHealth = Math.max(1, parseInteger(arg, next));
        index += 1;
        break;

      case "--max-loss":
        options.maxLossCost = Math.max(1, parseInteger(arg, next));
        index += 1;
        break;

      case "--seats":
        options.seatCount = Math.max(2, parseInteger(arg, next));
        index += 1;
        break;

      case "--team-size":
        options.teamSize = Math.max(1, parseInteger(arg, next));
        index += 1;
        break;

      case "--out":
        if (next === undefined) {
          throw new Error("--out needs a directory");
        }

        options.outputRoot = next;
        index += 1;
        break;

      default: {
        if (arg.startsWith("--")) {
          throw new Error(`unknown option ${arg}`);
        }

        options.positionals.push(arg);
      }
    }
  }

  if (options.positionals[0] === "replay") {
    options.command = "replay";

    return options;
  }

  for (const positional of options.positionals) {
    const tier = parseTier(positional);

    if (tier === null && positional !== "all") {
      throw new Error(`unknown tier "${positional}" (expected ${ALL_TIERS.join(", ")} or all)`);
    }

    if (tier !== null && !options.tiers.includes(tier)) {
      options.tiers.push(tier);
    }
  }

  if (options.tiers.length === 0) {
    options.tiers = [...ALL_TIERS];
  }

  return options;
}

function splitList(text: string | undefined): string[] {
  return text === undefined || text === "" ? [] : text.split("+");
}

function parseTeam(text: string): HeroPick[] {
  return text.split(",").map((part) => {
    const match = /^([^[\]{}<>]+)(?:\[([^\]]*)\])?(?:\{([^}]*)\})?(?:<([^>]*)>)?$/.exec(part.trim());

    if (match === null) {
      throw new Error(`can't read team member "${part}"`);
    }

    return { heroId: match[1]!, upgradeIds: splitList(match[2]), itemIds: splitList(match[3]), runeIds: splitList(match[4]) };
  });
}

function replay(options: CliOptions): void {
  const [, firstText, secondText, seedText, sideText] = options.positionals;

  if (firstText === undefined || secondText === undefined || seedText === undefined || (sideText !== "south" && sideText !== "north")) {
    throw new Error(USAGE);
  }

  const catalogue = loadCatalogue();
  const first = parseTeam(firstText);
  const second = parseTeam(secondText);
  const seed = parseInteger("seed", seedText);
  const setup = sideText === "south" ? createSurveySetup(seed, first, second, catalogue) : createSurveySetup(seed, second, first, catalogue);
  const played = playBattle(setup, catalogue);

  console.log(`first team (${firstText}) is ${sideText === "south" ? "A, south" : "B, north"}`);
  console.log(`result: ${JSON.stringify(played.result)}`);
  console.log(`length: ${seconds(played.result.endedAtTick)}`);
  console.log("setup:");
  console.log(JSON.stringify(setup, null, 2));
}

function battleTasks(jobs: readonly BattleJob[]): WorkerTask[] {
  const tasks: WorkerTask[] = [];
  let current: BattleJob[] = [];
  let battles = 0;

  for (const job of jobs) {
    current.push(job);
    battles += job.seedCount * 2;

    if (battles >= BATTLES_PER_TASK) {
      tasks.push({ kind: "battles", jobs: current });
      current = [];
      battles = 0;
    }
  }

  if (current.length > 0) {
    tasks.push({ kind: "battles", jobs: current });
  }

  return tasks;
}

function progress(label: string): (done: number, total: number) => void {
  let lastShown = -1;

  return (done, total) => {
    const shown = Math.floor((done / total) * 10);

    if (shown !== lastShown || done === total) {
      lastShown = shown;
      process.stderr.write(`\r${label}: ${done}/${total} tasks`);

      if (done === total) {
        process.stderr.write("\n");
      }
    }
  };
}

async function runBattleJobs(
  label: string,
  jobs: readonly BattleJob[],
  threads: number,
): Promise<Map<number, BattleJobResult>> {
  const replies = await runTasks(battleTasks(jobs), threads, progress(label));
  const results = new Map<number, BattleJobResult>();

  for (const reply of replies) {
    if (reply.kind === "battles") {
      for (const result of reply.results) {
        results.set(result.index, result);
      }
    }
  }

  return results;
}

async function runRunJobs(jobs: readonly RunJob[], threads: number): Promise<RunJobResult[]> {
  const tasks: WorkerTask[] = [];

  for (let start = 0; start < jobs.length; start += RUNS_PER_TASK) {
    tasks.push({ kind: "runs", jobs: jobs.slice(start, start + RUNS_PER_TASK) });
  }

  const replies = await runTasks(tasks, threads, progress("runs"));
  const results: RunJobResult[] = [];

  for (const reply of replies) {
    if (reply.kind === "runs") {
      results.push(...reply.results);
    }
  }

  return results.sort((a, b) => a.index - b.index);
}

function pairsFor(jobs: readonly BattleJob[], indices: readonly number[], results: ReadonlyMap<number, BattleJobResult>): [BattleJob, BattleJobResult][] {
  const pairs: [BattleJob, BattleJobResult][] = [];

  for (const index of indices) {
    const job = jobs[index];
    const result = results.get(index);

    if (job !== undefined && result !== undefined) {
      pairs.push([job, result]);
    }
  }

  return pairs;
}

function fightStats(pairs: readonly [BattleJob, BattleJobResult][]): SurveyReport["fight"] {
  const ticks: number[] = [];
  let battles = 0;
  let timeouts = 0;

  for (const [, result] of pairs) {
    ticks.push(...result.endTicks);
    battles += result.battles;
    timeouts += result.timeouts;
  }

  if (battles === 0) {
    return null;
  }

  return { medianTicks: quantile(ticks, 0.5), p90Ticks: quantile(ticks, 0.9), timeoutRate: timeouts / battles };
}

function collectFlags(report: SurveyReport, allRows: readonly MatchupRow[]): Flag[] {
  const flags: Flag[] = [];

  const failures = allRows.reduce((sum, row) => sum + row.failures, 0);
  const trips = allRows.reduce((sum, row) => sum + row.budgetTrips, 0);

  if (failures > 0) {
    flags.push({ severity: "warn", text: `${failures} battles ended in a simulation failure.` });
  }

  if (trips > 0) {
    flags.push({ severity: "warn", text: `The reaction budget tripped ${trips} times (a loop).` });
  }

  for (const row of report.sanity) {
    if (!row.mirror) {
      continue;
    }

    const outside = row.southRate < MIRROR_BAND_LOW || row.southRate > MIRROR_BAND_HIGH;

    if (outside && row.battles >= MIRROR_CHECK_MIN_BATTLES) {
      flags.push({ severity: "warn", text: `Mirror ${row.first}: south scores ${percent(row.southRate)} over ${row.battles} battles (side bias).` });
    } else if (outside) {
      flags.push({ severity: "info", text: `Mirror ${row.first}: south scores ${percent(row.southRate)}, but only over ${row.battles} battles.` });
    }
  }

  if (report.fight !== null) {
    const median = ticksToSeconds(report.fight.medianTicks);
    const p90 = ticksToSeconds(report.fight.p90Ticks);

    if (median < FIGHT_MEDIAN_LOW_SECONDS || median > FIGHT_MEDIAN_HIGH_SECONDS) {
      flags.push({ severity: "warn", text: `Median fight is ${median.toFixed(1)} s (target ${FIGHT_MEDIAN_LOW_SECONDS}–${FIGHT_MEDIAN_HIGH_SECONDS} s).` });
    }

    if (p90 > FIGHT_P90_HIGH_SECONDS) {
      flags.push({ severity: "warn", text: `90th-percentile fight is ${p90.toFixed(1)} s (target under ${FIGHT_P90_HIGH_SECONDS} s).` });
    }

    if (report.fight.timeoutRate > TIMEOUT_RATE_LIMIT) {
      flags.push({ severity: "warn", text: `${percent(report.fight.timeoutRate)} of team battles timed out (target under 2%).` });
    }
  }

  for (const hero of report.heroes) {
    if (hero.battles > 0 && (hero.swapWinRate < HERO_RATE_LOW || hero.swapWinRate > HERO_RATE_HIGH)) {
      flags.push({
        severity: "warn",
        text: `${hero.heroId} wins ${percent(hero.swapWinRate)} of one-swap matchups (teams that differ only by this hero; target 45–55%).`,
      });
    }
  }

  if (report.confirmed.length > 0) {
    const examples = report.confirmed.slice(0, 3).map((row) => {
      const favoured = row.firstRate >= 0.5 ? row.first : row.second;
      const other = row.firstRate >= 0.5 ? row.second : row.first;

      return `${favoured} beats ${other} ${percent(Math.max(row.firstRate, 1 - row.firstRate))}`;
    });

    flags.push({
      severity: "warn",
      text: `${report.confirmed.length} of ${report.teams.filter((row) => !row.mirror).length} non-mirror team matchups are confirmed hard counters (75%+ on fresh seeds)${report.unconfirmedExtremes > 0 ? `, plus ${report.unconfirmedExtremes} more over the confirmation cap` : ""}, for example ${examples.join("; ")}.`,
    });
  }

  for (const piece of report.pieces) {
    if (piece.pairs === 0) {
      continue;
    }

    const swing = piece.rarePowerSpike ? RARE_SPIKE_SWING : PIECE_SWING;

    if (Math.abs(piece.delta) > swing) {
      flags.push({ severity: "warn", text: `${piece.label} on ${piece.heroId} moves win rate ${points(piece.delta)} points.` });
    } else if (piece.rarePowerSpike && piece.delta > PIECE_SWING) {
      flags.push({ severity: "info", text: `Rare power spike: ${piece.label} on ${piece.heroId} is worth ${points(piece.delta)} points, which is fine for something this rare.` });
    } else if (piece.delta < 0.01) {
      flags.push({ severity: "info", text: `${piece.label} on ${piece.heroId} barely helps (${points(piece.delta)} points).` });
    }
  }

  if (report.medianDistinctOutcomes !== null && report.medianDistinctOutcomes <= 2) {
    flags.push({
      severity: "info",
      text: `Seeds barely matter yet: a matchup has a median of ${report.medianDistinctOutcomes} distinct outcomes, so win rates are close to fixed results rather than odds.`,
    });
  }

  if (report.runs !== null) {
    if (report.runs.stalled > 0 || report.runs.aborted > 0) {
      flags.push({ severity: "warn", text: `Full runs: ${report.runs.stalled} stalled and ${report.runs.aborted} aborted.` });
    }
  }

  return flags;
}

function summariseRunsOrNull(results: readonly RunJobResult[]): RunSummary | null {
  return results.length === 0 ? null : summariseRuns(results);
}

function directoryStamp(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z").replaceAll(":", "-");
}

function heroIdsOf(catalogue: Catalogue): string[] {
  return playableHeroIds(catalogue);
}

async function survey(options: CliOptions): Promise<void> {
  const packages = options.tiers.includes("runs") ? ["game", "content", "run"] : ["game", "content"];
  const stale = stalePackages(REPOSITORY_ROOT, packages);

  if (stale.length > 0 && !options.allowStale) {
    throw new Error(
      `the built dist is older than src for: ${stale.join(", ")}. Build them first (pnpm --filter @jev-game/<name> build) or pass --allow-stale.`,
    );
  }

  const plan = options.full ? FULL_PLAN : QUICK_PLAN;
  const override = options.seedOverride;
  const catalogue = loadCatalogue();
  const heroIds = heroIdsOf(catalogue);
  const teams = heroTeams(heroIds, options.teamSize);

  const params: SurveyParams = {
    tiers: options.tiers,
    mode: options.full ? "full" : "quick",
    surveySeed: options.surveySeed,
    teamSize: options.teamSize,
    sanitySeeds: override ?? plan.sanity,
    mirrorSeeds: override ?? plan.mirror,
    teamSeeds: override ?? plan.teams,
    confirmSeeds: plan.confirm,
    pieceSeeds: override ?? plan.pieces,
    runCount: options.runCount ?? plan.runs,
    roundCap: options.roundCap,
    startingHealth: options.startingHealth,
    maxLossCost: options.maxLossCost,
    seatCount: options.seatCount,
  };

  const list = new JobList();

  const sanityIndices = options.tiers.includes("sanity")
    ? addSanityJobs(list, heroIds, options.surveySeed, params.sanitySeeds, params.mirrorSeeds)
    : [];

  const teamIndices = options.tiers.includes("teams") ? addTeamJobs(list, teams, options.surveySeed, params.teamSeeds) : [];

  const pieceCases: PieceCase[] = options.tiers.includes("pieces")
    ? addPieceJobs(list, catalogue, teams, teams, options.surveySeed, params.pieceSeeds)
    : [];

  const started = Date.now();
  const battleCount = list.jobs.reduce((sum, job) => sum + job.seedCount * 2, 0);
  process.stderr.write(`${list.jobs.length} matchups, ${battleCount} battles, ${options.threads} threads\n`);

  const results = await runBattleJobs("battles", list.jobs, options.threads);

  const sanityPairs = pairsFor(list.jobs, sanityIndices, results);
  const teamPairs = pairsFor(list.jobs, teamIndices, results);

  const extremes = teamPairs
    .filter(([job, result]) => {
      if (isMirror(job)) {
        return false;
      }

      const rate = matchupRow(job, result).firstRate;

      return rate >= EXTREME_RATE || rate <= 1 - EXTREME_RATE;
    })
    .sort((a, b) => Math.abs(matchupRow(b[0], b[1]).firstRate - 0.5) - Math.abs(matchupRow(a[0], a[1]).firstRate - 0.5));

  const confirmList = new JobList();

  for (const [job] of extremes.slice(0, CONFIRMATION_CAP)) {
    confirmList.add("confirm", job.first, job.second, options.surveySeed + CONFIRMATION_SEED_OFFSET, params.confirmSeeds);
  }

  const confirmResults = await runBattleJobs("confirm", confirmList.jobs, options.threads);
  const confirmed: MatchupRow[] = [];

  for (const [index, job] of confirmList.jobs.entries()) {
    const result = confirmResults.get(index);

    if (result === undefined) {
      continue;
    }

    const row = matchupRow(job, result);

    if (row.firstRate >= EXTREME_RATE || row.firstRate <= 1 - EXTREME_RATE) {
      confirmed.push(row);
    }
  }

  const runJobs: RunJob[] = [];

  if (options.tiers.includes("runs")) {
    for (let index = 0; index < params.runCount; index += 1) {
      runJobs.push({
        index,
        runSeed: options.surveySeed + index,
        seatCount: options.seatCount,
        roundCap: options.roundCap,
        startingHealth: options.startingHealth,
        maxLossCost: options.maxLossCost,
      });
    }
  }

  const runResults = await runRunJobs(runJobs, options.threads);

  const sanityRows = sanityPairs.map(([job, result]) => matchupRow(job, result));
  const teamRows = teamPairs.map(([job, result]) => matchupRow(job, result));
  const allResults = [...sanityPairs, ...teamPairs].map(([, result]) => result);
  const south = sideRate(allResults);
  const distinct: number[] = [];

  for (const row of teamRows) {
    if (!row.mirror) {
      distinct.push(row.distinctOutcomes);
    }
  }

  const report: SurveyReport = {
    params,
    contentHash: contentHash(catalogue),
    flags: [],
    sanity: sanityRows,
    teams: teamRows,
    confirmed,
    unconfirmedExtremes: Math.max(0, extremes.length - CONFIRMATION_CAP),
    heroes: teamPairs.length === 0 ? [] : heroRows(teamPairs),
    teamRows: teamWinRates(teamPairs),
    pieces: pieceRows(pieceCases, results),
    runs: summariseRunsOrNull(runResults),
    fight: fightStats(teamPairs),
    southRate: south.battles === 0 ? null : scoreRate(south),
    medianDistinctOutcomes: distinct.length === 0 ? null : quantile(distinct, 0.5),
  };

  report.flags = collectFlags(report, [...sanityRows, ...teamRows]);

  const directory = writeReport(
    options.outputRoot,
    `${directoryStamp()}-${report.contentHash}`,
    report,
  );

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`survey finished in ${elapsed} s`);
  console.log(`report: ${join(directory, "report.md")}`);

  for (const flag of report.flags) {
    console.log(`  ${flag.severity}: ${flag.text}`);
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (options.command === "help") {
    console.log(USAGE);

    return;
  }

  if (options.command === "replay") {
    replay(options);

    return;
  }

  await survey(options);
}

await main();
