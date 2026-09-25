import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { gameCatalogue as catalogue, validateCatalogue } from "@jev-game/content";
import {
  advanceIfReady,
  applyCommand,
  createRun,
  decideFallbackCommand,
  DEFAULT_RUN_RULES,
  deriveControllerSeed,
  getPlayerView,
  isSeatReady,
  runBotCommands,
  type PlayerId,
  type RunCommand,
  type RunState,
  type SeatSpec,
} from "@jev-game/run";
import { createTypeSafeProvider } from "./provider/client.js";
import { createCloudflareProvider } from "./provider/cloudflare.js";
import { createOfflineProvider } from "./provider/offline.js";
import { DEFAULT_PROVIDER_CONCURRENCY, limitProvider, type LimitedProvider } from "./provider/limiter.js";
import { providerFromEnvironment } from "./provider/environment.js";
import { applyJevOutcome, createJevDriver, type ApplyVerdict, type DriverOutcome } from "./driver.js";
import { replayKey, type DecisionRecord, type ReplayEntry } from "./decision-record.js";
import { draftQuestion } from "./decisions/choose-hero.js";
import { rewardQuestion } from "./decisions/choose-reward.js";

const SEAT_COUNT = 8;

const MAX_LOOP_STEPS = 20000;

const FAULT_TIMEOUT_MILLISECONDS = 300;

const IDLE_WAIT_MILLISECONDS = 1000;

type ProviderMode = "offline" | "jev" | "faults" | "faults-cloudflare";

interface Timings {
  draftMilliseconds: number;
  rewardMilliseconds: number;
}

interface RunReport {
  seed: number;
  finished: boolean;
  rounds: number;
  winners: PlayerId[];
  jevResults: { playerId: PlayerId; health: number; eliminated: boolean; won: boolean }[];
  records: DecisionRecord[];
  replayLog: ReplayEntry[];
  verdicts: Record<ApplyVerdict, number>;
  deadlineFallbacks: number;
  digest: string;
  wallMilliseconds: number;
}

const questionsSchema = z.object({
  questions: z.object({ decision: z.object({ criteria: z.record(z.string(), z.string().nullable()) }) }),
});

const requestBodySchema = z.union([questionsSchema, z.object({ input: questionsSchema }).transform((body) => body.input)]);

const FAULT_MODEL = "fault-injection";

const FAULTS = ["ok", "http-500", "malformed", "unknown-option", "hang", "http-429"] as const;

function jsonResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

function faultyFetch(): (input: string, init?: RequestInit) => Promise<Response> {
  let call = 0;

  return async (_input, init) => {
    const fault = FAULTS[call % FAULTS.length] ?? "ok";
    call += 1;
    const parsed = requestBodySchema.safeParse(JSON.parse(await new Response(init?.body ?? null).text()));
    const options = parsed.success ? Object.keys(parsed.data.questions.decision.criteria) : [];

    switch (fault) {
      case "http-500":
        return jsonResponse(500, JSON.stringify({ error: "injected server error" }));

      case "http-429":
        return jsonResponse(429, JSON.stringify({ error: "injected rate limit" }));

      case "malformed":
        return jsonResponse(200, JSON.stringify({ model: FAULT_MODEL, answers: {} }));

      case "unknown-option":
        return jsonResponse(
          200,
          JSON.stringify({
            model: FAULT_MODEL,
            answers: { decision: { type: "choice", choice: "not_an_option", probabilities: { not_an_option: 1 }, confidence: 1 } },
            usage: { input_tokens: 10, output_tokens: 1 },
          }),
        );

      case "hang":
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        });

      default: {
        const choice = options[0] ?? "none";

        return jsonResponse(
          200,
          JSON.stringify({
            model: FAULT_MODEL,
            answers: { decision: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } },
            usage: { input_tokens: 100, output_tokens: 5 },
          }),
        );
      }
    }
  };
}

