import type { BattleEvent } from "@jev-game/game";

const MAX_ENTRIES = 30;

export interface EventLogView {
  push(events: readonly BattleEvent[]): void;
  clear(): void;
  dispose(): void;
}

function describe(event: BattleEvent): string {
  switch (event.kind) {
    case "cast":
      return `${event.sourceUnitId} casts ${event.abilityId} on ${event.targetUnitId}`;

    case "damage-dealt": {
      const absorbed = event.shieldAbsorbed > 0 ? ` (${event.shieldAbsorbed} shielded)` : "";

      return `${event.sourceUnitId} hit ${event.targetUnitId} for ${event.amount}${absorbed}`;
    }

    case "healing-done":
      return `${event.sourceUnitId} healed ${event.targetUnitId} for ${event.amount}`;

    case "shield-applied":
      return `${event.sourceUnitId} shielded ${event.targetUnitId} for ${event.amount}`;

    case "slow-applied":
      return `${event.sourceUnitId} slowed ${event.targetUnitId} to ${Math.round(event.speedMultiplier * 100)}% speed`;

    case "cast-fizzled":
      return `${event.sourceUnitId}'s ${event.abilityId} fizzled, ${event.targetUnitId} was no longer a legal target`;

    case "reaction-budget-exceeded":
      return `reaction chain from action #${event.rootActionSequence} exceeded its safety budget at depth ${event.depthReached}`;

    case "status-expired":
      return `${event.unitId}'s ${event.status} expired`;

    case "death":
      return `${event.unitId} died`;

    case "battle-ended":
      return `battle ended (${JSON.stringify(event.result)})`;

    default: {
      const exhaustive: never = event;

      return exhaustive;
    }
  }
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
