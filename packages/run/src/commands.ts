import { createHeroBuild, isValidFormation, type BoardCell, type Catalogue } from "@jev-game/game";
import { boardArena, defaultFormation } from "@jev-game/content";
import type { PlayerId } from "./ids.js";
import type { HeroOffer, PlayerSeat, RunPhase, RunState } from "./types.js";
import { isSeatReady } from "./readiness.js";
import { applyRewardOffer } from "./rewards.js";
import { hasStashRoom, itemCanGoOn, runeCanGoOn } from "./inventory.js";

export type RunCommand =
  | { kind: "commit-draft"; playerId: PlayerId; offerIds: readonly string[]; expectedRevision: number }
  | { kind: "confirm-ready"; playerId: PlayerId; expectedRevision: number }
  | { kind: "place-heroes"; playerId: PlayerId; formation: readonly BoardCell[]; expectedRevision: number }
  | {
      kind: "choose-offer";
      playerId: PlayerId;
      decisionId: string;
      offerId: string;
      heroSlot: number | null;
      expectedRevision: number;
    }
  | { kind: "move-item"; playerId: PlayerId; instanceId: string; heroSlot: number | null; expectedRevision: number }
  | { kind: "socket-rune"; playerId: PlayerId; instanceId: string; heroSlot: number | null; expectedRevision: number }
  | { kind: "discard-item"; playerId: PlayerId; instanceId: string; expectedRevision: number };

export type RunCommandRejectionReason =
  | "wrong-phase"
  | "unknown-player"
  | "already-eliminated"
  | "already-decided"
  | "unknown-offer"
  | "duplicate-offer"
  | "invalid-offer-count"
  | "ineligible-upgrade"
  | "invalid-formation"
  | "stale-revision"
  | "unknown-decision"
  | "unknown-piece"
  | "no-room"
  | "team-full"
  | "rune-does-not-fit";

export type RunCommandResult =
  | { accepted: true; state: RunState }
  | { accepted: false; reason: RunCommandRejectionReason };

