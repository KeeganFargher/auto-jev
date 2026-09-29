import { strict as assert } from "node:assert";
import { test } from "node:test";
import { decideVoice, type VoiceRules, type VoiceSlot } from "../src/audio/voice-policy.js";

const HIT: VoiceRules = { maxVoices: 4, cooldownMs: 35, onLimit: "steal-oldest", priority: 0 };

const HEAVY: VoiceRules = { maxVoices: 3, cooldownMs: 80, onLimit: "steal-oldest", priority: 2 };

const CHANNEL_LIMIT = 4;

function voice(soundId: string, startedAt: number, priority: number): VoiceSlot {
  return { soundId, startedAt, priority };
}

test("a full channel gives a heavy sound the oldest hit's slot, never an older heavy one's", () => {
  const playing = [
    voice("crit-heavy", 0, 2),
    voice("hit-blade", 10, 0),
    voice("swing-light", 20, 0),
    voice("stun", 30, 2),
  ];

  assert.deepEqual(decideVoice("death", HEAVY, playing, CHANNEL_LIMIT, undefined, 100), {
    kind: "steal",
    victim: playing[1],
  });
});

test("a hit is dropped when every sound on a full channel outranks it", () => {
  const playing = [
    voice("crit-heavy", 0, 2),
    voice("stun", 10, 2),
    voice("death", 20, 2),
    voice("battle-start", 30, 3),
  ];

  assert.deepEqual(decideVoice("hit-blunt", HIT, playing, CHANNEL_LIMIT, undefined, 100), {
    kind: "skip",
    reason: "limit",
  });
});

test("a hit on a channel full of hits takes the oldest one's slot", () => {
  const playing = [
    voice("hit-blade", 40, 0),
    voice("swing-light", 10, 0),
    voice("swing-heavy", 30, 0),
    voice("crit-hit", 20, 0),
  ];

  assert.deepEqual(decideVoice("hit-blunt", HIT, playing, CHANNEL_LIMIT, undefined, 100), {
    kind: "steal",
    victim: playing[1],
  });
});

test("a sound's own copy limit applies before the channel's", () => {
  const swing: VoiceRules = { maxVoices: 3, cooldownMs: 70, onLimit: "steal-oldest", priority: 0 };

  const playing = [
    voice("swing-light", 0, 0),
    voice("swing-light", 50, 0),
    voice("swing-light", 90, 0),
    voice("crit-heavy", 5, 2),
  ];

  assert.deepEqual(decideVoice("swing-light", swing, playing, CHANNEL_LIMIT, 90, 200), {
    kind: "steal",
    victim: playing[0],
  });
});
