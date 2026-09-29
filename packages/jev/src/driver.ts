import {
  applyCommand,
  deriveControllerSeed,
  getPlayerView,
  requireSeat,
  type PlayerId,
  type PlayerView,
  type RunCommand,
  type RunState,
} from "@jev-game/run";
import type { JevProvider } from "./provider/types.js";
import { decideDraft, needsJevDecision, SUPERSEDED } from "./controller.js";
import type { DecisionRecord } from "./decision-record.js";

export type SeatActivity = "idle" | "thinking";

export interface DriverOutcome {
  runId: string;
  playerId: PlayerId;
  phaseEpoch: number;
  decisionRevision: number;
  command: RunCommand;
  records: DecisionRecord[];
  superseded: boolean;
}

export interface JevDriverOptions {
  provider: JevProvider;
  playerIds: readonly PlayerId[];
  onOutcome: (outcome: DriverOutcome) => void;
  now: () => number;
}

export interface JevDriver {
  sync(state: RunState, deadlineAt: number | null): void;
  activity(playerId: PlayerId): SeatActivity;
  stop(): void;
}

interface Job {
  key: string;
  controller: AbortController;
}

export type ApplyVerdict = "applied" | "superseded" | "stale-epoch" | "stale-revision";

export interface AppliedOutcome {
  state: RunState;
  verdict: ApplyVerdict;
}

function jobKey(state: RunState, playerId: PlayerId): string {
  return `${state.runId}:${state.phaseEpoch}:${playerId}:${requireSeat(state, playerId).decisionRevision}`;
}

export function applyJevOutcome(state: RunState, outcome: DriverOutcome): AppliedOutcome {
  if (state.runId !== outcome.runId) {
    throw new Error(`Jev answered for run ${outcome.runId} inside run ${state.runId}`);
  }

  if (outcome.superseded) {
    return { state, verdict: "superseded" };
  }

  if (state.phaseEpoch !== outcome.phaseEpoch) {
    return { state, verdict: "stale-epoch" };
  }

  if (requireSeat(state, outcome.playerId).decisionRevision !== outcome.decisionRevision) {
    return { state, verdict: "stale-revision" };
  }

  const result = applyCommand(state, outcome.command);

  if (!result.accepted) {
    throw new Error(
      `Jev's ${outcome.command.kind} for ${outcome.playerId} was refused: ${result.reason}`,
    );
  }

  return { state: result.state, verdict: "applied" };
}

export function createJevDriver(options: JevDriverOptions): JevDriver {
  const jobs = new Map<PlayerId, Job>();
  const delivered = new Map<PlayerId, string>();
  let stopped = false;

  function cancel(playerId: PlayerId): void {
    jobs.get(playerId)?.controller.abort(SUPERSEDED);
    jobs.delete(playerId);
  }

  function start(state: RunState, view: PlayerView, key: string, deadlineAt: number | null): void {
    const playerId = view.you.playerId;
    const controller = new AbortController();
    const remaining = deadlineAt === null ? null : Math.max(0, deadlineAt - options.now());

    const signal =
      remaining === null
        ? controller.signal
        : AbortSignal.any([controller.signal, AbortSignal.timeout(remaining)]);

    jobs.set(playerId, { key, controller });

    void decideDraft({
      view,
      provider: options.provider,
      controllerSeed: deriveControllerSeed(state.runSeed, state.phaseEpoch, playerId),
      signal,
      isLegal: (command) => applyCommand(state, command).accepted,
      now: options.now,
    }).then((decision) => {
      if (stopped) {
        return;
      }

      const current = jobs.get(playerId)?.key === key;

      if (current) {
        jobs.delete(playerId);
        delivered.set(playerId, key);
      }

      options.onOutcome({
        runId: view.runId,
        playerId,
        phaseEpoch: view.phaseEpoch,
        decisionRevision: view.you.decisionRevision,
        command: decision.command,
        records: decision.records,
        superseded: !current,
      });
    });
  }

  return {
    sync(state, deadlineAt) {
      if (stopped) {
        return;
      }

      for (const playerId of options.playerIds) {
        const view = getPlayerView(state, playerId);
        const key = jobKey(state, playerId);

        if (!needsJevDecision(view)) {
          cancel(playerId);
          continue;
        }

        if (jobs.get(playerId)?.key === key || delivered.get(playerId) === key) {
          continue;
        }

        cancel(playerId);
        start(state, view, key, deadlineAt);
      }
    },

    activity(playerId) {
      return jobs.has(playerId) ? "thinking" : "idle";
    },

    stop() {
      stopped = true;

      for (const job of jobs.values()) {
        job.controller.abort(SUPERSEDED);
      }

      jobs.clear();
    },
  };
}
