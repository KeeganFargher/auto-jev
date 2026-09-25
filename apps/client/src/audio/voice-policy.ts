export type LimitBehaviour = "steal-oldest" | "skip";

export interface VoiceRules {
  maxVoices: number;
  cooldownMs: number;
  onLimit: LimitBehaviour;
  priority: number;
}

export interface VoiceSlot {
  soundId: string;
  startedAt: number;
  priority: number;
}

export type VoiceDecision<V extends VoiceSlot> =
  | { kind: "play" }
  | { kind: "skip"; reason: "cooldown" | "limit" }
  | { kind: "steal"; victim: V };

function oldest<V extends VoiceSlot>(voices: readonly V[]): V {
  return voices.reduce((first, voice) => (voice.startedAt < first.startedAt ? voice : first));
}

export function decideVoice<V extends VoiceSlot>(
  soundId: string,
  rules: VoiceRules,
  active: readonly V[],
  globalLimit: number,
  lastStartedAt: number | undefined,
  now: number,
): VoiceDecision<V> {
  if (lastStartedAt !== undefined && now - lastStartedAt < rules.cooldownMs) {
    return { kind: "skip", reason: "cooldown" };
  }

  const same = active.filter((voice) => voice.soundId === soundId);

  if (same.length >= rules.maxVoices) {
    return rules.onLimit === "skip" ? { kind: "skip", reason: "limit" } : { kind: "steal", victim: oldest(same) };
  }

  if (active.length >= globalLimit) {
    const yielding = active.filter((voice) => voice.priority <= rules.priority);

    if (yielding.length === 0) {
      return { kind: "skip", reason: "limit" };
    }

    const lowest = Math.min(...yielding.map((voice) => voice.priority));

    return { kind: "steal", victim: oldest(yielding.filter((voice) => voice.priority === lowest)) };
  }

  return { kind: "play" };
}
