import { strict as assert } from "node:assert";
import { test } from "node:test";
import { placeTip, TIP_GAP, TIP_MARGIN, type Box } from "../src/ui/tooltip/placement.js";

const VIEWPORT = { width: 1000, height: 800 };

const TIP = { width: 100, height: 50 };

function boxAt(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

test("a tip takes its preferred side when it fits", () => {
  const anchor = boxAt(500, 300, 40, 40);
  const placement = placeTip("left", anchor, anchor, TIP, VIEWPORT);

  assert.deepEqual(placement, { x: 500 - TIP_GAP - TIP.width, y: 300, side: "left" });
});

test("a tip flips to the opposite side when the preferred one runs off screen", () => {
  const anchor = boxAt(50, 300, 40, 40);
  const placement = placeTip("left", anchor, anchor, TIP, VIEWPORT);

  assert.equal(placement.side, "right");
  assert.equal(placement.x, anchor.right + TIP_GAP);
});

test("a top tip flips below the anchor near the top edge", () => {
  const anchor = boxAt(500, 20, 40, 40);
  const placement = placeTip("top", anchor, anchor, TIP, VIEWPORT);

  assert.equal(placement.side, "bottom");
  assert.equal(placement.y, anchor.bottom + TIP_GAP);
});

test("a side tip is measured from the edge box rather than the anchor", () => {
  const anchor = boxAt(500, 300, 40, 40);
  const edge = boxAt(400, 300, 200, 40);
  const placement = placeTip("right", anchor, edge, TIP, VIEWPORT);

  assert.equal(placement.x, edge.right + TIP_GAP);
});

test("the tip is clamped inside the viewport margin", () => {
  const anchor = boxAt(500, 790, 40, 40);
  const placement = placeTip("left", anchor, anchor, TIP, VIEWPORT);

  assert.equal(placement.y, VIEWPORT.height - TIP_MARGIN - TIP.height);
});

test("a tip larger than the viewport pins to the margin instead of going negative", () => {
  const anchor = boxAt(20, 10, 10, 10);
  const placement = placeTip("left", anchor, anchor, TIP, { width: 100, height: 40 });

  assert.equal(placement.x, TIP_MARGIN);
  assert.equal(placement.y, TIP_MARGIN);
});
