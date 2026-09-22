import type { UnitId } from "../ids.js";
import type { BattleEvent } from "./events.js";
import type { BattleState } from "./state.js";
import type { CompiledReactionInstance } from "../builds/compile-build.js";

export const MAX_REACTION_DEPTH = 4;

export const MAX_REACTIONS_PER_TICK = 16;

export interface ReactionJob {
  rootActionSequence: number;
  depth: number;
  reaction: CompiledReactionInstance;
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
}

export interface ReactionBudgetExceeded {
  rootActionSequence: number;
  depthReached: number;
}

export interface ReactionQueueResult {
  events: BattleEvent[];
  budgetExceeded: ReactionBudgetExceeded | null;
}

export function processReactionQueue(
  queue: ReactionJob[],
  state: BattleState,
  nextSequence: () => number,
): ReactionQueueResult {
  const events: BattleEvent[] = [];
  let processed = 0;

  while (queue.length > 0) {
    const job = queue.shift();

    if (job === undefined) {
      break;
    }

    if (job.depth > MAX_REACTION_DEPTH || processed >= MAX_REACTIONS_PER_TICK) {
      return { events, budgetExceeded: { rootActionSequence: job.rootActionSequence, depthReached: job.depth } };
    }

    processed += 1;

    const source = state.units.find((unit) => unit.unitId === job.sourceUnitId);
    const target = state.units.find((unit) => unit.unitId === job.targetUnitId);

    if (source === undefined || target === undefined || !target.alive) {
      continue;
    }

    switch (job.reaction.trigger) {
      case "after-heal-effect": {
        const expiresAtTick = state.tick + job.reaction.shieldDurationTicks;
        target.shield = { amount: job.reaction.shieldAmount, expiresAtTick };

        events.push({
          kind: "shield-applied",
          tick: state.tick,
          sequence: nextSequence(),
          causeSequence: job.rootActionSequence,
          sourceUnitId: source.unitId,
          targetUnitId: target.unitId,
          abilityId: job.reaction.reactionId,
          amount: target.shield.amount,
          expiresAtTick,
        });

        break;
      }

      default: {
        const exhaustive: never = job.reaction.trigger;

        void exhaustive;
      }
    }
  }

  return { events, budgetExceeded: null };
}
