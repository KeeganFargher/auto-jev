import type { EffectDefinition } from "../definitions.js";
import type { UnitState } from "./state.js";
import { applyDamage } from "./damage.js";

export type EffectOutcome =
  | { kind: "damage"; hpLost: number; shieldAbsorbed: number }
  | { kind: "heal"; amountHealed: number }
  | { kind: "shield"; amount: number; expiresAtTick: number };

export function applyEffect(
  effect: EffectDefinition,
  target: UnitState,
  tick: number,
): EffectOutcome {
  switch (effect.kind) {
    case "damage": {
      const requested = Math.round(effect.amount);

      const shieldAbsorbed =
        target.shield === null ? 0 : Math.min(target.shield.amount, requested);

      if (target.shield !== null) {
        target.shield.amount -= shieldAbsorbed;

        if (target.shield.amount <= 0) {
          target.shield = null;
        }
      }

      const hpLost = applyDamage(target, requested - shieldAbsorbed);

      return { kind: "damage", hpLost, shieldAbsorbed };
    }

    case "heal": {
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + Math.round(effect.amount));

      return { kind: "heal", amountHealed: target.hp - before };
    }

    case "shield": {
      const expiresAtTick = tick + effect.durationTicks;
      target.shield = { amount: Math.round(effect.amount), expiresAtTick };

      return { kind: "shield", amount: target.shield.amount, expiresAtTick };
    }

    default: {
      const exhaustive: never = effect;

      return exhaustive;
    }
  }
}
