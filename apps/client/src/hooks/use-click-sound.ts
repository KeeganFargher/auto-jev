import { useEffect } from "react";
import { useAudio } from "./use-audio.js";

const CLICK_ALREADY_VOICED_MS = 30;

const CLICK_TARGETS = "button, .menu-link, .pill-button";

export function useClickSound(): void {
  const audio = useAudio();

  useEffect(() => {
    function handleClick(event: MouseEvent): void {
      const voiced = performance.now() - audio.lastEffectAt() < CLICK_ALREADY_VOICED_MS;

      if (
        !voiced &&
        event.target instanceof Element &&
        event.target.closest(CLICK_TARGETS) !== null
      ) {
        audio.play("ui-click");
      }
    }

    document.addEventListener("click", handleClick);

    return () => document.removeEventListener("click", handleClick);
  }, [audio]);
}
