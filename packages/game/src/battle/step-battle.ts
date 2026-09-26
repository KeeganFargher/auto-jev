import type { UnitId } from "../ids.js";
import type { BattleState, UnitState } from "./state.js";
import type { BattleEvent, CastEvent } from "./events.js";
import type { BattleResult } from "./result.js";
import type { Catalogue } from "../definitions.js";
import type { CompiledAbility } from "../builds/compile-build.js";
import { isCastTarget, resolveTarget } from "./targeting.js";
import { proposeDrift, proposeFollow, proposeMovement, separateUnits } from "./movement.js";
import { getEngageRange, proposeAction, type ActionProposal } from "./abilities.js";
import { expireShield, expireSlow, expireTimedStatuses } from "./statuses.js";
import {
  CAST_FLAGS,
  PUPPET_FLAGS,
  applyDeferredMoves,
  applySpawns,
  attackSpeedBonusFor,
  createResolutionContext,
  findPassive,
  finishChannel,
  isEvaded,
  gainMana,
  payAbilityHp,
  payHp,
  reflectUltimate,
  removeUnit,
  resolveCast,
  updateOverclock,
  type ResolutionContext,
} from "./combat.js";
import { processReactions, processTimedEffects } from "./timed.js";
import { scheduleUnstableEcho, type BudgetBreach } from "./triggers.js";

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

function payForCast(ctx: ResolutionContext, unit: UnitState, abilityId: string, ability: CompiledAbility | undefined): void {
  const pact = findPassive(unit, "blood-pact");

  if (pact !== null && (abilityId === unit.abilityId || abilityId === unit.ultimateId)) {
    payHp(ctx, unit, unit.hp * pact.hpFraction, "blood-pact");
  } else if (ability?.manaCost !== undefined) {
    unit.mana = Math.max(0, unit.mana - ability.manaCost);
  }

  if (ability !== undefined) {
    payAbilityHp(ctx, unit, ability);
  }
}

