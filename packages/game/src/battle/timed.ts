import type { UnitState } from "./state.js";
import type { CompiledAbility } from "../builds/compile-build.js";
import { TICK_RATE } from "../constants.js";
import { unitsInCircle } from "./areas.js";
import {
  CAST_FLAGS,
  DOT_FLAGS,
  OPENER_STAGGER_SLOTS,
  OPENER_STAGGER_TICKS,
  RETRIBUTION_FLAGS,
  RUNE_TRIGGER_FLAGS,
  REACTION_FLAGS,
  createZone,
  dealHitAndReport,
  echoFlags,
  findPassive,
  findUnit,
  payHp,
  resolveCast,
  resolveCastPayload,
  resolveOnTarget,
  type HitFlags,
  type ResolutionContext,
} from "./combat.js";
import { emptyRunes } from "../builds/compile-build.js";
import { resolveCastTarget } from "./targeting.js";
import { isUntargetable } from "./statuses.js";

export const MAX_TRIGGERED_CASTS_PER_TICK = 16;

function processDots(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;

  for (const unit of ctx.state.units) {
    if (!unit.alive || unit.dots.length === 0) {
      continue;
    }

    for (const dot of unit.dots) {
      if (!unit.alive) {
        break;
      }

      if (!unit.dots.includes(dot)) {
        continue;
      }

      if (tick >= dot.nextTickAt) {
        dot.nextTickAt += TICK_RATE;
        const source = findUnit(ctx.state, dot.sourceUnitId);

        if (source !== null) {
          dealHitAndReport(ctx, {
            source,
            target: unit,
            amount: dot.stacks * dot.damagePerStackPerSecond,
            abilityId: dot.dot,
            causeSequence: ctx.nextSequence(),
            school: null,
            isBasicAttack: false,
            flags: DOT_FLAGS,
            dot: dot.dot,
          });
        }
      }

      if (unit.alive && tick >= dot.expiresAtTick) {
        unit.dots = unit.dots.filter((candidate) => candidate !== dot);
        ctx.events.push({ kind: "status-expired", tick, sequence: ctx.nextSequence(), unitId: unit.unitId, status: dot.dot });
      }
    }
  }
}

function processRetribution(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;

  for (const unit of ctx.state.units) {
    if (unit.memory.retributionEndsAtTick === 0 || tick < unit.memory.retributionEndsAtTick) {
      continue;
    }

    const pool = unit.memory.retributionPool;
    const retribution = findPassive(unit, "retribution");
    unit.memory.retributionEndsAtTick = 0;
    unit.memory.retributionPool = 0;

    if (!unit.alive || retribution === null || pool <= 0) {
      continue;
    }

    const causeSequence = ctx.nextSequence();
    ctx.events.push({ kind: "passive-triggered", tick, sequence: causeSequence, unitId: unit.unitId, passive: "retribution" });

    const cast = { source: unit, ability: retributionAbility(unit), castSequence: causeSequence, isBasicAttack: false, scale: 1, flags: RETRIBUTION_FLAGS };

    for (const victim of unitsInCircle(ctx.state.units, unit, unit.position, retribution.radiusUnits, "enemies")) {
      resolveOnTarget(ctx, cast, victim, [
        { kind: "damage", amount: Math.max(1, Math.round(pool * retribution.fraction)) },
        { kind: "apply-condition", condition: "staggered" },
      ]);
    }
  }
}

function retributionAbility(unit: UnitState): CompiledAbility {
  return {
    id: "retribution",
    name: "Retribution",
    cooldownTicks: 0,
    targetPolicy: "self",
    range: 0,
    effects: [],
    school: unit.school ?? "might",
    runes: emptyRunes(),
  };
}

function processOpeners(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;

  for (const [index, unitId] of ctx.state.resolutionPriority.entries()) {
    const unit = findUnit(ctx.state, unitId);
    const signatureId = unit?.signatureAbilityId ?? null;
    const opener = unit === null || signatureId === null ? null : (unit.abilities[signatureId]?.runes.opener ?? null);

    if (unit === null || signatureId === null || opener === null || !unit.alive || unit.memory.openerFired) {
      continue;
    }

    if (tick < opener.atTick + (index % OPENER_STAGGER_SLOTS) * OPENER_STAGGER_TICKS) {
      continue;
    }

    unit.memory.openerFired = true;
    ctx.triggered.push({ sourceUnitId: unit.unitId, abilityId: signatureId, scale: 1, flags: RUNE_TRIGGER_FLAGS, causeSequence: ctx.nextSequence() });
  }
}

function processSoulbound(ctx: ResolutionContext): void {
  if (ctx.state.tick % TICK_RATE !== 0) {
    return;
  }

  for (const unit of ctx.state.units) {
    const soulbound = unit.alive ? findPassive(unit, "soulbound") : null;

    if (soulbound !== null) {
      payHp(ctx, unit, unit.maxHp * soulbound.maxHpFractionPerSecond, "soulbound");
    }
  }
}

