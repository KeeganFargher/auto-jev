import { createStore, type ReadableStore } from "../state/store.js";

export interface Navigation {
  id: number;
  hash: string;
}

export interface NavigationStore extends ReadableStore<Navigation> {
  replaceHash(hash: string): void;
}

export function createNavigationStore(target: Window): NavigationStore {
  const store = createStore<Navigation>({ id: 0, hash: target.location.hash });

  target.addEventListener("hashchange", () => {
    store.update((current) => ({ id: current.id + 1, hash: target.location.hash }));
  });

  return {
    get: store.get,
    subscribe: store.subscribe,

    replaceHash(hash) {
      target.history.replaceState(null, "", hash);
      store.update((current) => ({ ...current, hash }));
    },
  };
}
