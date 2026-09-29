import type { UnitId } from "../ids.js";
import { directionTo } from "../math/vector.js";
import { nextFloat } from "../random/rng.js";
import { CRIT_FREEZE } from "./beats.js";
import { dealDamage, gainMana, healUnit } from "./damage.js";
import { emit, type StepContext } from "./events.js";
import { isLaunchable, launchUnit } from "./launch.js";
import { isCasting } from "./prediction.js";
import { fireProjectile } from "./projectiles.js";
import {
  CRIT_CHANCE,
  CRIT_HOP_DISTANCE_UNITS,
  CRIT_HOP_RISE_UNITS,
  CRIT_MULTIPLIER,
  MANA_PER_ATTACK_HIT,
  MELEE_REACH_SLACK_UNITS,
} from "./rules.js";
import { isGrounded, unitById, type UnitState } from "./state.js";
import { canAttack, compareUnitIds, edgeGap, isInReach, livingAllies } from "./targeting.js";

export function faceTowards(unit: UnitState, target: UnitState): void {
  const direction = directionTo(unit.position, target.position);

  if (direction.x !== 0 || direction.y !== 0) {
    unit.facing = direction;
  }
}

export function canStartAttack(ctx: StepContext, unit: UnitState, target: UnitState): boolean {
  return (
    ctx.state.tick >= unit.nextAttackTick &&
    canAttack(unit, target) &&
    isInReach(unit, target, unit.attack.rangeUnits)
  );
}

export function startAttack(ctx: StepContext, unit: UnitState, target: UnitState): void {
  const tick = ctx.state.tick;
  const hitTick = tick + unit.attack.windupTicks;
  unit.action = { kind: "attack", targetUnitId: target.unitId, startTick: tick, hitTick };
  unit.nextAttackTick = tick + unit.attack.intervalTicks;
  faceTowards(unit, target);
  emit(ctx, {
    kind: "attack",
    sourceUnitId: unit.unitId,
    targetUnitId: target.unitId,
    delivery: unit.attack.kind,
    hitTick,
  });
}

function rollCrit(ctx: StepContext): boolean {
  return nextFloat(ctx.state.rng) < CRIT_CHANCE;
}

function critHop(ctx: StepContext, unit: UnitState, target: UnitState): void {
  if (!isLaunchable(target) || !isGrounded(target) || isCasting(target)) {
    return;
  }

  const direction = directionTo(unit.position, target.position);
  const away = direction.x === 0 && direction.y === 0 ? unit.facing : direction;
  launchUnit(ctx, target, {
    cause: "crit",
    launcher: unit,
    destination: {
      x: target.position.x + away.x * CRIT_HOP_DISTANCE_UNITS,
      y: target.position.y + away.y * CRIT_HOP_DISTANCE_UNITS,
    },
    riseUnits: CRIT_HOP_RISE_UNITS,
    hard: false,
    bowlingHop: 0,
    bowlingDamage: 0,
    landingDamage: 0,
    stunTicks: 0,
  });
}

function healMostHurtAlly(ctx: StepContext, unit: UnitState, amount: number): void {
  let best: UnitState | null = null;
  let bestFraction = 1;

  for (const ally of livingAllies(ctx.state, unit).sort(compareUnitIds)) {
    const fraction = ally.hp / ally.maxHp;

    if (fraction < bestFraction && edgeGap(unit, ally) <= unit.attack.rangeUnits) {
      best = ally;
      bestFraction = fraction;
    }
  }

  if (best !== null) {
    healUnit(ctx, unit, best, amount, "attack");
  }
}

function meleeHit(ctx: StepContext, unit: UnitState, target: UnitState): void {
  const attack = unit.attack;

  if (
    !canAttack(unit, target) ||
    !isInReach(unit, target, attack.rangeUnits + MELEE_REACH_SLACK_UNITS)
  ) {
    return;
  }

  const crit = rollCrit(ctx);
  dealDamage(ctx, unit, target, attack.damage * (crit ? CRIT_MULTIPLIER : 1), "attack", crit);
  gainMana(ctx.state, unit, MANA_PER_ATTACK_HIT);

  if (!crit) {
    return;
  }

  emit(ctx, { kind: "beat", beat: CRIT_FREEZE });

  if (target.alive) {
    critHop(ctx, unit, target);
  }
}

export function resolveAttackHit(ctx: StepContext, unit: UnitState, targetUnitId: UnitId): void {
  const target = unitById(ctx.state, targetUnitId);
  const attack = unit.attack;
  unit.action = { kind: "idle" };

  if (attack.kind === "melee") {
    meleeHit(ctx, unit, target);

    return;
  }

  if (!canAttack(unit, target)) {
    return;
  }

  const crit = rollCrit(ctx);
  faceTowards(unit, target);
  fireProjectile(
    ctx,
    unit,
    target,
    {
      kind: "attack",
      damage: attack.damage * (crit ? CRIT_MULTIPLIER : 1),
      crit,
      splashRadiusUnits: attack.splashRadiusUnits,
      splashFraction: attack.splashFraction,
    },
    attack.unitsPerSecond,
  );

  if (attack.allyHeal > 0) {
    healMostHurtAlly(ctx, unit, attack.allyHeal);
  }
}
