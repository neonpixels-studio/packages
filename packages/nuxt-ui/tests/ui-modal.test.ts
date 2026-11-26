// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";
import UiModal from "../app/components/UiModal.vue";
import type { ModalCloseReason } from "../shared/lib/index.ts";
import { mountComponent, settle, type Mounted } from "./ui-helpers.ts";

// happy-dom implements `<dialog>` only in part: it has no focus trap, no
// inert page, and no real Escape or backdrop. The browser test in
// fixture-app.test.ts covers those; this file covers the state the component
// owns, in the order a caller sees it.

const mountedList: Mounted[] = [];

afterEach(() => {
  for (const mounted of mountedList.splice(0)) {
    mounted.unmount();
  }
  document.documentElement.removeAttribute("style");
  document.body.innerHTML = "";
});

function mountModal(props: Record<string, unknown> = {}, slots = {}) {
  const closes: ModalCloseReason[] = [];
  const mounted: Mounted = mountComponent(
    UiModal,
    {
      title: "Delete trip",
      open: true,
      "onUpdate:open": (value: boolean) => mounted.rerender({ open: value }),
      onClose: (reason: ModalCloseReason) => closes.push(reason),
      ...props,
    },
    slots,
  );
  mountedList.push(mounted);
  const dialog = mounted.container.querySelector("dialog") as HTMLDialogElement;
  return { mounted, dialog, closes };
}

