import type { BattleEvent } from "@jev-game/game";

const MAX_ENTRIES = 30;

export interface EventLogView {
  push(events: readonly BattleEvent[]): void;
  clear(): void;
  dispose(): void;
}

function describe(event: BattleEvent): string {
  if (event.kind === "attack-hit") {
    return `${event.sourceUnitId} hit ${event.targetUnitId} for ${event.amount}`;
  }

  if (event.kind === "death") {
    return `${event.unitId} died`;
  }

  return `battle ended (${JSON.stringify(event.result)})`;
}

export function createEventLogView(container: HTMLElement): EventLogView {
  return {
    push(events) {
      for (const event of events) {
        const entry = document.createElement("div");
        entry.textContent = describe(event);
        container.prepend(entry);
      }

      while (container.children.length > MAX_ENTRIES) {
        container.lastElementChild?.remove();
      }
    },

    clear() {
      container.replaceChildren();
    },

    dispose() {
      container.replaceChildren();
    },
  };
}
