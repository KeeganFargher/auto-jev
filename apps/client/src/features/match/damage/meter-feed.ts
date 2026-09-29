import type { BattleEvent, BattleSnapshot } from "@jev-game/game";
import { createStore, type ReadableStore, type Store } from "../../../state/store.js";
import { createDamageTally, type DamageTally, type MeterSnapshot } from "./damage-tally.js";

export const PUBLISH_EVERY_MS = 120;

export interface MeterFeed {
  readonly snapshot: ReadableStore<MeterSnapshot | null>;
  start(opening: BattleSnapshot, friendlyTeamId: string, history: readonly BattleEvent[]): void;
  push(events: readonly BattleEvent[]): void;
  clear(): void;
  dispose(): void;
}

export function createMeterFeed(): MeterFeed {
  const snapshot: Store<MeterSnapshot | null> = createStore<MeterSnapshot | null>(null);
  let tally: DamageTally | null = null;
  let dirty = false;
  let publishedAt = Number.NEGATIVE_INFINITY;
  let trailing: number | null = null;

  function cancelTrailing(): void {
    if (trailing !== null) {
      window.clearTimeout(trailing);
      trailing = null;
    }
  }

  function publish(): void {
    if (tally === null) {
      throw new Error("The damage meter published before it started");
    }

    cancelTrailing();
    dirty = false;
    publishedAt = performance.now();
    snapshot.set(tally.read());
  }

  function schedule(): void {
    if (!dirty) {
      return;
    }

    if (performance.now() - publishedAt >= PUBLISH_EVERY_MS) {
      publish();

      return;
    }

    trailing ??= window.setTimeout(() => {
      trailing = null;

      if (dirty) {
        publish();
      }
    }, PUBLISH_EVERY_MS);
  }

  function reset(): void {
    cancelTrailing();
    tally = null;
    dirty = false;
    publishedAt = Number.NEGATIVE_INFINITY;
    snapshot.set(null);
  }

  return {
    snapshot,

    start(opening, friendlyTeamId, history) {
      reset();
      tally = createDamageTally(opening, friendlyTeamId);
      tally.ingest(history);
      publish();
    },

    push(events) {
      if (tally === null) {
        throw new Error("The damage meter received events before it started");
      }

      dirty = tally.ingest(events) || dirty;
      schedule();
    },

    clear: reset,
    dispose: reset,
  };
}
