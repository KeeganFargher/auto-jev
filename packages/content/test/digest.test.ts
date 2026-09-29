import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { sha256Hex } from "../src/index.js";

function nodeSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

test("SHA-256 matches the published test vectors", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
});

test("SHA-256 matches node crypto at every padding boundary", () => {
  for (let length = 0; length <= 200; length += 1) {
    const text = Array.from({ length }, (_, index) =>
      String.fromCharCode(33 + ((index * 7 + length) % 90)),
    ).join("");

    assert.equal(sha256Hex(text), nodeSha256(text), `length ${length}`);
  }
});

test("SHA-256 hashes the UTF-8 bytes of non-ASCII text", () => {
  for (const text of ["héllo wörld", "火の玉 🔥💥", "\u0000￿", "🫧".repeat(40)]) {
    assert.equal(sha256Hex(text), nodeSha256(text), text);
  }
});

test("SHA-256 handles a long multi-block message", () => {
  const text = JSON.stringify(
    Array.from({ length: 5000 }, (_, index) => ({ index, x: index / 7 })),
  );

  assert.equal(sha256Hex(text), nodeSha256(text));
});
