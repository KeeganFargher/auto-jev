import { useEffect } from "react";
import { MUSIC_FOR_SCREEN } from "../../../audio/catalogue.js";
import { useAudio } from "../../../hooks/use-audio.js";
import { useStoreSelector } from "../../../state/use-store.js";
import { musicScreenOf } from "../model/screen-mode.js";
import type { MatchController } from "../state/match-controller.js";

export function useMatchAudio(controller: MatchController): void {
  const audio = useAudio();
  const screen = useStoreSelector(controller.state, musicScreenOf);

  useEffect(() => {
    void audio.preload("battle");

    return () => audio.setMusic(null);
  }, [audio]);

  useEffect(() => {
    audio.setMusic(MUSIC_FOR_SCREEN[screen]);
  }, [audio, screen]);
}
