import type { Catalogue } from "@jev-game/game";
import {
  applyCommand,
  decideBotCommand,
  deriveControllerSeed,
  getPlayerView,
  type PlayerId,
  type RunCommand,
  type RunState,
} from "@jev-game/run";
import type { JevProvider } from "./provider/types.js";
import { decideForSeat, needsJevDecision, SUPERSEDED } from "./controller.js";
import { roundOutcomeFrom, type RoundOutcome } from "./observations/build-observation.js";
import type { DecisionRecord } from "./decision-record.js";

export type SeatActivity = "idle" | "thinking";

export interface DriverOutcome {
  runId: string;
  playerId: PlayerId;
  phaseEpoch: number;
  decisionRevision: number;
  command: RunCommand | null;
  records: DecisionRecord[];
  superseded: boolean;
}

export interface JevDriverOptions {
  provider: JevProvider;
  catalogue: Catalogue;
  playerIds: readonly PlayerId[];
  onOutcome: (outcome: DriverOutcome) => void;
  now: () => number;
}

export interface JevDriver {
  sync(state: RunState, deadlineAt: number | null): void;
  activity(playerId: PlayerId): SeatActivity;
  history(playerId: PlayerId): readonly RoundOutcome[];
  stop(): void;
}

interface Job {
  key: string;
  controller: AbortController;
}

export type ApplyVerdict =
  | "applied"
  | "superseded"
  | "no-command"
  | "stale-run"
  | "stale-epoch"
  | "stale-revision"
  | "eliminated"
  | "rejected";

export interface AppliedOutcome {
  state: RunState;
  verdict: ApplyVerdict;
}

function jobKey(state: RunState, playerId: PlayerId): string {
  return `${state.runId}:${state.phaseEpoch}:${playerId}:${state.players[playerId]?.decisionRevision ?? -1}`;
}

export function applyJevOutcome(state: RunState, outcome: DriverOutcome, catalogue: Catalogue): AppliedOutcome {
  const seat = state.players[outcome.playerId];

  if (outcome.superseded) {
    return { state, verdict: "superseded" };
  }

  if (state.runId !== outcome.runId) {
    return { state, verdict: "stale-run" };
  }

  if (state.phaseEpoch !== outcome.phaseEpoch) {
    return { state, verdict: "stale-epoch" };
  }

  if (seat === undefined || seat.eliminated) {
    return { state, verdict: "eliminated" };
  }

  if (seat.decisionRevision !== outcome.decisionRevision) {
    return { state, verdict: "stale-revision" };
  }

  if (outcome.command === null) {
    return { state, verdict: "no-command" };
  }

  const result = applyCommand(state, outcome.command, catalogue);

  return result.accepted ? { state: result.state, verdict: "applied" } : { state, verdict: "rejected" };
}

export function createJevDriver(options: JevDriverOptions): JevDriver {
  const jobs = new Map<PlayerId, Job>();
  const delivered = new Map<PlayerId, string>();
  const histories = new Map<PlayerId, RoundOutcome[]>();
  let stopped = false;

  function cancel(playerId: PlayerId): void {
    jobs.get(playerId)?.controller.abort(SUPERSEDED);
    jobs.delete(playerId);
  }

  function remember(state: RunState, playerId: PlayerId): void {
    const view = getPlayerView(state, playerId);
    const outcome = view === null || (view.phase !== "reward" && view.phase !== "round-result") ? null : roundOutcomeFrom(view);
    const history = histories.get(playerId) ?? [];

    if (outcome !== null && !history.some((entry) => entry.round === outcome.round)) {
      histories.set(playerId, [...history, outcome]);
    }
  }

  function start(state: RunState, playerId: PlayerId, key: string, deadlineAt: number | null): void {
    const view = getPlayerView(state, playerId);

    if (view === null) {
      return;
    }

    const controller = new AbortController();
    const remaining = deadlineAt === null ? null : Math.max(0, deadlineAt - options.now());
    const signal = remaining === null ? controller.signal : AbortSignal.any([controller.signal, AbortSignal.timeout(remaining)]);
    const controllerSeed = deriveControllerSeed(state.runSeed, state.currentRound?.round ?? 0, playerId);
    jobs.set(playerId, { key, controller });

    const preview = (command: RunCommand) => {
      const result = applyCommand(state, command, options.catalogue);

      return result.accepted ? (result.state.players[playerId] ?? null) : null;
    };

    decideForSeat({
      view,
      catalogue: options.catalogue,
      provider: options.provider,
      history: histories.get(playerId) ?? [],
      controllerSeed,
      signal,
      preview,
      now: options.now,
    })
      .catch(() => ({ command: decideBotCommand(view, controllerSeed, options.catalogue), records: [] }))
      .then((decision) => {
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
        remember(state, playerId);

        const view = getPlayerView(state, playerId);
        const key = jobKey(state, playerId);

        if (view === null || !needsJevDecision(view)) {
          cancel(playerId);
          continue;
        }

        if (jobs.get(playerId)?.key === key || delivered.get(playerId) === key) {
          continue;
        }

        cancel(playerId);
        start(state, playerId, key, deadlineAt);
      }
    },

    activity(playerId) {
      return jobs.has(playerId) ? "thinking" : "idle";
    },

    history(playerId) {
      return histories.get(playerId) ?? [];
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
