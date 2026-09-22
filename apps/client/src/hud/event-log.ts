import type { BattleEvent } from "@jev-game/game";

const MAX_ENTRIES = 50;

export interface EventLogView {
  push(events: readonly BattleEvent[]): void;
  clear(): void;
  dispose(): void;
}

function describe(event: BattleEvent): string {
  if (event.kind === "attack-hit") {
    return `t${event.tick} ${event.sourceUnitId} hit ${event.targetUnitId} for ${event.amount}`;
  }

  if (event.kind === "death") {
    return `t${event.tick} ${event.unitId} died`;
  }

  return `t${event.tick} battle ended (${JSON.stringify(event.result)})`;
}

export function createEventLogView(container: HTMLElement): EventLogView {
  const list = document.createElement("ul");
  list.className = "lab-event-log";
  container.appendChild(list);

  return {
    push(events) {
      for (const event of events) {
        const entry = document.createElement("li");
        entry.textContent = describe(event);
        list.prepend(entry);
      }

      while (list.children.length > MAX_ENTRIES) {
        list.lastElementChild?.remove();
      }
    },

    clear() {
      list.replaceChildren();
    },

    dispose() {
      list.remove();
    },
  };
}
