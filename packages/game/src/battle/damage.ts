import { emit, type DamageCause, type HealCause, type StepContext } from "./events.js";
import { leaveBubble } from "./bubbles.js";
import { detonateFuse } from "./fire.js";
import { MANA_PER_DAMAGE_TAKEN, MAX_MANA_PER_HIT_TAKEN } from "./rules.js";
import { bubbleById, fuseById, type BattleState, type UnitState } from "./state.js";

export function gainMana(state: BattleState, unit: UnitState, amount: number): void {
  if (!unit.alive || unit.signature === null || unit.rampage !== null) {
    return;
  }

  unit.mana = Math.min(unit.maxMana, unit.mana + amount);

  if (unit.mana >= unit.maxMana && unit.readySinceTick < 0) {
    unit.readySinceTick = state.tick;
  }
}

export function dealDamage(
  ctx: StepContext,
  source: UnitState,
  target: UnitState,
  amount: number,
  cause: DamageCause,
  crit: boolean,
): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid ${cause} damage ${amount} from "${source.unitId}"`);
  }

  if (!target.alive) {
    return 0;
  }

  const actual = Math.min(Math.round(amount), target.hp);

  if (actual === 0) {
    return 0;
  }

  target.hp -= actual;
  source.damageDealt += actual;
  emit(ctx, {
    kind: "damage",
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    amount: actual,
    crit,
    cause,
    hpAfter: target.hp,
  });

  if (target.hp === 0) {
    killUnit(ctx, target, source);

    return actual;
  }

  gainMana(ctx.state, target, Math.min(actual * MANA_PER_DAMAGE_TAKEN, MAX_MANA_PER_HIT_TAKEN));

  return actual;
}

export function healUnit(
  ctx: StepContext,
  source: UnitState,
  target: UnitState,
  amount: number,
  cause: HealCause,
): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid ${cause} heal ${amount} from "${source.unitId}"`);
  }

  if (!target.alive) {
    return 0;
  }

  const actual = Math.min(Math.round(amount), target.maxHp - target.hp);

  if (actual === 0) {
    return 0;
  }

  target.hp += actual;
  emit(ctx, {
    kind: "heal",
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    amount: actual,
    cause,
    hpAfter: target.hp,
  });

  return actual;
}

function killUnit(ctx: StepContext, unit: UnitState, killer: UnitState): void {
  const state = ctx.state;
  const motion = unit.motion;
  unit.alive = false;
  unit.diedAtTick = state.tick;
  unit.action = { kind: "idle" };
  unit.motion = { kind: "ground" };
  unit.burning = null;
  unit.readySinceTick = -1;
  emit(ctx, { kind: "death", unitId: unit.unitId, killerUnitId: killer.unitId });

  if (motion.kind === "float") {
    leaveBubble(ctx, bubbleById(state, motion.bubbleId), unit);
  }

  const primed = unit.primed;

  if (primed !== null) {
    detonateFuse(ctx, fuseById(state, primed.fuseId), unit, 1);
  }
}
