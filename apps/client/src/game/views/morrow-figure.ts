import { Color, Group, type ColorRepresentation } from "three";
import { HIPS, NECK_BASE, NECK_PITCH, RING_SPACING, STANCE } from "../../models/morrow/body.js";
import { BODY_PIVOT, createMorrow, LID_OPEN, MORROW_HEIGHT } from "../../models/morrow/morrow.js";
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

interface Swing {
  pitch: number;
  pitchSpeed: number;
  roll: number;
  rollSpeed: number;
}

interface Glance {
  readonly extension: number;
  readonly bend: number;
  readonly turn: number;
}

interface Butt {
  readonly extension: number;
  readonly dip: number;
}

interface Rearing {
  readonly lift: number;
  readonly neck: number;
}

interface Flinch {
  readonly extension: number;
  readonly flash: number;
}

interface Nod {
  readonly extension: number;
  readonly bend: number;
}

const GAIT_SECONDS = 1.15;

const STRIDE = 0.2;

const STEP_LIFT = 0.26;

const SWING_SHARE = 0.4;

const PHASES = [0, 0.5, 0.5, 0];

const BUTT_DRAW = 0.07;

const BUTT_THRUST = 0.08;

const BUTT_RECOVER = 0.45;

const REAR_RISE = 0.2;

const REAR_HOLD = 0.12;

const REAR_SLAM = 0.16;

const REAR_SETTLE = 0.4;

const REAR_ANGLE = 0.3;

const FLINCH_SECONDS = 0.38;

const WITHDRAW_SECONDS = 0.42;

const DROP_SECONDS = 0.18;

const ROCK_SECONDS = 0.7;

const DEATH_HOLD = 0.5;

const BLINK_SECONDS = 0.2;

const FLASH_STRENGTH = 0.16;

const SUN_SPIN = 0.35;

const AVATAR_SPIN = 1.1;

const CAST_SPIN = 7;

const BELL_STIFFNESS = 22;

const BELL_DAMPING = 1.1;

const LANTERN_STIFFNESS = 30;

const LANTERN_DAMPING = 2.2;

const DROP_UNITS = 0.72 + STANCE;

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

  return Math.exp(-5 * t) * Math.cos(t * 13) * (1 - t);
}

function swingStep(
  state: Swing,
  stiffness: number,
  damping: number,
  pitchDrive: number,
  rollDrive: number,
  deltaSeconds: number,
): void {
  const steps = Math.max(1, Math.ceil(deltaSeconds / (1 / 120)));
  const dt = deltaSeconds / steps;

  for (let step = 0; step < steps; step += 1) {
    state.pitchSpeed += (-stiffness * Math.sin(state.pitch) - damping * state.pitchSpeed - pitchDrive) * dt;
    state.rollSpeed += (-stiffness * Math.sin(state.roll) - damping * state.rollSpeed - rollDrive) * dt;
    state.pitch = Math.max(-1, Math.min(1, state.pitch + state.pitchSpeed * dt));
    state.roll = Math.max(-1, Math.min(1, state.roll + state.rollSpeed * dt));
  }
}

export interface MorrowFigure extends HeroFigure {
  setForm(key: string | null): void;
}

