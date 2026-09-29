import type { BattleEvent, ProjectilePayload } from "@jev-game/game";

const PROJECTILE_NAMES: Readonly<Record<ProjectilePayload["kind"], string>> = {
  attack: "shot",
  fuse: "fuse bolt",
  hook: "hook",
};

export function describeEvent(event: BattleEvent): string {
  switch (event.kind) {
    case "attack":
      return `${event.sourceUnitId} ${event.delivery === "melee" ? "swings at" : "shoots at"} ${event.targetUnitId}`;

    case "projectile":
      return `${event.sourceUnitId} fires a ${PROJECTILE_NAMES[event.payload]} at ${event.targetUnitId}`;

    case "damage":
      return `${event.sourceUnitId} hit ${event.targetUnitId} for ${event.amount}${event.crit ? " (crit)" : ""} with ${event.cause}, ${event.hpAfter} HP left`;

    case "heal":
      return `${event.sourceUnitId} healed ${event.targetUnitId} for ${event.amount} with ${event.cause}`;

    case "signature": {
      const target = event.targetUnitId === null ? "" : ` on ${event.targetUnitId}`;

      return `${event.unitId} casts ${event.signature}${target}${event.wanted ? " into a setup" : ""}`;
    }

    case "hammer-impact":
      return `${event.unitId}'s hammer hit ${event.hitUnitIds.length} units`;

    case "rampage":
      return `${event.unitId} rampage ${event.phase}, size ${event.size.toFixed(2)}`;

    case "grab":
      return `${event.unitId} grabbed ${event.targetUnitId}`;

    case "throw":
      return `${event.unitId} threw ${event.targetUnitId}`;

    case "yank":
      return `${event.unitId} yanked ${event.targetUnitId}`;

    case "launch":
      return event.motion.landing.cause === "drop"
        ? `${event.unitId} dropped as the bubble popped`
        : `${event.unitId} launched by ${event.motion.landing.cause}${event.juggle ? ", juggled" : ""}`;

    case "land":
      return `${event.unitId} landed${event.hard ? " hard" : ""} after ${event.cause}`;

    case "pull":
      return `${event.makerUnitId} pulled ${event.unitId} into the pile`;

    case "freeze":
      return `${event.makerUnitId} froze ${event.unitId}`;

    case "thaw":
      return `${event.unitId} thawed`;

    case "shatter":
      return `${event.unitId} shattered`;

    case "downed":
      return `${event.unitId} is downed`;

    case "get-up":
      return `${event.unitId} got up`;

    case "stun":
      return `${event.unitId} is stunned`;

    case "bubble":
      return `${event.ownerUnitId} blew a ${event.bubbleKind} bubble around ${event.memberUnitIds.join(", ")}`;

    case "bubble-launch":
      return `bubble ${event.bubbleId} was knocked flying`;

    case "pop":
      return `bubble ${event.bubbleId} popped`;

    case "prime":
      return `${event.makerUnitId} lit a fuse on ${event.unitId}`;

    case "ignite":
      return `${event.unitId} caught fire from ${event.sourceUnitId} by ${event.cause}`;

    case "burn-end":
      return `${event.unitId} stopped burning`;

    case "explode":
      return `${event.unitId} exploded${event.hotPotato ? ", hot potato" : ""}`;

    case "combo-link":
      return `COMBO ×${event.count}! ${event.setupUnitId} set up ${event.targetUnitId} (${event.state}) for ${event.payoffUnitId}`;

    case "beat": {
      const beat = event.beat;

      return beat.kind === "freeze"
        ? `hit-stop ${beat.seconds}s`
        : `slow-mo ${beat.rate}× for ${beat.ticks} ticks`;
    }

    case "death":
      return `${event.unitId} died to ${event.killerUnitId}`;

    case "battle-ended": {
      const result = event.result;

      return result.kind === "win"
        ? `battle over, ${result.winningTeamId} wins`
        : `battle over, draw (${result.reason})`;
    }

    default: {
      const exhaustive: never = event;

      return exhaustive;
    }
  }
}
