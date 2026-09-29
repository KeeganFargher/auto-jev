import { useMemo, useSyncExternalStore } from "react";
import type { Equality, ReadableStore } from "./store.js";

interface Memo<T, S> {
  value: T;
  selected: S;
}

export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function useStoreSelector<T, S>(
  store: ReadableStore<T>,
  select: (value: T) => S,
  equals: Equality<S> = Object.is,
): S {
  const read = useMemo(() => {
    let memo: Memo<T, S> | null = null;

    return (): S => {
      const value = store.get();

      if (memo !== null && memo.value === value) {
        return memo.selected;
      }

      const selected = select(value);

      if (memo !== null && equals(memo.selected, selected)) {
        memo = { value, selected: memo.selected };

        return memo.selected;
      }

      memo = { value, selected };

      return selected;
    };
  }, [store, select, equals]);

  return useSyncExternalStore(store.subscribe, read);
}
