import type { HeroDefinitionId } from "@jev-game/game";
import { DUEL_TEAM_A, gameCatalogue, MAX_LAB_TEAM_SIZE, THREE_VERSUS_THREE_TEAM_A } from "@jev-game/content";
import type { BattleLabSession, LabScenarioKind, LabTeams, TeamAUpgradeIdsByHero } from "../session/types.js";
import { heroName } from "../game/catalogues.js";
import { createUpgradePickerView } from "./upgrade-picker.js";

export interface BattleControlsView {
  dispose(): void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

const SCENARIO_OPTIONS: readonly { value: LabScenarioKind; label: string }[] = [
  { value: "three-vs-three", label: "three vs three" },
  { value: "duel", label: "duel" },
  { value: "custom", label: "custom teams" },
];

function teamAHeroes(scenario: LabScenarioKind, teams: LabTeams): readonly HeroDefinitionId[] {
  switch (scenario) {
    case "three-vs-three":
      return THREE_VERSUS_THREE_TEAM_A;

    case "duel":
      return DUEL_TEAM_A;

    case "custom":
      return teams.a;

    default: {
      const exhaustive: never = scenario;

      return exhaustive;
    }
  }
}

function playableHeroes(): HeroDefinitionId[] {
  const heroIds: HeroDefinitionId[] = [];

  for (const hero of Object.values(gameCatalogue.heroes)) {
    if (hero.summon !== true) {
      heroIds.push(hero.id);
    }
  }

  return heroIds.sort((a, b) => heroName(a).localeCompare(heroName(b)));
}

function toggledTeam(team: readonly HeroDefinitionId[], heroId: HeroDefinitionId): HeroDefinitionId[] {
  if (team.includes(heroId)) {
    return team.length > 1 ? team.filter((member) => member !== heroId) : [...team];
  }

  return team.length < MAX_LAB_TEAM_SIZE ? [...team, heroId] : [...team];
}

function teamPicker(parent: HTMLElement, getTeams: () => LabTeams, setTeams: (teams: LabTeams) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "hud-team-picker";
  parent.appendChild(root);

  function render(): void {
    const teams = getTeams();
    root.replaceChildren();

    for (const side of ["a", "b"] as const) {
      const row = document.createElement("div");
      row.className = "hud-team-row";

      const caption = document.createElement("span");
      caption.className = "hud-team-caption";
      caption.textContent = side === "a" ? "team A" : "team B";
      row.append(caption);

      for (const heroId of playableHeroes()) {
        const chip = document.createElement("button");
        chip.className = "hud-chip";
        chip.textContent = heroName(heroId);
        chip.classList.toggle("is-active", teams[side].includes(heroId));
        chip.addEventListener("click", () => {
          const current = getTeams();
          setTeams({ ...current, [side]: toggledTeam(current[side], heroId) });
          render();
        });
        row.append(chip);
      }

      root.append(row);
    }
  }

  render();

  return root;
}

function isScenarioKind(value: string): value is LabScenarioKind {
  return SCENARIO_OPTIONS.some((option) => option.value === value);
}

function iconButton(parent: HTMLElement, glyph: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "hud-icon-button";
  button.textContent = glyph;
  button.title = label;
  button.setAttribute("aria-label", label);
  parent.appendChild(button);

  return button;
}

function numberField(parent: HTMLElement, label: string, initialValue: number): HTMLInputElement {
  const wrapper = document.createElement("label");
  wrapper.className = "hud-field";

  const caption = document.createElement("span");
  caption.textContent = label;
  wrapper.appendChild(caption);

  const input = document.createElement("input");
  input.type = "number";
  input.value = String(initialValue);
  input.min = "0";
  input.step = "1";
  wrapper.appendChild(input);
  parent.appendChild(wrapper);

  return input;
}

function scenarioField(
  parent: HTMLElement,
  initialValue: LabScenarioKind,
): HTMLSelectElement {
  const wrapper = document.createElement("label");
  wrapper.className = "hud-field";

  const caption = document.createElement("span");
  caption.textContent = "scenario";
  wrapper.appendChild(caption);

  const select = document.createElement("select");

  for (const option of SCENARIO_OPTIONS) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;

    if (option.value === initialValue) {
      element.selected = true;
    }

    select.appendChild(element);
  }

  wrapper.appendChild(select);
  parent.appendChild(wrapper);

  return select;
}

export function createBattleControlsView(
  barContainer: HTMLElement,
  tuningContainer: HTMLElement,
  upgradesContainer: HTMLElement,
  session: BattleLabSession,
  onReplay: () => void,
  onReset: (seed: number, scenario?: LabScenarioKind, teamAUpgradeIdsByHero?: TeamAUpgradeIdsByHero, teams?: LabTeams) => void,
): BattleControlsView {
  const playButton = iconButton(barContainer, "▶", "Play");
  const pauseButton = iconButton(barContainer, "‖", "Pause");
  const stepButton = iconButton(barContainer, "▶‖", "Step one tick");
  const resetButton = iconButton(barContainer, "↻", "Reset");
  const replayButton = iconButton(barContainer, "⏮", "Replay last recording");

  const speedGroup = document.createElement("div");
  speedGroup.className = "hud-speed";
  barContainer.appendChild(speedGroup);

  const speedButtons: HTMLButtonElement[] = [];

  for (const speed of SPEED_OPTIONS) {
    const chip = document.createElement("button");
    chip.className = "hud-chip";
    chip.textContent = `${speed}x`;

    if (speed === 1) {
      chip.classList.add("is-active");
    }

    chip.addEventListener("click", () => {
      session.setSpeed(speed);

      for (const other of speedButtons) {
        other.classList.remove("is-active");
      }

      chip.classList.add("is-active");
    });

    speedGroup.appendChild(chip);
    speedButtons.push(chip);
  }

  const fields = document.createElement("div");
  fields.className = "hud-fields";
  tuningContainer.appendChild(fields);

  const initial = session.peekSnapshot();
  const seedInput = numberField(fields, "seed", initial.seed);
  const scenarioSelect = scenarioField(fields, initial.scenario);
  let teams: LabTeams = initial.teams;
  let scenario: LabScenarioKind = initial.scenario;

  const upgradePicker = createUpgradePickerView(upgradesContainer, () => {});
  upgradePicker.render(teamAHeroes(scenario, teams));

  const pickerRoot = teamPicker(
    tuningContainer,
    () => teams,
    (next) => {
      teams = next;
      upgradePicker.render(teamAHeroes(scenario, teams));
    },
  );

  pickerRoot.hidden = scenario !== "custom";

  scenarioSelect.addEventListener("change", () => {
    const selected = scenarioSelect.value;

    if (isScenarioKind(selected)) {
      scenario = selected;
      pickerRoot.hidden = scenario !== "custom";
      upgradePicker.render(teamAHeroes(scenario, teams));
    }
  });

  playButton.addEventListener("click", () => {
    session.play();
  });

  pauseButton.addEventListener("click", () => {
    session.pause();
  });

  stepButton.addEventListener("click", () => {
    session.stepOnce();
  });

  resetButton.addEventListener("click", () => {
    onReset(Number(seedInput.value), scenario, upgradePicker.getSelection(), teams);
  });

  replayButton.addEventListener("click", onReplay);

  return {
    dispose() {
      playButton.remove();
      pauseButton.remove();
      stepButton.remove();
      resetButton.remove();
      replayButton.remove();
      speedGroup.remove();
      fields.remove();
      pickerRoot.remove();
      upgradePicker.dispose();
    },
  };
}