function isCorruptUnitState(unit: UnitState): boolean {
  return !Number.isFinite(unit.hp) || !Number.isFinite(unit.position.x) || !Number.isFinite(unit.position.y);
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

function pruneTimedBuffs(unit: UnitState, tick: number): void {
  if (unit.speedBuffs.length > 0) {
    unit.speedBuffs = unit.speedBuffs.filter((buff) => buff.expiresAtTick > tick);
  }

  if (unit.marks.length > 0) {
    unit.marks = unit.marks.filter((mark) => mark.expiresAtTick > tick);
  }
}

function followedLeader(unit: UnitState, units: readonly UnitState[]): UnitState | null {
  const leader = unit.summonerUnitId === null ? undefined : units.find((candidate) => candidate.unitId === unit.summonerUnitId);

  return leader !== undefined && leader.alive && leader.form?.definition.summonsFollow === true ? leader : null;
}

function busyUnitIds(state: BattleState): Set<UnitId> {
  const busy = new Set<UnitId>();

  for (const sequence of state.sequences) {
    if (sequence.moves) {
      busy.add(sequence.sourceUnitId);
    }
  }

  return busy;
}

function breachResult(state: BattleState, events: BattleEvent[], breach: BudgetBreach): BattleResult {
  events.push({
    kind: "reaction-budget-exceeded",
    tick: state.tick,
    sequence: nextSequence(state),
    rootActionSequence: breach.rootActionSequence,
    depthReached: breach.depthReached,
  });

  return {
    kind: "failure",
    reason: "reaction budget exceeded",
    endedAtTick: state.tick,
    damageDealt: collectDamageDealt(state.units),
  };
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

    pruneTimedBuffs(unit, state.tick);
  }

  for (const unit of eligible) {
    const channel = unit.channel;

    for (const status of expireTimedStatuses(unit, state.tick)) {
      events.push({ kind: "status-expired", tick: state.tick, sequence: nextSequence(state), unitId: unit.unitId, status });
    }

    if (channel !== null && unit.channel === null) {
      finishChannel(ctx, unit, channel);
    }
  }

  for (const unit of eligible) {
    if (unit.alive && unit.expiresAtTick > 0 && state.tick >= unit.expiresAtTick) {
      removeUnit(ctx, unit);
    }
  }

  const timedBreach = processTimedEffects(ctx);
  applyDeferredMoves(ctx);

  const acting = state.units.filter((unit) => unit.alive);
  const busy = busyUnitIds(state);

  for (const unit of acting) {
    const target = resolveTarget(unit, state.units);
    unit.targetUnitId = target === null ? null : target.unitId;
  }

  const movementProposals = acting.flatMap((unit) => {
    if (busy.has(unit.unitId)) {
      return [];
    }

    if (unit.channel !== null && unit.channel.drifts) {
      return [proposeDrift(unit, state.units, state.arenaWidth, state.arenaHeight)];
    }

    const leader = followedLeader(unit, state.units);

    if (leader !== null) {
      return [proposeFollow(unit, leader, state.arenaWidth, state.arenaHeight)];
    }

    const target =
      unit.targetUnitId === null
        ? null
        : (state.units.find((candidate) => candidate.unitId === unit.targetUnitId) ?? null);

    return [proposeMovement(unit, target, getEngageRange(unit), state.units, state.arenaWidth, state.arenaHeight)];
  });

  for (const proposal of movementProposals) {
    const unit = state.units.find((candidate) => candidate.unitId === proposal.unitId);

    if (unit !== undefined) {
      unit.position = proposal.position;
    }
  }

  separateUnits(state.units, busy, state.arenaWidth, state.arenaHeight);

  updateOverclock(state);

  const actionProposals: ActionProposal[] = [];

  for (const unit of acting) {
    const proposal = busy.has(unit.unitId) ? null : proposeAction(unit, state.units, state.tick);

    if (proposal === null) {
      continue;
    }

    const ability = unit.abilities[proposal.abilityId];

    let cooldownDuration = unit.abilityCooldownDurations[proposal.abilityId] ?? ability?.cooldownTicks ?? 0;

    const speedBonus = proposal.isBasicAttack ? attackSpeedBonusFor(state, unit) : 0;

    if (speedBonus > 0) {
      cooldownDuration = Math.max(1, Math.round(cooldownDuration / (1 + speedBonus)));
    }

    unit.abilityCooldowns[proposal.abilityId] = state.tick + cooldownDuration;
    payForCast(ctx, unit, proposal.abilityId, ability);
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

    if (target === undefined || !isCastTarget(ability, source, target)) {
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
    const isUltimate = proposal.abilityId === source.ultimateId;

    const castEvent: CastEvent = {
      kind: "cast",
      tick: state.tick,
      sequence: castSequence,
      sourceUnitId: proposal.sourceUnitId,
      abilityId: proposal.abilityId,
      targetUnitId: proposal.targetUnitId,
      isBasicAttack: proposal.isBasicAttack,
    };

    if (isUltimate) {
      castEvent.ultimate = true;
    }

    events.push(castEvent);

    if (proposal.isBasicAttack) {
      gainMana(state, source, source.manaPerAttack);
    }

    if (proposal.isBasicAttack && isEvaded(ctx, source, target, castSequence)) {
      continue;
    }

    if (!isUltimate || !reflectUltimate(ctx, source, ability, target)) {
      resolveCast(
        ctx,
        { source, ability, castSequence, isBasicAttack: proposal.isBasicAttack, scale: 1, flags: proposal.isBasicAttack && target.teamId === source.teamId ? PUPPET_FLAGS : CAST_FLAGS, critBonus: 0, repeat: null },
        target,
      );

      if (!proposal.isBasicAttack) {
        scheduleUnstableEcho(ctx, source, ability.id, target, castSequence);
      }
    }

  }

  applyDeferredMoves(ctx);

  const reactionBreach = processReactions(ctx);
  applyDeferredMoves(ctx);
  applySpawns(ctx);

  const breach = timedBreach ?? reactionBreach;
  const result = breach === null ? evaluateResult(state) : breachResult(state, events, breach);

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
