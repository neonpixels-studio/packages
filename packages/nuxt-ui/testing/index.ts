import { defineComponent, h, type Component, type Slots } from "vue";

// Plain stand-ins for the layer's components, for an app's unit tests that
// mount a page without Nuxt's auto-imports. They render the same labels, slots,
// and attributes a test would query, and none of the styling or dialog behavior.
//
//   mount(Page, { global: { stubs: uiStubs } })

function slotOrNothing(slots: Slots, name = "default") {
  return slots[name]?.() ?? [];
}

export const UiModal = defineComponent({
  name: "UiModal",
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, required: true },
    dismissible: { type: Boolean, default: true },
  },
  emits: ["update:open", "close"],
  setup(props, context) {
    return () =>
      props.open
        ? h("div", { role: "dialog", "aria-label": props.title }, [
            h(
              "h2",
              slotOrNothing(context.slots, "title").length > 0
                ? slotOrNothing(context.slots, "title")
                : props.title,
            ),
            ...slotOrNothing(context.slots),
            ...slotOrNothing(context.slots, "footer"),
          ])
        : null;
  },
});

export const UiField = defineComponent({
  name: "UiField",
  props: {
    label: { type: String, required: true },
    hint: { type: String, default: undefined },
    error: { type: String, default: undefined },
    required: { type: Boolean, default: false },
  },
  setup(props, context) {
    const id = "ui-field-stub";
    return () =>
      h("div", [
        h("label", { for: id }, props.label),
        ...(context.slots.default?.({
          id,
          describedBy: undefined,
          invalid: Boolean(props.error),
        }) ?? []),
        props.hint ? h("p", props.hint) : null,
        props.error ? h("p", props.error) : null,
      ]);
  },
});

function createControlStub(name: string, tag: "input" | "textarea") {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: {
      modelValue: { type: [String, Number], default: "" },
      label: { type: String, required: true },
      hint: { type: String, default: undefined },
      error: { type: String, default: undefined },
      required: { type: Boolean, default: false },
      disabled: { type: Boolean, default: false },
    },
    emits: ["update:modelValue"],
    setup(props, context) {
      return () =>
        h("div", [
          h("label", { for: name }, props.label),
          h(tag, {
            ...context.attrs,
            id: name,
            value: props.modelValue,
            required: props.required,
            disabled: props.disabled,
            onInput: (event: Event) =>
              context.emit(
                "update:modelValue",
                (event.target as HTMLInputElement).value,
              ),
          }),
          props.error ? h("p", props.error) : null,
        ]);
    },
  });
}

export const UiInput = createControlStub("UiInput", "input");
export const UiTextarea = createControlStub("UiTextarea", "textarea");

export const UiButton = defineComponent({
  name: "UiButton",
  props: {
    to: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    type: { type: String, default: "button" },
  },
  emits: ["click"],
  setup(props, context) {
    return () =>
      props.to
        ? h("a", { href: props.to }, slotOrNothing(context.slots))
        : h(
            "button",
            {
              type: props.type,
              disabled: props.disabled || props.loading,
              onClick: (event: MouseEvent) => context.emit("click", event),
            },
            slotOrNothing(context.slots),
          );
  },
});

export const UiConsentBanner = defineComponent({
  name: "UiConsentBanner",
  props: { privacyHref: { type: String, default: undefined } },
  setup(_props, context) {
    return () =>
      h("section", { "aria-label": "Consent" }, slotOrNothing(context.slots));
  },
});

export const UiCookieSettingsLink = defineComponent({
  name: "UiCookieSettingsLink",
  setup(_props, context) {
    return () => {
      const label = slotOrNothing(context.slots);
      return h(
        "button",
        { type: "button" },
        label.length > 0 ? label : "Cookie settings",
      );
    };
  },
});

export const uiStubs: Record<string, Component> = {
  UiModal,
  UiField,
  UiInput,
  UiTextarea,
  UiButton,
  UiConsentBanner,
  UiCookieSettingsLink,
};
