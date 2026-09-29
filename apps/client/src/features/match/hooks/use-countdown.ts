import { useEffectEvent, useLayoutEffect, useState } from "react";
import { useAudio } from "../../../hooks/use-audio.js";
import { secondsUntil, URGENT_SECONDS } from "../model/match-model.js";
import { createCountdown } from "../state/countdown.js";

export interface PlateTimer {
  timer: string;
  urgent: boolean;
}

interface Reading {
  epoch: number;
  remaining: number | null;
}

const STOPPED: PlateTimer = { timer: "", urgent: false };

export function useCountdown(epoch: number | null, deadline: number | null): PlateTimer {
  const audio = useAudio();
  const [reading, setReading] = useState<Reading | null>(null);

  const tick = useEffectEvent((remaining: number) => {
    if (remaining <= URGENT_SECONDS) {
      audio.play("countdown-tick");
    }
  });

  const seconds = useEffectEvent(() => {
    if (deadline === null) {
      throw new Error("A countdown phase arrived without a deadline");
    }

    return secondsUntil(deadline, Date.now());
  });

  useLayoutEffect(() => {
    if (epoch === null) {
      return;
    }

    const countdown = createCountdown(seconds(), {
      onChange: (remaining) => setReading({ epoch, remaining }),
      onTick: tick,
    });

    return () => countdown.dispose();
  }, [epoch]);

  if (epoch === null || reading === null || reading.epoch !== epoch || reading.remaining === null) {
    return STOPPED;
  }

  return { timer: String(reading.remaining), urgent: reading.remaining <= URGENT_SECONDS };
}
