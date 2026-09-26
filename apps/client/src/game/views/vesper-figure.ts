import { Color, Group, type ColorRepresentation, type Vector3 } from "three";
import { createVesper, REST_FEET, type VesperPose } from "../../models/vesper/vesper.js";
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

const BODY_SCALE = 1.35;

export const VESPER_SCALE = FIGURE_SCALE * BODY_SCALE;

const GAIT_SECONDS = 0.5;

const STANCE = 0.42;

const STRIDE = 1.5;

const FRONT_LIFT = 0.55;

const HIND_LIFT = 0.45;

const LEG_PHASES = [0, 0.1, 0.55, 0.65];

const SWIPE_WINDUP = 0.12;

const SWIPE_STRIKE = 0.09;

const SWIPE_RECOVER = 0.3;

const POUNCE_CROUCH = 0.2;

const POUNCE_SPRING = 0.16;

const POUNCE_RECOVER = 0.3;

const FLINCH_SECONDS = 0.3;

const STAGGER_SECONDS = 0.25;

const COLLAPSE_SECONDS = 0.45;

const DEATH_HOLD_SECONDS = 0.6;

const FLASH_STRENGTH = 0.5;

const IDLE_FLAME = 0.7;

const CHARGE_FLAME = 1.1;

const BLINK_SECONDS = 0.14;

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

