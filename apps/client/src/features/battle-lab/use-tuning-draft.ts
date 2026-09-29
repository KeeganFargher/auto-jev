import { useState } from "react";
import type { BattleLabSession, LabFight, LabTeams } from "../../session/types.js";
import { parseSeed } from "./lab-fights.js";

export interface TuningDraft {
  teams: LabTeams;
  seedText: string;
  setTeams(teams: LabTeams): void;
  setSeedText(text: string): void;
  toFight(): LabFight;
}

export function useTuningDraft(session: BattleLabSession): TuningDraft {
  const [tracked, setTracked] = useState(session);
  const [teams, setTeams] = useState(session.fight().teams);
  const [seedText, setSeedText] = useState(String(session.fight().seed));

  if (tracked !== session) {
    setTracked(session);
    setTeams(session.fight().teams);
    setSeedText(String(session.fight().seed));
  }

  return {
    teams,
    seedText,
    setTeams,
    setSeedText,
    toFight: () => ({ seed: parseSeed(seedText), teams }),
  };
}
