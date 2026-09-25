import type { ActiveBomb, ActiveForm, PendingBurst, UnitState } from "./state.js";
import { TICK_RATE } from "../constants.js";
import { unitsInCircle } from "./areas.js";
import {
  CAST_FLAGS,
  DOT_FLAGS,
  REACTION_FLAGS,
  advanceEmitter,
  blessedBurst,
  burstForm,
  burstPoison,
  createZone,
  detonateBomb,
  dotPeriod,
  endForm,
  fireShowerMarker,
  dealHitAndReport,
  findPassive,
  findUnit,
  passivesOfKind,
  payHp,
  processCorpseBlasts,
  processDetonations,
  pullToward,
  recheckBurst,
  resolveCast,
  resolveCastPayload,
  resolveOnTarget,
  settleStoredDamage,
  settleTether,
  spreadEpidemic,
  withStun,
  type ResolutionContext,
} from "./combat.js";
import { isCastTarget, resolveCastTarget } from "./targeting.js";
import { channelHaste, priorityRank, processOpeners, processPendingCasts, processPendingStrikes, processStackDecay, type BudgetBreach } from "./triggers.js";
import { processSequences } from "./sequences.js";

export const MAX_REACTIONS_PER_TICK = 16;

function processDots(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;

  for (const unitId of ctx.state.resolutionPriority) {
    const unit = findUnit(ctx.state, unitId);

    if (unit === null || !unit.alive || unit.dots.length === 0) {
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
        dot.nextTickAt += dotPeriod(unit, dot);
        const source = findUnit(ctx.state, dot.sourceUnitId);

        if (source !== null) {
          const causeSequence = ctx.nextSequence();
          dealHitAndReport(ctx, {
            source,
            target: unit,
            amount: dot.stacks * dot.damagePerStackPerSecond,
            abilityId: dot.dot,
            causeSequence,
            school: null,
            isAttack: false,
            flags: DOT_FLAGS,
            dot: dot.dot,
          });

          const spread = unit.pandemic?.sourceUnitId === source.unitId ? unit.pandemic.spread : null;

          if (unit.alive && spread !== null) {
            spreadEpidemic(ctx, source, unit, dot, spread, causeSequence);
          }

          if (unit.alive) {
            recheckBurst(ctx, source, unit, dot, causeSequence);
          }
        }
      }

      if (unit.alive && tick >= dot.expiresAtTick) {
        unit.dots = unit.dots.filter((candidate) => candidate !== dot);
        ctx.events.push({ kind: "status-expired", tick, sequence: ctx.nextSequence(), unitId: unit.unitId, status: dot.dot });
      }
    }
  }
}

function processBursts(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;
  const due = ctx.state.bursts.filter((burst) => burst.dueTick <= tick);

  if (due.length === 0) {
    return;
  }

  ctx.state.bursts = ctx.state.bursts.filter((burst) => burst.dueTick > tick);
  const rank = priorityRank(ctx.state);
  due.sort((a, b) => (rank.get(a.targetUnitId) ?? Number.POSITIVE_INFINITY) - (rank.get(b.targetUnitId) ?? Number.POSITIVE_INFINITY) || Number(a.spreads) - Number(b.spreads));
  const pairKey = (burst: PendingBurst) => `${burst.holderUnitId}:${burst.targetUnitId}`;
  const popped = new Set(due.filter((burst) => !burst.spreads).map(pairKey));
  const doubled = new Set(due.filter((burst) => burst.spreads && popped.has(pairKey(burst))).map(pairKey));

  for (const burst of due) {
    if (!burst.spreads && doubled.has(pairKey(burst))) {
      continue;
    }

    burstPoison(ctx, burst, doubled.has(pairKey(burst)) ? 2 : 1);
  }
}

function processBlessedBursts(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;
  const due = ctx.state.blessedBursts.filter((burst) => burst.dueTick <= tick);

  if (due.length === 0) {
    return;
  }

  ctx.state.blessedBursts = ctx.state.blessedBursts.filter((burst) => burst.dueTick > tick);
  const rank = priorityRank(ctx.state);
  due.sort((a, b) => (rank.get(a.allyUnitId) ?? Number.POSITIVE_INFINITY) - (rank.get(b.allyUnitId) ?? Number.POSITIVE_INFINITY));

  for (const burst of due) {
    blessedBurst(ctx, burst);
  }
}

