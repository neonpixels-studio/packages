// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { uiStubs } from "../testing/index.ts";
import { mountComponent, type Mounted } from "./ui-helpers.ts";

let mounted: Mounted | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function mountPage(content: () => ReturnType<typeof h>) {
  const page = defineComponent({
    components: uiStubs,
    render: content,
  });
  mounted = mountComponent(page);
  return mounted.container;
}

describe("the testing stubs", () => {
  it("covers every component the layer ships", () => {
    expect(Object.keys(uiStubs).sort()).toEqual([
      "UiButton",
      "UiConsentBanner",
      "UiCookieSettingsLink",
      "UiField",
      "UiInput",
      "UiModal",
      "UiTextarea",
    ]);
  });

  it("mounts a page that uses them without Nuxt auto-imports", () => {
    const onSave = vi.fn();
    const container = mountPage(() =>
      h("main", [
        h(uiStubs.UiInput!, { label: "Name", modelValue: "Ada" }),
        h(uiStubs.UiButton!, { onClick: onSave }, () => "Save"),
        h(uiStubs.UiModal!, { open: true, title: "Sure?" }, () => "Body"),
        h(uiStubs.UiModal!, { open: false, title: "Hidden" }, () => "Never"),
        h(uiStubs.UiCookieSettingsLink!),
      ]),
    );
    expect(container.querySelector("input")?.value).toBe("Ada");
    expect(container.querySelector("label")?.textContent).toBe("Name");
    expect(container.textContent).toContain("Body");
    expect(container.textContent).not.toContain("Never");
    expect(container.textContent).toContain("Cookie settings");
    (container.querySelector("button") as HTMLElement).click();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("gives UiField's slot an id, describedBy, and invalid", () => {
    const seen: Record<string, unknown>[] = [];
    mountPage(() =>
      h(
        uiStubs.UiField!,
        { label: "Plan", error: "Pick one" },
        {
          default: (props: Record<string, unknown>) => {
            seen.push(props);
            return null;
          },
        },
      ),
    );
    expect(seen[0]).toMatchObject({ invalid: true });
    expect(typeof seen[0]?.id).toBe("string");
  });
});
