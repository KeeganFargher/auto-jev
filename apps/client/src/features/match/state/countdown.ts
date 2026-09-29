export interface Countdown {
  dispose(): void;
}

export interface CountdownHandlers {
  onChange: (remaining: number | null) => void;
  onTick?: (remaining: number) => void;
  onExpire?: () => void;
}

export function createCountdown(seconds: number, handlers: CountdownHandlers): Countdown {
  if (!Number.isInteger(seconds) || seconds < 1) {
    throw new Error(`A countdown needs a whole number of seconds, got ${seconds}`);
  }

  let remaining = seconds;
  handlers.onChange(remaining);

  const interval = setInterval(() => {
    remaining -= 1;

    if (remaining <= 0) {
      clearInterval(interval);
      handlers.onChange(null);
      handlers.onExpire?.();

      return;
    }

    handlers.onChange(remaining);
    handlers.onTick?.(remaining);
  }, 1000);

  return {
    dispose() {
      clearInterval(interval);
      handlers.onChange(null);
    },
  };
}
