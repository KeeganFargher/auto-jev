import { SkipIcon } from "../../../ui/icons/icons.js";

export function SkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <button type="button" className="pill-button battle-skip" onClick={onSkip}>
      <SkipIcon />
      Skip
    </button>
  );
}
