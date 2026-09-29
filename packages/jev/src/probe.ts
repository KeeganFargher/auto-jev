import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import type { HeroDefinitionId } from "@jev-game/game";
import { gameCatalogue, validateCatalogue } from "@jev-game/content";
import {
  advanceIfReady,
  applyCommand,
  createRun,
  decideFallbackCommand,
  DEFAULT_RUN_RULES,
  deriveControllerSeed,
  getPlayerView,
  isSeatReady,
  requireRound,
  requireSeat,
  runBotCommands,
  type PlayerId,
  type RunCommand,
  type RunState,
  type SeatSpec,
} from "@jev-game/run";
import { createTypeSafeProvider } from "./provider/client.js";
import { createCloudflareProvider } from "./provider/cloudflare.js";
import { createOfflineProvider } from "./provider/offline.js";
import {
  DEFAULT_PROVIDER_CONCURRENCY,
  limitProvider,
  type LimitedProvider,
} from "./provider/limiter.js";
import { providerFromEnvironment } from "./provider/environment.js";
import {
  applyJevOutcome,
  createJevDriver,
  type ApplyVerdict,
  type DriverOutcome,
} from "./driver.js";
import { DEADLINE, EARLIER_PICK_FAILED, SUPERSEDED } from "./controller.js";
import { replayKey, type DecisionRecord, type ReplayEntry } from "./decision-record.js";
import { draftQuestion } from "./decisions/choose-hero.js";

const SEAT_COUNT = 8;

const MAX_LOOP_STEPS = 20000;

const FAULT_TIMEOUT_MILLISECONDS = 300;

const FAULT_MODEL = "fault-injection";

type ProviderMode = "offline" | "jev" | "faults" | "faults-cloudflare";

type Fault = "ok" | "http-500" | "malformed" | "unknown-option" | "hang" | "http-429";

const FAULTS: readonly Fault[] = [
  "ok",
  "http-500",
  "malformed",
  "unknown-option",
  "hang",
  "http-429",
];

const SEAT_FALLBACKS: readonly string[] = [SUPERSEDED, DEADLINE, EARLIER_PICK_FAILED];

const INJECTED_FAILURES: readonly string[] = [
  "http-error",
  "rate-limited",
  "invalid-response",
  "unknown-option",
  "timeout",
];

const LIVE_FAILURES: readonly string[] = [...INJECTED_FAILURES, "connection", "provider-error"];

const VERDICTS: readonly ApplyVerdict[] = [
  "applied",
  "superseded",
  "stale-epoch",
  "stale-revision",
];

interface JevResult {
  playerId: PlayerId;
  health: number;
  eliminated: boolean;
  won: boolean;
}

interface RunReport {
  seed: number;
  finished: boolean;
  rounds: number;
  winners: PlayerId[];
  jevResults: JevResult[];
  records: DecisionRecord[];
  replayLog: ReplayEntry[];
  verdicts: Record<ApplyVerdict, number>;
  deadlineFallbacks: number;
  digest: string;
  wallMilliseconds: number;
}

const argumentsSchema = z.object({
  seed: z.coerce.number<string>().int(),
  runs: z.coerce.number<string>().int().positive(),
  "jev-seats": z.coerce.number<string>().int().min(1).max(SEAT_COUNT),
  provider: z.enum(["offline", "jev", "faults", "faults-cloudflare"]),
  concurrency: z.coerce.number<string>().int().positive(),
  "draft-seconds": z.coerce.number<string>().positive(),
  records: z.string().optional(),
  "show-question": z.boolean(),
  "offline-delay-ms": z.coerce.number<string>().int().nonnegative(),
});

const questionsSchema = z.object({
  questions: z.object({
    decision: z.object({ criteria: z.record(z.string(), z.string().nullable()) }),
  }),
});

const requestBodySchema = z.union([
  questionsSchema,
  z.object({ input: questionsSchema }).transform((body) => body.input),
]);

function jsonResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

function faultAt(call: number): Fault {
  const fault = FAULTS[call % FAULTS.length];

  if (fault === undefined) {
    throw new Error(`No fault is lined up for call ${call}`);
  }

  return fault;
}

function faultyFetch(): (input: string, init?: RequestInit) => Promise<Response> {
  let call = 0;

  return async (_input, init) => {
    const fault = faultAt(call);
    call += 1;

    if (init?.body === undefined || init.body === null || !init.signal) {
      throw new Error("the fault injector was sent a request without a body or a signal");
    }

    const signal = init.signal;
    const parsed = requestBodySchema.parse(JSON.parse(await new Response(init.body).text()));
    const options = Object.keys(parsed.questions.decision.criteria);

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
            answers: {
              decision: {
                type: "choice",
                choice: "not_an_option",
                probabilities: { not_an_option: 1 },
                confidence: 1,
              },
            },
            usage: { input_tokens: 10, output_tokens: 1 },
          }),
        );

      case "hang":
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });

      case "ok": {
        const choice = options[0];

        if (choice === undefined) {
          throw new Error("the fault injector was asked a question with no options");
        }

        return jsonResponse(
          200,
          JSON.stringify({
            model: FAULT_MODEL,
            answers: {
              decision: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 },
            },
            usage: { input_tokens: 100, output_tokens: 5 },
          }),
        );
      }
    }
  };
}

