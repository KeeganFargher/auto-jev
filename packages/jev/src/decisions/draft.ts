import type { DecisionEngine, DecisionOption, DecisionResult } from "../controller.js";

/**
 * Asks a faction's Jev to make a draft pick.
 * TODO: draft mechanics aren't designed yet — wire this up once they are.
 */
export async function chooseDraft(
  _engine: DecisionEngine,
  _state: Record<string, unknown>,
  _options: DecisionOption[],
): Promise<DecisionResult> {
  throw new Error("chooseDraft is not implemented yet");
}
