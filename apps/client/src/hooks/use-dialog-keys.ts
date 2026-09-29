import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex='-1'])";

function focusableIn(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (node) => node.offsetParent !== null,
  );
}

function trapFocus(dialog: HTMLElement, event: KeyboardEvent): void {
  const focusable = focusableIn(dialog);
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

export function useDialogKeys(dialogRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog === null) {
      throw new Error("useDialogKeys needs its ref attached to a mounted element");
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();

        return;
      }

      if (event.key === "Tab" && dialog !== null) {
        trapFocus(dialog, event);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dialogRef, onClose]);
}
