// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import UiField from "../app/components/UiField.vue";
import UiInput from "../app/components/UiInput.vue";
import UiTextarea from "../app/components/UiTextarea.vue";
import { mountComponent, settle, type Mounted } from "./ui-helpers.ts";

let mounted: Mounted | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function mountInput(props: Record<string, unknown>): HTMLInputElement {
  mounted = mountComponent(UiInput, { label: "Email", ...props });
  return mounted.container.querySelector("input") as HTMLInputElement;
}

describe("UiField", () => {
  it("passes id, describedBy, and invalid to its slot, with a real label for the control", () => {
    const seen: Record<string, unknown>[] = [];
    mounted = mountComponent(
      UiField,
      { label: "Plan", hint: "Pick one", error: "Required" },
      {
        default: (slotProps) => {
          seen.push(slotProps);
          return null;
        },
      },
    );
    const label = mounted.container.querySelector("label");
    const slotProps = seen[0] as {
      id: string;
      describedBy: string;
      invalid: boolean;
    };
    expect(label?.getAttribute("for")).toBe(slotProps.id);
    expect(slotProps.invalid).toBe(true);
    const ids = slotProps.describedBy.split(" ");
    expect(ids).toHaveLength(2);
    expect(
      mounted.container.querySelector(`#${CSS.escape(ids[0]!)}`)?.textContent,
    ).toBe("Required");
    expect(
      mounted.container.querySelector(`#${CSS.escape(ids[1]!)}`)?.textContent,
    ).toBe("Pick one");
  });

  it("reports no description and a valid control without hint or error", () => {
    const seen: Record<string, unknown>[] = [];
    mounted = mountComponent(
      UiField,
      { label: "Plan" },
      {
        default: (slotProps) => {
          seen.push(slotProps);
          return null;
        },
      },
    );
    expect(seen[0]?.describedBy).toBeUndefined();
    expect(seen[0]?.invalid).toBe(false);
  });
});

describe("UiInput", () => {
  it("labels the control with a real label for its id", () => {
    const input = mountInput({});
    const label = mounted?.container.querySelector("label");
    expect(label?.getAttribute("for")).toBe(input.id);
    expect(input.id).not.toBe("");
  });

  it("ties an error to the control and marks it invalid, with the text present", () => {
    const input = mountInput({ error: "Not an email" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(
      mounted?.container.querySelector(`#${CSS.escape(describedBy)}`)
        ?.textContent,
    ).toBe("Not an email");
  });

  it("ties a hint alone without marking the control invalid", () => {
    const input = mountInput({ hint: "We never share it" });
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(
      mounted?.container.querySelector(`#${CSS.escape(describedBy)}`)
        ?.textContent,
    ).toBe("We never share it");
  });

  it("lists the error id before the hint id when both are set", () => {
    const input = mountInput({ hint: "A hint", error: "An error" });
    const [first, second] = (
      input.getAttribute("aria-describedby") ?? ""
    ).split(" ");
    expect(
      mounted?.container.querySelector(`#${CSS.escape(first!)}`)?.textContent,
    ).toBe("An error");
    expect(
      mounted?.container.querySelector(`#${CSS.escape(second!)}`)?.textContent,
    ).toBe("A hint");
  });

  it("shows a required mark hidden from assistive technology and sets required on the control", () => {
    const input = mountInput({ required: true });
    const mark = mounted?.container.querySelector(".ui-field__required");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(input.required).toBe(true);
  });

  it("sets neither mark nor attribute when not required", () => {
    const input = mountInput({});
    expect(mounted?.container.querySelector(".ui-field__required")).toBeNull();
    expect(input.required).toBe(false);
  });

  it("passes other attributes and listeners to the control, not the wrapper", () => {
    const onFocus = vi.fn();
    const input = mountInput({
      placeholder: "you@example.com",
      class: "wide",
      autocomplete: "email",
      onFocus,
    });
    expect(input.getAttribute("placeholder")).toBe("you@example.com");
    expect(input.getAttribute("autocomplete")).toBe("email");
    expect(input.classList.contains("wide")).toBe(true);
    const wrapper = mounted?.container.firstElementChild;
    expect(wrapper?.hasAttribute("placeholder")).toBe(false);
    expect(wrapper?.classList.contains("wide")).toBe(false);
    input.dispatchEvent(new Event("focus"));
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("disables the control", () => {
    expect(mountInput({ disabled: true }).disabled).toBe(true);
  });

  it.each(["text", "email", "search", "url", "tel", "password", "number"])(
    "accepts type %s",
    (type) => {
      expect(mountInput({ type }).type).toBe(type);
    },
  );

  it("updates v-model with the typed text", async () => {
    const model = ref("");
    const input = mountInput({
      modelValue: model.value,
      "onUpdate:modelValue": (value: string) => {
        model.value = value;
      },
    });
    input.value = "hello";
    input.dispatchEvent(new Event("input"));
    await settle();
    expect(model.value).toBe("hello");
  });

  it("updates v-model with a number for a number input, and an empty string when cleared", async () => {
    const received: unknown[] = [];
    const input = mountInput({
      type: "number",
      "onUpdate:modelValue": (value: unknown) => received.push(value),
    });
    input.value = "42";
    input.dispatchEvent(new Event("input"));
    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(received).toEqual([42, ""]);
  });

  it("shows the value it is given", () => {
    expect(mountInput({ modelValue: "kept" }).value).toBe("kept");
  });
});

describe("UiTextarea", () => {
  function mountTextarea(props: Record<string, unknown>): HTMLTextAreaElement {
    mounted = mountComponent(UiTextarea, { label: "Notes", ...props });
    return mounted.container.querySelector("textarea") as HTMLTextAreaElement;
  }

  it("defaults to four rows and takes rows", () => {
    expect(mountTextarea({}).getAttribute("rows")).toBe("4");
    mounted?.unmount();
    expect(mountTextarea({ rows: 9 }).getAttribute("rows")).toBe("9");
  });

  it("wires label, error, required, and attributes like the input", () => {
    const textarea = mountTextarea({
      error: "Too short",
      required: true,
      placeholder: "Write here",
    });
    const label = mounted?.container.querySelector("label");
    expect(label?.getAttribute("for")).toBe(textarea.id);
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(textarea.required).toBe(true);
    expect(textarea.getAttribute("placeholder")).toBe("Write here");
    const describedBy = textarea.getAttribute("aria-describedby") ?? "";
    expect(
      mounted?.container.querySelector(`#${CSS.escape(describedBy)}`)
        ?.textContent,
    ).toBe("Too short");
  });

  it("updates v-model", () => {
    const received: string[] = [];
    const textarea = mountTextarea({
      "onUpdate:modelValue": (value: string) => received.push(value),
    });
    textarea.value = "typed";
    textarea.dispatchEvent(new Event("input"));
    expect(received).toEqual(["typed"]);
  });
});
