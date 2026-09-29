import { TICK_RATE } from "../constants.js";
import { distance } from "../math/vector.js";
import { unitsWithin } from "./areas.js";
import { CRIT_FREEZE } from "./beats.js";
import { dealDamage, gainMana } from "./damage.js";
import { emit, type StepContext } from "./events.js";
import { MANA_PER_ATTACK_HIT } from "./rules.js";
import { fuseArrives } from "./signatures/short-fuse.js";
import { hookArrives } from "./signatures/yank.js";
import {
  isFloating,
  nextEntityId,
  unitById,
  type ProjectilePayload,
  type ProjectileState,
  type UnitState,
} from "./state.js";
import { isEnemyOf } from "./targeting.js";

export function fireProjectile(
  ctx: StepContext,
  source: UnitState,
  target: UnitState,
  payload: ProjectilePayload,
  unitsPerSecond: number,
): ProjectileState {
  if (unitsPerSecond <= 0) {
    throw new Error(`Projectile from "${source.unitId}" has no speed`);
  }

  const state = ctx.state;

  const travelTicks = Math.max(
    1,
    Math.round((distance(source.position, target.position) / unitsPerSecond) * TICK_RATE),
  );

  const projectile: ProjectileState = {
    projectileId: nextEntityId(state),
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    from: { ...source.position },
    fromElevation: source.elevation,
    launchTick: state.tick,
    arrivalTick: state.tick + travelTicks,
    payload,
  };

  state.projectiles = [...state.projectiles, projectile];
  emit(ctx, {
    kind: "projectile",
    projectileId: projectile.projectileId,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    payload: payload.kind,
    arrivalTick: projectile.arrivalTick,
  });

  return projectile;
}

function attackArrives(
  ctx: StepContext,
  source: UnitState,
  target: UnitState,
  damage: number,
  crit: boolean,
  splashRadiusUnits: number,
  splashFraction: number,
): void {
  if (!target.alive || isFloating(target)) {
    return;
  }

  dealDamage(ctx, source, target, damage, "attack", crit);
  gainMana(ctx.state, source, MANA_PER_ATTACK_HIT);

  if (crit) {
    emit(ctx, { kind: "beat", beat: CRIT_FREEZE });
  }

  if (splashRadiusUnits <= 0) {
    return;
  }

  for (const other of unitsWithin(ctx.state.units, target.position, splashRadiusUnits)) {
    if (other.unitId !== target.unitId && isEnemyOf(source, other) && !isFloating(other)) {
      dealDamage(ctx, source, other, damage * splashFraction, "splash", false);
    }
  }
}

function arrive(ctx: StepContext, projectile: ProjectileState): void {
  const state = ctx.state;
  const source = unitById(state, projectile.sourceUnitId);
  const target = unitById(state, projectile.targetUnitId);
  const payload = projectile.payload;

  if (payload.kind === "attack") {
    attackArrives(
      ctx,
      source,
      target,
      payload.damage,
      payload.crit,
      payload.splashRadiusUnits,
      payload.splashFraction,
    );

    return;
  }

  if (payload.kind === "fuse") {
    fuseArrives(ctx, source, target);

    return;
  }

  hookArrives(ctx, source, target);
}

export function resolveProjectiles(ctx: StepContext): void {
  const state = ctx.state;
  const arrived = state.projectiles.filter((projectile) => projectile.arrivalTick <= state.tick);

  if (arrived.length === 0) {
    return;
  }

  state.projectiles = state.projectiles.filter((projectile) => projectile.arrivalTick > state.tick);

  for (const projectile of arrived) {
    arrive(ctx, projectile);
  }
}