function liveProvider(): LimitedProvider {
  const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/server");

  const serverEnvironment = [".env.development", ".env"]
    .map((name) => resolve(serverDirectory, name))
    .find((path) => existsSync(path));

  if (serverEnvironment !== undefined) {
    process.loadEnvFile(serverEnvironment);
  }

  const selection = providerFromEnvironment(process.env);

  if (selection.kind === "none") {
    throw new Error(`cannot reach Jev: ${selection.reason}`);
  }

  if (selection.provider.source !== "jev") {
    throw new Error("cannot reach Jev: JEV_PROVIDER selects the offline stub");
  }

  return selection.provider;
}

function providerFor(
  mode: ProviderMode,
  seed: number,
  concurrency: number,
  offlineDelayMilliseconds: number,
): LimitedProvider {
  switch (mode) {
    case "offline":
      return limitProvider(createOfflineProvider(seed, offlineDelayMilliseconds), concurrency);

    case "faults":
      return limitProvider(
        createTypeSafeProvider({
          apiKey: "probe-fake-key",
          model: FAULT_MODEL,
          timeoutMilliseconds: FAULT_TIMEOUT_MILLISECONDS,
          fetch: faultyFetch(),
        }),
        concurrency,
      );

    case "faults-cloudflare":
      return limitProvider(
        createCloudflareProvider({
          accountId: "probe-account",
          apiToken: "probe-fake-token",
          model: FAULT_MODEL,
          timeoutMilliseconds: FAULT_TIMEOUT_MILLISECONDS,
          fetch: faultyFetch(),
        }),
        concurrency,
      );

    case "jev":
      return liveProvider();
  }
}

function expectedFallbackReasons(mode: ProviderMode): readonly string[] {
  switch (mode) {
    case "offline":
      return SEAT_FALLBACKS;

    case "faults":
    case "faults-cloudflare":
      return [...SEAT_FALLBACKS, ...INJECTED_FAILURES];

    case "jev":
      return [...SEAT_FALLBACKS, ...LIVE_FAILURES];
  }
}

function seatsFor(jevPlayerIds: readonly PlayerId[]): SeatSpec[] {
  const seats: SeatSpec[] = jevPlayerIds.map((playerId, index) => ({
    playerId,
    displayName: `Jev ${index + 1}`,
    controllerKind: "jev",
  }));

  for (let index = seats.length; index < SEAT_COUNT; index += 1) {
    seats.push({
      playerId: `bot-${index + 1}`,
      displayName: `Bot ${index + 1}`,
      controllerKind: "random-bot",
    });
  }

  return seats;
}

function stateDigest(state: RunState): string {
  const players = Object.values(state.players)
    .sort((first, second) => first.playerId.localeCompare(second.playerId))
    .map((seat) => ({
      playerId: seat.playerId,
      runHealth: seat.runHealth,
      eliminated: seat.eliminated,
      heroIds: seat.heroIds,
      formation: seat.formation,
    }));

  return JSON.stringify({
    phase: state.phase,
    winners: state.winnerPlayerIds,
    pairingHistory: state.pairingHistory,
    players,
  });
}

function emptyVerdicts(): Record<ApplyVerdict, number> {
  return { applied: 0, superseded: 0, "stale-epoch": 0, "stale-revision": 0 };
}

