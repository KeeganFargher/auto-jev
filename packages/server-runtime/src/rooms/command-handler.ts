import { applyCommand, type RunCommand, type RunState } from "@jev-game/run";
import type { AckMessage, CommandIntent, CommandMessage } from "@jev-game/protocol";
import { rememberAck, type SeatSlot } from "./seat-registry.js";

export interface CommandOutcome {
  ack: AckMessage;
  next: RunState | null;
}

function toRunCommand(
  playerId: string,
  expectedRevision: number,
  intent: CommandIntent,
): RunCommand {
  switch (intent.kind) {
    case "select-heroes":
      return { kind: "select-heroes", playerId, heroIds: intent.heroIds, expectedRevision };

    case "commit-draft":
      return { kind: "commit-draft", playerId, heroIds: intent.heroIds, expectedRevision };

    case "place-heroes":
      return { kind: "place-heroes", playerId, formation: intent.formation, expectedRevision };

    case "confirm-ready":
      return { kind: "confirm-ready", playerId, expectedRevision };
  }
}

function rejected(commandId: string, reason: AckMessage["reason"]): CommandOutcome {
  return { ack: { commandId, accepted: false, reason }, next: null };
}

export function handleCommand(
  run: RunState | null,
  seat: SeatSlot | null,
  message: CommandMessage,
): CommandOutcome {
  if (seat === null || seat.controller !== "human") {
    return rejected(message.commandId, "not-seated");
  }

  const remembered = seat.acks.get(message.commandId);

  if (remembered !== undefined) {
    return { ack: remembered, next: null };
  }

  const outcome = decide(run, seat, message);
  rememberAck(seat, outcome.ack);

  return outcome;
}

function decide(run: RunState | null, seat: SeatSlot, message: CommandMessage): CommandOutcome {
  if (run === null) {
    return rejected(message.commandId, "not-started");
  }

  if (message.runId !== run.runId) {
    return rejected(message.commandId, "stale-run");
  }

  if (message.phaseEpoch !== run.phaseEpoch) {
    return rejected(message.commandId, "stale-epoch");
  }

  const command = toRunCommand(seat.playerId, message.expectedRevision, message.intent);
  const result = applyCommand(run, command);

  if (!result.accepted) {
    return rejected(message.commandId, result.reason);
  }

  return {
    ack: { commandId: message.commandId, accepted: true, reason: null },
    next: result.state,
  };
}
