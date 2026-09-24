import { JevProviderFailure, type JevProvider } from "./types.js";

export const DEFAULT_PROVIDER_CONCURRENCY = 4;

export interface ProviderLoad {
  active: number;
  queued: number;
  peakActive: number;
  calls: number;
}

export interface LimitedProvider extends JevProvider {
  load(): ProviderLoad;
}

interface Waiter {
  start: () => void;
  signal: AbortSignal;
}

export function limitProvider(inner: JevProvider, concurrency: number): LimitedProvider {
  const waiting: Waiter[] = [];
  let active = 0;
  let peakActive = 0;
  let calls = 0;

  function release(): void {
    active -= 1;

    for (let next = waiting.shift(); next !== undefined; next = waiting.shift()) {
      if (!next.signal.aborted) {
        next.start();

        return;
      }
    }
  }

  function acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      return Promise.reject(new JevProviderFailure("aborted", "the request was aborted before it started"));
    }

    if (active < concurrency) {
      active += 1;
      peakActive = Math.max(peakActive, active);

      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        signal,
        start: () => {
          signal.removeEventListener("abort", onAbort);
          active += 1;
          peakActive = Math.max(peakActive, active);
          resolve();
        },
      };

      function onAbort(): void {
        const index = waiting.indexOf(waiter);

        if (index !== -1) {
          waiting.splice(index, 1);
        }

        reject(new JevProviderFailure("aborted", "the request was aborted while queued"));
      }

      signal.addEventListener("abort", onAbort, { once: true });
      waiting.push(waiter);
    });
  }

  return {
    source: inner.source,
    model: inner.model,

    load() {
      return { active, queued: waiting.length, peakActive, calls };
    },

    async choose(question, signal) {
      await acquire(signal);
      calls += 1;

      try {
        return await inner.choose(question, signal);
      } finally {
        release();
      }
    },
  };
}
