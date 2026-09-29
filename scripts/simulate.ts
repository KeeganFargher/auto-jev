import { parseArgs } from "node:util";
import {
  runBattle,
  TICK_RATE,
  type BattleEvent,
  type BattleResult,
  type ComboLinkEvent,
} from "@jev-game/game";
import {
  battleDigest,
  createCustomLabSetup,
  gameCatalogue,
  LAB_PRESETS,
  labPreset,
  sha256Hex,
  validateCatalogue,
  type LabPreset,
} from "@jev-game/content";
import {
  advanceIfReady,
  createRun,
  requireRound,
  runBotCommands,
  type RoundState,
  type RunState,
  type SeatSpec,
} from "@jev-game/run";

const MODES = ["all", "battle", "combos", "run"] as const;

type Mode = (typeof MODES)[number];

const MAX_RUN_STEPS = 1000;

interface ComboSummary {
  links: number;
  longest: number;
  byState: Map<string, number>;
}

interface PresetTally {
  battles: number;
  linkedBattles: number;
  links: number;
  longest: number;
  teamAWins: number;
  draws: number;
  seconds: number;
}

interface PlayedRun {
  state: RunState;
  rounds: RoundState[];
}

function integerOption(raw: string, name: string, minimum: number): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`--${name} must be a whole number of at least ${minimum}, got "${raw}"`);
  }

  return value;
}

function modeOf(raw: string): Mode {
  const mode = MODES.find((candidate) => candidate === raw);

  if (mode === undefined) {
    throw new Error(`Unknown mode "${raw}". Modes: ${MODES.join(", ")}`);
  }

  return mode;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function percent(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`;
}

function seconds(ticks: number): string {
  return `${(ticks / TICK_RATE).toFixed(1)}s`;
}

function describeResult(result: BattleResult): string {
  if (result.kind === "win") {
    return `${result.winningTeamId} won at ${seconds(result.endedAtTick)}`;
  }

  return `draw (${result.reason}) at ${seconds(result.endedAtTick)}`;
}

function comboLinks(events: readonly BattleEvent[]): ComboLinkEvent[] {
  return events.flatMap((event) => (event.kind === "combo-link" ? [event] : []));
}

function summariseCombos(events: readonly BattleEvent[]): ComboSummary {
  const links = comboLinks(events);
  const byState = new Map<string, number>();

  for (const link of links) {
    byState.set(link.state, (byState.get(link.state) ?? 0) + 1);
  }

  return {
    links: links.length,
    longest: Math.max(0, ...links.map((link) => link.count)),
    byState,
  };
}

function presetBattle(preset: LabPreset, seed: number): ReturnType<typeof runBattle> {
  return runBattle(createCustomLabSetup(seed, preset.teamA, preset.teamB), gameCatalogue);
}

function showBattle(presetId: string, seed: number): void {
  const preset = labPreset(presetId);
  const outcome = presetBattle(preset, seed);
  const combos = summariseCombos(outcome.events);
  const casts = new Map<string, number>();

  for (const event of outcome.events) {
    if (event.kind === "signature") {
      const key = `${event.unitId} ${event.signature}`;
      casts.set(key, (casts.get(key) ?? 0) + 1);
    }
  }

  const states = [...combos.byState].map(([state, count]) => `${state} x${count}`).join(", ");

  console.log(`preset: ${preset.id} (${preset.name})`);
  console.log(`teams: A ${preset.teamA.join(", ")} | B ${preset.teamB.join(", ")}`);
  console.log(`seed: ${seed}`);
  console.log(`result: ${describeResult(outcome.result)}`);
  console.log(`events: ${outcome.events.length}, digest ${battleDigest(outcome.events)}`);

  console.log(
    `signatures: ${[...casts].map(([key, count]) => `${key} x${count}`).join(", ") || "none"}`,
  );

  console.log(
    `combo links: ${combos.links}${states === "" ? "" : ` (${states})`}, longest chain ${combos.longest}`,
  );

  console.log("damage dealt:");

  for (const [unitId, amount] of Object.entries(outcome.result.damageDealt)) {
    console.log(`  ${unitId}: ${amount}`);
  }
}

function tallyPreset(preset: LabPreset, seedCount: number): PresetTally {
  const tally: PresetTally = {
    battles: 0,
    linkedBattles: 0,
    links: 0,
    longest: 0,
    teamAWins: 0,
    draws: 0,
    seconds: 0,
  };

  for (let seed = 1; seed <= seedCount; seed += 1) {
    const outcome = presetBattle(preset, seed);
    const combos = summariseCombos(outcome.events);
    const result = outcome.result;

    tally.battles += 1;
    tally.linkedBattles += combos.links > 0 ? 1 : 0;
    tally.links += combos.links;
    tally.longest = Math.max(tally.longest, combos.longest);
    tally.teamAWins += result.kind === "win" && result.winningTeamId === "A" ? 1 : 0;
    tally.draws += result.kind === "draw" ? 1 : 0;
    tally.seconds += result.endedAtTick / TICK_RATE;
  }

  return tally;
}

function showCombos(seedCount: number): void {
  const rows = LAB_PRESETS.map((preset) => {
    const tally = tallyPreset(preset, seedCount);

    return [
      preset.id,
      String(tally.battles),
      percent(tally.linkedBattles, tally.battles),
      (tally.links / tally.battles).toFixed(2),
      String(tally.longest),
      percent(tally.teamAWins, tally.battles),
      percent(tally.draws, tally.battles),
      `${(tally.seconds / tally.battles).toFixed(1)}s`,
    ];
  });

  const header = ["preset", "battles", "linked", "links", "longest", "A wins", "draws", "length"];
  const table = [header, ...rows];

  const widths = header.map((_, column) =>
    Math.max(...table.map((row) => (row[column] ?? "").length)),
  );

  console.log(`combo rate over seeds 1-${seedCount}:`);

  for (const row of table) {
    console.log(
      `  ${row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ")}`.trimEnd(),
    );
  }
}

