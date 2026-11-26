const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]",
].join(",");

function isFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute("disabled") || element.closest("[hidden]")) {
    return false;
  }
  return element.getAttribute("tabindex") !== "-1";
}

export function listFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isFocusable);
}

// The first element marked `autofocus`, else the first focusable element.
export function findInitialFocus(root: HTMLElement): HTMLElement | null {
  const marked = root.querySelector<HTMLElement>("[autofocus]");
  if (marked) {
    return marked;
  }
  return listFocusable(root)[0] ?? null;
}

// Where Tab should land when it would leave the dialog, or null to let the
// browser move focus as usual.
export function wrapTabFocus(
  root: HTMLElement,
  active: Element | null,
  backwards: boolean,
): HTMLElement | null {
  const focusable = listFocusable(root);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    return root;
  }
  if (backwards && (active === first || active === root)) {
    return last;
  }
  if (!backwards && active === last) {
    return first;
  }
  return null;
}
