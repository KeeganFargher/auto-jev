import { strict as assert } from "node:assert";
import { test } from "node:test";
import { decideVoice, type VoiceRules, type VoiceSlot } from "../src/audio/voice-policy.js";

const HIT: VoiceRules = { maxVoices: 4, cooldownMs: 35, onLimit: "steal-oldest", priority: 0 };

const ABILITY: VoiceRules = { maxVoices: 3, cooldownMs: 80, onLimit: "steal-oldest", priority: 1 };

const CHANNEL_LIMIT = 4;

function voice(soundId: string, startedAt: number, priority: number): VoiceSlot {
  return { soundId, startedAt, priority };
}

test("a full channel gives an ability the oldest hit's slot, never an older ability's", () => {
  const playing = [voice("frozen-orb", 0, 1), voice("hit-blade", 10, 0), voice("swing-light", 20, 0), voice("hex", 30, 1)];

  assert.deepEqual(decideVoice("hailstorm", ABILITY, playing, CHANNEL_LIMIT, undefined, 100), { kind: "steal", victim: playing[1] });
});

test("a hit is dropped when every sound on a full channel outranks it", () => {
  const playing = [voice("frozen-orb", 0, 1), voice("hex", 10, 1), voice("leap", 20, 1), voice("whirlwind", 30, 2)];

  assert.deepEqual(decideVoice("hit-frost", HIT, playing, CHANNEL_LIMIT, undefined, 100), { kind: "skip", reason: "limit" });
});

test("a hit on a channel full of hits takes the oldest one's slot", () => {
  const playing = [voice("hit-blade", 40, 0), voice("swing-light", 10, 0), voice("hit-dark", 30, 0), voice("crit-hit", 20, 0)];

  assert.deepEqual(decideVoice("hit-frost", HIT, playing, CHANNEL_LIMIT, undefined, 100), { kind: "steal", victim: playing[1] });
});

test("a sound's own copy limit applies before the channel's", () => {
  const shard: VoiceRules = { maxVoices: 3, cooldownMs: 70, onLimit: "steal-oldest", priority: 0 };
  const playing = [voice("ice-shard", 0, 0), voice("ice-shard", 50, 0), voice("ice-shard", 90, 0), voice("frozen-orb", 5, 1)];

  assert.deepEqual(decideVoice("ice-shard", shard, playing, CHANNEL_LIMIT, 90, 200), { kind: "steal", victim: playing[0] });
});