async function playRun(
  seed: number,
  jevPlayerIds: readonly PlayerId[],
  provider: LimitedProvider | null,
  replay: ReadonlyMap<string, RunCommand> | null,
  draftMilliseconds: number,
): Promise<RunReport> {
  const startedAt = Date.now();

  let state = advanceIfReady(
    createRun(`probe-${seed}`, seed, seatsFor(jevPlayerIds), DEFAULT_RUN_RULES),
  );

  const records: DecisionRecord[] = [];
  const replayLog: ReplayEntry[] = [];
  const battleDigests: string[][] = [];
  const verdicts = emptyVerdicts();
  const outcomes: DriverOutcome[] = [];
  let wake: (() => void) | null = null;
  let deadlineFallbacks = 0;

  const driver =
    provider === null
      ? null
      : createJevDriver({
          provider,
          playerIds: jevPlayerIds,
          now: () => Date.now(),
          onOutcome: (outcome) => {
            outcomes.push(outcome);
            wake?.();
          },
        });

  function applyLogged(command: RunCommand): void {
    const decisionRevision = requireSeat(state, command.playerId).decisionRevision;
    const result = applyCommand(state, command);

    if (!result.accepted) {
      throw new Error(`${command.kind} for ${command.playerId} was refused: ${result.reason}`);
    }

    replayLog.push({
      playerId: command.playerId,
      phaseEpoch: state.phaseEpoch,
      decisionRevision,
      command,
    });
    state = result.state;
  }

  function applyReplay(commands: ReadonlyMap<string, RunCommand>): void {
    for (const playerId of jevPlayerIds) {
      const seat = requireSeat(state, playerId);
      const command = commands.get(replayKey(playerId, state.phaseEpoch, seat.decisionRevision));

      if (command !== undefined) {
        applyLogged(command);
      }
    }
  }

  function applyDeadlineFallback(): void {
    for (const playerId of jevPlayerIds) {
      if (isSeatReady(state, playerId)) {
        continue;
      }

      const controllerSeed = deriveControllerSeed(state.runSeed, state.phaseEpoch, playerId);
      const command = decideFallbackCommand(getPlayerView(state, playerId), controllerSeed);

      if (command === null) {
        throw new Error(`${playerId} is not ready in ${state.phase} and has no fallback`);
      }

      applyLogged(command);
    }
  }

  function applyOutcomes(): void {
    for (let outcome = outcomes.shift(); outcome !== undefined; outcome = outcomes.shift()) {
      records.push(...outcome.records);
      const applied = applyJevOutcome(state, outcome);
      verdicts[applied.verdict] += 1;

      if (applied.verdict === "applied") {
        replayLog.push({
          playerId: outcome.playerId,
          phaseEpoch: outcome.phaseEpoch,
          decisionRevision: outcome.decisionRevision,
          command: outcome.command,
        });
      }

      state = applied.state;
    }
  }

  function waitForOutcome(deadlineAt: number): Promise<boolean> {
    return new Promise((resolveWait) => {
      if (outcomes.length > 0) {
        resolveWait(false);

        return;
      }

      const timer = setTimeout(
        () => {
          wake = null;
          resolveWait(true);
        },
        Math.max(0, deadlineAt - Date.now()),
      );

      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolveWait(false);
      };
    });
  }

  let epoch = -1;
  let deadlineAt: number | null = null;

  for (let step = 0; step < MAX_LOOP_STEPS && state.phase !== "finished"; step += 1) {
    if (state.phaseEpoch !== epoch) {
      epoch = state.phaseEpoch;
      deadlineAt = state.phase === "draft" ? Date.now() + draftMilliseconds : null;
    }

    state = runBotCommands(state);

    if (replay !== null) {
      applyReplay(replay);
    }

    applyOutcomes();
    driver?.sync(state, deadlineAt);
    const next = advanceIfReady(state);

    if (next !== state) {
      state = next;

      if (state.phase === "round-result" || state.phase === "finished") {
        battleDigests.push(requireRound(state).battles.map((battle) => battle.digest));
      }

      continue;
    }

    if (driver === null) {
      break;
    }

    if (deadlineAt === null) {
      throw new Error(`Run ${state.runId} is stuck in ${state.phase} with nobody left to move it`);
    }

    const timedOut = await waitForOutcome(deadlineAt);

    if (timedOut && Date.now() >= deadlineAt) {
      applyDeadlineFallback();
      deadlineFallbacks += 1;
      deadlineAt = null;
    }
  }

  driver?.stop();
  const winners = state.winnerPlayerIds ?? [];

  return {
    seed,
    finished: state.phase === "finished",
    rounds: battleDigests.length,
    winners,
    jevResults: jevPlayerIds.map((playerId) => {
      const seat = requireSeat(state, playerId);

      return {
        playerId,
        health: seat.runHealth,
        eliminated: seat.eliminated,
        won: winners.includes(playerId),
      };
    }),
    records,
    replayLog,
    verdicts,
    deadlineFallbacks,
    digest: JSON.stringify({ state: stateDigest(state), battles: battleDigests }),
    wallMilliseconds: Date.now() - startedAt,
  };
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);
  const value = sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];

  if (value === undefined) {
    throw new Error(`No percentile ${fraction} in ${values.length} values`);
  }

  return value;
}

function countBy(values: readonly string[]): string {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return JSON.stringify(Object.fromEntries(counts));
}

function printQuestions(seed: number, jevPlayerId: PlayerId): void {
  const state = advanceIfReady(
    createRun(`probe-${seed}`, seed, seatsFor([jevPlayerId]), DEFAULT_RUN_RULES),
  );

  const view = getPlayerView(state, jevPlayerId);
  const picked: HeroDefinitionId[] = [];

  for (let pick = 1; pick <= view.rules.draftPicks; pick += 1) {
    const step = draftQuestion(view, picked);
    const heroId = step.heroIds[0];

    if (heroId === undefined) {
      throw new Error(`Draft pick ${pick} offered no heroes`);
    }

    console.log(JSON.stringify(step.question, null, 2));
    picked.push(heroId);
  }
}

