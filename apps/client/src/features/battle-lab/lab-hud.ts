import type { BattleEvent } from "@jev-game/game";
import { createStore, type ReadableStore, type Store } from "../../state/store.js";
import { sameReadout, type UnitReadout } from "../../ui/hero/unit-readout.js";
import { describeEvent } from "./describe-event.js";

export interface FeedEntry {
  id: number;
  text: string;
}

export interface LabHudFrame {
  status: string;
  events: readonly BattleEvent[];
  selected: UnitReadout | null;
}

export interface LabHud {
  readonly status: ReadableStore<string | null>;
  readonly feed: ReadableStore<readonly FeedEntry[]>;
  readonly readout: ReadableStore<UnitReadout | null>;
  publish(frame: LabHudFrame): void;
  reset(): void;
}

export const FEED_LIMIT = 30;

export function appendFeed(
  feed: readonly FeedEntry[],
  events: readonly BattleEvent[],
  nextId: number,
): readonly FeedEntry[] {
  const fresh = events.map((event, index) => ({ id: nextId + index, text: describeEvent(event) }));

  return [...fresh.reverse(), ...feed].slice(0, FEED_LIMIT);
}

export function createLabHud(): LabHud {
  const status: Store<string | null> = createStore<string | null>(null);
  const feed: Store<readonly FeedEntry[]> = createStore<readonly FeedEntry[]>([]);
  const readout: Store<UnitReadout | null> = createStore<UnitReadout | null>(null, sameReadout);
  let nextId = 0;

  return {
    status,
    feed,
    readout,

    publish(frame) {
      status.set(frame.status);
      readout.set(frame.selected);

      if (frame.events.length > 0) {
        feed.update((current) => appendFeed(current, frame.events, nextId));
        nextId += frame.events.length;
      }
    },

    reset() {
      status.set(null);
      feed.set([]);
      readout.set(null);
    },
  };
}
