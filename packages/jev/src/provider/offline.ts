import { createRng, nextFloat } from "@jev-game/game";
import { JevProviderFailure, type JevProvider } from "./types.js";

export const OFFLINE_MODEL = "offline-stub";

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new JevProviderFailure("aborted", "the offline request was aborted"));

      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);

    function onAbort(): void {
      clearTimeout(timer);
      reject(new JevProviderFailure("aborted", "the offline request was aborted"));
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createOfflineProvider(seed: number, delayMilliseconds: number): JevProvider {
  const rng = createRng(seed);

  return {
    source: "offline",
    model: OFFLINE_MODEL,

    async choose(question, signal) {
      await wait(delayMilliseconds, signal);

      const keys = Object.keys(question.options);

      if (keys.length === 0) {
        throw new JevProviderFailure("invalid-response", "the offline stub was given no options");
      }

      const weights = keys.map(() => 0.05 + nextFloat(rng));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const probabilities: Record<string, number> = {};
      let best = 0;

      keys.forEach((key, index) => {
        probabilities[key] = (weights[index] ?? 0) / total;

        if ((weights[index] ?? 0) > (weights[best] ?? 0)) {
          best = index;
        }
      });

      const chosen = keys[best] ?? keys[0] ?? "";

      return {
        choice: chosen,
        probabilities,
        confidence: probabilities[chosen] ?? 0,
        model: OFFLINE_MODEL,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    },
  };
}
