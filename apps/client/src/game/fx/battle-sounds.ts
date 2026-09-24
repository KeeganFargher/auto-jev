import { audio } from "../../audio/engine.js";
import type { SoundId } from "../../audio/catalogue.js";

export type BattleCue = "swing" | "cast" | "hit" | "heal" | "death";

const CUE_SOUNDS: Readonly<Record<BattleCue, SoundId>> = {
  swing: "attack-swing",
  cast: "spell-cast",
  hit: "hit-impact",
  heal: "heal",
  death: "death",
};

export function playBattleCue(cue: BattleCue, pan: number | undefined): void {
  audio.play(CUE_SOUNDS[cue], pan === undefined ? {} : { pan });
}