function providerFor(mode: ProviderMode, seed: number, concurrency: number, offlineDelayMilliseconds: number): LimitedProvider {
  if (mode === "offline") {
    return limitProvider(createOfflineProvider(seed, offlineDelayMilliseconds), concurrency);
  }

  if (mode === "faults-cloudflare") {
    const provider = createCloudflareProvider({
      accountId: "probe-account",
      apiToken: "probe-fake-token",
      model: FAULT_MODEL,
      timeoutMilliseconds: FAULT_TIMEOUT_MILLISECONDS,
      fetch: faultyFetch(),
    });

    return limitProvider(provider, concurrency);
  }

  if (mode === "faults") {
    const provider = createTypeSafeProvider({
      apiKey: "probe-fake-key",
      model: FAULT_MODEL,
      timeoutMilliseconds: FAULT_TIMEOUT_MILLISECONDS,
      fetch: faultyFetch(),
    });

    return limitProvider(provider, concurrency);
  }

  const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/server");
  const serverEnvironment = [".env.development", ".env"].map((name) => resolve(serverDirectory, name)).find((path) => existsSync(path));

  if (serverEnvironment !== undefined) {
    process.loadEnvFile(serverEnvironment);
  }

  const selection = providerFromEnvironment(process.env);

  if (selection.kind === "none" || selection.provider.source !== "jev") {
    throw new Error(`cannot reach Jev: ${selection.kind === "none" ? selection.reason : "JEV_PROVIDER selects the offline stub"}`);
  }

  return selection.provider;
}

function seatsFor(jevPlayerIds: readonly PlayerId[]): SeatSpec[] {
  const seats: SeatSpec[] = [];

  for (let index = 0; index < SEAT_COUNT; index += 1) {
    const playerId = index < jevPlayerIds.length ? (jevPlayerIds[index] ?? `jev-${index + 1}`) : `bot-${index + 1}`;
    const jev = index < jevPlayerIds.length;

    seats.push({ playerId, displayName: jev ? `Jev ${index + 1}` : `Bot ${index + 1}`, controllerKind: jev ? "jev" : "random-bot" });
  }

  return seats;
}

function digestOf(state: RunState): string {
  const players = Object.values(state.players)
    .sort((first, second) => first.playerId.localeCompare(second.playerId))
    .map((seat) => ({
      playerId: seat.playerId,
      runHealth: seat.runHealth,
      eliminated: seat.eliminated,
      heroBuilds: seat.heroBuilds,
      items: seat.items,
      gems: seat.gems,
      formation: seat.formation,
    }));

  return JSON.stringify({
    phase: state.phase,
    round: state.currentRound?.round ?? 0,
    winners: state.winnerPlayerIds,
    pairingHistory: state.pairingHistory,
    players,
  });
}

function deadlineFor(state: RunState, timings: Timings | null): number | null {
  if (timings === null) {
    return null;
  }

  if (state.phase === "draft") {
    return Date.now() + timings.draftMilliseconds;
  }

  if (state.phase === "reward") {
    return Date.now() + timings.rewardMilliseconds;
  }

  return null;
}

const VERDICTS: readonly ApplyVerdict[] = ["applied", "superseded", "no-command", "stale-run", "stale-epoch", "stale-revision", "eliminated", "rejected"];

function emptyVerdicts(): Record<ApplyVerdict, number> {
  return { applied: 0, superseded: 0, "no-command": 0, "stale-run": 0, "stale-epoch": 0, "stale-revision": 0, eliminated: 0, rejected: 0 };
}