function drainFormStacks(unit: UnitState, tick: number): void {
  const form = unit.form;
  const key = form?.definition.drainsStacksKey;

  if (form === null || key === undefined) {
    return;
  }

  for (const passive of passivesOfKind(unit, "stacks")) {
    if (passive.key === key) {
      const remaining = Math.max(0, form.endsAtTick - tick) / Math.max(1, form.definition.durationTicks);
      unit.memory.stacks[key] = Math.round(passive.max * remaining);
    }
  }
}

function processShowers(ctx: ResolutionContext): void {
  if (ctx.state.showers.length === 0) {
    return;
  }

  const rank = priorityRank(ctx.state);
  const due = ctx.state.showers.filter((shower) => shower.nextTick <= ctx.state.tick);
  due.sort((a, b) => (rank.get(a.sourceUnitId) ?? Number.POSITIVE_INFINITY) - (rank.get(b.sourceUnitId) ?? Number.POSITIVE_INFINITY) || a.showerId - b.showerId);

  for (const shower of due) {
    fireShowerMarker(ctx, shower);
  }

  ctx.state.showers = ctx.state.showers.filter((shower) => shower.remaining > 0);
}

function processEmitters(ctx: ResolutionContext): void {
  if (ctx.state.emitters.length === 0) {
    return;
  }

  const rank = priorityRank(ctx.state);

  const ordered = [...ctx.state.emitters].sort(
    (a, b) => (rank.get(a.sourceUnitId) ?? Number.POSITIVE_INFINITY) - (rank.get(b.sourceUnitId) ?? Number.POSITIVE_INFINITY) || a.emitterId - b.emitterId,
  );

  for (const emitter of ordered) {
    advanceEmitter(ctx, emitter);
  }

  ctx.state.emitters = ctx.state.emitters.filter((emitter) => emitter.endsAtTick > ctx.state.tick);
}

function processBombs(ctx: ResolutionContext): void {
  if (ctx.state.bombs.length === 0) {
    return;
  }

  const ready: ActiveBomb[] = [];

  for (const bomb of ctx.state.bombs) {
    const target = findUnit(ctx.state, bomb.targetUnitId);

    if (target !== null && target.alive) {
      bomb.position = { x: target.position.x, y: target.position.y };
    }

    if (ctx.state.tick >= bomb.detonatesAtTick || target === null || !target.alive) {
      ready.push(bomb);
    }
  }

  ctx.state.bombs = ctx.state.bombs.filter((bomb) => !ready.includes(bomb));

  for (const bomb of ready) {
    detonateBomb(ctx, bomb);
  }
}

function pullTowardImpacts(ctx: ResolutionContext): void {
  for (const impact of ctx.state.impacts) {
    const source = impact.pull === null ? null : findUnit(ctx.state, impact.sourceUnitId);

    if (source !== null && impact.pull !== null && ctx.state.tick < impact.landsAtTick) {
      pullToward(ctx, source, impact.center, impact.pull.radiusUnits, impact.pull.distanceUnits);
    }
  }
}