describe("UiModal", () => {
  it("is labelled by its title", async () => {
    const { dialog } = mountModal();
    await settle();
    const heading = dialog.querySelector("h2") as HTMLElement;
    expect(dialog.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(heading.textContent?.trim()).toBe("Delete trip");
  });

  it("keeps the heading when the title slot replaces the text", async () => {
    const { dialog } = mountModal({}, { title: () => "Custom title" });
    await settle();
    const heading = dialog.querySelector("h2") as HTMLElement;
    expect(heading.textContent?.trim()).toBe("Custom title");
    expect(dialog.getAttribute("aria-labelledby")).toBe(heading.id);
  });

  it("renders the default and footer slots, and no footer without one", async () => {
    const withFooter = mountModal(
      {},
      { default: () => "Body text", footer: () => "Footer text" },
    );
    expect(withFooter.dialog.textContent).toContain("Body text");
    expect(withFooter.dialog.querySelector("footer")?.textContent).toBe(
      "Footer text",
    );
    const withoutFooter = mountModal({}, { default: () => "Body" });
    expect(withoutFooter.dialog.querySelector("footer")).toBeNull();
  });

  it("opens as a modal dialog when open is true at mount", async () => {
    const { dialog } = mountModal();
    await settle();
    expect(dialog.open).toBe(true);
  });

  it("stays closed while open is false", async () => {
    const { dialog } = mountModal({ open: false });
    await settle();
    expect(dialog.open).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("locks scrolling while open and restores the previous value on close", async () => {
    document.documentElement.style.overflow = "scroll";
    const { dialog, mounted } = mountModal();
    await settle();
    expect(document.documentElement.style.overflow).toBe("hidden");
    mounted.rerender({ open: false });
    await settle();
    expect(dialog.open).toBe(false);
    expect(document.documentElement.style.overflow).toBe("scroll");
  });

  it("restores scrolling and focus when unmounted while open", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { mounted } = mountModal();
    await settle();
    expect(document.documentElement.style.overflow).toBe("hidden");
    mounted.unmount();
    mountedList.pop();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });

  it("returns focus to the element that had it before opening", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { mounted } = mountModal({ open: false });
    mounted.rerender({ open: true });
    await settle();
    expect(document.activeElement).not.toBe(opener);
    mounted.rerender({ open: false });
    await settle();
    expect(document.activeElement).toBe(opener);
  });

  it("focuses the first autofocus element, else the first focusable element", async () => {
    const withAutofocus = mountModal(
      {},
      {
        default: () => [
          h("button", { id: "first" }, "first"),
          h("input", { id: "wanted", autofocus: true }),
        ],
      },
    );
    await settle();
    expect(document.activeElement?.id).toBe("wanted");
    withAutofocus.mounted.unmount();
    mountedList.pop();
    const plain = mountModal(
      {},
      { default: () => [h("button", { id: "only" }, "only")] },
    );
    await settle();
    expect(document.activeElement?.id).toBe("only");
    expect(plain.dialog.open).toBe(true);
  });

  it("closes on Escape with the reason escape, once, when dismissible", async () => {
    const { dialog, closes } = mountModal();
    await settle();
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    await settle();
    expect(cancel.defaultPrevented).toBe(true);
    expect(closes).toEqual(["escape"]);
    expect(dialog.open).toBe(false);
  });

  it("closes on the Escape key itself, which the browser would otherwise turn into a second close request", async () => {
    const { dialog, closes } = mountModal();
    await settle();
    const keydown = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(keydown);
    await settle();
    expect(keydown.defaultPrevented).toBe(true);
    expect(closes).toEqual(["escape"]);
  });

  it("ignores the Escape key when not dismissible, and still stops the browser acting on it", async () => {
    const { dialog, closes } = mountModal({ dismissible: false });
    await settle();
    const keydown = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(keydown);
    await settle();
    expect(keydown.defaultPrevented).toBe(true);
    expect(closes).toEqual([]);
    expect(dialog.open).toBe(true);
  });

  it("ignores Escape and the backdrop when not dismissible", async () => {
    const { dialog, closes } = mountModal({ dismissible: false });
    await settle();
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    dialog.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    dialog.click();
    await settle();
    expect(cancel.defaultPrevented).toBe(true);
    expect(closes).toEqual([]);
    expect(dialog.open).toBe(true);
  });

  it("closes on a click that starts and ends on the backdrop", async () => {
    const { dialog, closes } = mountModal();
    await settle();
    dialog.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    dialog.click();
    await settle();
    expect(closes).toEqual(["backdrop"]);
  });

  it("does not close when a click starts inside the dialog and ends on the backdrop", async () => {
    const { dialog, closes } = mountModal(
      {},
      { default: () => h("button", { id: "inside" }, "x") },
    );
    await settle();
    const inside = dialog.querySelector("#inside") as HTMLElement;
    inside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    dialog.click();
    await settle();
    expect(closes).toEqual([]);
    expect(dialog.open).toBe(true);
  });

  it("does not close on a click inside the panel", async () => {
    const { dialog, closes } = mountModal(
      {},
      { default: () => h("button", { id: "inside" }, "x") },
    );
    await settle();
    const inside = dialog.querySelector("#inside") as HTMLElement;
    inside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    inside.click();
    await settle();
    expect(closes).toEqual([]);
  });

  it("emits close with the reason programmatic when the caller closes it, once", async () => {
    const { mounted, closes } = mountModal();
    await settle();
    mounted.rerender({ open: false });
    await settle();
    mounted.rerender({ open: false });
    await settle();
    expect(closes).toEqual(["programmatic"]);
  });

  it("emits update:open with false when dismissed", async () => {
    const onUpdate = vi.fn();
    const { dialog } = mountModal({ "onUpdate:open": onUpdate });
    await settle();
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onUpdate).toHaveBeenCalledWith(false);
  });
});

describe("two modals open at once", () => {
  async function openTwo() {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const first = mountModal({ open: false, title: "First" });
    first.mounted.rerender({ open: true });
    await settle();
    const innerOpener = document.createElement("button");
    first.dialog.append(innerOpener);
    innerOpener.focus();
    const second = mountModal({ open: false, title: "Second" });
    second.mounted.rerender({ open: true });
    await settle();
    return { opener, innerOpener, first, second };
  }

  it("restores focus and scrolling when closed top first", async () => {
    const { opener, innerOpener, first, second } = await openTwo();
    second.mounted.rerender({ open: false });
    await settle();
    expect(document.activeElement).toBe(innerOpener);
    expect(document.documentElement.style.overflow).toBe("hidden");
    first.mounted.rerender({ open: false });
    await settle();
    expect(document.activeElement).toBe(opener);
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("restores focus and scrolling when closed bottom first", async () => {
    const { opener, first, second } = await openTwo();
    first.mounted.rerender({ open: false });
    await settle();
    expect(document.documentElement.style.overflow).toBe("hidden");
    second.mounted.rerender({ open: false });
    await settle();
    expect(document.activeElement).toBe(opener);
    expect(document.documentElement.style.overflow).toBe("");
  });
});
