import { isValidFormation, type BoardCell, type HeroDefinitionId } from "@jev-game/game";
import { boardArena, defaultFormation } from "@jev-game/content";
import type { PlayerId } from "./ids.js";
import type { PlayerSeat, RunPhase, RunState } from "./types.js";
import { isSeatReady } from "./readiness.js";

export type RunCommand =
  | {
      kind: "select-heroes";
      playerId: PlayerId;
      heroIds: readonly HeroDefinitionId[];
      expectedRevision: number;
    }
  | {
      kind: "commit-draft";
      playerId: PlayerId;
      heroIds: readonly HeroDefinitionId[];
      expectedRevision: number;
    }
  | {
      kind: "place-heroes";
      playerId: PlayerId;
      formation: readonly BoardCell[];
      expectedRevision: number;
    }
  | { kind: "confirm-ready"; playerId: PlayerId; expectedRevision: number };

export type RunCommandRejectionReason =
  | "wrong-phase"
  | "unknown-player"
  | "already-eliminated"
  | "already-decided"
  | "stale-revision"
  | "unknown-hero"
  | "duplicate-hero"
  | "invalid-pick-count"
  | "invalid-formation";

export type RunCommandResult =
  | { accepted: true; state: RunState }
  | { accepted: false; reason: RunCommandRejectionReason };

const COMMAND_PHASES: Record<RunCommand["kind"], RunPhase> = {
  "select-heroes": "draft",
  "commit-draft": "draft",
  "place-heroes": "preparing",
  "confirm-ready": "preparing",
};

function withSeat(state: RunState, seat: PlayerSeat): RunState {
  return { ...state, players: { ...state.players, [seat.playerId]: seat } };
}

function accept(state: RunState): RunCommandResult {
  return { accepted: true, state };
}

function reject(reason: RunCommandRejectionReason): RunCommandResult {
  return { accepted: false, reason };
}

function pickProblem(
  state: RunState,
  heroIds: readonly HeroDefinitionId[],
): RunCommandRejectionReason | null {
  if (new Set(heroIds).size !== heroIds.length) {
    return "duplicate-hero";
  }

  if (heroIds.some((heroId) => !state.draftPool.includes(heroId))) {
    return "unknown-hero";
  }

  return null;
}

function applySelectHeroes(
  state: RunState,
  seat: PlayerSeat,
  heroIds: readonly HeroDefinitionId[],
): RunCommandResult {
  if (heroIds.length > state.rules.draftPicks) {
    return reject("invalid-pick-count");
  }

  const problem = pickProblem(state, heroIds);

  if (problem !== null) {
    return reject(problem);
  }

  return accept({
    ...state,
    draftSelectionByPlayer: { ...state.draftSelectionByPlayer, [seat.playerId]: [...heroIds] },
  });
}

function applyCommitDraft(
  state: RunState,
  seat: PlayerSeat,
  heroIds: readonly HeroDefinitionId[],
): RunCommandResult {
  if (heroIds.length !== state.rules.draftPicks) {
    return reject("invalid-pick-count");
  }

  const problem = pickProblem(state, heroIds);

  if (problem !== null) {
    return reject(problem);
  }

  return accept(
    withSeat(state, {
      ...seat,
      heroIds: [...heroIds],
      formation: defaultFormation(heroIds),
      decisionRevision: seat.decisionRevision + 1,
    }),
  );
}

function applyPlaceHeroes(
  state: RunState,
  seat: PlayerSeat,
  formation: readonly BoardCell[],
): RunCommandResult {
  if (!isValidFormation(boardArena, formation, seat.heroIds.length)) {
    return reject("invalid-formation");
  }

  const copied = formation.map((cell) => ({ column: cell.column, row: cell.row }));

  return accept(withSeat(state, { ...seat, formation: copied }));
}

export function applyCommand(state: RunState, command: RunCommand): RunCommandResult {
  const seat = state.players[command.playerId];

  if (seat === undefined) {
    return reject("unknown-player");
  }

  if (seat.eliminated) {
    return reject("already-eliminated");
  }

  if (COMMAND_PHASES[command.kind] !== state.phase) {
    return reject("wrong-phase");
  }

  if (seat.decisionRevision !== command.expectedRevision) {
    return reject("stale-revision");
  }

  if (isSeatReady(state, seat.playerId)) {
    return reject("already-decided");
  }

  switch (command.kind) {
    case "select-heroes":
      return applySelectHeroes(state, seat, command.heroIds);

    case "commit-draft":
      return applyCommitDraft(state, seat, command.heroIds);

    case "place-heroes":
      return applyPlaceHeroes(state, seat, command.formation);

    case "confirm-ready":
      return accept(withSeat(state, { ...seat, decisionRevision: seat.decisionRevision + 1 }));
  }
}
