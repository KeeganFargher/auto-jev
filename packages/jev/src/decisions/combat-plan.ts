import type { DecisionEngine, DecisionOption, DecisionResult } from "../controller.js";

/**
 * Asks a faction's Jev to pick a combat plan.
 * TODO: combat-plan mechanics aren't designed yet — wire this up once they are.
 */
export async function chooseCombatPlan(
  _engine: DecisionEngine,
  _state: Record<string, unknown>,
  _options: DecisionOption[],
): Promise<DecisionResult> {
  throw new Error("chooseCombatPlan is not implemented yet");
}
