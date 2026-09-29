import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  idleTip,
  reduceTip,
  WARM_MS,
  type TipAction,
  type TipState,
  type TipTarget,
} from "../src/ui/tooltip/tip-state.js";

function targetFor(owner: string): TipTarget<string> {
  return { owner, anchor: `${owner}-anchor`, spec: { side: "left", content: `${owner}-content` } };
}

function run(actions: readonly TipAction<string>[], times: readonly number[]): TipState<string> {
  let state = idleTip<string>();

  actions.forEach((action, index) => {
    const now = times[index];

    if (now === undefined) {
      throw new Error(`Action ${index} has no timestamp`);
    }

    state = reduceTip(state, action, now);
  });

  return state;
}

function activeOwner(state: TipState<string>): string | null {
  return state.active === null ? null : state.active.target.owner;
}

test("hovering a cold trigger waits for the delay before showing", () => {
  const hovered = run([{ kind: "hover", target: targetFor("a") }], [10_000]);

  assert.equal(hovered.active, null);
  assert.equal(hovered.pending?.target.owner, "a");
  assert.equal(hovered.pending?.via, "pointer");

  const shown = reduceTip(hovered, { kind: "elapse", anchor: "a-anchor", attached: true }, 10_160);

  assert.equal(activeOwner(shown), "a");
  assert.equal(shown.active?.via, "pointer");
  assert.equal(shown.active?.entering, true);
  assert.equal(shown.pending, null);
});

test("switching triggers while a tip shows is instant and keeps the entrance state", () => {
  const switched = run(
    [
      { kind: "hover", target: targetFor("a") },
      { kind: "elapse", anchor: "a-anchor", attached: true },
      { kind: "hover", target: targetFor("b") },
    ],
    [10_000, 10_160, 10_300],
  );

  assert.equal(activeOwner(switched), "b");
  assert.equal(switched.active?.entering, true);
  assert.equal(switched.pending, null);
});

test("a tip that appears inside the warm window shows at once without the entrance", () => {
  const state = run(
    [
      { kind: "hover", target: targetFor("a") },
      { kind: "elapse", anchor: "a-anchor", attached: true },
      { kind: "unhover", owner: "a" },
      { kind: "hover", target: targetFor("b") },
    ],
    [10_000, 10_160, 10_500, 10_500 + WARM_MS - 1],
  );

  assert.equal(activeOwner(state), "b");
  assert.equal(state.active?.entering, false);
});

test("a tip hidden longer than the warm window waits for the delay again", () => {
  const state = run(
    [
      { kind: "hover", target: targetFor("a") },
      { kind: "elapse", anchor: "a-anchor", attached: true },
      { kind: "unhover", owner: "a" },
      { kind: "hover", target: targetFor("b") },
    ],
    [10_000, 10_160, 10_500, 10_500 + WARM_MS],
  );

  assert.equal(state.active, null);
  assert.equal(state.pending?.target.owner, "b");
});

test("leaving a trigger cancels its pending tip and hides its shown tip", () => {
  const pending = run(
    [
      { kind: "hover", target: targetFor("a") },
      { kind: "unhover", owner: "a" },
    ],
    [10_000, 10_050],
  );

  assert.equal(pending.pending, null);
  assert.equal(pending.active, null);

  const hidden = run(
    [
      { kind: "hover", target: targetFor("a") },
      { kind: "elapse", anchor: "a-anchor", attached: true },
      { kind: "unhover", owner: "a" },
    ],
    [10_000, 10_160, 10_400],
  );

  assert.equal(hidden.active, null);
  assert.equal(hidden.hiddenAt, 10_400);
});

test("leaving a different trigger leaves the shown tip alone", () => {
  const shown = run(
    [
      { kind: "hover", target: targetFor("a") },
      { kind: "elapse", anchor: "a-anchor", attached: true },
    ],
    [10_000, 10_160],
  );

  assert.equal(reduceTip(shown, { kind: "unhover", owner: "b" }, 10_200), shown);
});

test("keyboard focus shows at once and pointer leave does not hide it", () => {
  const focused = run([{ kind: "focus", target: targetFor("a") }], [10_000]);

  assert.equal(activeOwner(focused), "a");
  assert.equal(focused.active?.via, "focus");
  assert.equal(focused.active?.entering, true);
  assert.equal(reduceTip(focused, { kind: "unhover", owner: "a" }, 10_100), focused);
});

