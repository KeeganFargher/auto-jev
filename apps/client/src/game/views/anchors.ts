export interface Anchors<P> {
  place(key: string, payload: P): void;
  release(key: string): void;
  follow(key: string, listener: (payload: P) => void): () => void;
  clear(): void;
}

export function createAnchors<P>(): Anchors<P> {
  const latest = new Map<string, P>();
  const followers = new Map<string, Set<(payload: P) => void>>();

  return {
    place(key, payload) {
      latest.set(key, payload);

      for (const listener of followers.get(key) ?? []) {
        listener(payload);
      }
    },

    release(key) {
      latest.delete(key);
    },

    follow(key, listener) {
      const listeners = followers.get(key) ?? new Set();
      listeners.add(listener);
      followers.set(key, listeners);
      const known = latest.get(key);

      if (known !== undefined) {
        listener(known);
      }

      return () => {
        listeners.delete(listener);

        if (listeners.size === 0) {
          followers.delete(key);
        }
      };
    },

    clear() {
      latest.clear();
    },
  };
}
