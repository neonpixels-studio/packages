import {
  defineComponent,
  h,
  mergeProps,
  type Component,
  type Slots,
} from "vue";

// Plain stand-ins for the layer's components, for an app's unit tests that
// mount a page without Nuxt's auto-imports. They render the same labels, slots,
// and attributes a test would query, and none of the styling or dialog behavior.
//
//   mount(Page, { global: { stubs: uiStubs } })

let stubCount = 0;

// Each stub instance gets its own id, so two fields on a page never share one.
function nextStubId(name: string): string {
  stubCount += 1;
  return `${name}-${stubCount}`;
}

function slotOrNothing(slots: Slots, name = "default") {
  return slots[name]?.() ?? [];
}

// The ids the real field puts on its hint and error, and the order it lists them in.
function describeField(id: string, hint?: string, error?: string) {
  const ids = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(
    Boolean,
  );
  return {
    hintId: `${id}-hint`,
    errorId: `${id}-error`,
    describedBy: ids.length > 0 ? ids.join(" ") : undefined,
    invalid: Boolean(error),
  };
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
    const id = nextStubId("UiField");
    return () => {
      const field = describeField(id, props.hint, props.error);
      return h("div", [
        h("label", { for: id }, props.label),
        ...(context.slots.default?.({
          id,
          describedBy: field.describedBy,
          invalid: field.invalid,
        }) ?? []),
        props.hint ? h("p", { id: field.hintId }, props.hint) : null,
        props.error ? h("p", { id: field.errorId }, props.error) : null,
      ]);
    };
  },
});

// Like the real controls: a number input reports a number, or "" when empty.
function readControlValue(event: Event): string | number {
  const control = event.target as HTMLInputElement;
  const isNumber = control.type === "number" && control.value !== "";
  return isNumber ? control.valueAsNumber : control.value;
}

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
      const id = nextStubId(name);
      return () => {
        const field = describeField(id, props.hint, props.error);
        return h("div", [
          h("label", { for: id }, props.label),
          h(
            tag,
            mergeProps(context.attrs, {
              id,
              value: props.modelValue,
              required: props.required,
              disabled: props.disabled,
              "aria-describedby": field.describedBy,
              "aria-invalid": field.invalid ? "true" : undefined,
              onInput: (event: Event) =>
                context.emit("update:modelValue", readControlValue(event)),
            }),
          ),
          props.hint ? h("p", { id: field.hintId }, props.hint) : null,
          props.error ? h("p", { id: field.errorId }, props.error) : null,
        ]);
      };
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
    return () => {
      const inactive = props.disabled || props.loading;
      const busy = props.loading ? "true" : undefined;
      const content = slotOrNothing(context.slots);
      if (props.to && inactive) {
        return h(
          "span",
          { role: "link", "aria-disabled": "true", "aria-busy": busy },
          content,
        );
      }
      if (props.to) {
        return h(
          "a",
          {
            href: props.to,
            onClick: (event: MouseEvent) => context.emit("click", event),
          },
          content,
        );
      }
      return h(
        "button",
        {
          type: props.type,
          disabled: inactive,
          "aria-busy": busy,
          onClick: (event: MouseEvent) => context.emit("click", event),
        },
        content,
      );
    };
  },
});

export const UiConsentBanner = defineComponent({
  name: "UiConsentBanner",
  props: { privacyHref: { type: String, default: undefined } },
  setup(_props, context) {
    return () =>
      h(
        "section",
        { "aria-label": "Consent" },
        context.slots.default?.({ services: [] }) ?? [],
      );
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
