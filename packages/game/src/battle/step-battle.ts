import type { UnitId } from "../ids.js";
import type { BattleState, UnitState } from "./state.js";
import type { BattleEvent } from "./events.js";
import type { BattleResult } from "./result.js";
import type { Catalogue } from "../definitions.js";
import { resolveTarget } from "./targeting.js";
import { proposeMovement } from "./movement.js";
import { proposeAttack, type AttackProposal } from "./attacks.js";
import { applyDamage } from "./damage.js";

export interface BattleStep {
  tick: number;
  events: BattleEvent[];
  result: BattleResult | null;
}

function nextSequence(state: BattleState): number {
  const sequence = state.eventSequence;
  state.eventSequence += 1;

  return sequence;
}

function livingUnitsByTeam(units: readonly UnitState[]): Map<string, UnitState[]> {
  const teams = new Map<string, UnitState[]>();

  for (const unit of units) {
    if (!unit.alive) {
      continue;
    }

    const teammates = teams.get(unit.teamId);

    if (teammates === undefined) {
      teams.set(unit.teamId, [unit]);
    } else {
      teammates.push(unit);
    }
  }

  return teams;
}

function collectDamageDealt(units: readonly UnitState[]): Record<UnitId, number> {
  const damageDealt: Record<UnitId, number> = {};

  for (const unit of units) {
    damageDealt[unit.unitId] = unit.damageDealt;
  }

  return damageDealt;
}

function isCorruptUnitState(unit: UnitState): boolean {
  return (
    !Number.isFinite(unit.hp) || !Number.isFinite(unit.position.x) || !Number.isFinite(unit.position.y)
  );
}

function evaluateResult(state: BattleState): BattleResult | null {
  if (state.units.some(isCorruptUnitState)) {
    return {
      kind: "failure",
      reason: "non-finite unit state",
      endedAtTick: state.tick,
      damageDealt: collectDamageDealt(state.units),
    };
  }

  const livingTeams = livingUnitsByTeam(state.units);

  if (livingTeams.size === 0) {
    return {
      kind: "draw",
      reason: "mutual-elimination",
      endedAtTick: state.tick,
      damageDealt: collectDamageDealt(state.units),
    };
  }

  if (livingTeams.size === 1) {
    const [winningTeamId] = [...livingTeams.keys()];

    if (winningTeamId !== undefined) {
      return {
        kind: "win",
        winningTeamId,
        endedAtTick: state.tick,
        damageDealt: collectDamageDealt(state.units),
      };
    }
  }

  if (state.tick >= state.tickLimit) {
    return {
      kind: "draw",
      reason: "timeout",
      endedAtTick: state.tick,
      damageDealt: collectDamageDealt(state.units),
    };
  }

  return null;
}

export function stepBattle(state: BattleState, _catalogue: Catalogue): BattleStep {
  if (state.result !== null) {
    return { tick: state.tick, events: [], result: state.result };
  }

  state.tick += 1;

  const events: BattleEvent[] = [];
  const eligible = state.units.filter((unit) => unit.alive);

  for (const unit of eligible) {
    const target = resolveTarget(unit, state.units);
    unit.targetUnitId = target === null ? null : target.unitId;
  }

  const movementProposals = eligible.map((unit) => {
    const target =
      unit.targetUnitId === null
        ? null
        : (state.units.find((candidate) => candidate.unitId === unit.targetUnitId) ?? null);

    return proposeMovement(unit, target, state.arenaWidth, state.arenaHeight);
  });

  for (const proposal of movementProposals) {
    const unit = state.units.find((candidate) => candidate.unitId === proposal.unitId);

    if (unit !== undefined) {
      unit.position = proposal.position;
    }
  }

  const attackProposals: AttackProposal[] = [];

  for (const unit of eligible) {
    const target =
      unit.targetUnitId === null
        ? null
        : (state.units.find((candidate) => candidate.unitId === unit.targetUnitId) ?? null);

    const proposal = proposeAttack(unit, target, state.tick);

    if (proposal !== null) {
      attackProposals.push(proposal);
      unit.nextAttackTick = state.tick + unit.attackIntervalTicks;
    }
  }

  const priorityRank = new Map(state.resolutionPriority.map((unitId, index) => [unitId, index]));

  attackProposals.sort((a, b) => {
    const rankA = priorityRank.get(a.sourceUnitId) ?? Number.POSITIVE_INFINITY;
    const rankB = priorityRank.get(b.sourceUnitId) ?? Number.POSITIVE_INFINITY;

    return rankA - rankB;
  });

  for (const proposal of attackProposals) {
    const source = state.units.find((candidate) => candidate.unitId === proposal.sourceUnitId);
    const target = state.units.find((candidate) => candidate.unitId === proposal.targetUnitId);

    if (target === undefined || !target.alive) {
      continue;
    }

    const actual = applyDamage(target, proposal.amount);

    if (source !== undefined) {
      source.damageDealt += actual;
    }

    events.push({
      kind: "attack-hit",
      tick: state.tick,
      sequence: nextSequence(state),
      sourceUnitId: proposal.sourceUnitId,
      targetUnitId: proposal.targetUnitId,
      amount: actual,
    });

    if (!target.alive) {
      events.push({
        kind: "death",
        tick: state.tick,
        sequence: nextSequence(state),
        unitId: target.unitId,
      });
    }
  }

  const result = evaluateResult(state);

  if (result !== null) {
    state.result = result;
    events.push({
      kind: "battle-ended",
      tick: state.tick,
      sequence: nextSequence(state),
      result,
    });
  }

  return { tick: state.tick, events, result: state.result };
}
