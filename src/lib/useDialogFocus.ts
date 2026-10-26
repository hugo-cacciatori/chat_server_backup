import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, innermost last: only the topmost one traps Tab.
const openDialogs: HTMLElement[] = [];

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0,
  );
}

/**
 * While `isOpen`: move focus into the dialog (to `initialFocusRef` or its first focusable
 * element), keep `Tab` / `Shift+Tab` inside it, and return focus to the previously focused
 * element when it closes.
 */
export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;

    const previous = document.activeElement as HTMLElement | null;
    openDialogs.push(dialog);
    (initialFocusRef?.current ?? focusableWithin(dialog)[0] ?? dialog).focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || openDialogs[openDialogs.length - 1] !== dialog) return;
      const items = focusableWithin(dialog);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      openDialogs.splice(openDialogs.indexOf(dialog), 1);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [dialogRef, isOpen, initialFocusRef]);
}
