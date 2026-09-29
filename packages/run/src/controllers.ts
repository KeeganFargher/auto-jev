import {
  createRng,
  nextInt,
  sameFormation,
  type BoardCell,
  type HeroDefinitionId,
} from "@jev-game/game";
import { boardArena, centreOutColumns, defaultFormation } from "@jev-game/content";
import type { PlayerId } from "./ids.js";
import type { RunState } from "./types.js";
import { deriveControllerSeed } from "./seed.js";
import { applyCommand, type RunCommand } from "./commands.js";
import { isSeatReady, requireSeat } from "./readiness.js";
import { getPlayerView, type PlayerView } from "./player-view.js";

const MAX_POLICY_COMMANDS = 8;

export type SeatPolicy = (view: PlayerView, controllerSeed: number) => RunCommand | null;

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const rng = createRng(seed);
  const order = [...items];

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = nextInt(rng, index + 1);
    const current = order[index];
    const swap = order[swapIndex];

    if (current === undefined || swap === undefined) {
      throw new Error(`Shuffle index ${swapIndex} is outside ${order.length} items`);
    }

    order[index] = swap;
    order[swapIndex] = current;
  }

  return order;
}

export function botFormation(heroIds: readonly HeroDefinitionId[], seed: number): BoardCell[] {
  return defaultFormation(heroIds, shuffled(centreOutColumns(boardArena.columns), seed));
}

function commitDraft(
  view: PlayerView,
  controllerSeed: number,
  selected: readonly HeroDefinitionId[],
): RunCommand {
  const rest = view.draftPool.filter((heroId) => !selected.includes(heroId));
  const topUp = shuffled(rest, controllerSeed).slice(0, view.rules.draftPicks - selected.length);

  return {
    kind: "commit-draft",
    playerId: view.you.playerId,
    heroIds: [...selected, ...topUp],
    expectedRevision: view.you.decisionRevision,
  };
}

function confirmReady(view: PlayerView): RunCommand {
  return {
    kind: "confirm-ready",
    playerId: view.you.playerId,
    expectedRevision: view.you.decisionRevision,
  };
}

export function decideBotCommand(view: PlayerView, controllerSeed: number): RunCommand | null {
  if (view.you.eliminated || view.you.ready) {
    return null;
  }

  switch (view.phase) {
    case "draft":
      return commitDraft(view, controllerSeed, []);

    case "preparing": {
      const formation = botFormation(view.you.heroIds, controllerSeed);

      if (sameFormation(formation, view.you.formation)) {
        return confirmReady(view);
      }

      return {
        kind: "place-heroes",
        playerId: view.you.playerId,
        formation,
        expectedRevision: view.you.decisionRevision,
      };
    }

    case "lobby":
    case "round-result":
    case "finished":
      return null;
  }
}

export function decideFallbackCommand(view: PlayerView, controllerSeed: number): RunCommand | null {
  if (view.you.eliminated || view.you.ready) {
    return null;
  }

  switch (view.phase) {
    case "draft":
      return commitDraft(view, controllerSeed, view.draftSelection);

    case "preparing":
      return confirmReady(view);

    case "lobby":
    case "round-result":
    case "finished":
      return null;
  }
}

export function applySeatPolicy(state: RunState, playerId: PlayerId, policy: SeatPolicy): RunState {
  const controllerSeed = deriveControllerSeed(state.runSeed, state.phaseEpoch, playerId);
  let current = state;

  for (let step = 0; step < MAX_POLICY_COMMANDS; step += 1) {
    const command = policy(getPlayerView(current, playerId), controllerSeed);

    if (command === null) {
      return current;
    }

    const result = applyCommand(current, command);

    if (!result.accepted) {
      throw new Error(
        `Seat "${playerId}" sent ${command.kind}, which was refused: ${result.reason}`,
      );
    }

    current = result.state;
  }

  throw new Error(`Seat "${playerId}" was still deciding after ${MAX_POLICY_COMMANDS} commands`);
}

export function runFallbackCommands(state: RunState, playerIds: readonly PlayerId[]): RunState {
  let current = state;

  for (const playerId of playerIds) {
    current = applySeatPolicy(current, playerId, decideFallbackCommand);
  }

  return current;
}

function botPolicyFor(state: RunState, playerId: PlayerId): SeatPolicy | null {
  const seat = requireSeat(state, playerId);

  switch (seat.controllerKind) {
    case "random-bot":
      return decideBotCommand;

    case "jev":
      return state.phase === "preparing" ? decideBotCommand : null;

    case "human":
      return seat.forfeited ? decideFallbackCommand : null;
  }
}

export function runBotCommands(state: RunState): RunState {
  let current = state;

  for (const playerId of Object.keys(state.players)) {
    const policy = botPolicyFor(current, playerId);

    if (policy !== null && !isSeatReady(current, playerId)) {
      current = applySeatPolicy(current, playerId, policy);
    }
  }

  return current;
}
