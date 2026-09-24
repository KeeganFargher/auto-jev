export interface HealthTrail {
  update(hp: number, snap: boolean): void;
  step(deltaSeconds: number): void;
}

const HOLD_SECONDS = 0.4;

const MAX_HOLD_SECONDS = 1;

const DRAIN_RATE = 6;

const MIN_DRAIN_PER_SECOND = 0.2;

export function createHealthTrail(element: HTMLElement, hp: number): HealthTrail {
  let shown = hp;
  let value = hp;
  let age = 0;
  let quiet = 0;
  let drawn = "";

  function draw(): void {
    const width = `${(value * 100).toFixed(1)}%`;

    if (width !== drawn) {
      drawn = width;
      element.style.width = width;
    }
  }

  draw();

  return {
    update(next, snap) {
      if (snap || next >= value) {
        value = next;
      } else if (next < shown) {
        if (value <= shown) {
          age = 0;
        }

        quiet = 0;
      }

      shown = next;
      draw();
    },

    step(deltaSeconds) {
      if (value <= shown) {
        return;
      }

      age += deltaSeconds;
      quiet += deltaSeconds;

      if (quiet < HOLD_SECONDS && age < MAX_HOLD_SECONDS) {
        return;
      }

      const drain = Math.max((value - shown) * (1 - Math.exp(-DRAIN_RATE * deltaSeconds)), MIN_DRAIN_PER_SECOND * deltaSeconds);
      value = Math.max(shown, value - drain);
      draw();
    },
  };
}
