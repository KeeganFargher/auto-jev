import { button, el } from "../dom.js";
import { closeIcon, gearIcon } from "../icons.js";

export interface SettingsTab {
  id: string;
  label: string;
  icon(): SVGSVGElement;
  content: HTMLElement;
}

interface MountedTab {
  trigger: HTMLButtonElement;
  panel: HTMLElement;
}

const TITLE_ID = "settings-window-title";

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex='-1'])";

export function mountSettingsWindow(root: HTMLElement, tabs: readonly SettingsTab[]): void {
  let open = false;
  let activeIndex = 0;

  const gear = button("settings-gear", () => setOpen(true), gearIcon());
  gear.setAttribute("aria-label", "Settings");
  gear.setAttribute("aria-haspopup", "dialog");

  const closeButton = button("settings-close", () => setOpen(false), closeIcon());
  closeButton.setAttribute("aria-label", "Close settings");

  const title = el("h2", "settings-title", "Settings");
  title.id = TITLE_ID;

  const tabList = el("div", "settings-tabs");
  tabList.setAttribute("role", "tablist");

  const body = el("div", "settings-body");

  const mounted: MountedTab[] = tabs.map((tab, index) => {
    const trigger = button("settings-tab", () => selectTab(index), tab.icon(), el("span", "", tab.label));
    trigger.id = `settings-tab-${tab.id}`;
    trigger.setAttribute("role", "tab");
    trigger.setAttribute("aria-controls", `settings-panel-${tab.id}`);

    const panel = el("div", "settings-tab-panel", tab.content);
    panel.id = `settings-panel-${tab.id}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", trigger.id);

    tabList.append(trigger);
    body.append(panel);

    return { trigger, panel };
  });

  const dialog = el("div", "settings-window", el("div", "settings-header", title, closeButton), tabList, body);
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", TITLE_ID);

  const overlay = el("div", "settings-overlay", dialog);

  function selectTab(index: number): void {
    activeIndex = index;

    for (const [position, { trigger, panel }] of mounted.entries()) {
      const active = position === activeIndex;
      trigger.classList.toggle("is-active", active);
      trigger.setAttribute("aria-selected", String(active));
      trigger.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
    }
  }

  function setOpen(next: boolean): void {
    open = next;
    overlay.hidden = !open;
    gear.setAttribute("aria-expanded", String(open));

    if (open) {
      mounted[activeIndex]?.trigger.focus();
    } else {
      gear.focus();
    }
  }

  function moveTab(step: number): void {
    selectTab((activeIndex + step + mounted.length) % mounted.length);
    mounted[activeIndex]?.trigger.focus();
  }

  function trapFocus(event: KeyboardEvent): void {
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => node.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!open) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);

      return;
    }

    if (event.key === "Tab") {
      trapFocus(event);

      return;
    }

    if (event.target instanceof Node && tabList.contains(event.target) && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      event.preventDefault();
      moveTab(event.key === "ArrowRight" ? 1 : -1);
    }
  }

  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) {
      setOpen(false);
    }
  });

  selectTab(activeIndex);
  overlay.hidden = true;
  gear.setAttribute("aria-expanded", "false");
  document.addEventListener("keydown", handleKeyDown);
  root.append(gear, overlay);
}
