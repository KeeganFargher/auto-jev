import { MAX_LAB_TEAM_SIZE } from "@jev-game/content";
import { heroName } from "../../game/catalogues.js";
import type { LabTeams } from "../../session/types.js";
import { editTeam, LAB_HEROES, TEAM_SIDES, type TeamSide } from "./lab-fights.js";

function TeamRow({
  side,
  teams,
  onChange,
}: {
  side: TeamSide;
  teams: LabTeams;
  onChange: (teams: LabTeams) => void;
}) {
  const team = teams[side];

  return (
    <div className="hud-team-row">
      <span className="hud-team-caption">
        team {side.toUpperCase()} · {team.length}/{MAX_LAB_TEAM_SIZE}
      </span>
      {team.map((heroId, index) => (
        <button
          key={`${heroId}-${index}`}
          type="button"
          className="hud-chip is-active"
          title="Remove from the team"
          disabled={team.length === 1}
          onClick={() =>
            onChange(
              editTeam(
                teams,
                side,
                team.filter((_, memberIndex) => memberIndex !== index),
              ),
            )
          }
        >
          {heroName(heroId)} ✕
        </button>
      ))}
      <div className="hud-team-add">
        {LAB_HEROES.map((heroId) => (
          <button
            key={heroId}
            type="button"
            className="hud-chip"
            disabled={team.length >= MAX_LAB_TEAM_SIZE}
            onClick={() => onChange(editTeam(teams, side, [...team, heroId]))}
          >
            + {heroName(heroId)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TeamPicker({
  teams,
  onChange,
}: {
  teams: LabTeams;
  onChange: (teams: LabTeams) => void;
}) {
  return (
    <div className="hud-team-picker">
      {TEAM_SIDES.map((side) => (
        <TeamRow key={side} side={side} teams={teams} onChange={onChange} />
      ))}
    </div>
  );
}
