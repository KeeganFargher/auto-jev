import type { ReactNode } from "react";
import type { TipSide } from "./placement.js";

export interface TipSpec {
  side: TipSide;
  content: ReactNode;
}

export type TipVia = "pointer" | "focus" | "touch";

export type PendingVia = "pointer" | "touch";

export interface TipTarget<A = HTMLElement> {
  owner: string;
  anchor: A;
  spec: TipSpec;
}

export interface PendingTip<A = HTMLElement> {
  target: TipTarget<A>;
  via: PendingVia;
}

export interface ActiveTip<A = HTMLElement> {
  target: TipTarget<A>;
  via: TipVia;
  entering: boolean;
}

export interface TipState<A = HTMLElement> {
  pending: PendingTip<A> | null;
  active: ActiveTip<A> | null;
  hiddenAt: number;
}

export type TipAction<A = HTMLElement> =
  | { kind: "hover"; target: TipTarget<A> }
  | { kind: "unhover"; owner: string }
  | { kind: "focus"; target: TipTarget<A> }
  | { kind: "blur"; owner: string }
  | { kind: "press"; target: TipTarget<A> }
  | { kind: "unpress" }
  | { kind: "elapse"; anchor: A; attached: boolean }
  | { kind: "respec"; owner: string; spec: TipSpec }
  | { kind: "release"; owner: string }
  | { kind: "hide" };

export const SHOW_DELAY_MS = 160;

export const WARM_MS = 450;

export const LONG_PRESS_MS = 450;

export function idleTip<A = HTMLElement>(): TipState<A> {
  return { pending: null, active: null, hiddenAt: Number.NEGATIVE_INFINITY };
}

function show<A>(state: TipState<A>, target: TipTarget<A>, via: TipVia, now: number): TipState<A> {
  const cold = state.active === null && now - state.hiddenAt >= WARM_MS;

  return {
    pending: null,
    active: { target, via, entering: state.active === null ? cold : state.active.entering },
    hiddenAt: state.hiddenAt,
  };
}

function hide<A>(state: TipState<A>, now: number): TipState<A> {
  if (state.active === null && state.pending === null) {
    return state;
  }

  return { pending: null, active: null, hiddenAt: state.active === null ? state.hiddenAt : now };
}

function owns(held: { target: { owner: string } }, owner: string): boolean {
  return held.target.owner === owner;
}

function withSpec<H extends { target: { spec: TipSpec } }>(held: H, spec: TipSpec): H {
  return { ...held, target: { ...held.target, spec } };
}

export function reduceTip<A>(state: TipState<A>, action: TipAction<A>, now: number): TipState<A> {
  switch (action.kind) {
    case "hover": {
      if (state.active !== null && state.active.target.owner === action.target.owner) {
        return state.pending === null ? state : { ...state, pending: null };
      }

      if (state.active !== null || now - state.hiddenAt < WARM_MS) {
        return show(state, action.target, "pointer", now);
      }

      return { ...state, pending: { target: action.target, via: "pointer" } };
    }

    case "unhover": {
      if (
        state.active !== null &&
        owns(state.active, action.owner) &&
        state.active.via === "pointer"
      ) {
        return hide(state, now);
      }

      if (
        state.pending !== null &&
        owns(state.pending, action.owner) &&
        state.pending.via === "pointer"
      ) {
        return { ...state, pending: null };
      }

      return state;
    }

    case "focus":
      return show(state, action.target, "focus", now);

    case "blur":
      return state.active !== null &&
        owns(state.active, action.owner) &&
        state.active.via === "focus"
        ? hide(state, now)
        : state;

    case "press":
      return { ...state, pending: { target: action.target, via: "touch" } };

    case "unpress":
      return state.pending !== null && state.pending.via === "touch"
        ? { ...state, pending: null }
        : state;

    case "elapse": {
      if (state.pending === null || state.pending.target.anchor !== action.anchor) {
        return state;
      }

      return action.attached
        ? show(state, state.pending.target, state.pending.via, now)
        : { ...state, pending: null };
    }

    case "respec": {
      const active =
        state.active !== null && owns(state.active, action.owner)
          ? withSpec(state.active, action.spec)
          : state.active;

      const pending =
        state.pending !== null && owns(state.pending, action.owner)
          ? withSpec(state.pending, action.spec)
          : state.pending;

      return active === state.active && pending === state.pending
        ? state
        : { ...state, active, pending };
    }

    case "release": {
      if (state.active !== null && owns(state.active, action.owner)) {
        return hide(state, now);
      }

      return state.pending !== null && owns(state.pending, action.owner)
        ? { ...state, pending: null }
        : state;
    }

    case "hide":
      return hide(state, now);
  }
}
