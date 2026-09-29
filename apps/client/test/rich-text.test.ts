import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseRichText } from "../src/ui/tooltip/rich-text.js";

test("numbers, units and status words are split out of the surrounding text", () => {
  assert.deepEqual(parseRichText("Deals 12 damage, 50% burning for 2 s"), [
    { kind: "text", text: "Deals " },
    { kind: "number", text: "12" },
    { kind: "text", text: " damage, " },
    { kind: "number", text: "50%" },
    { kind: "text", text: " " },
    { kind: "status", text: "burning", status: "burning" },
    { kind: "text", text: " for " },
    { kind: "number", text: "2 s" },
  ]);
});

test("status words match regardless of case and keep the original spelling", () => {
  assert.deepEqual(parseRichText("Airborne foes"), [
    { kind: "status", text: "Airborne", status: "airborne" },
    { kind: "text", text: " foes" },
  ]);
});

test("text without tokens comes back as a single text part", () => {
  assert.deepEqual(parseRichText("Charges forward"), [{ kind: "text", text: "Charges forward" }]);
});

test("empty text has no parts", () => {
  assert.deepEqual(parseRichText(""), []);
});

test("signed and multiplied values stay attached to their numbers", () => {
  assert.deepEqual(parseRichText("+3 cells and ×2"), [
    { kind: "number", text: "+3 cells" },
    { kind: "text", text: " and " },
    { kind: "number", text: "×2" },
  ]);
});
