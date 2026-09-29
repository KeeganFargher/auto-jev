import type { TeamId } from "../ids.js";
import { COMBO_FREEZE } from "./beats.js";
import { emit, type StepContext } from "./events.js";
import { CHAIN_DAMAGE_BONUS_PER_LINK, CHAIN_WINDOW_TICKS } from "./rules.js";
import {
  setupMarks,
  unitById,
  type BattleState,
  type ChainState,
  type UnitState,
} from "./state.js";

export function teamChain(state: BattleState, teamId: TeamId): ChainState {
  const chain = state.chains.find((candidate) => candidate.teamId === teamId);

  if (chain === undefined) {
    throw new Error(`No chain for team "${teamId}"`);
  }

  return chain;
}

export function chainDamageMultiplier(state: BattleState, teamId: TeamId): number {
  return 1 + CHAIN_DAMAGE_BONUS_PER_LINK * teamChain(state, teamId).count;
}

export function expireChains(state: BattleState): void {
  for (const chain of state.chains) {
    if (chain.count > 0 && state.tick - chain.lastLinkTick > CHAIN_WINDOW_TICKS) {
      chain.count = 0;
      chain.unitIds = [];
      chain.pairs = [];
    }
  }
}

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

export function recordComboLink(
  ctx: StepContext,
  payoff: UnitState,
  targets: readonly UnitState[],
): void {
  const state = ctx.state;
  const chain = teamChain(state, payoff.teamId);

  for (const target of targets) {
    for (const mark of setupMarks(state, target)) {
      const maker = unitById(state, mark.makerUnitId);
      const pair = `${maker.unitId}>${payoff.unitId}`;

      if (
        maker.unitId === payoff.unitId ||
        maker.teamId !== payoff.teamId ||
        chain.pairs.includes(pair)
      ) {
        continue;
      }

      chain.count += 1;
      chain.lastLinkTick = state.tick;
      chain.pairs = [...chain.pairs, pair];
      chain.unitIds = addUnique(addUnique(chain.unitIds, maker.unitId), payoff.unitId);
      emit(ctx, {
        kind: "combo-link",
        teamId: payoff.teamId,
        count: chain.count,
        setupUnitId: maker.unitId,
        payoffUnitId: payoff.unitId,
        targetUnitId: target.unitId,
        state: mark.state,
        unitIds: [...chain.unitIds],
      });
      emit(ctx, { kind: "beat", beat: COMBO_FREEZE });

      return;
    }
  }
}
