import { Bone, Euler, Group, Matrix4, Quaternion, Skeleton, Vector3 } from "three";
import { HEAD_JOINT, LEGS, SPINE, TAIL, type LegJoints } from "./anatomy.js";

export interface RigPose {
  readonly bob: number;
  readonly surge: number;
  readonly pitch: number;
  readonly roll: number;
  readonly arch: number;
  readonly sit: number;
  readonly limp: number;
  readonly headPitch: number;
  readonly headYaw: number;
  readonly tailLift: number;
  readonly tailSwing: number;
  readonly tailPhase: number;
  readonly breath: number;
  readonly feet: readonly Vector3[];
}

export interface Rig {
  readonly root: Group;
  readonly skeleton: Skeleton;
  readonly head: Bone;
  readonly neck: Bone;
  readonly paws: readonly Bone[];
  readonly tailTip: Vector3;
  pose(pose: RigPose): void;
  attach(bone: Bone, restPosition: Vector3): Group;
  nearestSpine(restPosition: Vector3): Bone;
  carry(bone: Bone, restPosition: Vector3, out: Vector3): Vector3;
}

const PIVOT_Y = 2.1;

const FRONT_HINT = new Vector3(0, 0, -1);

const HIND_HINT = new Vector3(0, 0, 1);

const SIDE = new Vector3(1, 0, 0);

const FORWARD = new Vector3(0, 0, 1);

const TAIL_FLOOR = 0.12;

const BREATH_SWELL = 0.035;

const RIBS_BONE = 2;

interface LegRig {
  readonly joints: LegJoints;
  readonly upper: number;
  readonly lower: number;
  readonly ankleOffset: Vector3;
  readonly toeLength: number;
  readonly bones: readonly Bone[];
}

const basis = new Matrix4();

const xAxis = new Vector3();

const yAxis = new Vector3();

const zAxis = new Vector3();

function frame(direction: Vector3, side: Vector3, out: Quaternion): Quaternion {
  zAxis.copy(direction).normalize();
  xAxis.copy(side).addScaledVector(zAxis, -side.dot(zAxis));

  if (xAxis.lengthSq() < 1e-8) {
    xAxis.set(0, 1, 0).addScaledVector(zAxis, -zAxis.y);
  }

  xAxis.normalize();
  yAxis.crossVectors(zAxis, xAxis);
  basis.makeBasis(xAxis, yAxis, zAxis);

  return out.setFromRotationMatrix(basis);
}

