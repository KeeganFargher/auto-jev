import type { PlayerId } from "@jev-game/run";
import { createStore, type Store } from "../../../state/store.js";
import { sameReadout, type UnitReadout } from "../../../ui/hero/unit-readout.js";
import { createMeterFeed, type MeterFeed } from "../damage/meter-feed.js";
import type { BattleHeaderState } from "../model/battle-header.js";
import type { SeatRow } from "../model/seat-rows.js";

export interface PlateState {
  roundText: string;
  phaseText: string;
  timer: string;
  urgent: boolean;
}

export interface WatchCommands {
  skip(): void;
  focus(playerId: PlayerId): void;
}

export interface WatchHud {
  readonly plate: Store<PlateState>;
  readonly header: Store<BattleHeaderState | null>;
  readonly rows: Store<readonly SeatRow[]>;
  readonly selected: Store<UnitReadout | null>;
  readonly canSkip: Store<boolean>;
  readonly boardOwner: Store<PlayerId | null>;
  readonly meter: MeterFeed;
  bind(commands: WatchCommands): () => void;
  skip(): void;
  focus(playerId: PlayerId): void;
  reset(): void;
}

export const BLANK_PLATE: PlateState = { roundText: "", phaseText: "", timer: "", urgent: false };

export function samePlate(previous: PlateState, next: PlateState): boolean {
  return (
    previous.roundText === next.roundText &&
    previous.phaseText === next.phaseText &&
    previous.timer === next.timer &&
    previous.urgent === next.urgent
  );
}

export function createWatchHud(): WatchHud {
  const plate = createStore<PlateState>(BLANK_PLATE, samePlate);
  const header = createStore<BattleHeaderState | null>(null);
  const rows = createStore<readonly SeatRow[]>([]);
  const selected = createStore<UnitReadout | null>(null, sameReadout);
  const canSkip = createStore(false);
  const boardOwner = createStore<PlayerId | null>(null);
  const meter = createMeterFeed();
  let commands: WatchCommands | null = null;

  function requireCommands(): WatchCommands {
    if (commands === null) {
      throw new Error("No round is being watched");
    }

    return commands;
  }

  return {
    plate,
    header,
    rows,
    selected,
    canSkip,
    boardOwner,
    meter,

    bind(next) {
      if (commands !== null) {
        throw new Error("A round is already being watched");
      }

      commands = next;

      return () => {
        commands = null;
      };
    },

    skip() {
      requireCommands().skip();
    },

    focus(playerId) {
      requireCommands().focus(playerId);
    },

    reset() {
      plate.set(BLANK_PLATE);
      header.set(null);
      rows.set([]);
      selected.set(null);
      canSkip.set(false);
      boardOwner.set(null);
      meter.clear();
    },
  };
}
