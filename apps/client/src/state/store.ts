export type Equality<T> = (previous: T, next: T) => boolean;

export interface ReadableStore<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
}

export interface Store<T> extends ReadableStore<T> {
  set(next: T): void;
  update(change: (current: T) => T): void;
}

export function createStore<T>(initial: T, equals: Equality<T> = Object.is): Store<T> {
  let current = initial;
  const listeners = new Set<() => void>();

  function set(next: T): void {
    if (equals(current, next)) {
      return;
    }

    current = next;

    for (const listener of Array.from(listeners)) {
      listener();
    }
  }

  return {
    get() {
      return current;
    },

    set,

    update(change) {
      set(change(current));
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function shallowEqualArrays<T>(previous: readonly T[], next: readonly T[]): boolean {
  return previous.length === next.length && previous.every((item, index) => item === next[index]);
}
