import { strict as assert } from "node:assert";
import { test } from "node:test";
import { classNames } from "../src/ui/class-names.js";

test("class names join the truthy names and drop the false ones", () => {
  assert.equal(classNames("env-card", false, "is-saved"), "env-card is-saved");
  assert.equal(classNames("env-card", false, false), "env-card");
});
