import type { ReactNode } from "react";

export interface Choice<T> {
  value: T;
  label: string;
}

export function ChoiceRow<T>({
  icon,
  name,
  choices,
  current,
  onPick,
}: {
  icon: ReactNode;
  name: string;
  choices: readonly Choice<T>[];
  current: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="settings-row is-choice">
      <span className="settings-channel-icon">{icon}</span>
      <span className="settings-channel-name">{name}</span>
      <div className="settings-choices" role="radiogroup" aria-label={name}>
        {choices.map((choice) => {
          const checked = choice.value === current;

          return (
            <button
              key={choice.label}
              type="button"
              className="settings-choice"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onPick(choice.value)}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
