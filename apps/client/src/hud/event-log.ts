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

    case "condition-applied":
      return `${event.targetUnitId} is ${event.condition}`;

    case "combo-detonated":
      return `${event.combo.toUpperCase()}! ${event.sourceUnitId} detonated ${event.targetUnitId}'s ${event.condition} for ${event.bonusDamage} extra`;

    case "status-applied":
      return `${event.targetUnitId} is ${event.status}${event.stacks === undefined ? "" : ` x${event.stacks}`}`;

    case "unit-moved":
      return `${event.unitId} ${event.reason === "blink" ? "blinked" : "was knocked back"}`;

    case "impact-scheduled":
      return `${event.sourceUnitId}'s ${event.abilityId} is coming down`;

    case "impact-landed":
      return `${event.abilityId} landed`;

    case "emitter-started":
      return `${event.sourceUnitId} sent out ${event.abilityId}`;

    case "emitter-fired":
      return `${event.abilityId} shot at ${event.targetUnitId}`;

    case "zone-created":
      return `${event.sourceUnitId} left ${event.abilityId} on the ground`;

    case "zone-expired":
      return `a zone faded`;

    case "attack-evaded":
      return `${event.targetUnitId} dodged ${event.sourceUnitId}`;

    case "revived":
      return `${event.unitId} came back with ${event.hp} HP`;

    case "unit-spawned":
      return `${event.summonerUnitId} raised a ${event.heroId}`;

    case "unit-dismissed":
      return `${event.unitId} was dismissed`;

    case "corpse-spent":
      return `${event.unitId}'s corpse was used up`;

    case "passive-triggered":
      return `${event.unitId}: ${event.passive}`;

    case "hp-paid":
      return `${event.unitId} paid ${event.amount} HP (${event.reason})`;

    case "death":
      return `${event.unitId} died`;

    case "battle-ended": {
      const { result } = event;

      if (result.kind === "win") {
        return `battle over, ${result.winningTeamId} wins`;
      }

      return `battle over, ${result.kind} (${result.reason})`;
    }

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