function botSeats(count: number): SeatSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `bot-${index + 1}`,
    displayName: `Bot ${index + 1}`,
    controllerKind: "random-bot",
  }));
}

function playRun(seed: number, seatCount: number): PlayedRun {
  let state = createRun(`sim-${seed}`, seed, botSeats(seatCount));
  const rounds: RoundState[] = [];

  for (let step = 0; step < MAX_RUN_STEPS; step += 1) {
    if (state.phase === "finished") {
      return { state, rounds };
    }

    const next = advanceIfReady(runBotCommands(state));

    if (next.phaseEpoch === state.phaseEpoch) {
      throw new Error(`Run ${state.runId} is stuck in ${state.phase}`);
    }

    if (next.phase === "round-result" || next.phase === "finished") {
      rounds.push(requireRound(next));
    }

    state = next;
  }

  throw new Error(`Run sim-${seed} did not finish within ${MAX_RUN_STEPS} steps`);
}

function runDigest(played: PlayedRun): string {
  return sha256Hex(
    JSON.stringify({
      players: played.state.players,
      winners: played.state.winnerPlayerIds,
      battles: played.rounds.map((round) => round.battles.map((battle) => battle.digest)),
    }),
  );
}

function describeRound(round: RoundState): string {
  let wins = 0;
  let links = 0;

  for (const battle of round.battles) {
    const outcome = runBattle(battle.setup, gameCatalogue);
    const replayed = battleDigest(outcome.events);

    if (replayed !== battle.digest) {
      throw new Error(
        `${battle.battleId} replayed to ${replayed}, the run recorded ${battle.digest}`,
      );
    }

    wins += battle.result.kind === "win" ? 1 : 0;
    links += comboLinks(outcome.events).length;
  }

  const bye = round.byePlayerId === null ? "" : `, bye ${round.byePlayerId}`;
  const draws = round.battles.length - wins;

  return `round ${round.round + 1}: ${plural(round.battles.length, "battle")}${bye}, ${plural(wins, "win")}, ${plural(draws, "draw")}, ${plural(links, "combo link")}`;
}

function showRun(seed: number, seatCount: number): void {
  const played = playRun(seed, seatCount);
  const state = played.state;
  const winners = state.winnerPlayerIds;

  if (winners === null) {
    throw new Error(`The run ended after ${played.rounds.length} rounds without winners`);
  }

  const digest = runDigest(played);
  const replayDigest = runDigest(playRun(seed, seatCount));

  if (replayDigest !== digest) {
    throw new Error(`Run sim-${seed} replayed to ${replayDigest}, the first play gave ${digest}`);
  }

  console.log(
    `run ${state.runId}: ${seatCount} bot seats, ${state.rules.draftPicks} picks from ${state.draftPool.join(", ")}`,
  );

  for (const seat of Object.values(state.players)) {
    console.log(`  ${seat.playerId}: ${seat.heroIds.join(", ")}`);
  }

  for (const round of played.rounds) {
    console.log(`  ${describeRound(round)}`);
  }

  const standings = Object.values(state.players)
    .sort((left, right) => right.runHealth - left.runHealth)
    .map((seat) => `${seat.playerId} ${seat.eliminated ? "out" : `on ${seat.runHealth} health`}`)
    .join(", ");

  console.log(`finished after ${played.rounds.length} rounds: ${standings}`);
  console.log(`winners: ${winners.join(", ")}`);
  console.log(`digest ${digest}, identical on replay`);
}

function main(): void {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      seed: { type: "string", default: "1" },
      seeds: { type: "string", default: "20" },
      seats: { type: "string", default: "8" },
    },
  });

  validateCatalogue(gameCatalogue);

  const mode = modeOf(positionals[0] ?? "all");
  const seed = integerOption(values.seed, "seed", 0);
  const seedCount = integerOption(values.seeds, "seeds", 1);
  const seatCount = integerOption(values.seats, "seats", 2);

  switch (mode) {
    case "all":
      showCombos(seedCount);
      console.log("");
      showRun(seed, seatCount);

      return;

    case "battle": {
      const presetId = positionals[1];

      if (presetId === undefined) {
        throw new Error(`Name a preset: ${LAB_PRESETS.map((preset) => preset.id).join(", ")}`);
      }

      showBattle(presetId, seed);

      return;
    }

    case "combos":
      showCombos(seedCount);

      return;

    case "run":
      showRun(seed, seatCount);

      return;
  }
}

main();
