interface Entry {
  dialog: HTMLElement;
  returnTarget: HTMLElement | null;
}

export interface ModalHandle {
  release: () => void;
}

export interface ModalStack {
  enter: (dialog: HTMLElement) => ModalHandle;
}

// Shared by every open modal: the scroll lock is held while any modal is open,
// and each modal returns focus to what had it before that modal opened.
export function createModalStack(documentRef: Document): ModalStack {
  const entries: Entry[] = [];
  const root = documentRef.documentElement;
  let savedOverflow = "";
  let savedPaddingRight = "";

  function lockScroll(): void {
    const view = documentRef.defaultView;
    const scrollbarWidth = view ? view.innerWidth - root.clientWidth : 0;
    savedOverflow = root.style.overflow;
    savedPaddingRight = root.style.paddingRight;
    if (scrollbarWidth > 0 && view) {
      const padding = view.getComputedStyle(root).paddingRight || "0px";
      root.style.paddingRight = `calc(${padding} + ${scrollbarWidth}px)`;
    }
    root.style.overflow = "hidden";
  }

  function unlockScroll(): void {
    root.style.overflow = savedOverflow;
    root.style.paddingRight = savedPaddingRight;
  }

  function currentFocus(): HTMLElement | null {
    const active = documentRef.activeElement;
    if (!active || active === documentRef.body) {
      return null;
    }
    return active as HTMLElement;
  }

  // A modal that opened from inside the closing one now returns to where the
  // closing one would have returned.
  function handOverFocusTarget(closed: Entry, closedIndex: number): void {
    entries
      .slice(closedIndex)
      .filter(
        (above) =>
          above.returnTarget && closed.dialog.contains(above.returnTarget),
      )
      .forEach((above) => {
        above.returnTarget = closed.returnTarget;
      });
  }

  function restoreFocus(closed: Entry): void {
    const target = closed.returnTarget;
    if (!target?.isConnected || closed.dialog.contains(target)) {
      return;
    }
    target.focus();
  }

  function leave(entry: Entry): void {
    const index = entries.indexOf(entry);
    if (index === -1) {
      return;
    }
    const wasTop = index === entries.length - 1;
    entries.splice(index, 1);
    handOverFocusTarget(entry, index);
    if (entries.length === 0) {
      unlockScroll();
    }
    if (wasTop) {
      restoreFocus(entry);
    }
  }

  function enter(dialog: HTMLElement): ModalHandle {
    const entry: Entry = { dialog, returnTarget: currentFocus() };
    if (entries.length === 0) {
      lockScroll();
    }
    entries.push(entry);
    return { release: () => leave(entry) };
  }

  return { enter };
}

let sharedStack: ModalStack | undefined;
let sharedDocument: Document | undefined;

// One stack per document, created on first use so the server never touches it.
export function getModalStack(): ModalStack {
  if (!sharedStack || sharedDocument !== document) {
    sharedDocument = document;
    sharedStack = createModalStack(document);
  }
  return sharedStack;
}
