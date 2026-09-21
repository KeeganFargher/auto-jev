import type { DecisionOption } from "../controller.js";

/**
 * Projects what picking a given option would look like before it's committed
 * (e.g. for a UI preview). Identity stub for now.
 * TODO: depends on the game's own preview/UI model, not yet designed.
 */
export function previewChoice(option: DecisionOption): DecisionOption {
  return option;
}
