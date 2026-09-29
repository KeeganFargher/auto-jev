import type { EnvironmentTheme } from "../../game/environments/environment.js";
import { CheckIcon } from "../../ui/icons/icons.js";
import { classNames } from "../../ui/class-names.js";

function ThemeCard({
  theme,
  selected,
  saved,
  onPick,
}: {
  theme: EnvironmentTheme;
  selected: boolean;
  saved: boolean;
  onPick: (theme: EnvironmentTheme) => void;
}) {
  return (
    <button
      type="button"
      className={classNames("env-card", selected && "is-selected", saved && "is-saved")}
      aria-pressed={saved}
      title={saved ? "Your board" : "Use this board"}
      onClick={() => onPick(theme)}
    >
      <span className="env-swatch" style={{ "--swatch": theme.swatch }}>
        {saved ? <CheckIcon /> : null}
      </span>
      <span className="env-card-name">{theme.name}</span>
    </button>
  );
}

export function ThemePicker({
  themes,
  selectedId,
  savedId,
  onPick,
}: {
  themes: readonly EnvironmentTheme[];
  selectedId: string;
  savedId: string;
  onPick: (theme: EnvironmentTheme) => void;
}) {
  return (
    <div className="env-picker">
      {themes.map((theme) => (
        <ThemeCard
          key={theme.id}
          theme={theme}
          selected={theme.id === selectedId}
          saved={theme.id === savedId}
          onPick={onPick}
        />
      ))}
    </div>
  );
}