export function createRig(): Rig {
  const root = new Group();
  const bones: Bone[] = [];
  const spineBones: Bone[] = [];
  const tailBones: Bone[] = [];

  function addBone(from: Vector3, to: Vector3): Bone {
    const bone = new Bone();
    bone.position.copy(from);
    frame(to.clone().sub(from), SIDE, bone.quaternion);
    root.add(bone);
    bones.push(bone);

    return bone;
  }

  for (let index = 0; index < SPINE.length - 1; index += 1) {
    spineBones.push(addBone(SPINE[index] ?? new Vector3(), SPINE[index + 1] ?? new Vector3()));
  }

  for (let index = 0; index < TAIL.length - 1; index += 1) {
    tailBones.push(addBone(TAIL[index] ?? new Vector3(), TAIL[index + 1] ?? new Vector3()));
  }

  const legs: LegRig[] = LEGS.map((joints) => ({
    joints,
    upper: joints.top.distanceTo(joints.bend),
    lower: joints.bend.distanceTo(joints.ankle),
    ankleOffset: joints.ankle.clone().sub(joints.paw),
    toeLength: joints.paw.distanceTo(joints.toe),
    bones: [
      addBone(joints.top, joints.bend),
      addBone(joints.bend, joints.ankle),
      addBone(joints.ankle, joints.paw),
      addBone(joints.paw, joints.toe),
    ],
  }));

  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  const restInverse = new Map(bones.map((bone) => [bone, bone.matrixWorld.clone().invert()]));
  const tailLengths = TAIL.slice(1).map((point, index) => point.distanceTo(TAIL[index] ?? point));
  const head = spineBones[HEAD_JOINT] ?? new Bone();
  const neck = spineBones[HEAD_JOINT - 1] ?? new Bone();
  const tailTip = new Vector3();
  const from = new Vector3();
  const to = new Vector3();
  const lateral = new Vector3();
  const forward = new Vector3();
  const scratch = new Vector3();
  const hint = new Vector3();
  const knee = new Vector3();
  const ankle = new Vector3();
  const paw = new Vector3();
  const toe = new Vector3();
  const top = new Vector3();
  const offset = new Vector3();
  const toward = new Vector3();
  const bend = new Vector3();
  const headEuler = new Euler();
  const carried = new Matrix4();
  const tailPoints = TAIL.map(() => new Vector3());
  let current: RigPose | null = null;

  function bodyPoint(x: number, y: number, z: number, out: Vector3): Vector3 {
    const pose = current;

    if (pose === null) {
      return out.set(x, y, z);
    }

    const archWeight = Math.sin(Math.PI * Math.min(1, Math.max(0, (z + 2.6) / 4.3)));
    const sitWeight = Math.min(1, Math.max(0, (1.6 - z) / 4.4));
    const lifted = y + pose.arch * archWeight - pose.sit * 0.7 * sitWeight - PIVOT_Y;
    const cosPitch = Math.cos(pose.pitch);
    const sinPitch = Math.sin(pose.pitch);
    const pitchedY = lifted * cosPitch + z * sinPitch;
    const pitchedZ = z * cosPitch - lifted * sinPitch;
    const cosRoll = Math.cos(pose.roll);
    const sinRoll = Math.sin(pose.roll);

    return out.set(
      x * cosRoll - pitchedY * sinRoll,
      PIVOT_Y + x * sinRoll + pitchedY * cosRoll + pose.bob,
      pitchedZ + pose.surge,
    );
  }

  function bodyDirection(direction: Vector3, at: Vector3, out: Vector3): Vector3 {
    bodyPoint(at.x, at.y, at.z, scratch);
    bodyPoint(at.x + direction.x * 0.1, at.y + direction.y * 0.1, at.z + direction.z * 0.1, out);

    return out.sub(scratch).multiplyScalar(10);
  }

  function place(bone: Bone | undefined, start: Vector3, end: Vector3, side: Vector3): void {
    if (bone === undefined) {
      return;
    }

    bone.position.copy(start);
    frame(toward.subVectors(end, start), side, bone.quaternion);
  }

  function solveKnee(
    start: Vector3,
    target: Vector3,
    upper: number,
    lower: number,
    bendHint: Vector3,
    out: Vector3,
  ): Vector3 {
    toward.subVectors(target, start);
    const reach = Math.min(upper + lower - 1e-3, Math.max(Math.abs(upper - lower) + 1e-3, toward.length()));
    toward.normalize();
    const cos = Math.min(1, Math.max(-1, (upper * upper + reach * reach - lower * lower) / (2 * upper * reach)));
    const sin = Math.sqrt(1 - cos * cos);
    bend.copy(bendHint).addScaledVector(toward, -toward.dot(bendHint));

    if (bend.lengthSq() < 1e-8) {
      bend.set(0, 0, 1);
    }

    bend.normalize();

    return out
      .copy(start)
      .addScaledVector(toward, upper * cos)
      .addScaledVector(bend, upper * sin);
  }

  function poseSpine(pose: RigPose): void {
    for (const [index, bone] of spineBones.entries()) {
      if (index === HEAD_JOINT) {
        continue;
      }

      const rest = SPINE[index] ?? scratch;
      const restNext = SPINE[index + 1] ?? scratch;
      bodyPoint(rest.x, rest.y, rest.z, from);
      bodyPoint(restNext.x, restNext.y, restNext.z, to);
      place(bone, from, to, lateral);
    }

    const ribs = spineBones[RIBS_BONE];

    if (ribs !== undefined) {
      const swell = 1 + BREATH_SWELL * pose.breath;
      ribs.scale.set(swell, swell, 1);
    }

    const headRest = SPINE[HEAD_JOINT] ?? scratch;
    bodyPoint(headRest.x, headRest.y, headRest.z, head.position);
    headEuler.set(-(pose.pitch + pose.headPitch), pose.headYaw, pose.roll, "YXZ");
    head.quaternion.setFromEuler(headEuler);
  }

  function poseTail(pose: RigPose): void {
    const base = TAIL[0] ?? scratch;
    bodyPoint(base.x, base.y, base.z, scratch);
    let pitch = -0.75 + 0.5 * pose.tailLift - pose.pitch;
    const curl = 0.1 + 0.05 * pose.tailLift;

    for (const [index, point] of tailPoints.entries()) {
      point.copy(scratch);
      const along = index / (tailPoints.length - 1);
      const yaw = pose.tailSwing * Math.sin(pose.tailPhase - index * 0.55) * along;
      const length = tailLengths[index] ?? 0.4;
      scratch.x += Math.sin(yaw) * Math.cos(pitch) * length;
      scratch.y += Math.sin(pitch) * length;
      scratch.z -= Math.cos(yaw) * Math.cos(pitch) * length;
      pitch += curl * (1 - pose.limp);
      scratch.y = Math.max(TAIL_FLOOR, scratch.y);
    }

    for (const [index, bone] of tailBones.entries()) {
      place(bone, tailPoints[index] ?? scratch, tailPoints[index + 1] ?? scratch, lateral);
    }

    tailTip.copy(tailPoints[tailPoints.length - 1] ?? scratch);
  }

  function poseLeg(leg: LegRig, index: number, pose: RigPose): void {
    const { joints } = leg;
    const ground = pose.feet[index] ?? joints.paw;
    bodyPoint(
      joints.top.x * 1.3,
      joints.top.y - (leg.upper + leg.lower) * 0.6,
      joints.top.z + (joints.hind ? 0.3 : -0.2),
      scratch,
    );
    paw.lerpVectors(ground, scratch, pose.limp);
    bodyDirection(leg.ankleOffset, joints.paw, offset);
    offset.lerpVectors(leg.ankleOffset, offset, pose.limp);
    ankle.copy(paw).add(offset);
    bodyPoint(joints.top.x, joints.top.y, joints.top.z, top);
    bodyDirection(joints.hind ? HIND_HINT : FRONT_HINT, joints.top, hint);
    solveKnee(top, ankle, leg.upper, leg.lower, hint, knee);
    toward.subVectors(ankle, knee).normalize();
    ankle.copy(knee).addScaledVector(toward, leg.lower);
    paw.copy(ankle).sub(offset);
    bodyDirection(FORWARD, joints.paw, forward);
    forward.y *= pose.limp;
    forward.normalize();
    toe.copy(paw).addScaledVector(forward, leg.toeLength);
    place(leg.bones[0], top, knee, lateral);
    place(leg.bones[1], knee, ankle, lateral);
    place(leg.bones[2], ankle, paw, lateral);
    place(leg.bones[3], paw, toe, lateral);
  }

  return {
    root,
    skeleton,
    head,
    neck,
    paws: legs.map((leg) => leg.bones[3] ?? head),
    tailTip,

    pose(pose) {
      current = pose;
      bodyDirection(SIDE, SPINE[0] ?? scratch, lateral).normalize();
      poseSpine(pose);
      poseTail(pose);

      for (const [index, leg] of legs.entries()) {
        poseLeg(leg, index, pose);
      }
    },

    nearestSpine(restPosition) {
      let best = spineBones[0] ?? head;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const [index, bone] of spineBones.entries()) {
        const start = SPINE[index] ?? scratch;
        const end = SPINE[index + 1] ?? scratch;
        const distance = restPosition.distanceTo(scratch.copy(start).lerp(end, 0.5));

        if (index !== HEAD_JOINT && distance < bestDistance) {
          best = bone;
          bestDistance = distance;
        }
      }

      return best;
    },

    carry(bone, restPosition, out) {
      const inverse = restInverse.get(bone);
      carried.compose(bone.position, bone.quaternion, bone.scale);

      return inverse === undefined
        ? out.copy(restPosition)
        : out.copy(restPosition).applyMatrix4(inverse).applyMatrix4(carried);
    },

    attach(bone, restPosition) {
      const socket = new Group();
      const inverse = restInverse.get(bone);

      if (inverse !== undefined) {
        socket.position.copy(restPosition).applyMatrix4(inverse);
        socket.quaternion.setFromRotationMatrix(basis.extractRotation(inverse));
      }

      bone.add(socket);

      return socket;
    },
  };
}