export function createVesperFigure(traits: FigureTraits): HeroFigure {
  const root = new Group();
  const base = createFigureBase();
  const vesper = createVesper();
  const frame = new Group();
  frame.scale.setScalar(FIGURE_SCALE);
  vesper.root.scale.setScalar(BODY_SCALE);
  frame.add(base.root, vesper.root);
  root.add(frame);
  const pose: VesperPose = vesper.pose;
  const spectralMemory: SpectralMemory = { colors: new Map() };
  let teamColor = new Color("#ffffff");
  let moving = false;
  let celebrating = false;
  let dead = false;
  let linger = false;
  let spectral = false;
  let clock = Math.random() * 10;
  let gait = 0;
  let attackTime = Number.POSITIVE_INFINITY;
  let castTime = Number.POSITIVE_INFINITY;
  let hitTime = Number.POSITIVE_INFINITY;
  let deathTime = Number.POSITIVE_INFINITY;
  let blinkTime = Number.POSITIVE_INFINITY;
  let nextBlink = 2 + Math.random() * 3;
  let sinkTime = 0;
  let bodyGlow = 0;
  let charge = 0;
  let movingBlend = 0;
  let celebrateBlend = 0;

  function applyTeamColor(): void {
    base.paint(dead ? DEAD_COLOR : teamColor, dead);
    vesper.setTeamColor(dead ? DEAD_COLOR : teamColor);
  }

  function resetPose(): void {
    pose.bob = 0;
    pose.surge = 0;
    pose.pitch = 0;
    pose.roll = 0;
    pose.arch = 0;
    pose.sit = 0;
    pose.limp = 0;
    pose.headPitch = 0;
    pose.headYaw = 0;
    pose.tailLift = 0;
    pose.breath = Math.sin(clock * 1.7);
    pose.flame = IDLE_FLAME;

    for (const [index, foot] of pose.feet.entries()) {
      foot.copy(REST_FEET[index] ?? foot);
    }
  }

  function gaitPose(): void {
    const run = movingBlend;

    for (const [index, foot] of pose.feet.entries()) {
      const phase = (gait + (LEG_PHASES[index] ?? 0)) % 1;
      const lift = index < 2 ? FRONT_LIFT : HIND_LIFT;

      if (phase < STANCE) {
        foot.z += (STRIDE / 2 - (STRIDE * phase) / STANCE) * run;
      } else {
        const swing = (phase - STANCE) / (1 - STANCE);
        foot.z += (-STRIDE / 2 + STRIDE * smooth(swing)) * run;
        foot.y += lift * bump(swing) * run;
      }
    }

    const cycle = gait * Math.PI * 2;
    pose.bob += (0.1 * Math.sin(cycle * 2) - 0.08) * run;
    pose.pitch += 0.07 * Math.sin(cycle + 0.5) * run;
    pose.arch += 0.2 * Math.sin(cycle) * run;
    pose.headPitch -= pose.pitch * 0.8;
    pose.tailLift += 1.1 * run;
    pose.tailSwing = 0.35 - 0.2 * run;
    pose.headYaw += (0.25 * Math.sin(clock * 0.37) + 0.1 * Math.sin(clock * 0.91)) * (1 - run);
    pose.headPitch += 0.05 * Math.sin(clock * 0.53) * (1 - run);
  }

  function swipePose(): void {
    if (attackTime >= SWIPE_WINDUP + SWIPE_STRIKE + SWIPE_RECOVER) {
      return;
    }

    const paw = pose.feet[1];
    const windup = smooth(attackTime / SWIPE_WINDUP);
    const strike = smooth((attackTime - SWIPE_WINDUP) / SWIPE_STRIKE);
    const recover = 1 - smooth((attackTime - SWIPE_WINDUP - SWIPE_STRIKE) / SWIPE_RECOVER);
    const held = attackTime < SWIPE_WINDUP ? windup : recover;
    pose.bob -= 0.3 * held;
    pose.surge +=
      (attackTime < SWIPE_WINDUP ? -0.25 * windup : -0.25 + 1.15 * strike) * (attackTime < SWIPE_WINDUP ? 1 : recover);
    pose.pitch -= (0.08 + 0.08 * strike) * held;
    pose.headPitch -= 0.15 * held;

    if (paw !== undefined) {
      if (attackTime < SWIPE_WINDUP) {
        paw.y += 1.0 * windup;
        paw.z += 0.3 * windup;
        paw.x -= 0.15 * windup;
      } else {
        paw.y += (1.0 - 0.8 * strike) * recover;
        paw.z += (0.3 + 1.1 * strike) * recover;
        paw.x += (-0.15 + 0.45 * strike) * recover;
      }
    }
  }

  function pouncePose(): void {
    if (castTime >= POUNCE_CROUCH + POUNCE_SPRING + POUNCE_RECOVER) {
      return;
    }

    const crouch = smooth(castTime / POUNCE_CROUCH);
    const spring = bump((castTime - POUNCE_CROUCH) / POUNCE_SPRING);
    const recover = 1 - smooth((castTime - POUNCE_CROUCH - POUNCE_SPRING) / POUNCE_RECOVER);
    const low = castTime < POUNCE_CROUCH ? crouch : recover * (1 - spring);
    pose.bob += -0.55 * low + 0.7 * spring;
    pose.surge += 1.2 * spring - 0.2 * low;
    pose.pitch += 0.22 * spring - 0.1 * low;
    pose.arch -= 0.25 * low;
    pose.tailLift += 0.8 * low;
    pose.flame += 1.2 * Math.max(low, spring);

    for (const [index, foot] of pose.feet.entries()) {
      foot.z += (index < 2 ? 0.9 : -0.7) * spring;
      foot.y += (index < 2 ? 0.6 : 0.2) * spring;
    }
  }

  function flinchPose(): number {
    if (hitTime >= FLINCH_SECONDS) {
      return 0;
    }

    const flinch = bump(hitTime / FLINCH_SECONDS) * (1 - hitTime / FLINCH_SECONDS / 2);
    pose.surge -= 0.35 * flinch;
    pose.pitch += 0.12 * flinch;
    pose.headPitch += 0.2 * flinch;
    pose.roll += 0.1 * flinch * Math.sin(hitTime * 55);

    return flinch;
  }

  function celebratePose(): void {
    const sit = celebrateBlend;

    if (sit <= 0.001) {
      return;
    }

    pose.sit += sit;
    pose.pitch += 0.35 * sit;
    pose.headPitch += 0.25 * sit - pose.pitch * 0.6;
    pose.tailLift += 0.6 * sit;
    pose.flame += 0.8 * sit;
    pose.feet[2]?.set(0.52, 0.16, -1.1);
    pose.feet[3]?.set(-0.52, 0.16, -1.1);

    for (const [index, foot] of pose.feet.entries()) {
      foot.lerpVectors(REST_FEET[index] ?? foot, foot, sit);
    }
  }

  function deathPose(): void {
    pose.flame = 0.4 * (1 - smooth(deathTime / (STAGGER_SECONDS + COLLAPSE_SECONDS)));
    pose.blink = 1;

    if (deathTime < STAGGER_SECONDS) {
      const stagger = smooth(deathTime / STAGGER_SECONDS);
      pose.roll += 0.25 * stagger;
      pose.bob -= 0.3 * stagger;
      pose.headPitch -= 0.3 * stagger;

      return;
    }

    const fall = smooth((deathTime - STAGGER_SECONDS) / COLLAPSE_SECONDS);
    pose.roll += 0.25 + 1.12 * fall;
    pose.bob -= 0.3 + 1.35 * fall;
    pose.limp = fall;
    pose.headPitch -= 0.3 + 0.2 * fall;
    pose.tailLift -= 0.8 * fall;
    pose.tailSwing = 0.05;
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
      } else if (action === "cast") {
        castTime = 0;
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
        vesper.root.position.y = 0;
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
      paintSpectral(vesper.surfaces, spectralMemory, isSpectral);
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
      vesper.setCastsShadow(castsShadow);
    },

    castOrigin(out: Vector3) {
      return vesper.mouth(out);
    },

    update(deltaSeconds) {
      clock += deltaSeconds;
      attackTime += deltaSeconds;
      castTime += deltaSeconds;
      hitTime += deltaSeconds;
      deathTime += deltaSeconds;
      blinkTime += deltaSeconds;
      movingBlend += ((moving && !dead ? 1 : 0) - movingBlend) * clamp01(deltaSeconds * 7);
      celebrateBlend += ((celebrating && !dead ? 1 : 0) - celebrateBlend) * clamp01(deltaSeconds * 4);
      gait = (gait + (deltaSeconds / GAIT_SECONDS) * movingBlend) % 1;
      pose.tailPhase += deltaSeconds * (1.6 + 4.4 * movingBlend);
      nextBlink -= deltaSeconds;

      if (nextBlink <= 0) {
        blinkTime = 0;
        nextBlink = 2.5 + Math.random() * 4;
      }

      resetPose();
      pose.blink = bump(blinkTime / BLINK_SECONDS);
      let flinch = 0;

      if (dead) {
        deathPose();
        sinkTime += !linger && deathTime > STAGGER_SECONDS + COLLAPSE_SECONDS + DEATH_HOLD_SECONDS ? deltaSeconds : 0;
        const sink = Math.min(1, sinkTime / SINK_SECONDS);
        vesper.root.position.y = (-sink * SINK_UNITS) / FIGURE_SCALE;
        base.root.scale.setScalar(Math.max(0.001, 1 - sink));
        root.visible = sink < 1;
      } else {
        gaitPose();
        celebratePose();
        swipePose();
        pouncePose();
        flinch = flinchPose();
        pose.flame += CHARGE_FLAME * charge + (charge >= 1 ? 0.4 * (0.5 + 0.5 * Math.sin(clock * 9)) : 0);
      }

      vesper.setFlash(Math.max(flinch * FLASH_STRENGTH, bodyGlow));
      vesper.update(deltaSeconds);
    },

    dispose() {
      vesper.dispose();
      base.dispose();
      root.removeFromParent();
    },
  };
}
