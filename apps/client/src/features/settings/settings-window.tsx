import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useDialogKeys } from "../../hooks/use-dialog-keys.js";
import { CloseIcon, GearIcon } from "../../ui/icons/icons.js";
import { SETTINGS_TABS, type SettingsTab } from "./settings-tabs.js";

const TITLE_ID = "settings-window-title";

interface SettingsDialogProps {
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

function SettingsDialog({ activeIndex, onSelect, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useDialogKeys(dialogRef, onClose);

  useEffect(() => {
    const trigger = triggerRefs.current[activeIndex];

    if (trigger === null || trigger === undefined) {
      throw new Error(`Settings dialog opened without a trigger for tab ${activeIndex}`);
    }

    trigger.focus();
  }, []);

  function moveTab(step: number): void {
    const next = (activeIndex + step + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    onSelect(next);
    triggerRefs.current[next]?.focus();
  }

  function handleTabKeys(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveTab(event.key === "ArrowRight" ? 1 : -1);
    }
  }

  function renderTrigger(tab: SettingsTab, index: number) {
    const active = index === activeIndex;

    return (
      <button
        key={tab.id}
        ref={(node) => {
          triggerRefs.current[index] = node;
        }}
        type="button"
        id={`settings-tab-${tab.id}`}
        className={active ? "settings-tab is-active" : "settings-tab"}
        role="tab"
        aria-selected={active}
        aria-controls={`settings-panel-${tab.id}`}
        tabIndex={active ? 0 : -1}
        onClick={() => onSelect(index)}
      >
        {tab.icon}
        <span>{tab.label}</span>
      </button>
    );
  }

  return (
    <div
      className="settings-overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        <div className="settings-header">
          <h2 id={TITLE_ID} className="settings-title">
            Settings
          </h2>
          <button
            type="button"
            className="settings-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="settings-tabs" role="tablist" onKeyDown={handleTabKeys}>
          {SETTINGS_TABS.map(renderTrigger)}
        </div>
        <div className="settings-body">
          {SETTINGS_TABS.map((tab, index) => (
            <div
              key={tab.id}
              id={`settings-panel-${tab.id}`}
              className="settings-tab-panel"
              role="tabpanel"
              aria-labelledby={`settings-tab-${tab.id}`}
              hidden={index !== activeIndex}
            >
              {tab.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsWindow() {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const gearRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    gearRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={gearRef}
        type="button"
        className="settings-gear"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <GearIcon />
      </button>
      {open ? (
        <SettingsDialog activeIndex={activeIndex} onSelect={setActiveIndex} onClose={close} />
      ) : null}
    </>
  );
}
