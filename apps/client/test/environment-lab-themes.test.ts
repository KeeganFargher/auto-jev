import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolveTheme } from "../src/features/environment-lab/theme-selection.js";

const COVE = { id: "cove" };

const RUINS = { id: "ruins" };

const THEMES = [COVE, RUINS];

test("no requested theme means the player's saved board", () => {
  assert.equal(resolveTheme(THEMES, null, RUINS), RUINS);
});

test("a requested theme wins over the saved board", () => {
  assert.equal(resolveTheme(THEMES, "cove", RUINS), COVE);
});

test("an unknown requested theme throws and names the ids that exist", () => {
  assert.throws(
    () => resolveTheme(THEMES, "swamp", RUINS),
    /Unknown board theme "swamp".*cove, ruins/,
  );
});

test("an empty requested theme is unknown rather than treated as no request", () => {
  assert.throws(() => resolveTheme(THEMES, "", RUINS), /Unknown board theme ""/);
});
