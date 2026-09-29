import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { useStoreSelector } from "../../state/use-store.js";
import type { TipAction, TipSpec, TipState, TipTarget } from "./tip-state.js";
import { TIP_ID, useTooltip } from "./tooltip-context.js";

export interface TipTrigger {
  "data-tip-id"?: string | undefined;
  "aria-describedby"?: string | undefined;
  onPointerEnter?: ((event: PointerEvent<HTMLElement>) => void) | undefined;
  onPointerLeave?: ((event: PointerEvent<HTMLElement>) => void) | undefined;
  onPointerDown?: ((event: PointerEvent<HTMLElement>) => void) | undefined;
  onPointerUp?: (() => void) | undefined;
  onPointerCancel?: (() => void) | undefined;
  onFocus?: ((event: FocusEvent<HTMLElement>) => void) | undefined;
  onBlur?: ((event: FocusEvent<HTMLElement>) => void) | undefined;
}

type TipHandlers = Omit<TipTrigger, "data-tip-id" | "aria-describedby">;

const NO_TIP: TipTrigger = {};

function targetOf(
  owner: string,
  anchor: HTMLElement,
  latest: RefObject<TipSpec | null>,
): TipTarget {
  const spec = latest.current;

  if (spec === null) {
    throw new Error("A tip trigger fired an event while it had no tip to show");
  }

  return { owner, anchor, spec };
}

function createHandlers(
  dispatch: (action: TipAction) => void,
  owner: string,
  latest: RefObject<TipSpec | null>,
): TipHandlers {
  return {
    onPointerEnter(event) {
      if (event.pointerType !== "touch") {
        dispatch({ kind: "hover", target: targetOf(owner, event.currentTarget, latest) });
      }
    },

    onPointerLeave(event) {
      if (event.pointerType !== "touch") {
        dispatch({ kind: "unhover", owner });
      }
    },

    onPointerDown(event) {
      if (event.pointerType === "touch") {
        dispatch({ kind: "press", target: targetOf(owner, event.currentTarget, latest) });
      }
    },

    onPointerUp() {
      dispatch({ kind: "unpress" });
    },

    onPointerCancel() {
      dispatch({ kind: "unpress" });
    },

    onFocus(event) {
      if (event.target === event.currentTarget && event.currentTarget.matches(":focus-visible")) {
        dispatch({ kind: "focus", target: targetOf(owner, event.currentTarget, latest) });
      }
    },

    onBlur(event) {
      if (event.target === event.currentTarget) {
        dispatch({ kind: "blur", owner });
      }
    },
  };
}

export function useTip(spec: TipSpec | null): TipTrigger {
  const tooltip = useTooltip();
  const owner = useId();
  const latest = useRef(spec);
  const { dispatch } = tooltip;

  const selectDescribing = useCallback(
    (state: TipState) => state.active !== null && state.active.target.owner === owner,
    [owner],
  );

  const describing = useStoreSelector(tooltip.state, selectDescribing);

  useLayoutEffect(() => {
    latest.current = spec;

    if (spec === null) {
      dispatch({ kind: "release", owner });
    } else {
      dispatch({ kind: "respec", owner, spec });
    }
  });

  useEffect(() => () => dispatch({ kind: "release", owner }), [dispatch, owner]);

  const handlers = useMemo(() => createHandlers(dispatch, owner, latest), [dispatch, owner]);
  const enabled = spec !== null;

  return useMemo(
    () =>
      enabled
        ? { ...handlers, "data-tip-id": owner, "aria-describedby": describing ? TIP_ID : undefined }
        : NO_TIP,
    [enabled, handlers, owner, describing],
  );
}
