import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { EnvironmentTheme } from "../../game/environments/environment.js";
import { ENVIRONMENT_THEMES } from "../../game/environments/themes/index.js";
import type { BoardStage } from "../../game/views/board-stage.js";
import { runLeakTest, type LeakTestHost } from "./leak-test.js";

export interface LeakTest {
  note: string;
  start(home: EnvironmentTheme): void;
}

export function useLeakTest(
  stage: BoardStage | null,
  showTheme: (theme: EnvironmentTheme) => void,
): LeakTest {
  const [note, setNote] = useState("");
  const running = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  function start(home: EnvironmentTheme): void {
    if (stage === null) {
      throw new Error("The leak test was started before the board stage existed");
    }

    if (running.current) {
      return;
    }

    running.current = true;

    const host: LeakTestHost<EnvironmentTheme> = {
      onFrame: (listener) => stage.onFrame(listener),
      stats: () => stage.stats(),
      show: (next) => {
        flushSync(() => showTheme(next));
      },
      isActive: () => mounted.current,
      report: setNote,
    };

    void runLeakTest(host, ENVIRONMENT_THEMES, home).finally(() => {
      running.current = false;
    });
  }

  return { note, start };
}
