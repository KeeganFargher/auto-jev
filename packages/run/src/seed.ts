import type { BattleId, PlayerId } from "./ids.js";

function hashSeed(parts: readonly (string | number)[]): number {
  let hash = 0x811c9dc5;

  for (const part of parts) {
    const text = String(part);

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }

  return hash >>> 0;
}

export function derivePairingSeed(runSeed: number): number {
  return hashSeed([runSeed, "pairing"]);
}

export function deriveBattleSeed(runSeed: number, round: number, battleId: BattleId): number {
  return hashSeed([runSeed, "battle", round, battleId]);
}

export function deriveOfferSeed(runSeed: number, round: number, playerId: PlayerId, purpose: string): number {
  return hashSeed([runSeed, "offer", round, playerId, purpose]);
}

export function deriveControllerSeed(runSeed: number, round: number, playerId: PlayerId): number {
  return hashSeed([runSeed, "controller", round, playerId]);
}

export function deriveDecisionSeed(controllerSeed: number, decisionId: string): number {
  return hashSeed([controllerSeed, "decision", decisionId]);
}
