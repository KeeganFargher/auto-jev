import type { SignatureDefinition } from "../../definitions.js";
import { CAST_SLOW } from "../beats.js";
import { emit, type StepContext } from "../events.js";
import { READY_WAIT_TICKS } from "../rules.js";
import type { UnitState } from "../state.js";
import { advanceBigBubble, planBigBubble, startBigBubble } from "./big-bubble.js";
import { advanceHammerfall, planHammerfall, startHammerfall } from "./hammerfall.js";
import type { CastPlan } from "./plan.js";
import { advanceGrab, planRampage, startRampage } from "./rampage.js";
import { advanceShortFuse, planShortFuse, startShortFuse } from "./short-fuse.js";
import { advanceYank, planYank, startYank } from "./yank.js";

function planSignature(
  ctx: StepContext,
  unit: UnitState,
  signature: SignatureDefinition,
  wantedOnly: boolean,
): CastPlan | null {
  switch (signature.kind) {
    case "hammerfall":
      return planHammerfall(ctx, unit, signature, wantedOnly);
    case "rampage":
      return planRampage(ctx, unit, signature, wantedOnly);
    case "short-fuse":
      return planShortFuse(ctx, unit, signature, wantedOnly);
    case "big-bubble":
      return planBigBubble(ctx, unit, signature, wantedOnly);
    case "yank":
      return planYank(ctx, unit, signature, wantedOnly);
  }
}

function startSignature(
  ctx: StepContext,
  unit: UnitState,
  signature: SignatureDefinition,
  plan: CastPlan,
): void {
  switch (signature.kind) {
    case "hammerfall":
      startHammerfall(ctx, unit, signature, plan);

      return;
    case "rampage":
      startRampage(ctx, unit, signature);

      return;
    case "short-fuse":
      startShortFuse(ctx, unit, signature, plan);

      return;
    case "big-bubble":
      startBigBubble(ctx, unit, signature, plan);

      return;
    case "yank":
      startYank(ctx, unit, signature, plan);
  }
}

function releaseDelayTicks(signature: SignatureDefinition): number {
  switch (signature.kind) {
    case "hammerfall":
      return signature.impactTick;
    case "rampage":
      return signature.growTicks;
    case "short-fuse":
    case "big-bubble":
    case "yank":
      return signature.castTicks;
  }
}

function readyPlan(
  ctx: StepContext,
  unit: UnitState,
  signature: SignatureDefinition,
): CastPlan | null {
  const wanted = planSignature(ctx, unit, signature, true);

  if (wanted !== null || ctx.state.tick - unit.readySinceTick < READY_WAIT_TICKS) {
    return wanted;
  }

  return planSignature(ctx, unit, signature, false);
}

export function trySignature(ctx: StepContext, unit: UnitState): boolean {
  const signature = unit.signature;

  if (signature === null || unit.readySinceTick < 0) {
    return false;
  }

  const plan = readyPlan(ctx, unit, signature);

  if (plan === null) {
    return false;
  }

  unit.mana = 0;
  unit.readySinceTick = -1;
  emit(ctx, {
    kind: "signature",
    unitId: unit.unitId,
    signature: signature.kind,
    targetUnitId: plan.targetUnitId,
    point: { ...plan.point },
    releaseTick: ctx.state.tick + releaseDelayTicks(signature),
    wanted: plan.wanted,
  });
  emit(ctx, { kind: "beat", beat: CAST_SLOW });
  startSignature(ctx, unit, signature, plan);

  return true;
}

export function advanceSignatureAction(ctx: StepContext, unit: UnitState): void {
  const action = unit.action;

  switch (action.kind) {
    case "hammerfall":
      advanceHammerfall(ctx, unit, action);

      return;
    case "rampage-grow":
      if (ctx.state.tick >= action.endTick) {
        unit.action = { kind: "idle" };
      }

      return;
    case "grab":
      advanceGrab(ctx, unit, action);

      return;
    case "short-fuse":
      advanceShortFuse(ctx, unit, action);

      return;
    case "big-bubble":
      advanceBigBubble(ctx, unit, action);

      return;
    case "yank":
      advanceYank(ctx, unit, action);

      return;
    case "idle":
    case "attack":
      throw new Error(`Unit "${unit.unitId}" is not casting`);
  }
}