async function playRun(
  seed: number,
  jevPlayerIds: readonly PlayerId[],
  provider: LimitedProvider | null,
  replay: ReadonlyMap<string, RunCommand> | null,
  timings: Timings | null,
): Promise<RunReport> {
  const startedAt = Date.now();
  let state = advanceIfReady(createRun(`probe-${seed}`, seed, seatsFor(jevPlayerIds), DEFAULT_RUN_RULES), catalogue);
  const records: DecisionRecord[] = [];
  const replayLog: ReplayEntry[] = [];
  const verdicts = emptyVerdicts();
  const outcomes: DriverOutcome[] = [];
  let wake: (() => void) | null = null;
  let deadlineFallbacks = 0;

  const driver =
    provider === null
      ? null
      : createJevDriver({
          provider,
          catalogue,
          playerIds: jevPlayerIds,
          now: () => Date.now(),
          onOutcome: (outcome) => {
            outcomes.push(outcome);
            wake?.();
          },
        });

  function applyLogged(playerId: PlayerId, command: RunCommand): boolean {
    const seat = state.players[playerId];
    const result = applyCommand(state, command, catalogue);

    if (!result.accepted || seat === undefined) {
      return false;
    }

    replayLog.push({ playerId, phaseEpoch: state.phaseEpoch, decisionRevision: seat.decisionRevision, command });
    state = result.state;

    return true;
  }

  function applyReplay(): void {
    for (const playerId of jevPlayerIds) {
      for (let step = 0; step < 64; step += 1) {
        const seat = state.players[playerId];
        const command = seat === undefined ? undefined : replay?.get(replayKey(playerId, state.phaseEpoch, seat.decisionRevision));

        if (command === undefined || !applyLogged(playerId, command)) {
          break;
        }
      }
    }
  }

  function applyDeadlineFallback(): void {
    for (const playerId of jevPlayerIds) {
      const controllerSeed = deriveControllerSeed(state.runSeed, state.currentRound?.round ?? 0, playerId);

      for (let step = 0; step < 64 && !isSeatReady(state, playerId); step += 1) {
        const view = getPlayerView(state, playerId);
        const command = view === null || view.you.eliminated ? null : decideFallbackCommand(view, controllerSeed, catalogue);

        if (command === null || !applyLogged(playerId, command)) {
          break;
        }
      }
    }
  }

  let epoch = -1;
  let deadlineAt: number | null = null;

  for (let step = 0; step < MAX_LOOP_STEPS && state.phase !== "finished"; step += 1) {
    if (state.phaseEpoch !== epoch) {
      epoch = state.phaseEpoch;
      deadlineAt = deadlineFor(state, timings);
    }

    state = runBotCommands(state, catalogue);

    if (replay !== null) {
      applyReplay();
    }

    for (let outcome = outcomes.shift(); outcome !== undefined; outcome = outcomes.shift()) {
      records.push(...outcome.records);
      const seat = state.players[outcome.playerId];
      const applied = applyJevOutcome(state, outcome, catalogue);
      verdicts[applied.verdict] += 1;

      if (applied.verdict === "applied" && outcome.command !== null && seat !== undefined) {
        replayLog.push({ playerId: outcome.playerId, phaseEpoch: outcome.phaseEpoch, decisionRevision: seat.decisionRevision, command: outcome.command });
      }

      state = applied.state;
    }

    driver?.sync(state, deadlineAt);

    const next = advanceIfReady(state, catalogue);

    if (next.phaseEpoch !== state.phaseEpoch || next !== state) {
      state = next;
      continue;
    }

    if (driver === null) {
      break;
    }

    const waitMilliseconds = deadlineAt === null ? IDLE_WAIT_MILLISECONDS : Math.max(0, deadlineAt - Date.now());

    const timedOut = await new Promise<boolean>((resolveWait) => {
      const timer = setTimeout(() => {
        wake = null;
        resolveWait(true);
      }, waitMilliseconds);

      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolveWait(false);
      };

      if (outcomes.length > 0) {
        wake();
      }
    });

    if (timedOut && deadlineAt !== null && Date.now() >= deadlineAt) {
      applyDeadlineFallback();
      deadlineFallbacks += 1;
      deadlineAt = null;
    }
  }

  driver?.stop();

  return {
    seed,
    finished: state.phase === "finished",
    rounds: state.currentRound?.round ?? 0,
    winners: state.winnerPlayerIds ?? [],
    jevResults: jevPlayerIds.map((playerId) => {
      const seat = state.players[playerId];

      return {
        playerId,
        health: seat?.runHealth ?? 0,
        eliminated: seat?.eliminated ?? true,
        won: (state.winnerPlayerIds ?? []).includes(playerId),
      };
    }),
    records,
    replayLog,
    verdicts,
    deadlineFallbacks,
    digest: digestOf(state),
    wallMilliseconds: Date.now() - startedAt,
  };
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);

  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

function countBy(values: readonly string[]): string {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return JSON.stringify(Object.fromEntries(counts));
}

