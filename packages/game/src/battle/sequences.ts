import type { UnitId } from "../ids.js";
import type { DashDefinition } from "../definitions.js";
import type { ActiveSequence, UnitState } from "./state.js";
import { distance, isWithinRange } from "../math/vector.js";
import { unitsInCircle } from "./areas.js";
import { isUntargetable } from "./statuses.js";
import {
  CAST_FLAGS,
  applyMark,
  behindTarget,
  chainTargets,
  findUnit,
  heal,
  passivesOfKind,
  resolveOnTarget,
  withStun,
  type CastInfo,
  type ResolutionContext,
} from "./combat.js";
import { priorityRank } from "./triggers.js";

export const MARK_DURATION_TICKS = 90;

const LONE_HOP_REACH = 2;

function isHopCandidate(source: UnitState, candidate: UnitState): boolean {
  return candidate.alive && candidate.teamId !== source.teamId && !isUntargetable(candidate);
}

function lowestHpEnemyHero(ctx: ResolutionContext, source: UnitState): UnitState | null {
  let lowest: UnitState | null = null;

  for (const candidate of ctx.state.units) {
    if (!isHopCandidate(source, candidate) || candidate.summonerUnitId !== null) {
      continue;
    }

    if (lowest === null || candidate.hp < lowest.hp || (candidate.hp === lowest.hp && candidate.unitId < lowest.unitId)) {
      lowest = candidate;
    }
  }

  return lowest;
}

function timesHit(sequence: ActiveSequence, unitId: UnitId): number {
  let count = 0;

  for (const hit of sequence.hitUnitIds) {
    if (hit === unitId) {
      count += 1;
    }
  }

  return count;
}

function hopKey(sequence: ActiveSequence, candidate: UnitState): number[] {
  const last = sequence.hitUnitIds[sequence.hitUnitIds.length - 1];

  return [
    candidate.summonerUnitId === null ? 0 : 1,
    timesHit(sequence, candidate.unitId),
    candidate.unitId === last ? 1 : 0,
    distance(sequence.anchor, candidate.position),
  ];
}

function isBetter(key: readonly number[], best: readonly number[]): boolean {
  for (let index = 0; index < key.length; index += 1) {
    const difference = (key[index] ?? 0) - (best[index] ?? 0);

    if (difference !== 0) {
      return difference < 0;
    }
  }

  return false;
}

function bestHop(ctx: ResolutionContext, source: UnitState, sequence: ActiveSequence, reach: number): UnitState | null {
  let best: UnitState | null = null;
  let bestKey: number[] = [];

  for (const candidate of ctx.state.units) {
    if (!isHopCandidate(source, candidate)) {
      continue;
    }

    if (reach > 0 && !isWithinRange(distance(sequence.anchor, candidate.position), reach)) {
      continue;
    }

    const key = hopKey(sequence, candidate);

    if (best === null || isBetter(key, bestKey) || (!isBetter(bestKey, key) && candidate.unitId < best.unitId)) {
      best = candidate;
      bestKey = key;
    }
  }

  return best;
}

function chooseHopTarget(ctx: ResolutionContext, source: UnitState, sequence: ActiveSequence, dash: DashDefinition): UnitState | null {
  if (dash.markPerStrike !== undefined) {
    return lowestHpEnemyHero(ctx, source);
  }

  const near = bestHop(ctx, source, sequence, dash.hopRangeUnits);

  if (dash.hopRangeUnits <= 0 || near === null || timesHit(sequence, near.unitId) === 0) {
    return near;
  }

  const wide = bestHop(ctx, source, sequence, dash.hopRangeUnits * LONE_HOP_REACH);

  return wide !== null && timesHit(sequence, wide.unitId) === 0 ? wide : near;
}

function removeSequence(ctx: ResolutionContext, sequence: ActiveSequence): void {
  ctx.state.sequences = ctx.state.sequences.filter((candidate) => candidate.sequenceId !== sequence.sequenceId);
}

function finishSequence(ctx: ResolutionContext, sequence: ActiveSequence, source: UnitState, dash: DashDefinition): void {
  removeSequence(ctx, sequence);

  if (!sequence.moves || dash.endBehindLowestHero !== true || !source.alive) {
    return;
  }

  const target = lowestHpEnemyHero(ctx, source);

  if (target !== null) {
    ctx.moves.push({ unitId: source.unitId, to: behindTarget(ctx, sequence.anchor, target), reason: "dash" });
    source.targetUnitId = target.unitId;
  }
}

