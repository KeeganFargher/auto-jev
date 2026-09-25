import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setText } from "../src/hud/dom.js";

interface TextHolder {
  textContent: string | null;
}

interface CountedText {
  node: TextHolder;
  writes: () => number;
}

function countingText(initial: string): CountedText {
  let text: string | null = initial;
  let writes = 0;

  return {
    node: {
      get textContent() {
        return text;
      },
      set textContent(next) {
        writes += 1;
        text = next;
      },
    },
    writes: () => writes,
  };
}

test("setting the text an element already shows leaves the element untouched", () => {
  const timer = countingText("12");
  setText(timer.node, "12");

  assert.equal(timer.writes(), 0);
});

test("setting new text replaces what the element shows", () => {
  const timer = countingText("12");
  setText(timer.node, "11");

  assert.equal(timer.writes(), 1);
  assert.equal(timer.node.textContent, "11");
});
