import { classNames } from "../../../ui/class-names.js";

const LONG_ACTION_LABEL = 6;

export function ActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={classNames("action-button", label.length > LONG_ACTION_LABEL && "is-long")}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