function performHop(ctx: ResolutionContext, sequence: ActiveSequence, forced: UnitState | null): void {
  const source = findUnit(ctx.state, sequence.sourceUnitId);
  const ability = source?.abilities[sequence.abilityId];
  const dash = ability?.dash;

  if (source === null || ability === undefined || dash === undefined || !source.alive || (sequence.moves && source.control !== null)) {
    removeSequence(ctx, sequence);

    return;
  }

  const target = forced !== null && isHopCandidate(source, forced) ? forced : chooseHopTarget(ctx, source, sequence, dash);

  if (target === null) {
    finishSequence(ctx, sequence, source, dash);

    return;
  }

  if (sequence.moves) {
    ctx.moves.push({ unitId: source.unitId, to: behindTarget(ctx, sequence.anchor, target), reason: "dash" });
    source.targetUnitId = target.unitId;
  }

  sequence.anchor = { x: target.position.x, y: target.position.y };

  const cast = withStun(
    {
      source,
      ability,
      castSequence: sequence.castSequence,
      isBasicAttack: false,
      scale: sequence.scale,
      flags: CAST_FLAGS,
      critBonus: (dash.critBonusPerHop ?? 0) * sequence.hopsDone,
      repeat: sequence.repeat,
    },
    sequence.stun,
  );

  const last = sequence.hopsLeft <= 1;
  const effects = last && dash.finalEffects !== undefined ? [...ability.effects, ...dash.finalEffects] : ability.effects;
  const hitIds = new Set<UnitId>([target.unitId]);
  let damage = resolveOnTarget(ctx, cast, target, effects);

  if (dash.markPerStrike !== undefined) {
    applyMark(ctx, source, target, dash.markPerStrike, MARK_DURATION_TICKS);
  }

  if (dash.splashRadiusUnits !== undefined) {
    for (const other of unitsInCircle(ctx.state.units, source, target.position, dash.splashRadiusUnits, "enemies")) {
      if (other.unitId === target.unitId) {
        continue;
      }

      hitIds.add(other.unitId);
      damage += resolveOnTarget(ctx, cast, other, ability.effects);
    }
  }

  for (const extra of chainTargets(ctx, cast, target, hitIds)) {
    damage += resolveOnTarget(ctx, { ...cast, scale: cast.scale * (ability.gems.chain?.fraction ?? 1) }, extra, ability.effects);
  }

  if (ability.gems.leech > 0 && damage > 0 && source.alive) {
    heal(ctx, source, source, damage * ability.gems.leech, "leech", sequence.castSequence);
  }

  sequence.hitUnitIds.push(target.unitId);
  sequence.hopsDone += 1;
  sequence.hopsLeft -= 1;
  sequence.nextHopTick = ctx.state.tick + dash.periodTicks;

  if (sequence.hopsLeft <= 0) {
    finishSequence(ctx, sequence, source, dash);
  }
}

function spendStacks(source: UnitState, abilityId: string): number {
  let extra = 0;

  for (const passive of passivesOfKind(source, "stacks")) {
    if (passive.spentBy !== abilityId) {
      continue;
    }

    extra += (source.memory.stacks[passive.key] ?? 0) * (passive.extraHopsPerStack ?? 0);
    source.memory.stacks[passive.key] = 0;
  }

  return extra;
}

export function startSequence(ctx: ResolutionContext, cast: CastInfo, primaryTarget: UnitState): void {
  const { source, ability } = cast;
  const dash = ability.dash;

  if (dash === undefined) {
    return;
  }

  const moves = cast.repeat !== "clone";
  const hops = dash.hops + (moves ? spendStacks(source, ability.id) : 0);

  if (moves && dash.untargetable === true) {
    source.untargetableUntilTick = Math.max(source.untargetableUntilTick, ctx.state.tick + (hops - 1) * dash.periodTicks + 1);
  }

  const sequence: ActiveSequence = {
    sequenceId: ctx.state.nextEntityId,
    sourceUnitId: source.unitId,
    abilityId: ability.id,
    castSequence: cast.castSequence,
    scale: cast.scale,
    stun: cast.stun ?? null,
    hopsLeft: hops,
    hopsDone: 0,
    nextHopTick: ctx.state.tick,
    hitUnitIds: [],
    anchor: { x: source.position.x, y: source.position.y },
    moves,
    repeat: cast.repeat === "multistrike" ? null : cast.repeat,
  };

  ctx.state.nextEntityId += 1;
  ctx.state.sequences.push(sequence);
  performHop(ctx, sequence, primaryTarget.teamId === source.teamId ? null : primaryTarget);
}

export function processSequences(ctx: ResolutionContext): void {
  if (ctx.state.sequences.length === 0) {
    return;
  }

  const rank = priorityRank(ctx.state);
  const due = ctx.state.sequences.filter((sequence) => sequence.nextHopTick <= ctx.state.tick);

  due.sort(
    (a, b) =>
      (rank.get(a.sourceUnitId) ?? Number.POSITIVE_INFINITY) - (rank.get(b.sourceUnitId) ?? Number.POSITIVE_INFINITY) || a.sequenceId - b.sequenceId,
  );

  for (const sequence of due) {
    if (ctx.state.sequences.includes(sequence)) {
      performHop(ctx, sequence, null);
    }
  }
}

export function cancelSequences(ctx: ResolutionContext, unitId: UnitId, includeShades = false): void {
  ctx.state.sequences = ctx.state.sequences.filter(
    (sequence) => sequence.sourceUnitId !== unitId || (!sequence.moves && !includeShades),
  );
}

export function isDashing(ctx: ResolutionContext, unitId: UnitId): boolean {
  return ctx.state.sequences.some((sequence) => sequence.moves && sequence.sourceUnitId === unitId);
}