function printQuestions(seed: number, jevPlayerId: PlayerId): void {
  let state = advanceIfReady(createRun(`probe-${seed}`, seed, seatsFor([jevPlayerId]), DEFAULT_RUN_RULES), catalogue);
  const draftView = getPlayerView(state, jevPlayerId);
  const draft = draftView === null ? null : draftQuestion(draftView, catalogue, [], []);

  console.log(JSON.stringify(draft?.question ?? null, null, 2));

  for (let step = 0; step < MAX_LOOP_STEPS && state.phase !== "reward" && state.phase !== "finished"; step += 1) {
    const view = getPlayerView(state, jevPlayerId);
    const controllerSeed = deriveControllerSeed(state.runSeed, state.currentRound?.round ?? 0, jevPlayerId);
    const command = view === null || view.phase !== "draft" || view.you.ready ? null : decideFallbackCommand(view, controllerSeed, catalogue);

    const result = command === null ? null : applyCommand(state, command, catalogue);

    if (result !== null && result.accepted) {
      state = result.state;
    }

    state = advanceIfReady(runBotCommands(state, catalogue), catalogue);
  }

  const view = getPlayerView(state, jevPlayerId);
  const decision = view?.pendingDecisions[0];

  if (view === null || decision === undefined) {
    return;
  }

  const reward = rewardQuestion(view, catalogue, decision, [], (command) => {
    const result = applyCommand(state, command, catalogue);

    return result.accepted ? (result.state.players[jevPlayerId] ?? null) : null;
  });

  console.log(JSON.stringify(reward?.question ?? null, null, 2));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      seed: { type: "string", default: "1" },
      runs: { type: "string", default: "1" },
      "jev-seats": { type: "string", default: "1" },
      provider: { type: "string", default: "offline" },
      concurrency: { type: "string", default: String(DEFAULT_PROVIDER_CONCURRENCY) },
      "draft-seconds": { type: "string", default: "30" },
      "reward-seconds": { type: "string", default: "15" },
      records: { type: "string" },
      "show-question": { type: "boolean", default: false },
      "offline-delay-ms": { type: "string", default: "40" },
    },
  });

  const mode = z.enum(["offline", "jev", "faults", "faults-cloudflare"]).parse(values.provider);
  const firstSeed = Number(values.seed);
  const runs = Number(values.runs);
  const jevSeats = Math.min(SEAT_COUNT, Math.max(1, Number(values["jev-seats"])));
  const concurrency = Number(values.concurrency);
  const jevPlayerIds = Array.from({ length: jevSeats }, (_unused, index) => `jev-${index + 1}`);

  const timings: Timings = {
    draftMilliseconds: Number(values["draft-seconds"]) * 1000,
    rewardMilliseconds: Number(values["reward-seconds"]) * 1000,
  };

  validateCatalogue(catalogue);

  if (values["show-question"]) {
    printQuestions(firstSeed, jevPlayerIds[0] ?? "jev-1");

    return;
  }

  const provider = providerFor(mode, firstSeed, concurrency, Number(values["offline-delay-ms"]));
  const reports: RunReport[] = [];

  console.log(`provider: ${mode} (${provider.source}, ${provider.model}), Jev seats: ${jevSeats} of ${SEAT_COUNT}, the rest baseline random bots`);

  for (let run = 0; run < runs; run += 1) {
    const seed = firstSeed + run;
    const report = await playRun(seed, jevPlayerIds, provider, null, timings);
    const callsBefore = provider.load().calls;
    const replayCommands = new Map(report.replayLog.map((entry) => [replayKey(entry.playerId, entry.phaseEpoch, entry.decisionRevision), entry.command]));
    const replayed = await playRun(seed, jevPlayerIds, null, replayCommands, null);
    const replayCalls = provider.load().calls - callsBefore;
    reports.push(report);

    const jev = report.jevResults.map((result) => `${result.playerId} ${result.won ? "WON" : result.eliminated ? "out" : `alive ${result.health}hp`}`).join(", ");

    console.log(
      `seed ${seed}: ${report.finished ? "finished" : "DID NOT FINISH"} after round ${report.rounds} in ${(report.wallMilliseconds / 1000).toFixed(1)}s; winners ${report.winners.join(", ") || "none"}; ${jev}; replay ${replayed.digest === report.digest ? "identical" : "DIFFERENT"} with ${replayCalls} provider calls`,
    );
  }

  const records = reports.flatMap((report) => report.records);
  const answered = records.filter((record) => record.source !== "fallback");
  const latencies = answered.map((record) => record.durationMilliseconds);
  const verdicts = emptyVerdicts();

  for (const report of reports) {
    for (const verdict of VERDICTS) {
      verdicts[verdict] += report.verdicts[verdict];
    }
  }

  const load = provider.load();
  const inputTokens = answered.reduce((sum, record) => sum + (record.usage?.inputTokens ?? 0), 0);

  console.log(`decisions: ${records.length} (${countBy(records.map((record) => (record.source === "fallback" ? "fallback" : `${record.source} ${record.model ?? ""}`)))})`);
  console.log(`by kind: ${countBy(records.map((record) => record.kind))}`);
  console.log(`fallback reasons: ${countBy(records.flatMap((record) => (record.fallbackReason === null ? [] : [record.fallbackReason])))}`);
  console.log(`latency ms: p50 ${percentile(latencies, 0.5)}, p95 ${percentile(latencies, 0.95)}, max ${percentile(latencies, 1)}`);
  console.log(`provider calls ${load.calls}, peak concurrent ${load.peakActive} (limit ${concurrency}), input tokens ${inputTokens}`);
  console.log(`apply verdicts: ${JSON.stringify(verdicts)}; deadline fallbacks: ${reports.reduce((sum, report) => sum + report.deadlineFallbacks, 0)}`);

  if (values.records !== undefined) {
    writeFileSync(values.records, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
    console.log(`records written to ${values.records}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
