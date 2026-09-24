import type { UnitId } from "../ids.js";
import type { BattleState, UnitState } from "./state.js";
import type { BattleEvent, CastEvent } from "./events.js";
import type { BattleResult } from "./result.js";
import type { Catalogue } from "../definitions.js";
import { resolveTarget } from "./targeting.js";
import { proposeMovement } from "./movement.js";
import { getEngageRange, proposeAction, type ActionProposal } from "./abilities.js";
import { expireShield, expireSlow, expireTimedStatuses } from "./statuses.js";
import {
  CAST_FLAGS,
  applyDeferredMoves,
  applySpawns,
  attackSpeedBonusFor,
  createResolutionContext,
  findPassive,
  isEvaded,
  manaGainMultiplier,
  payHp,
  reflectSignature,
  resolveCast,
  type ResolutionContext,
} from "./combat.js";
import { processTimedEffects, processTriggeredCasts } from "./timed.js";

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
    if (!unit.alive || unit.summonerUnitId !== null) {
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

function payForSignature(ctx: ResolutionContext, unit: UnitState, manaCost: number, overchargeHpCost: number): void {
  const contract = findPassive(unit, "blood-contract");

  if (contract === null) {
    unit.mana = Math.max(0, unit.mana - manaCost);
  } else {
    payHp(ctx, unit, unit.maxHp * contract.hpFraction, "blood-contract");
  }

  if (overchargeHpCost > 0) {
    payHp(ctx, unit, unit.hp * overchargeHpCost, "overcharge");
  }
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

export function stepBattle(state: BattleState, catalogue: Catalogue): BattleStep {
  if (state.result !== null) {
    return { tick: state.tick, events: [], result: state.result };
  }

  state.tick += 1;

  const events: BattleEvent[] = [];
  const ctx = createResolutionContext(state, events, () => nextSequence(state), catalogue);

  const eligible = state.units.filter((unit) => unit.alive);

  for (const unit of eligible) {
    if (expireShield(unit, state.tick)) {
      events.push({
        kind: "status-expired",
        tick: state.tick,
        sequence: nextSequence(state),
        unitId: unit.unitId,
        status: "shield",
      });
    }

    if (expireSlow(unit, state.tick)) {
      events.push({
        kind: "status-expired",
        tick: state.tick,
        sequence: nextSequence(state),
        unitId: unit.unitId,
        status: "slow",
      });
    }
  }

  for (const unit of eligible) {
    for (const status of expireTimedStatuses(unit, state.tick)) {
      events.push({ kind: "status-expired", tick: state.tick, sequence: nextSequence(state), unitId: unit.unitId, status });
    }
  }

  processTimedEffects(ctx);

  const acting = state.units.filter((unit) => unit.alive);

  for (const unit of acting) {
    const target = resolveTarget(unit, state.units);
    unit.targetUnitId = target === null ? null : target.unitId;
  }

  const movementProposals = acting.map((unit) => {
    const target =
      unit.targetUnitId === null
        ? null
        : (state.units.find((candidate) => candidate.unitId === unit.targetUnitId) ?? null);

    return proposeMovement(
      unit,
      target,
      getEngageRange(unit, catalogue),
      state.arenaWidth,
      state.arenaHeight,
    );
  });

  for (const proposal of movementProposals) {
    const unit = state.units.find((candidate) => candidate.unitId === proposal.unitId);

    if (unit !== undefined) {
      unit.position = proposal.position;
    }
  }

  const actionProposals: ActionProposal[] = [];

  for (const unit of acting) {
    const proposal = proposeAction(unit, state.units, state.tick, catalogue);

    if (proposal === null) {
      continue;
    }

    const ability = unit.abilities[proposal.abilityId] ?? catalogue.abilities[proposal.abilityId];

    let cooldownDuration =
      unit.abilityCooldownDurations[proposal.abilityId] ??
      catalogue.abilities[proposal.abilityId]?.cooldownTicks ??
      0;

    const speedBonus = proposal.isBasicAttack ? attackSpeedBonusFor(state, unit) : 0;

    if (speedBonus > 0) {
      cooldownDuration = Math.max(1, Math.round(cooldownDuration / (1 + speedBonus)));
    }

    unit.abilityCooldowns[proposal.abilityId] = state.tick + cooldownDuration;

    if (ability?.manaCost !== undefined) {
      payForSignature(ctx, unit, ability.manaCost, unit.abilities[proposal.abilityId]?.runes.overchargeHpCost ?? 0);
    }

    actionProposals.push(proposal);
  }

  const priorityRank = new Map(state.resolutionPriority.map((unitId, index) => [unitId, index]));

  actionProposals.sort((a, b) => {
    const rankA = priorityRank.get(a.sourceUnitId) ?? Number.POSITIVE_INFINITY;
    const rankB = priorityRank.get(b.sourceUnitId) ?? Number.POSITIVE_INFINITY;

    return rankA - rankB;
  });

  for (const proposal of actionProposals) {
    const source = state.units.find((candidate) => candidate.unitId === proposal.sourceUnitId);
    const target = state.units.find((candidate) => candidate.unitId === proposal.targetUnitId);
    const ability = source?.abilities[proposal.abilityId];

    if (ability === undefined || source === undefined) {
      continue;
    }

    if (target === undefined || !target.alive) {
      events.push({
        kind: "cast-fizzled",
        tick: state.tick,
        sequence: nextSequence(state),
        sourceUnitId: proposal.sourceUnitId,
        abilityId: proposal.abilityId,
        targetUnitId: proposal.targetUnitId,
      });

      continue;
    }

    const castSequence = nextSequence(state);
    const isSignature = ability.manaCost !== undefined;

    const castEvent: CastEvent = {
      kind: "cast",
      tick: state.tick,
      sequence: castSequence,
      sourceUnitId: proposal.sourceUnitId,
      abilityId: proposal.abilityId,
      targetUnitId: proposal.targetUnitId,
      isBasicAttack: proposal.isBasicAttack,
    };

    if (isSignature) {
      castEvent.signature = true;
    }

    events.push(castEvent);

    if (proposal.isBasicAttack && source.maxMana > 0) {
      source.mana = Math.min(source.maxMana, source.mana + source.manaPerAttack * manaGainMultiplier(state, source));
    }

    if (proposal.isBasicAttack && isEvaded(ctx, source, target, castSequence)) {
      continue;
    }

    if (!isSignature || !reflectSignature(ctx, source, ability, target)) {
      resolveCast(
        ctx,
        { source, ability, castSequence, isBasicAttack: proposal.isBasicAttack, scale: 1, flags: CAST_FLAGS },
        target,
      );
    }

    if (isSignature) {
      source.memory.signatureCasts += 1;

      if (findPassive(source, "refill-after-first-signature") !== null && !source.memory.refillUsed) {
        source.memory.refillUsed = true;
        source.mana = source.maxMana;
        events.push({ kind: "passive-triggered", tick: state.tick, sequence: nextSequence(state), unitId: source.unitId, passive: "refill-after-first-signature" });
      }
    }
  }

  applyDeferredMoves(ctx);

  const budgetExceeded = processTriggeredCasts(ctx);
  applyDeferredMoves(ctx);
  applySpawns(ctx);

  let result: BattleResult | null;

  if (budgetExceeded !== null) {
    events.push({
      kind: "reaction-budget-exceeded",
      tick: state.tick,
      sequence: nextSequence(state),
      rootActionSequence: budgetExceeded.rootActionSequence,
      depthReached: budgetExceeded.depthReached,
    });

    result = {
      kind: "failure",
      reason: "reaction budget exceeded",
      endedAtTick: state.tick,
      damageDealt: collectDamageDealt(state.units),
    };
  } else {
    result = evaluateResult(state);
  }

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
