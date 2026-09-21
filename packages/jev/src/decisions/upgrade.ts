import type { DecisionEngine, DecisionOption, DecisionResult } from "../controller.js";

/**
 * Asks a faction's Jev to pick an upgrade.
 * TODO: upgrade mechanics aren't designed yet — wire this up once they are.
 */
export async function chooseUpgrade(
  _engine: DecisionEngine,
  _state: Record<string, unknown>,
  _options: DecisionOption[],
): Promise<DecisionResult> {
  throw new Error("chooseUpgrade is not implemented yet");
}