export function createMorrowFigure(traits: FigureTraits): MorrowFigure {
  const root = new Group();
  const frame = new Group();
  const base = createFigureBase();
  const morrow = createMorrow();
  frame.scale.setScalar(FIGURE_SCALE);
  morrow.root.scale.setScalar(traits.height / MORROW_HEIGHT);
  frame.add(base.root, morrow.root);
  root.add(frame);
  const spectralMemory: SpectralMemory = { colors: new Map() };
  const hipRest = HIPS.map((hip) => hip.clone().sub(BODY_PIVOT));
  const neckRest = NECK_BASE.clone().sub(BODY_PIVOT);
  const bellSwing: Swing = { pitch: 0, pitchSpeed: 0, roll: 0, rollSpeed: 0 };
  const lanternSwings: Swing[] = morrow.lanterns.map(() => ({ pitch: 0, pitchSpeed: 0, roll: 0, rollSpeed: 0 }));
  let teamColor = new Color("#ffffff");
  let moving = false;
  let dead = false;
  let linger = false;
  let spectral = false;
  let celebrating = false;
  let avatar = false;
  let clock = Math.random() * 10;
  let gait = 0;
  let movingBlend = 0;
  let cheerBlend = 0;
  let avatarBlend = 0;
  let attackTime = Number.POSITIVE_INFINITY;
  let castTime = Number.POSITIVE_INFINITY;
  let hitTime = Number.POSITIVE_INFINITY;
  let deathTime = Number.POSITIVE_INFINITY;
  let blinkTime = Number.POSITIVE_INFINITY;
  let nextBlink = 2 + Math.random() * 3;
  let lookTime = 0;
  let lookYaw = 0;
  let lookPitch = 0;
  let yaw = 0;
  let pitch = 0;
  let sinkTime = 0;
  let bodyGlow = 0;
  let charge = 0;
  let throwing = false;
  let lastRoll = 0;
  let rollSpeed = 0;
  let lastSurge = 0;
  let surgeSpeed = 0;
  let spin = 0;

  function applyTeamColor(): void {
    base.paint(dead ? DEAD_COLOR : teamColor, dead);
  }

  function rest(): void {
    morrow.body.position.copy(BODY_PIVOT);
    morrow.body.rotation.set(0, 0, 0);
    morrow.neck.position.copy(neckRest);
    morrow.neck.rotation.set(NECK_PITCH, 0, 0);
    morrow.head.rotation.set(-NECK_PITCH, 0, 0);
    morrow.tail.rotation.set(0, 0, 0);
    morrow.shrine.rotation.set(0, 0, 0);

    for (const [index, leg] of morrow.legs.entries()) {
      leg.position.copy(hipRest[index]);
      leg.rotation.set(0, 0, 0);
      leg.scale.setScalar(1);
    }

    for (const lid of morrow.lids) {
      lid.rotation.x = LID_OPEN;
    }
  }

  function extend(extension: number, bend: number, turn: number): void {
    for (const [index, ring] of morrow.rings.entries()) {
      ring.position.z = index === 0 ? 0 : RING_SPACING * extension;
      ring.rotation.x = bend / morrow.rings.length;
      ring.rotation.y = turn / morrow.rings.length;
    }

    morrow.head.position.z = RING_SPACING * extension;
  }

  function idle(): Glance {
    const breath = Math.sin(clock * 1.35);
    morrow.body.position.y += 0.025 * breath;

    if (clock > lookTime) {
      lookTime = clock + 2.5 + Math.random() * 3;
      lookYaw = (Math.random() - 0.5) * 0.8;
      lookPitch = (Math.random() - 0.4) * 0.25;
    }

    return { extension: 1 + 0.025 * breath, bend: lookPitch * (1 - movingBlend), turn: lookYaw * (1 - movingBlend) };
  }

  function walk(): number {
    if (movingBlend <= 0.001) {
      return 0;
    }

    const cycle = gait * Math.PI * 2;
    morrow.body.position.y += movingBlend * 0.05 * Math.abs(Math.sin(cycle * 2));
    morrow.body.rotation.z += movingBlend * 0.045 * Math.sin(cycle);
    morrow.body.rotation.x += movingBlend * 0.02 * Math.sin(cycle * 2);
    morrow.tail.rotation.y = movingBlend * 0.25 * Math.sin(cycle);

    for (const [index, leg] of morrow.legs.entries()) {
      const phase = (gait + PHASES[index]) % 1;
      const swinging = phase < SWING_SHARE;
      const progress = swinging ? phase / SWING_SHARE : (phase - SWING_SHARE) / (1 - SWING_SHARE);
      const reach = swinging ? 1 - 2 * smooth(progress) : -1 + 2 * progress;
      leg.rotation.x += movingBlend * STRIDE * reach;
      leg.position.y += movingBlend * (swinging ? STEP_LIFT * bump(progress) : 0);
    }

    return movingBlend * 0.035 * Math.sin(cycle * 2);
  }

  function headbutt(): Butt {
    if (attackTime >= BUTT_DRAW + BUTT_THRUST + BUTT_RECOVER) {
      return { extension: 0, dip: 0 };
    }

    if (avatar) {
      const lift = bump(attackTime / (BUTT_DRAW + BUTT_THRUST + BUTT_RECOVER));
      morrow.body.rotation.x -= 0.12 * lift;
      morrow.body.position.y += 0.3 * lift;

      return { extension: 0.1 * lift, dip: -0.25 * lift };
    }

    if (attackTime < BUTT_DRAW) {
      const draw = smooth(attackTime / BUTT_DRAW);
      morrow.body.position.z -= 0.08 * draw;

      return { extension: -0.3 * draw, dip: -0.12 * draw };
    }

    if (attackTime < BUTT_DRAW + BUTT_THRUST) {
      const thrust = smooth((attackTime - BUTT_DRAW) / BUTT_THRUST);
      morrow.body.position.z += -0.08 + 0.42 * thrust;

      return { extension: -0.3 + 0.62 * thrust, dip: -0.12 + 0.37 * thrust };
    }

    const recover = (attackTime - BUTT_DRAW - BUTT_THRUST) / BUTT_RECOVER;
    const ease = 1 - smooth(recover);
    morrow.body.position.z += 0.34 * ease;
    morrow.head.rotation.y += 0.16 * settle(recover);

    return { extension: 0.32 * ease, dip: 0.25 * ease };
  }

  function rear(): Rearing {
    const total = REAR_RISE + REAR_HOLD + REAR_SLAM + REAR_SETTLE;

    if (castTime >= total) {
      return { lift: 0, neck: 0 };
    }

    let amount: number;

    if (castTime < REAR_RISE) {
      amount = smooth(castTime / REAR_RISE);
    } else if (castTime < REAR_RISE + REAR_HOLD) {
      amount = 1;
    } else if (castTime < REAR_RISE + REAR_HOLD + REAR_SLAM) {
      amount = 1 - (castTime - REAR_RISE - REAR_HOLD) / REAR_SLAM;
    } else {
      amount = 0.06 * settle((castTime - REAR_RISE - REAR_HOLD - REAR_SLAM) / REAR_SETTLE);
    }

    morrow.body.rotation.x -= REAR_ANGLE * amount;
    morrow.body.position.y += 2 * Math.sin(REAR_ANGLE * amount);
    morrow.body.position.z -= 0.25 * amount;

    for (const index of [0, 1]) {
      morrow.legs[index].rotation.x -= 0.55 * amount;
      morrow.legs[index].position.y += 0.18 * amount;
    }

    for (const index of [2, 3]) {
      morrow.legs[index].rotation.x += REAR_ANGLE * amount;
    }

    return { lift: amount, neck: -0.35 * amount };
  }

  function flinch(): Flinch {
    if (hitTime >= FLINCH_SECONDS) {
      return { extension: 0, flash: 0 };
    }

    const t = hitTime / FLINCH_SECONDS;
    const jolt = bump(Math.min(1, t * 2.5)) * (1 - t);
    morrow.body.position.z -= 0.12 * jolt;
    morrow.body.rotation.z += 0.03 * settle(t);

    return { extension: -0.35 * jolt, flash: Math.max(0, 1 - hitTime / 0.18) };
  }

  function cheer(): Nod {
    if (cheerBlend <= 0.001) {
      return { extension: 0, bend: 0 };
    }

    const nod = Math.sin(clock * 7);
    morrow.body.position.y += cheerBlend * 0.08 * Math.max(0, nod);

    return { extension: cheerBlend * 0.12, bend: cheerBlend * (-0.25 + 0.2 * nod) };
  }

  function blink(deltaSeconds: number): void {
    nextBlink -= deltaSeconds;

    if (nextBlink <= 0) {
      blinkTime = 0;
      nextBlink = 2.5 + Math.random() * 4;
    }

    const closing = blinkTime < BLINK_SECONDS ? bump(blinkTime / BLINK_SECONDS) : 0;

    for (const lid of morrow.lids) {
      lid.rotation.x = LID_OPEN + (0.9 - LID_OPEN) * closing;
    }
  }

  function withdraw(): void {
    const pull = smooth(deathTime / WITHDRAW_SECONDS);
    const drop = smooth((deathTime - WITHDRAW_SECONDS * 0.6) / DROP_SECONDS);

    const rock =
      deathTime > WITHDRAW_SECONDS * 0.6 + DROP_SECONDS
        ? settle((deathTime - WITHDRAW_SECONDS * 0.6 - DROP_SECONDS) / ROCK_SECONDS)
        : 0;

    morrow.body.position.y -= DROP_UNITS * drop;
    morrow.body.rotation.z += 0.05 * rock;
    morrow.body.rotation.x += 0.03 * rock;
    morrow.neck.position.z -= 1.15 * pull;
    morrow.neck.rotation.x += 0.35 * pull;
    morrow.head.rotation.x += 0.25 * pull;
    morrow.tail.rotation.x = -0.9 * pull;

    for (const [index, leg] of morrow.legs.entries()) {
      const side = hipRest[index].x > 0 ? 1 : -1;
      leg.position.y += 0.7 * pull;
      leg.position.x -= side * 0.35 * pull;
      leg.rotation.z += side * 0.5 * pull;
      leg.scale.setScalar(1 - 0.25 * pull);
    }

    for (const lid of morrow.lids) {
      lid.rotation.x = LID_OPEN + (0.9 - LID_OPEN) * pull;
    }

    extend(1 - 0.92 * pull, 0, 0);
  }

  function sway(deltaSeconds: number): void {
    const roll = morrow.body.rotation.z;
    const surge = morrow.body.position.z;
    const nextRollSpeed = (roll - lastRoll) / Math.max(1e-3, deltaSeconds);
    const nextSurgeSpeed = (surge - lastSurge) / Math.max(1e-3, deltaSeconds);
    const rollAccel = Math.max(-40, Math.min(40, (nextRollSpeed - rollSpeed) / Math.max(1e-3, deltaSeconds)));
    const surgeAccel = Math.max(-60, Math.min(60, (nextSurgeSpeed - surgeSpeed) / Math.max(1e-3, deltaSeconds)));
    lastRoll = roll;
    lastSurge = surge;
    rollSpeed = nextRollSpeed;
    surgeSpeed = nextSurgeSpeed;
    swingStep(bellSwing, BELL_STIFFNESS, BELL_DAMPING, -surgeAccel * 0.35, rollAccel * 2.2, deltaSeconds);
    morrow.bell.rotation.set(bellSwing.pitch, 0, bellSwing.roll);

    for (const [index, lantern] of morrow.lanterns.entries()) {
      const state = lanternSwings[index];
      swingStep(state, LANTERN_STIFFNESS, LANTERN_DAMPING, -surgeAccel * 0.3, rollAccel * 2, deltaSeconds);
      lantern.rotation.set(state.pitch, 0, state.roll);
    }

    morrow.shrine.rotation.z = -0.25 * bellSwing.roll * 0.1;
  }

  function ring(strength: number): void {
    bellSwing.pitchSpeed += strength;
    bellSwing.rollSpeed += strength * 0.35 * (Math.random() - 0.5);
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
        throwing = avatar;
        ring(avatar ? 2.5 : 1.6);
      } else if (action === "cast") {
        castTime = 0;
        throwing = true;
        ring(3.2);
      } else {
        hitTime = 0;
        ring(1.1);
      }
    },

    setDead(isDead) {
      if (isDead === dead) {
        return;
      }

      dead = isDead;
      deathTime = isDead ? 0 : Number.POSITIVE_INFINITY;
      sinkTime = 0;

      if (isDead) {
        ring(2.4);
      } else {
        attackTime = Number.POSITIVE_INFINITY;
        castTime = Number.POSITIVE_INFINITY;
        hitTime = Number.POSITIVE_INFINITY;
        base.root.scale.setScalar(1);
        morrow.root.position.y = 0;
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
      paintSpectral(morrow.surfaces, spectralMemory, isSpectral);
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
      morrow.setCastsShadow(castsShadow);
    },

    setForm(key) {
      avatar = key === "avatar";
    },

    castOrigin(out) {
      return (throwing ? morrow.mallet : morrow.beak).getWorldPosition(out);
    },

    update(deltaSeconds) {
      clock += deltaSeconds;
      attackTime += deltaSeconds;
      castTime += deltaSeconds;
      hitTime += deltaSeconds;
      deathTime += deltaSeconds;
      blinkTime += deltaSeconds;
      movingBlend += ((moving && !dead ? 1 : 0) - movingBlend) * clamp01(deltaSeconds * 5);
      cheerBlend += ((celebrating && !dead ? 1 : 0) - cheerBlend) * clamp01(deltaSeconds * 4);
      avatarBlend += ((avatar && !dead ? 1 : 0) - avatarBlend) * clamp01(deltaSeconds * 3);
      gait = (gait + (deltaSeconds / GAIT_SECONDS) * movingBlend) % 1;
      rest();
      let flash = 0;

      const casting =
        castTime < REAR_RISE + REAR_HOLD + REAR_SLAM ? 1 - castTime / (REAR_RISE + REAR_HOLD + REAR_SLAM) : 0;

      if (dead) {
        withdraw();
        const resting = deathTime > WITHDRAW_SECONDS + DROP_SECONDS + ROCK_SECONDS + DEATH_HOLD;
        sinkTime += !linger && resting ? deltaSeconds : 0;
        const sunk = Math.min(1, sinkTime / SINK_SECONDS);
        morrow.root.position.y = (-sunk * SINK_UNITS) / FIGURE_SCALE;
        base.root.scale.setScalar(Math.max(0.001, 1 - sunk));
        root.visible = sunk < 1;
      } else {
        const looking = idle();
        const bob = walk();
        const butt = headbutt();
        const reared = rear();
        const flinched = flinch();
        const cheered = cheer();
        flash = flinched.flash;
        yaw += (looking.turn - yaw) * clamp01(deltaSeconds * 2.5);
        pitch += (looking.bend - pitch) * clamp01(deltaSeconds * 2.5);

        const extension =
          1 + 0.06 * movingBlend + (looking.extension - 1) + butt.extension + flinched.extension + cheered.extension;

        extend(Math.max(0.2, extension), pitch + reared.neck + cheered.bend - 0.1 * movingBlend, yaw);
        morrow.head.rotation.x += butt.dip + bob - 0.25 * reared.lift;
        blink(deltaSeconds);
      }

      sway(deltaSeconds);
      const spinRate = SUN_SPIN + (AVATAR_SPIN - SUN_SPIN) * avatarBlend + CAST_SPIN * casting + 2 * cheerBlend;
      spin += deltaSeconds * (dead ? 0 : spinRate);
      morrow.sun.rotation.z = spin;
      morrow.setFlash(Math.max(flash * FLASH_STRENGTH, bodyGlow));
      morrow.setGlow(dead ? -0.15 : Math.max(casting * 1.2, charge * 0.6, avatarBlend * 0.5));
      morrow.setRadiance(dead ? 0 : Math.max(avatarBlend, cheerBlend * 0.6, casting * 0.5));
    },

    dispose() {
      morrow.dispose();
      base.dispose();
      root.removeFromParent();
    },
  };
}