function processForms(ctx: ResolutionContext): void {
  const ending: { unit: UnitState; form: ActiveForm }[] = [];

  for (const unit of ctx.state.units) {
    if (unit.alive) {
      drainFormStacks(unit, ctx.state.tick);
    }
  }

  for (const unitId of ctx.state.resolutionPriority) {
    const unit = findUnit(ctx.state, unitId);

    if (unit?.form !== null && unit !== null && (!unit.alive || ctx.state.tick >= unit.form.endsAtTick || (unit.form.definition.endsWhenShieldBreaks === true && unit.shield === null))) {
      const form = endForm(ctx, unit);

      if (form !== null) {
        ending.push({ unit, form });
      }
    }
  }

  for (const { unit, form } of ending) {
    burstForm(ctx, unit, form);
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

    if (zone.followsUnitId !== null) {
      if (source === null || !source.alive) {
        zone.expiresAtTick = Math.min(zone.expiresAtTick, tick);
      } else {
        zone.center = { x: source.position.x, y: source.position.y };
      }
    }

    if (source !== null && tick >= zone.nextPulseTick && tick < zone.expiresAtTick) {
      zone.nextPulseTick += zone.periodTicks;
      const ability = source.abilities[zone.abilityId];
      const causeSequence = ctx.nextSequence();

      if (ability !== undefined) {
        const flags = zone.fullHits ? CAST_FLAGS : REACTION_FLAGS;
        const pulse = { source, ability, castSequence: causeSequence, isBasicAttack: false, scale: 1, flags, critBonus: 0, repeat: null };

        for (const victim of unitsInCircle(ctx.state.units, source, zone.center, zone.radiusUnits, "enemies")) {
          resolveOnTarget(ctx, pulse, victim, zone.effects);
        }

        if (zone.allyEffects.length > 0) {
          for (const ally of unitsInCircle(ctx.state.units, source, zone.center, zone.radiusUnits, "allies")) {
            resolveOnTarget(ctx, pulse, ally, zone.allyEffects);
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

    const cast = withStun({ source, ability, castSequence: impact.causeSequence, isBasicAttack: false, scale: impact.scale, flags: CAST_FLAGS, critBonus: 0, repeat: null }, impact.stun);

    resolveCastPayload(ctx, cast, null, impact.center);

    if (impact.scale >= 1) {
      createZone(ctx, source, ability, impact.center);
    }
  }
}

function processChannels(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;

  for (const unitId of ctx.state.resolutionPriority) {
    const unit = findUnit(ctx.state, unitId);
    const channel = unit?.channel ?? null;

    if (unit === null || !unit.alive || channel === null || tick < channel.nextPulseTick || tick >= channel.endsAtTick) {
      continue;
    }

    channel.nextPulseTick += Math.max(1, Math.round(channel.periodTicks / (1 + channelHaste(unit))));
    const ability = unit.abilities[channel.abilityId];

    if (ability === undefined) {
      continue;
    }

    if (channel.pull !== null) {
      pullToward(ctx, unit, unit.position, channel.pull.radiusUnits, channel.pull.distanceUnits);
    }

    const pulse = withStun({ source: unit, ability, castSequence: channel.castSequence, isBasicAttack: false, scale: 1, flags: CAST_FLAGS, critBonus: 0, repeat: null }, channel.stun);

    for (const victim of unitsInCircle(ctx.state.units, unit, unit.position, channel.radiusUnits, "enemies")) {
      resolveOnTarget(ctx, pulse, victim, channel.effects);
    }
  }
}

export function processTimedEffects(ctx: ResolutionContext): BudgetBreach | null {
  settleStoredDamage(ctx);
  processStackDecay(ctx);
  processSoulbound(ctx);
  processDots(ctx);
  processBursts(ctx);
  processBlessedBursts(ctx);
  processCorpseBlasts(ctx);
  processDetonations(ctx);
  settleTether(ctx);
  processForms(ctx);
  processOpeners(ctx);
  processZones(ctx);
  processChannels(ctx);
  processSequences(ctx);
  processShowers(ctx);
  processEmitters(ctx);
  pullTowardImpacts(ctx);
  processImpacts(ctx);
  processBombs(ctx);
  processPendingStrikes(ctx);

  return processPendingCasts(ctx);
}

export function processReactions(ctx: ResolutionContext): BudgetBreach | null {
  let processed = 0;

  while (ctx.reactions.length > 0) {
    const job = ctx.reactions.shift();

    if (job === undefined) {
      break;
    }

    if (processed >= MAX_REACTIONS_PER_TICK) {
      return { rootActionSequence: job.causeSequence, depthReached: processed };
    }

    processed += 1;

    const source = findUnit(ctx.state, job.sourceUnitId);
    const ability = source?.abilities[job.abilityId];

    if (source === null || !source.alive || ability === undefined) {
      continue;
    }

    const target = job.targetUnitId === undefined ? resolveCastTarget(ability, source, ctx.state.units) : findUnit(ctx.state, job.targetUnitId);

    if (target === null || !isCastTarget(ability, source, target)) {
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

    resolveCast(ctx, { source, ability, castSequence, isBasicAttack: false, scale: 1, flags: CAST_FLAGS, critBonus: 0, repeat: null, triggered: true }, target);
  }

  return null;
}
