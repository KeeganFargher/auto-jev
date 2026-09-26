import { Color, Group, Vector3, type ColorRepresentation } from "three";
import { createNettle } from "../../models/nettle/nettle.js";
import {
  DEAD_COLOR,
  FIGURE_SCALE,
  SINK_SECONDS,
  SINK_UNITS,
  createFigureBase,
  paintSpectral,
  type SpectralMemory,
} from "./figure-base.js";
import type { FigureTraits, HeroFigure } from "./hero-figures.js";

export interface NettleFigure extends HeroFigure {
  setStunned(stunned: boolean): void;
}

const GAIT_SECONDS = 0.95;

const STANCE = 0.55;

const STRIDE = 0.34;

const STEP_LIFT = 0.16;

const WINDUP = 0.16;

const FLICK = 0.08;

const FLICK_RECOVER = 0.34;

const RAISE = 0.26;

const HOLD = 0.14;

const FLING = 0.12;

const CAST_RECOVER = 0.38;

const HIT_SECONDS = 0.45;

const FLASH_SECONDS = 0.18;

const STAGGER = 0.24;

const FALL = 0.55;

const THUD = 0.22;

const DEATH_HOLD = 0.6;

const SIP_SECONDS = 1.7;

const FLASH_STRENGTH = 0.14;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smooth(value: number): number {
  const t = clamp01(value);

  return t * t * (3 - 2 * t);
}

function bump(value: number): number {
  return Math.sin(Math.PI * clamp01(value));
}

function settle(value: number): number {
  const t = clamp01(value);

  return Math.exp(-4 * t) * Math.cos(t * 9) * (1 - t);
}

