// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import UiButton from "../app/components/UiButton.vue";
import { mountComponent, type Mounted } from "./ui-helpers.ts";

let mounted: Mounted | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function mountButton(props: Record<string, unknown> = {}) {
  mounted = mountComponent(UiButton, props, { default: () => "Save" });
  return mounted.container.firstElementChild as HTMLElement;
}

describe("UiButton", () => {
  it("renders a button that never submits a form by default", () => {
    const button = mountButton();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.textContent).toContain("Save");
  });

  it("lets a form button ask for submit", () => {
    expect(mountButton({ type: "submit" }).getAttribute("type")).toBe("submit");
  });

  it("renders a NuxtLink with `to`", () => {
    const link = mountButton({ to: "/pricing" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/pricing");
  });

  it("applies variant, size, and block as classes", () => {
    const button = mountButton({ variant: "danger", size: "lg", block: true });
    expect(button.classList.contains("ui-button--danger")).toBe(true);
    expect(button.classList.contains("ui-button--lg")).toBe(true);
    expect(button.classList.contains("ui-button--block")).toBe(true);
  });

  it("emits click once for an active button", () => {
    const onClick = vi.fn();
    mountButton({ onClick }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled, busy, and silent while loading, and keeps its label", () => {
    const onClick = vi.fn();
    const button = mountButton({ loading: true, onClick });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector(".ui-button__label")?.textContent).toBe("Save");
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not emit click when disabled", () => {
    const onClick = vi.fn();
    const button = mountButton({ disabled: true, onClick });
    expect(button.hasAttribute("disabled")).toBe(true);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is not busy when only disabled", () => {
    expect(mountButton({ disabled: true }).hasAttribute("aria-busy")).toBe(
      false,
    );
  });

  it.each([{ disabled: true }, { loading: true }])(
    "renders a disabled link as an unfocusable, unclickable element: %o",
    (state) => {
      const onClick = vi.fn();
      const link = mountButton({ to: "/pricing", onClick, ...state });
      expect(link.tagName).not.toBe("A");
      expect(link.hasAttribute("href")).toBe(false);
      expect(link.hasAttribute("tabindex")).toBe(false);
      expect(link.getAttribute("aria-disabled")).toBe("true");
      link.click();
      expect(onClick).not.toHaveBeenCalled();
    },
  );

  it("reports a loading link as busy", () => {
    const link = mountButton({ to: "/pricing", loading: true });
    expect(link.getAttribute("aria-busy")).toBe("true");
  });
});