function processZones(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;

  for (const zone of ctx.state.zones) {
    const source = findUnit(ctx.state, zone.sourceUnitId);

    if (source !== null && tick >= zone.nextPulseTick && tick < zone.expiresAtTick) {
      zone.nextPulseTick += zone.periodTicks;
      const ability = source.abilities[zone.abilityId];
      const causeSequence = ctx.nextSequence();

      if (ability !== undefined) {
        for (const victim of unitsInCircle(ctx.state.units, source, zone.center, zone.radiusUnits, "enemies")) {
          resolveOnTarget(
            ctx,
            { source, ability, castSequence: causeSequence, isBasicAttack: false, scale: 1, flags: REACTION_FLAGS },
            victim,
            zone.effects,
          );
        }

        if (zone.allyEffects.length > 0) {
          for (const ally of unitsInCircle(ctx.state.units, source, zone.center, zone.radiusUnits, "allies")) {
            resolveOnTarget(
              ctx,
              { source, ability, castSequence: causeSequence, isBasicAttack: false, scale: 1, flags: REACTION_FLAGS },
              ally,
              zone.allyEffects,
            );
          }
        }
      }
    }

    if (tick >= zone.expiresAtTick) {
      ctx.state.zones = ctx.state.zones.filter((candidate) => candidate.zoneId !== zone.zoneId);
      ctx.events.push({ kind: "zone-expired", tick, sequence: ctx.nextSequence(), zoneId: zone.zoneId });
    }
  }
}

function processImpacts(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;
  const landing = ctx.state.impacts.filter((impact) => tick >= impact.landsAtTick);

  if (landing.length === 0) {
    return;
  }

  ctx.state.impacts = ctx.state.impacts.filter((impact) => tick < impact.landsAtTick);

  for (const impact of landing) {
    const source = findUnit(ctx.state, impact.sourceUnitId);
    const ability = source?.abilities[impact.abilityId];

    if (source === null || ability === undefined) {
      continue;
    }

    const radiusUnits = ability.area?.kind === "circle" ? ability.area.radiusUnits : 0;

    ctx.events.push({
      kind: "impact-landed",
      tick,
      sequence: ctx.nextSequence(),
      sourceUnitId: source.unitId,
      abilityId: ability.id,
      center: { x: impact.center.x, y: impact.center.y },
      radiusUnits,
    });

    const flags: HitFlags = impact.triggered ? RUNE_TRIGGER_FLAGS : CAST_FLAGS;
    const cast = { source, ability, castSequence: impact.causeSequence, isBasicAttack: false, scale: impact.scale, flags };

    resolveCastPayload(ctx, cast, null, impact.center);

    if (impact.scale >= 1) {
      createZone(ctx, source, ability, impact.center);
    }
  }
}

function processEchoes(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;
  const due = ctx.state.echoes.filter((echo) => tick >= echo.castAtTick);

  if (due.length === 0) {
    return;
  }

  ctx.state.echoes = ctx.state.echoes.filter((echo) => tick < echo.castAtTick);

  for (const echo of due) {
    const source = findUnit(ctx.state, echo.sourceUnitId);
    const ability = source?.abilities[echo.abilityId];

    if (source === null || !source.alive || ability === undefined) {
      continue;
    }

    const original = findUnit(ctx.state, echo.targetUnitId);
    const stillLegal = original !== null && original.alive && (original.teamId === source.teamId || !isUntargetable(original));
    const target = stillLegal ? original : resolveCastTarget(ability, source, ctx.state.units);

    if (target === null) {
      continue;
    }

    const castSequence = ctx.nextSequence();

    ctx.events.push({
      kind: "cast",
      tick,
      sequence: castSequence,
      sourceUnitId: source.unitId,
      abilityId: ability.id,
      targetUnitId: target.unitId,
      isBasicAttack: false,
      triggered: true,
    });

    resolveCast(ctx, { source, ability, castSequence, isBasicAttack: false, scale: echo.scale, flags: echoFlags(source) }, target);
  }
}

function processChannels(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;

  for (const unit of ctx.state.units) {
    const channel = unit.channel;

    if (!unit.alive || channel === null || tick < channel.nextPulseTick || tick >= channel.endsAtTick) {
      continue;
    }

    channel.nextPulseTick += channel.periodTicks;
    const ability = unit.abilities[channel.abilityId];

    if (ability === undefined) {
      continue;
    }

    const castSequence = ctx.nextSequence();

    for (const victim of unitsInCircle(ctx.state.units, unit, unit.position, channel.radiusUnits, "enemies")) {
      resolveOnTarget(ctx, { source: unit, ability, castSequence, isBasicAttack: false, scale: 1, flags: CAST_FLAGS }, victim, channel.effects);
    }
  }
}

export function processTimedEffects(ctx: ResolutionContext): void {
  processSoulbound(ctx);
  processDots(ctx);
  processRetribution(ctx);
  processOpeners(ctx);
  processZones(ctx);
  processChannels(ctx);
  processImpacts(ctx);
  processEchoes(ctx);
}

export function processTriggeredCasts(ctx: ResolutionContext): { rootActionSequence: number; depthReached: number } | null {
  let processed = 0;

  while (ctx.triggered.length > 0) {
    const job = ctx.triggered.shift();

    if (job === undefined) {
      break;
    }

    if (processed >= MAX_TRIGGERED_CASTS_PER_TICK) {
      return { rootActionSequence: job.causeSequence, depthReached: processed };
    }

    processed += 1;

    const source = findUnit(ctx.state, job.sourceUnitId);
    const ability = source?.abilities[job.abilityId];

    if (source === null || (!source.alive && job.fromCorpse !== true) || ability === undefined) {
      continue;
    }

    const target = resolveCastTarget(ability, source, ctx.state.units);

    if (target === null) {
      continue;
    }

    const castSequence = ctx.nextSequence();

    ctx.events.push({
      kind: "cast",
      tick: ctx.state.tick,
      sequence: castSequence,
      sourceUnitId: source.unitId,
      abilityId: ability.id,
      targetUnitId: target.unitId,
      isBasicAttack: false,
      triggered: true,
    });

    resolveCast(ctx, { source, ability, castSequence, isBasicAttack: false, scale: job.scale, flags: job.flags }, target);
  }

  return null;
}