function jevSummary(result: JevResult): string {
  if (result.won) {
    return `${result.playerId} WON`;
  }

  return result.eliminated
    ? `${result.playerId} out`
    : `${result.playerId} alive ${result.health}hp`;
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
      records: { type: "string" },
      "show-question": { type: "boolean", default: false },
      "offline-delay-ms": { type: "string", default: "40" },
    },
  });

  const settings = argumentsSchema.parse(values);
  const mode = settings.provider;

  const jevPlayerIds = Array.from(
    { length: settings["jev-seats"] },
    (_unused, index) => `jev-${index + 1}`,
  );

  validateCatalogue(gameCatalogue);

  if (settings["show-question"]) {
    printQuestions(settings.seed, "jev-1");

    return;
  }

  const provider = providerFor(
    mode,
    settings.seed,
    settings.concurrency,
    settings["offline-delay-ms"],
  );

  const draftMilliseconds = settings["draft-seconds"] * 1000;
  const reports: RunReport[] = [];
  const failures: string[] = [];

  console.log(
    `provider: ${mode} (${provider.source}, ${provider.model}), Jev seats: ${jevPlayerIds.length} of ${SEAT_COUNT}, the rest baseline random bots`,
  );

  for (let run = 0; run < settings.runs; run += 1) {
    const seed = settings.seed + run;
    const report = await playRun(seed, jevPlayerIds, provider, null, draftMilliseconds);

    const replayCommands = new Map(
      report.replayLog.map((entry) => [
        replayKey(entry.playerId, entry.phaseEpoch, entry.decisionRevision),
        entry.command,
      ]),
    );

    const replayed = await playRun(seed, jevPlayerIds, null, replayCommands, draftMilliseconds);
    const identical = replayed.digest === report.digest;
    reports.push(report);

    if (!report.finished) {
      failures.push(`seed ${seed} did not finish`);
    }

    if (!identical) {
      failures.push(`seed ${seed} replayed differently`);
    }

    console.log(
      `seed ${seed}: ${report.finished ? "finished" : "DID NOT FINISH"} after ${report.rounds} rounds in ${(report.wallMilliseconds / 1000).toFixed(1)}s; winners ${report.winners.join(", ")}; ${report.jevResults.map(jevSummary).join(", ")}; replay ${identical ? "identical" : "DIFFERENT"}`,
    );
  }

  const records = reports.flatMap((report) => report.records);
  const answered = records.filter((record) => record.source !== "fallback");

  const reasons = records.flatMap((record) =>
    record.fallbackReason === null ? [] : [record.fallbackReason],
  );

  const expected = expectedFallbackReasons(mode);
  const unexpected = [...new Set(reasons)].filter((reason) => !expected.includes(reason));
  const latencies = answered.map((record) => record.durationMilliseconds);
  const verdicts = emptyVerdicts();

  for (const report of reports) {
    for (const verdict of VERDICTS) {
      verdicts[verdict] += report.verdicts[verdict];
    }
  }

  if (unexpected.length > 0) {
    failures.push(`unexpected fallback reasons ${unexpected.join(", ")}`);
  }

  const load = provider.load();
  const inputTokens = answered.reduce((sum, record) => sum + (record.usage?.inputTokens ?? 0), 0);

  console.log(
    `decisions: ${records.length} (${countBy(records.map((record) => (record.source === "fallback" ? "fallback" : `${record.source} ${record.model ?? ""}`)))})`,
  );
  console.log(`by pick: ${countBy(records.map((record) => `pick ${record.pick}`))}`);
  console.log(`fallback reasons: ${countBy(reasons)}`);
  console.log(
    `latency ms: p50 ${percentile(latencies, 0.5)}, p95 ${percentile(latencies, 0.95)}, max ${percentile(latencies, 1)}`,
  );
  console.log(
    `provider calls ${load.calls}, peak concurrent ${load.peakActive} (limit ${settings.concurrency}), input tokens ${inputTokens}`,
  );
  console.log(
    `apply verdicts: ${JSON.stringify(verdicts)}; deadline fallbacks: ${reports.reduce((sum, report) => sum + report.deadlineFallbacks, 0)}`,
  );

  if (settings.records !== undefined) {
    writeFileSync(
      settings.records,
      records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    );
    console.log(`records written to ${settings.records}`);
  }

  if (failures.length > 0) {
    throw new Error(`The probe failed: ${failures.join("; ")}`);
  }
}

await main();
