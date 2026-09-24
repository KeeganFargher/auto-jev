export interface FrameSampler {
  record(now: number): void;
  averageMs(): number;
  worstMs(): number;
}

export function createFrameSampler(size: number, start: number): FrameSampler {
  const intervals: number[] = [];
  let last = start;

  return {
    record(now) {
      intervals.push(now - last);
      last = now;

      if (intervals.length > size) {
        intervals.shift();
      }
    },

    averageMs() {
      return intervals.length === 0 ? 0 : intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    },

    worstMs() {
      return Math.max(0, ...intervals);
    },
  };
}
