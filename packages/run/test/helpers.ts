import {
  DEFAULT_RUN_RULES,
  advanceIfReady,
  applyCommand,
  createRun,
  pumpRun,
  runBotCommands,
  type ControllerKind,
  type RunCommand,
  type RunRules,
  type RunState,
  type SeatSpec,
} from "../src/index.js";

export function seats(kinds: readonly ControllerKind[]): SeatSpec[] {
  return kinds.map((controllerKind, index) => ({
    playerId: `p${index + 1}`,
    displayName: `Player ${index + 1}`,
    controllerKind,
  }));
}

export function botRun(
  seed: number,
  seatCount: number,
  rules: RunRules = DEFAULT_RUN_RULES,
): RunState {
  return createRun(
    `run-${seed}`,
    seed,
    seats(Array.from({ length: seatCount }, () => "random-bot")),
    rules,
  );
}

export function draftingRun(kinds: readonly ControllerKind[], rules?: RunRules): RunState {
  return advanceIfReady(createRun("run-draft", 11, seats(kinds), rules));
}

export function accepted(state: RunState, command: RunCommand): RunState {
  const result = applyCommand(state, command);

  if (!result.accepted) {
    throw new Error(`${command.kind} for ${command.playerId} was refused: ${result.reason}`);
  }

  return result.state;
}

export function refusal(state: RunState, command: RunCommand): string {
  const result = applyCommand(state, command);

  if (result.accepted) {
    throw new Error(`${command.kind} for ${command.playerId} was accepted`);
  }

  return result.reason;
}

export function playOut(state: RunState): RunState {
  let current = pumpRun(state);

  for (let step = 0; step < 100 && current.phase !== "finished"; step += 1) {
    current = pumpRun(runBotCommands(current));
  }

  if (current.phase !== "finished") {
    throw new Error(`Run ${current.runId} did not finish; it is stuck in ${current.phase}`);
  }

  return current;
}

export function revisionOf(state: RunState, playerId: string): number {
  const seat = state.players[playerId];

  if (seat === undefined) {
    throw new Error(`No seat ${playerId}`);
  }

  return seat.decisionRevision;
}
