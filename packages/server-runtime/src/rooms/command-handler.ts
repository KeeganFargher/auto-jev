import type { Catalogue } from "@jev-game/game";
import { applyCommand, type RunCommand, type RunState } from "@jev-game/run";
import type { AckMessage, CommandIntent, CommandMessage } from "@jev-game/protocol";
import { rememberAck, type SeatSlot } from "./seat-registry.js";

export interface CommandOutcome {
  run: RunState | null;
  ack: AckMessage;
  changed: boolean;
}

function toRunCommand(playerId: string, expectedRevision: number, intent: CommandIntent): RunCommand {
  switch (intent.kind) {
    case "commit-draft":
      return { kind: "commit-draft", playerId, offerIds: intent.offerIds, expectedRevision };

    case "confirm-ready":
      return { kind: "confirm-ready", playerId, expectedRevision };

    case "place-heroes":
      return { kind: "place-heroes", playerId, formation: intent.formation, expectedRevision };

    case "choose-offer":
      return {
        kind: "choose-offer",
        playerId,
        decisionId: intent.decisionId,
        offerId: intent.offerId,
        heroSlot: intent.heroSlot,
        expectedRevision,
      };

    case "move-item":
      return { kind: "move-item", playerId, instanceId: intent.instanceId, heroSlot: intent.heroSlot, expectedRevision };

    case "socket-rune":
      return { kind: "socket-rune", playerId, instanceId: intent.instanceId, heroSlot: intent.heroSlot, expectedRevision };

    case "discard-item":
      return { kind: "discard-item", playerId, instanceId: intent.instanceId, expectedRevision };

    default: {
      const exhaustive: never = intent;

      return exhaustive;
    }
  }
}

function rejected(run: RunState | null, commandId: string, reason: AckMessage["reason"]): CommandOutcome {
  return { run, ack: { commandId, accepted: false, reason }, changed: false };
}

export function handleCommand(
  run: RunState | null,
  seat: SeatSlot | null,
  message: CommandMessage,
  catalogue: Catalogue,
): CommandOutcome {
  if (seat === null || seat.controller !== "human") {
    return rejected(run, message.commandId, "not-seated");
  }

  const remembered = seat.acks.get(message.commandId);

  if (remembered !== undefined) {
    return { run, ack: remembered, changed: false };
  }

  const outcome = decide(run, seat, message, catalogue);
  rememberAck(seat, outcome.ack);

  return outcome;
}

function decide(run: RunState | null, seat: SeatSlot, message: CommandMessage, catalogue: Catalogue): CommandOutcome {
  if (run === null) {
    return rejected(run, message.commandId, "not-started");
  }

  if (message.runId !== run.runId) {
    return rejected(run, message.commandId, "stale-run");
  }

  if (message.phaseEpoch !== run.phaseEpoch) {
    return rejected(run, message.commandId, "stale-epoch");
  }

  const command = toRunCommand(seat.playerId, message.expectedRevision, message.intent);
  const result = applyCommand(run, command, catalogue);

  if (!result.accepted) {
    return rejected(run, message.commandId, result.reason);
  }

  return { run: result.state, ack: { commandId: message.commandId, accepted: true, reason: null }, changed: true };
}