test("blur hides only the focused trigger's own focus tip", () => {
  const focused = run([{ kind: "focus", target: targetFor("a") }], [10_000]);

  assert.equal(reduceTip(focused, { kind: "blur", owner: "b" }, 10_100), focused);
  assert.equal(reduceTip(focused, { kind: "blur", owner: "a" }, 10_100).active, null);

  const hovered = run(
    [
      { kind: "hover", target: targetFor("a") },
      { kind: "elapse", anchor: "a-anchor", attached: true },
    ],
    [10_000, 10_160],
  );

  assert.equal(reduceTip(hovered, { kind: "blur", owner: "a" }, 10_300), hovered);
});

test("a long press waits for its own delay and lifting the finger cancels it", () => {
  const pressed = run([{ kind: "press", target: targetFor("a") }], [10_000]);

  assert.equal(pressed.pending?.via, "touch");
  assert.equal(pressed.active, null);
  assert.equal(reduceTip(pressed, { kind: "unpress" }, 10_100).pending, null);

  const shown = reduceTip(pressed, { kind: "elapse", anchor: "a-anchor", attached: true }, 10_450);

  assert.equal(shown.active?.via, "touch");
});

test("lifting a mouse button does not cancel a pending hover", () => {
  const hovered = run([{ kind: "hover", target: targetFor("a") }], [10_000]);

  assert.equal(reduceTip(hovered, { kind: "unpress" }, 10_050), hovered);
});

test("an elapsed timer for a detached anchor shows nothing", () => {
  const hovered = run([{ kind: "hover", target: targetFor("a") }], [10_000]);

  const elapsed = reduceTip(
    hovered,
    { kind: "elapse", anchor: "a-anchor", attached: false },
    10_160,
  );

  assert.equal(elapsed.active, null);
  assert.equal(elapsed.pending, null);
});

test("an elapsed timer for a stale anchor is ignored", () => {
  const hovered = run([{ kind: "hover", target: targetFor("b") }], [10_000]);

  assert.equal(
    reduceTip(hovered, { kind: "elapse", anchor: "a-anchor", attached: true }, 10_160),
    hovered,
  );
});

test("respec swaps the content of the shown and pending tips of that trigger only", () => {
  const shown = run(
    [
      { kind: "hover", target: targetFor("a") },
      { kind: "elapse", anchor: "a-anchor", attached: true },
    ],
    [10_000, 10_160],
  );

  const respecced = reduceTip(
    shown,
    { kind: "respec", owner: "a", spec: { side: "right", content: "fresh" } },
    10_200,
  );

  assert.equal(respecced.active?.target.spec.content, "fresh");
  assert.equal(respecced.active?.target.spec.side, "right");
  assert.equal(respecced.active?.entering, shown.active?.entering);

  const untouched = reduceTip(
    shown,
    { kind: "respec", owner: "b", spec: { side: "top", content: "other" } },
    10_200,
  );

  assert.equal(untouched, shown);

  const pending = run([{ kind: "hover", target: targetFor("a") }], [10_000]);

  const pendingRespecced = reduceTip(
    pending,
    { kind: "respec", owner: "a", spec: { side: "top", content: "fresh" } },
    10_050,
  );

  assert.equal(pendingRespecced.pending?.target.spec.content, "fresh");
});

test("releasing a trigger hides its tip and drops its pending tip", () => {
  const shown = run(
    [
      { kind: "hover", target: targetFor("a") },
      { kind: "elapse", anchor: "a-anchor", attached: true },
    ],
    [10_000, 10_160],
  );

  assert.equal(reduceTip(shown, { kind: "release", owner: "b" }, 10_300), shown);
  assert.equal(reduceTip(shown, { kind: "release", owner: "a" }, 10_300).active, null);

  const pending = run([{ kind: "hover", target: targetFor("a") }], [10_000]);

  assert.equal(reduceTip(pending, { kind: "release", owner: "a" }, 10_050).pending, null);
});

test("hiding an idle tooltip changes nothing and hiding a shown one starts the warm window", () => {
  const idle = idleTip<string>();

  assert.equal(reduceTip(idle, { kind: "hide" }, 10_000), idle);

  const shown = run([{ kind: "focus", target: targetFor("a") }], [10_000]);
  const hidden = reduceTip(shown, { kind: "hide" }, 10_400);

  assert.equal(hidden.active, null);
  assert.equal(hidden.hiddenAt, 10_400);
});
