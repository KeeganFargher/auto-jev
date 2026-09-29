import {
  DOWNED_TICKS,
  isDowned,
  isFrozen,
  isLaunched,
  type BattleSnapshot,
  type BubbleState,
  type UnitState,
} from "@jev-game/game";

export type UnitStatusKind =
  | "primed"
  | "burning"
  | "floating"
  | "airborne"
  | "downed"
  | "frozen"
  | "stunned"
  | "rampage"
  | "safety-bubble";

export interface UnitStatusInfo {
  label: string;
  buff: boolean;
  description: string;
}

export const UNIT_STATUS_INFO: Readonly<Record<UnitStatusKind, UnitStatusInfo>> = {
  primed: {
    label: "Primed",
    buff: false,
    description:
      "Carries a lit fuse and panics toward its friends. Explodes when the fuse runs out.",
  },
  burning: {
    label: "Burning",
    buff: false,
    description: "On fire. Takes damage over time and can spread the flames by touch.",
  },
  floating: {
    label: "Floating",
    buff: false,
    description: "Trapped in a bubble. Can't act until it drops.",
  },
  airborne: {
    label: "Airborne",
    buff: false,
    description: "Flying through the air. Can't act until it lands.",
  },
  downed: {
    label: "Downed",
    buff: false,
    description: "Knocked flat. Can't act until it gets up.",
  },
  frozen: {
    label: "Frozen",
    buff: false,
    description: "Frozen solid. Can't act, and a hammer or blast shatters it for double damage.",
  },
  stunned: {
    label: "Stunned",
    buff: false,
    description: "Seeing stars. Can't act.",
  },
  rampage: {
    label: "Rampage",
    buff: true,
    description: "Giant and unstoppable. Can't be moved or stunned.",
  },
  "safety-bubble": {
    label: "Safety Bubble",
    buff: true,
    description: "Floating out of reach in a healing bubble.",
  },
};

function bubbleIn(snapshot: BattleSnapshot, bubbleId: number): BubbleState {
  const bubble = snapshot.bubbles.find((candidate) => candidate.bubbleId === bubbleId);

  if (bubble === undefined) {
    throw new Error(`Snapshot at tick ${snapshot.tick} has no bubble ${bubbleId}`);
  }

  return bubble;
}

function missingStatus(unit: UnitState, status: UnitStatusKind): Error {
  return new Error(`Unit ${unit.unitId} is not ${status}`);
}

export function unitStatuses(snapshot: BattleSnapshot, unit: UnitState): UnitStatusKind[] {
  if (!unit.alive) {
    return [];
  }

  const statuses: UnitStatusKind[] = [];
  const motion = unit.motion;

  if (unit.primed !== null) {
    statuses.push("primed");
  }

  if (unit.burning !== null) {
    statuses.push("burning");
  }

  if (motion.kind === "float") {
    statuses.push(
      bubbleIn(snapshot, motion.bubbleId).kind === "safety" ? "safety-bubble" : "floating",
    );
  }

  if (isLaunched(unit)) {
    statuses.push("airborne");
  }

  if (isDowned(unit)) {
    statuses.push("downed");
  }

  if (isFrozen(unit, snapshot.tick)) {
    statuses.push("frozen");
  }

  if (unit.stunnedUntilTick > snapshot.tick && unit.rampage === null) {
    statuses.push("stunned");
  }

  if (unit.rampage !== null) {
    statuses.push("rampage");
  }

  return statuses;
}

export function statusEndTick(
  snapshot: BattleSnapshot,
  unit: UnitState,
  status: UnitStatusKind,
): number {
  const motion = unit.motion;

  switch (status) {
    case "primed": {
      if (unit.primed === null) {
        throw missingStatus(unit, status);
      }

      return unit.primed.explodeTick;
    }

    case "burning": {
      if (unit.burning === null) {
        throw missingStatus(unit, status);
      }

      return unit.burning.untilTick;
    }

    case "floating":
    case "safety-bubble": {
      if (motion.kind !== "float") {
        throw missingStatus(unit, status);
      }

      return bubbleIn(snapshot, motion.bubbleId).endTick;
    }

    case "airborne": {
      if (motion.kind !== "flight") {
        throw missingStatus(unit, status);
      }

      return motion.endTick;
    }

    case "downed": {
      if (motion.kind === "skid") {
        return motion.endTick + DOWNED_TICKS;
      }

      if (motion.kind !== "downed") {
        throw missingStatus(unit, status);
      }

      return motion.endTick;
    }

    case "frozen": {
      if (unit.frozen === null) {
        throw missingStatus(unit, status);
      }

      return unit.frozen.untilTick;
    }

    case "stunned": {
      return unit.stunnedUntilTick;
    }

    case "rampage": {
      if (unit.rampage === null) {
        throw missingStatus(unit, status);
      }

      return unit.rampage.endTick;
    }
  }
}
