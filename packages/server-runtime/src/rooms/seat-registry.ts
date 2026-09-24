import type { AckMessage } from "@jev-game/protocol";

export type SeatController = "bot" | "human";

export interface SeatSlot {
  playerId: string;
  seatNumber: number;
  controller: SeatController;
  displayName: string;
  sessionId: string | null;
  connected: boolean;
  lastViewKey: string;
  watchedEpoch: number;
  acks: Map<string, AckMessage>;
}

const MAX_REMEMBERED_ACKS = 64;

function botName(label: string, seatNumber: number): string {
  return `${label} ${seatNumber}`;
}

export function createSeats(count: number, botLabel: string): SeatSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `seat-${index + 1}`,
    seatNumber: index + 1,
    controller: "bot",
    displayName: botName(botLabel, index + 1),
    sessionId: null,
    connected: false,
    lastViewKey: "",
    watchedEpoch: -1,
    acks: new Map<string, AckMessage>(),
  }));
}

export function claimBotSeat(seats: readonly SeatSlot[], sessionId: string, name: string | undefined): SeatSlot | null {
  const seat = seats.find((candidate) => candidate.controller === "bot");

  if (seat === undefined) {
    return null;
  }

  seat.controller = "human";
  seat.sessionId = sessionId;
  seat.connected = true;
  seat.displayName = name !== undefined && name.length > 0 ? name : `Player ${seat.seatNumber}`;
  seat.lastViewKey = "";
  seat.acks.clear();

  return seat;
}

export function releaseToBot(seat: SeatSlot, botLabel: string): void {
  seat.controller = "bot";
  seat.sessionId = null;
  seat.connected = false;
  seat.displayName = botName(botLabel, seat.seatNumber);
  seat.lastViewKey = "";
  seat.acks.clear();
}

export function seatForSession(seats: readonly SeatSlot[], sessionId: string): SeatSlot | null {
  return seats.find((seat) => seat.sessionId === sessionId) ?? null;
}

export function humanSeats(seats: readonly SeatSlot[]): SeatSlot[] {
  return seats.filter((seat) => seat.controller === "human");
}

export function rememberAck(seat: SeatSlot, ack: AckMessage): void {
  seat.acks.set(ack.commandId, ack);

  if (seat.acks.size > MAX_REMEMBERED_ACKS) {
    const oldest = seat.acks.keys().next().value;

    if (oldest !== undefined) {
      seat.acks.delete(oldest);
    }
  }
}
