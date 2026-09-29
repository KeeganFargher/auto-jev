import { LAB_PRESETS } from "@jev-game/content";
import { useState } from "react";
import type { BattleLabSession, LabFight } from "../../session/types.js";
import { CUSTOM_PRESET_ID, presetFor, teamsOfPreset } from "./lab-fights.js";
import { parseFight, serializeFight } from "./scenario.js";
import { TeamPicker } from "./team-picker.js";
import type { TuningDraft } from "./use-tuning-draft.js";

export function LabTuning({
  session,
  draft,
  onFight,
}: {
  session: BattleLabSession;
  draft: TuningDraft;
  onFight: (fight: LabFight) => void;
}) {
  const [scenarioText, setScenarioText] = useState("");
  const [error, setError] = useState("");
  const preset = presetFor(draft.teams);

  function exportScenario(): void {
    setError("");
    setScenarioText(serializeFight(session.fight()));
  }

  function importScenario(): void {
    let fight: LabFight;

    try {
      fight = parseFight(scenarioText);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));

      return;
    }

    setError("");
    onFight(fight);
  }

  return (
    <details className="hud-tuning">
      <summary>tuning</summary>
      <div className="hud-tuning-body">
        <div className="hud-fields">
          <label className="hud-field">
            <span>preset</span>
            <select
              value={preset?.id ?? CUSTOM_PRESET_ID}
              onChange={(event) => {
                if (event.target.value !== CUSTOM_PRESET_ID) {
                  draft.setTeams(teamsOfPreset(event.target.value));
                }
              }}
            >
              {LAB_PRESETS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
              <option value={CUSTOM_PRESET_ID}>custom teams</option>
            </select>
          </label>
          <label className="hud-field">
            <span>seed</span>
            <input
              type="number"
              step={1}
              value={draft.seedText}
              onChange={(event) => draft.setSeedText(event.target.value)}
            />
          </label>
        </div>
        <p className="hud-note">{preset?.description ?? "Hand-picked teams."}</p>
        <TeamPicker teams={draft.teams} onChange={draft.setTeams} />
        <textarea
          className="hud-scenario-text"
          rows={4}
          spellCheck={false}
          value={scenarioText}
          onChange={(event) => setScenarioText(event.target.value)}
        />
        <div className="hud-row">
          <button type="button" onClick={exportScenario}>
            export
          </button>
          <button type="button" onClick={importScenario}>
            import
          </button>
        </div>
        <p className="hud-error">{error}</p>
      </div>
    </details>
  );
}
