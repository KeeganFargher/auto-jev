import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { BoardStage } from "../../game/views/board-stage.js";
import { createStore, type ReadableStore } from "../../state/store.js";
import { EMPTY_STATS_READING, type StatsReading } from "./stats-format.js";
import { createStatsMonitor, type StatsMonitor } from "./stats-monitor.js";

export function useStatsReadings(
  stage: BoardStage | null,
  visible: boolean,
): ReadableStore<StatsReading> {
  const [readings] = useState(() => createStore(EMPTY_STATS_READING));
  const monitorRef = useRef<StatsMonitor | null>(null);

  const onFrame = useEffectEvent((monitor: StatsMonitor) => {
    monitor.frame(performance.now(), visible);
  });

  useEffect(() => {
    if (stage === null) {
      return;
    }

    const monitor = createStatsMonitor(readings, () => stage.stats(), performance.now());
    monitorRef.current = monitor;
    const stopFrames = stage.onFrame(() => onFrame(monitor));

    return () => {
      stopFrames();
      monitorRef.current = null;
    };
  }, [stage, readings]);

  useEffect(() => {
    if (!visible || monitorRef.current === null) {
      return;
    }

    monitorRef.current.publish(performance.now());
  }, [visible, stage]);

  return readings;
}