const COMMAND_PHASES: Record<RunCommand["kind"], readonly RunPhase[]> = {
  "commit-draft": ["draft"],
  "confirm-ready": ["preparing"],
  "place-heroes": ["preparing"],
  "choose-offer": ["reward"],
  "move-item": ["reward", "preparing"],
  "socket-rune": ["reward", "preparing"],
  "discard-item": ["reward", "preparing"],
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

function applyCommitDraft(
  state: RunState,
  seat: PlayerSeat,
  offerIds: readonly string[],
  catalogue: Catalogue,
): RunCommandResult {
  if (offerIds.length !== state.rules.draftPicks) {
    return reject("invalid-offer-count");
  }

  if (new Set(offerIds).size !== offerIds.length) {
    return reject("duplicate-offer");
  }

  const offers = state.heroOffersByPlayer[seat.playerId] ?? [];
  const chosen: HeroOffer[] = [];

  for (const offerId of offerIds) {
    const offer = offers.find((candidate) => candidate.offerId === offerId);

    if (offer === undefined) {
      return reject("unknown-offer");
    }

    chosen.push(offer);
  }

  const heroBuilds = chosen.map((offer, index) =>
    createHeroBuild(`${seat.playerId}-${index}`, offer.heroId, [], catalogue),
  );

  const formation = defaultFormation(chosen.map((offer) => offer.heroId));

  return accept(withSeat(state, { ...seat, heroBuilds, formation, decisionRevision: seat.decisionRevision + 1 }));
}

function applyPlaceHeroes(state: RunState, seat: PlayerSeat, formation: readonly BoardCell[]): RunCommandResult {
  if (!isValidFormation(boardArena, formation, seat.heroBuilds.length)) {
    return reject("invalid-formation");
  }

  const copied = formation.map((cell) => ({ column: cell.column, row: cell.row }));

  return accept(withSeat(state, { ...seat, formation: copied }));
}

function applyChooseOffer(
  state: RunState,
  seat: PlayerSeat,
  command: Extract<RunCommand, { kind: "choose-offer" }>,
  catalogue: Catalogue,
): RunCommandResult {
  const pending = state.pendingDecisionsByPlayer[seat.playerId] ?? [];
  const decision = pending.find((candidate) => candidate.decisionId === command.decisionId);

  if (decision === undefined) {
    return reject("unknown-decision");
  }

  const offer = decision.offers.find((candidate) => candidate.offerId === command.offerId);

  if (offer === undefined) {
    return reject("unknown-offer");
  }

  const round = (state.currentRound?.round ?? 0) + 1;
  const applied = applyRewardOffer(catalogue, state.rules, round, seat, offer, command.heroSlot);

  if (!applied.accepted) {
    return reject(applied.reason);
  }

  const remaining = pending.filter((candidate) => candidate.decisionId !== decision.decisionId);
  const nextSeat = { ...applied.seat, decisionRevision: seat.decisionRevision + 1 };
  const nextState = withSeat(state, nextSeat);

  return accept({
    ...nextState,
    pendingDecisionsByPlayer: { ...state.pendingDecisionsByPlayer, [seat.playerId]: [...remaining, ...applied.followUps] },
  });
}

function applyMoveItem(state: RunState, seat: PlayerSeat, instanceId: string, heroSlot: number | null, catalogue: Catalogue): RunCommandResult {
  const piece = seat.items.find((candidate) => candidate.instanceId === instanceId);

  if (piece === undefined) {
    return reject("unknown-piece");
  }

  if (heroSlot === null ? !hasStashRoom(seat, state.rules, instanceId) : !itemCanGoOn(seat, piece.pieceId, heroSlot, state.rules, catalogue, instanceId)) {
    return reject("no-room");
  }

  const items = seat.items.map((candidate) => (candidate.instanceId === instanceId ? { ...candidate, heroSlot } : candidate));

  return accept(withSeat(state, { ...seat, items }));
}

function applySocketRune(
  state: RunState,
  seat: PlayerSeat,
  instanceId: string,
  heroSlot: number | null,
  catalogue: Catalogue,
): RunCommandResult {
  const piece = seat.runes.find((candidate) => candidate.instanceId === instanceId);

  if (piece === undefined) {
    return reject("unknown-piece");
  }

  if (heroSlot !== null && !runeCanGoOn(seat, piece.pieceId, heroSlot, catalogue, instanceId)) {
    return reject("rune-does-not-fit");
  }

  const runes = seat.runes.map((candidate) => (candidate.instanceId === instanceId ? { ...candidate, heroSlot } : candidate));

  return accept(withSeat(state, { ...seat, runes }));
}

function applyDiscardItem(state: RunState, seat: PlayerSeat, instanceId: string): RunCommandResult {
  if (!seat.items.some((candidate) => candidate.instanceId === instanceId)) {
    return reject("unknown-piece");
  }

  return accept(withSeat(state, { ...seat, items: seat.items.filter((candidate) => candidate.instanceId !== instanceId) }));
}

function isEquipmentCommand(command: RunCommand): boolean {
  return command.kind === "move-item" || command.kind === "socket-rune" || command.kind === "discard-item";
}

export function applyCommand(
  state: RunState,
  command: RunCommand,
  catalogue: Catalogue,
): RunCommandResult {
  const seat = state.players[command.playerId];

  if (seat === undefined) {
    return reject("unknown-player");
  }

  if (seat.eliminated) {
    return reject("already-eliminated");
  }

  if (!COMMAND_PHASES[command.kind].includes(state.phase)) {
    return reject("wrong-phase");
  }

  if (seat.decisionRevision !== command.expectedRevision) {
    return reject("stale-revision");
  }

  const lockedByReady = isEquipmentCommand(command) ? state.phase === "preparing" : true;

  if (lockedByReady && isSeatReady(state, seat.playerId)) {
    return reject("already-decided");
  }

  switch (command.kind) {
    case "commit-draft":
      return applyCommitDraft(state, seat, command.offerIds, catalogue);

    case "confirm-ready":
      return accept(withSeat(state, { ...seat, decisionRevision: seat.decisionRevision + 1 }));

    case "place-heroes":
      return applyPlaceHeroes(state, seat, command.formation);

    case "choose-offer":
      return applyChooseOffer(state, seat, command, catalogue);

    case "move-item":
      return applyMoveItem(state, seat, command.instanceId, command.heroSlot, catalogue);

    case "socket-rune":
      return applySocketRune(state, seat, command.instanceId, command.heroSlot, catalogue);

    case "discard-item":
      return applyDiscardItem(state, seat, command.instanceId);

    default: {
      const exhaustive: never = command;

      return exhaustive;
    }
  }
}
