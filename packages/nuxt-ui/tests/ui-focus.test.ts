// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  createModalStack,
  findInitialFocus,
  wrapTabFocus,
} from "../shared/lib/index.ts";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
});

function buildDialog(markup: string): HTMLElement {
  const dialog = document.createElement("div");
  dialog.innerHTML = markup;
  document.body.append(dialog);
  return dialog;
}

describe("findInitialFocus", () => {
  it("prefers the first autofocus element", () => {
    const dialog = buildDialog(
      '<button id="a"></button><input id="b" autofocus><input id="c" autofocus>',
    );
    expect(findInitialFocus(dialog)?.id).toBe("b");
  });

  it("falls back to the first focusable element, skipping disabled and tabindex -1", () => {
    const dialog = buildDialog(
      '<button disabled></button><div tabindex="-1"></div><div hidden><button></button></div><a href="/x" id="a"></a>',
    );
    expect(findInitialFocus(dialog)?.id).toBe("a");
  });

  it("returns null with nothing focusable", () => {
    expect(findInitialFocus(buildDialog("<p>text</p>"))).toBeNull();
  });
});

describe("wrapTabFocus", () => {
  const MARKUP = '<button id="first"></button><button id="last"></button>';

  it("wraps forward from the last element to the first", () => {
    const dialog = buildDialog(MARKUP);
    const last = dialog.querySelector("#last");
    expect(wrapTabFocus(dialog, last, false)?.id).toBe("first");
  });

  it("wraps backward from the first element to the last", () => {
    const dialog = buildDialog(MARKUP);
    const first = dialog.querySelector("#first");
    expect(wrapTabFocus(dialog, first, true)?.id).toBe("last");
  });

  it("lets the browser move focus inside the dialog", () => {
    const dialog = buildDialog(MARKUP);
    expect(
      wrapTabFocus(dialog, dialog.querySelector("#first"), false),
    ).toBeNull();
    expect(
      wrapTabFocus(dialog, dialog.querySelector("#last"), true),
    ).toBeNull();
  });

  it("keeps focus on the dialog when nothing inside can take it", () => {
    const dialog = buildDialog("<p>text</p>");
    expect(wrapTabFocus(dialog, dialog, false)).toBe(dialog);
  });
});

describe("createModalStack", () => {
  function opener(): HTMLButtonElement {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    return button;
  }

  it("locks scrolling once for any number of modals and unlocks after the last", () => {
    document.documentElement.style.overflow = "auto";
    const stack = createModalStack(document);
    const first = stack.enter(buildDialog(""));
    const second = stack.enter(buildDialog(""));
    expect(document.documentElement.style.overflow).toBe("hidden");
    first.release();
    expect(document.documentElement.style.overflow).toBe("hidden");
    second.release();
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("ignores a second release of the same handle", () => {
    const stack = createModalStack(document);
    const first = stack.enter(buildDialog(""));
    const second = stack.enter(buildDialog(""));
    first.release();
    first.release();
    expect(document.documentElement.style.overflow).toBe("hidden");
    second.release();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("returns focus to a target that is now hidden inside a closed modal's place", () => {
    const stack = createModalStack(document);
    const outer = opener();
    const firstDialog = buildDialog('<button id="inner"></button>');
    const first = stack.enter(firstDialog);
    (firstDialog.querySelector("#inner") as HTMLElement).focus();
    const second = stack.enter(buildDialog(""));
    first.release();
    second.release();
    expect(document.activeElement).toBe(outer);
  });

  it("does not move focus when a modal below the top closes", () => {
    const stack = createModalStack(document);
    const outer = opener();
    const first = stack.enter(buildDialog(""));
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    const second = stack.enter(buildDialog(""));
    first.release();
    expect(document.activeElement).toBe(other);
    second.release();
    expect(document.activeElement).toBe(other);
    expect(outer).not.toBe(other);
  });
});
