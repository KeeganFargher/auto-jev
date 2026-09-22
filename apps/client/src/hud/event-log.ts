import type { BattleEvent } from "@jev-game/game";

const MAX_ENTRIES = 30;

export interface EventLogView {
  push(events: readonly BattleEvent[]): void;
  clear(): void;
  dispose(): void;
}

function describe(event: BattleEvent): string {
  if (event.kind === "cast") {
    return `${event.sourceUnitId} casts ${event.abilityId} on ${event.targetUnitId}`;
  }

  if (event.kind === "damage-dealt") {
    const absorbed = event.shieldAbsorbed > 0 ? ` (${event.shieldAbsorbed} shielded)` : "";

    return `${event.sourceUnitId} hit ${event.targetUnitId} for ${event.amount}${absorbed}`;
  }

  if (event.kind === "healing-done") {
    return `${event.sourceUnitId} healed ${event.targetUnitId} for ${event.amount}`;
  }

  if (event.kind === "shield-applied") {
    return `${event.sourceUnitId} shielded ${event.targetUnitId} for ${event.amount}`;
  }

  if (event.kind === "cast-fizzled") {
    return `${event.sourceUnitId}'s ${event.abilityId} fizzled, ${event.targetUnitId} was no longer a legal target`;
  }

  if (event.kind === "status-expired") {
    return `${event.unitId}'s ${event.status} expired`;
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