export function createNettleFigure(traits: FigureTraits): NettleFigure {
  const root = new Group();
  const frame = new Group();
  const base = createFigureBase();
  const nettle = createNettle();
  const [leftHip, rightHip] = nettle.hips;
  const [cupShoulder, openShoulder] = nettle.shoulders;
  const [cupElbow, openElbow] = nettle.elbows;
  const hipRest = nettle.hips.map((hip) => hip.position.clone());
  const bodyRest = nettle.body.position.clone();
  frame.scale.setScalar(FIGURE_SCALE);
  nettle.root.scale.setScalar(traits.height / nettle.height);
  frame.add(base.root, nettle.root);
  root.add(frame);
  const spectralMemory: SpectralMemory = { colors: new Map() };
  let teamColor = new Color("#ffffff");
  let moving = false;
  let dead = false;
  let linger = false;
  let spectral = false;
  let stunned = false;
  let celebrating = false;
  let clock = Math.random() * 10;
  let gait = 0;
  let movingBlend = 0;
  let stunBlend = 0;
  let cheerBlend = 0;
  let attackTime = Number.POSITIVE_INFINITY;
  let castTime = Number.POSITIVE_INFINITY;
  let hitTime = Number.POSITIVE_INFINITY;
  let deathTime = Number.POSITIVE_INFINITY;
  let sipTime = Number.POSITIVE_INFINITY;
  let nextSip = 3 + Math.random() * 4;
  let sinkTime = 0;
  let bodyGlow = 0;
  let charge = 0;
  let throwing = false;

  function applyTeamColor(): void {
    base.paint(dead ? DEAD_COLOR : teamColor, dead);
  }

  function rest(): void {
    nettle.body.position.copy(bodyRest);
    nettle.body.rotation.set(0, 0, 0);
    nettle.head.rotation.set(0, 0, 0);
    nettle.crown.rotation.set(0, 0, 0);

    for (const [index, hip] of nettle.hips.entries()) {
      hip.position.copy(hipRest[index] ?? hip.position);
      hip.rotation.set(0, 0, 0);
    }

    for (const joint of [...nettle.shoulders, ...nettle.elbows]) {
      joint.rotation.set(0, 0, 0);
    }
  }

  function idle(): void {
    const still = 1 - movingBlend;
    nettle.body.rotation.z += 0.025 * Math.sin(clock * 0.7) * still;
    nettle.head.rotation.y += (0.22 * Math.sin(clock * 0.31) + 0.08 * Math.sin(clock * 0.83)) * still;
    nettle.head.rotation.x += 0.04 * Math.sin(clock * 0.47) * still;
    nettle.crown.rotation.z += 0.035 * Math.sin(clock * 1.1);
    nettle.crown.rotation.x += 0.025 * Math.sin(clock * 0.83 + 1);
    openShoulder.rotation.z -= 0.05 * Math.sin(clock * 0.9) * still;

    if (sipTime < SIP_SECONDS) {
      const sip = smooth(bump(sipTime / SIP_SECONDS) * 1.6) * still;
      cupShoulder.rotation.x -= 0.35 * sip;
      cupShoulder.rotation.z -= 0.25 * sip;
      cupElbow.rotation.x -= 0.75 * sip;
      nettle.head.rotation.x += 0.12 * sip;
      nettle.head.rotation.y *= 1 - sip;
    }
  }

  function walk(): void {
    const run = movingBlend;
    const cycle = gait * Math.PI * 2;

    for (const [side, hip] of [leftHip, rightHip].entries()) {
      const phase = (gait + side * 0.5) % 1;

      if (phase < STANCE) {
        hip.position.z += (STRIDE / 2 - (STRIDE * phase) / STANCE) * run;
      } else {
        const swing = (phase - STANCE) / (1 - STANCE);
        hip.position.z += (-STRIDE / 2 + STRIDE * smooth(swing)) * run;
        hip.position.y += STEP_LIFT * bump(swing) * run;
        hip.rotation.x -= 0.22 * bump(swing) * run;
      }
    }

    nettle.body.position.y += (0.05 * Math.sin(cycle * 2) - 0.03) * run;
    nettle.body.rotation.z += 0.07 * Math.sin(cycle) * run;
    nettle.body.rotation.x += 0.07 * run;
    nettle.head.rotation.z -= 0.05 * Math.sin(cycle) * run;
    nettle.crown.rotation.z += 0.06 * Math.sin(cycle + 0.8) * run;
    cupShoulder.rotation.x += 0.12 * Math.sin(cycle) * run;
    openShoulder.rotation.x -= 0.2 * Math.sin(cycle) * run;
  }

  function attack(): void {
    const t = attackTime;

    if (t >= WINDUP + FLICK + FLICK_RECOVER) {
      return;
    }

    let reach: number;

    if (t < WINDUP) {
      reach = -smooth(t / WINDUP);
    } else if (t < WINDUP + FLICK) {
      reach = -1 + 2.2 * smooth((t - WINDUP) / FLICK);
    } else {
      reach = 1.2 * settle((t - WINDUP - FLICK) / FLICK_RECOVER);
    }

    openShoulder.rotation.x -= 0.55 * reach;
    openShoulder.rotation.z -= 0.15 * Math.max(0, -reach);
    openElbow.rotation.x -= 0.35 * reach;
    nettle.body.rotation.y -= 0.14 * reach;
    nettle.body.rotation.x += 0.06 * Math.max(0, reach);
    nettle.head.rotation.x += 0.08 * Math.max(0, reach);
  }

  function cast(): void {
    const t = castTime;

    if (t >= RAISE + HOLD + FLING + CAST_RECOVER) {
      return;
    }

    let raised: number;
    let flung: number;

    if (t < RAISE) {
      raised = smooth(t / RAISE);
      flung = 0;
    } else if (t < RAISE + HOLD) {
      raised = 1;
      flung = 0;
    } else if (t < RAISE + HOLD + FLING) {
      raised = 1;
      flung = smooth((t - RAISE - HOLD) / FLING);
    } else {
      const back = 1 - smooth((t - RAISE - HOLD - FLING) / CAST_RECOVER);
      raised = back;
      flung = back;
    }

    cupShoulder.rotation.x -= 1.05 * raised - 0.75 * flung;
    cupShoulder.rotation.z += 0.25 * raised;
    cupElbow.rotation.x -= 0.45 * raised - 0.55 * flung;
    nettle.head.rotation.x -= 0.22 * raised - 0.3 * flung;
    nettle.body.rotation.x += -0.08 * raised + 0.2 * flung;
    nettle.crown.rotation.x += 0.08 * raised - 0.14 * flung;
    openShoulder.rotation.z -= 0.35 * raised;
  }

  function flinch(): number {
    if (hitTime >= HIT_SECONDS) {
      return 0;
    }

    const back = settle(hitTime / HIT_SECONDS);
    nettle.body.rotation.x -= 0.16 * back;
    nettle.head.rotation.x -= 0.14 * back;
    nettle.crown.rotation.z += 0.1 * Math.sin(hitTime * 42) * (1 - hitTime / HIT_SECONDS);

    return 1 - clamp01(hitTime / FLASH_SECONDS);
  }

  function daze(): void {
    nettle.body.rotation.z += 0.09 * Math.sin(clock * 3.1) * stunBlend;
    nettle.body.rotation.x += 0.05 * Math.sin(clock * 2.3) * stunBlend;
    nettle.head.rotation.z += 0.18 * Math.sin(clock * 3.1 + 0.7) * stunBlend;
    nettle.crown.rotation.z += 0.08 * Math.sin(clock * 3.1 + 1.4) * stunBlend;
  }

  function toast(): void {
    cupShoulder.rotation.x -= 1.25 * cheerBlend;
    cupShoulder.rotation.z += 0.2 * cheerBlend;
    cupElbow.rotation.x -= 0.2 * cheerBlend;
    nettle.head.rotation.x -= 0.2 * cheerBlend;
    nettle.body.position.y += 0.05 * Math.abs(Math.sin(clock * 5)) * cheerBlend;
    openShoulder.rotation.z -= 0.4 * cheerBlend;
  }

  function fell(): void {
    const t = deathTime;
    let fall: number;

    if (t < STAGGER) {
      fall = 0.1 * smooth(t / STAGGER);
    } else if (t < STAGGER + FALL) {
      const k = (t - STAGGER) / FALL;
      fall = 0.1 + 0.9 * k * k;
    } else {
      fall = 1 - 0.05 * bump((t - STAGGER - FALL) / THUD);
    }

    nettle.body.rotation.x -= 1.42 * fall;
    nettle.body.position.y -= 0.32 * fall;
    nettle.head.rotation.x += 0.3 * fall;
    cupShoulder.rotation.z += 0.7 * fall;
    openShoulder.rotation.z -= 0.7 * fall;
    cupElbow.rotation.x += 0.4 * fall;
    openElbow.rotation.x += 0.4 * fall;
  }

  applyTeamColor();

  return {
    root,
    height: traits.height * FIGURE_SCALE,

    setTeamColor(color: ColorRepresentation) {
      teamColor = new Color(color);
      applyTeamColor();
    },

    setMoving(isMoving) {
      moving = isMoving;
    },

    trigger(action) {
      if (dead) {
        return;
      }

      if (action === "attack") {
        attackTime = 0;
        throwing = true;
      } else if (action === "cast") {
        castTime = 0;
        throwing = false;
        sipTime = Number.POSITIVE_INFINITY;
      } else {
        hitTime = 0;
      }
    },

    setDead(isDead) {
      if (isDead === dead) {
        return;
      }

      dead = isDead;
      deathTime = isDead ? 0 : Number.POSITIVE_INFINITY;
      sinkTime = 0;

      if (!isDead) {
        attackTime = Number.POSITIVE_INFINITY;
        castTime = Number.POSITIVE_INFINITY;
        hitTime = Number.POSITIVE_INFINITY;
        base.root.scale.setScalar(1);
        nettle.root.position.y = 0;
        root.visible = true;
      }

      applyTeamColor();
    },

    setLinger(isLingering) {
      linger = isLingering;
    },

    setSpectral(isSpectral) {
      if (isSpectral === spectral) {
        return;
      }

      spectral = isSpectral;
      paintSpectral(nettle.surfaces, spectralMemory, isSpectral);
      applyTeamColor();
    },

    setOverclock() {},

    setGlow(amount) {
      bodyGlow = Math.max(0, amount);
    },

    setCharge(amount) {
      charge = clamp01(amount);
    },

    setChanneling() {},

    setCelebrating(isCelebrating) {
      celebrating = isCelebrating;
    },

    setCastsShadow(castsShadow) {
      nettle.setCastsShadow(castsShadow);
    },

    setStunned(isStunned) {
      stunned = isStunned;
    },

    castOrigin(out: Vector3) {
      return (throwing ? nettle.thorn : nettle.tea).getWorldPosition(out);
    },

    update(deltaSeconds) {
      clock += deltaSeconds;
      attackTime += deltaSeconds;
      castTime += deltaSeconds;
      hitTime += deltaSeconds;
      deathTime += deltaSeconds;
      sipTime += deltaSeconds;
      nextSip -= deltaSeconds;
      movingBlend += ((moving && !dead ? 1 : 0) - movingBlend) * clamp01(deltaSeconds * 6);
      stunBlend += ((stunned && !dead ? 1 : 0) - stunBlend) * clamp01(deltaSeconds * 6);
      cheerBlend += ((celebrating && !dead ? 1 : 0) - cheerBlend) * clamp01(deltaSeconds * 5);
      gait = (gait + (deltaSeconds / GAIT_SECONDS) * movingBlend) % 1;

      if (nextSip <= 0) {
        sipTime = 0;
        nextSip = 6 + Math.random() * 5;
      }

      rest();
      let flash = 0;

      if (dead) {
        fell();
        const resting = deathTime > STAGGER + FALL + THUD + DEATH_HOLD;
        sinkTime += !linger && resting ? deltaSeconds : 0;
        const sunk = Math.min(1, sinkTime / SINK_SECONDS);
        nettle.root.position.y = (-sunk * SINK_UNITS) / FIGURE_SCALE;
        base.root.scale.setScalar(Math.max(0.001, 1 - sunk));
        root.visible = sunk < 1;
      } else {
        idle();
        walk();
        attack();
        cast();
        flash = flinch();
        daze();
        toast();
      }

      const casting = castTime < RAISE + HOLD + FLING ? bump(castTime / (RAISE + HOLD + FLING)) : 0;
      nettle.setFlash(Math.max(flash * FLASH_STRENGTH, bodyGlow));
      nettle.setGlow(dead ? -1 : Math.max(casting, charge));
      nettle.update(deltaSeconds);
    },

    dispose() {
      nettle.dispose();
      base.dispose();
      root.removeFromParent();
    },
  };
}
