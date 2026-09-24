const URGENT_SECONDS = 3;

export interface Countdown {
  dispose(): void;
}

export function createCountdown(target: HTMLElement, seconds: number, onExpire: () => void, onTick?: (remaining: number) => void): Countdown {
  let remaining = seconds;

  function render(): void {
    target.textContent = String(remaining);
    target.classList.toggle("is-urgent", remaining <= URGENT_SECONDS);
  }

  function clear(): void {
    target.textContent = "";
    target.classList.remove("is-urgent");
  }

  render();

  const interval = setInterval(() => {
    remaining -= 1;

    if (remaining <= 0) {
      clearInterval(interval);
      clear();
      onExpire();

      return;
    }

    render();
    onTick?.(remaining);
  }, 1000);

  return {
    dispose() {
      clearInterval(interval);
      clear();
    },
  };
}
